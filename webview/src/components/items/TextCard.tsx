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
          void navigator.clipboard?.writeText(plainText(item))
          setCopied(true)
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

  return (
    <div className={s.para}>
      {paragraph.bullet ? <span className={s.bullet}>—</span> : null}
      <div className={s.paraBody}>
        {paragraph.parts.map((part, index) => (
          <PartView key={index} part={part} onOpenLink={onOpenLink} />
        ))}
      </div>
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
