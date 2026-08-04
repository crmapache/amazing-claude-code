import { Reveal, RevealProvider } from 'smooth-stream-text/react'
import { useEffect, useState } from 'react'
import type { Paragraph, TextItem, TextPart } from '../../feed/types'
import s from '../feed.module.css'

interface TextCardProps {
  item: TextItem
  /** Открыть ссылку из ответа агента в системном браузере, а не внутри вебвью. */
  onOpenLink: (url: string) => void
}

/** Сколько подряд держим галочку после копирования, прежде чем вернуть иконку. */
const COPIED_FLASH_MS = 1500

/**
 * Появление нового текста: слова проступают волной слева направо, а не
 * зажигаются пачкой.
 *
 * Задержка между соседними словами намеренно короткая. Поток сюда приходит уже
 * сглаженным, то есть по паре символов за кадр, и на каждый кадр рождается своя
 * порция волны: сделай паузу между ними длиннее кадра — и очередь начнёт копиться
 * быстрее, чем проигрывается, а показ отстанет от ответа на добрую секунду.
 *
 * Вертикальный сдвиг выключен по той же причине аккуратности: с ним слово на
 * время анимации становится блочным, и строка вокруг него подрагивает
 * переносами. Прозрачности с лёгкой размытостью для «проявления из ниоткуда»
 * достаточно, а лента остаётся неподвижной.
 */
const REVEAL = {
  unit: 'word',
  durationMs: 340,
  staggerMs: 14,
  blurPx: 4,
  translatePx: 0,
  maxWaveLagMs: 140,
} as const

/**
 * Капсула, а не голый текст вподряд с остальной лентой: по ней сразу видно, где
 * кончились технические логи (мысли, вызовы инструментов) и начался настоящий
 * ответ — тот же приём, что и у сообщения пользователя, только с другой стороны.
 */
export const TextCard = ({ item, onOpenLink }: TextCardProps) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    return () => clearTimeout(timeout)
  }, [copied])

  return (
    <div className={s.text} data-copyable>
      <button
        type="button"
        className={s.textCopy}
        title="Copy"
        onClick={() => {
          void copyToClipboard(plainText(item)).then((ok) => {
            if (ok) setCopied(true)
          })
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>

      {/* Одна волна на всю карточку: иначе каждый абзац начинал бы проявление
          заново и текст загорался бы ступеньками, а не единым ходом. */}
      <RevealProvider resetKey={item.id} {...REVEAL}>
        {item.paragraphs.map((paragraph, index) => (
          <ParagraphView key={index} paragraph={paragraph} onOpenLink={onOpenLink} />
        ))}
      </RevealProvider>
    </div>
  )
}

/** Сколько ждём современный Clipboard API, прежде чем считать его недоступным. */
const CLIPBOARD_API_TIMEOUT_MS = 300

/**
 * navigator.clipboard в здешнем встроенном в IDE браузере (JCEF) есть не
 * всегда — и, что хуже обычного отказа, может не отклониться с ошибкой, а
 * зависнуть без ответа насовсем (проверено живьём: обычный await так и не
 * дожидается ни успеха, ни отказа). Кнопка при этом рапортовала об успехе
 * (галочка) сразу, не дожидаясь вообще ничего. document.execCommand уже
 * используется в этом файле панели для других операций и там работает
 * стабильно, поэтому он — честный запасной путь, если современный API
 * недоступен, упал или молчит дольше разумного. "Успех" теперь значит именно
 * успех, а не просто вызов.
 */
const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    // .catch сразу на самом промисе — иначе он, отказавшись позже, чем таймаут
    // уже выиграл гонку, всплывёт как uncaught (in promise) в консоли.
    const write = navigator.clipboard
      .writeText(text)
      .then(() => 'done' as const)
      .catch(() => 'failed' as const)
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), CLIPBOARD_API_TIMEOUT_MS))

    if ((await Promise.race([write, timeout])) === 'done') return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  return ok
}

/** То, что реально уходит в буфер обмена — без markdown-разметки, простым текстом. */
const plainText = (item: TextItem): string =>
  item.paragraphs
    .map((paragraph) => {
      const text = paragraph.parts.map((part) => part.text).join('')
      return paragraph.bullet ? `- ${text}` : text
    })
    .join('\n')

const ParagraphView = ({ paragraph, onOpenLink }: { paragraph: Paragraph; onOpenLink: (url: string) => void }) => {
  if (paragraph.codeBlock) {
    return (
      <Reveal as="pre" className={s.codeBlock}>
        {paragraph.parts.map((part) => part.text).join('')}
      </Reveal>
    )
  }

  const paraClass = [s.para, paragraph.bullet && s.paraBullet, paragraph.heading && s.paraHeading]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={paraClass}>
      {paragraph.bullet ? <span className={s.bullet}>{'— '}</span> : null}
      {paragraph.parts.map((part, index) => (
        <PartView key={index} part={part} onOpenLink={onOpenLink} />
      ))}
    </div>
  )
}

/**
 * Каждый кусок абзаца проявляется сам, но волна у них общая — её держит
 * RevealProvider выше по дереву. Уже показанный текст при этом не переигрывается:
 * заново собранный разбор (жирный кусок дописался, абзац перестроился) карточка
 * досеивает молча.
 */
const PartView = ({ part, onOpenLink }: { part: TextPart; onOpenLink: (url: string) => void }) => {
  if (part.href) {
    const href = part.href
    return (
      <a
        href={href}
        className={s.link}
        // Открываем в системном браузере через хост-IDE: обычная навигация увела бы
        // сам вебвью панели на этот адрес вместо показа его снаружи.
        onClick={(event) => {
          event.preventDefault()
          onOpenLink(href)
        }}
      >
        <Reveal>{part.text}</Reveal>
      </a>
    )
  }
  if (part.code) return <Reveal className={s.code}>{part.text}</Reveal>
  if (part.mark) return <Reveal className={s.mark}>{part.text}</Reveal>
  if (part.strong) return <Reveal className={s.strong}>{part.text}</Reveal>
  return <Reveal>{part.text}</Reveal>
}
