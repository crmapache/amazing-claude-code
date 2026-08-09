import { RevealProvider } from 'smooth-stream-text/react'
import { useEffect, useState } from 'react'
import type { TextItem } from '../../feed/types'
import { Markdown } from './Markdown'
import s from '../feed.module.css'

interface TextCardProps {
  item: TextItem
  /** Открыть ссылку из ответа агента в системном браузере, а не внутри вебвью. */
  onOpenLink: (url: string) => void
}

/** Сколько подряд держим галочку после копирования, прежде чем вернуть иконку. */
const COPIED_FLASH_MS = 1500

/**
 * Дальше этого объёма текст показывается без волны проявления. Порог с запасом
 * выше любого живого ответа: столько букв набирается только у полотна, которое
 * пришло готовым куском, — сводки после сжатия контекста, длинного файла в
 * ответе.
 */
const REVEAL_LIMIT = 12_000

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

  /**
   * Волна проявления рисует каждое слово отдельным узлом со своей анимацией —
   * на обычном ответе это красиво и незаметно по цене, а на полотне в десятки
   * тысяч слов (сводка после сжатия контекста — как раз такое) превращается в
   * десятки тысяч анимаций разом: панель замирала, а потом гасла совсем.
   * Длинный текст показываем сразу целиком — проявляться там всё равно нечему,
   * он приходит одним куском, а не печатается на глазах.
   */
  const length = item.paragraphs.reduce(
    (sum, paragraph) => sum + paragraph.parts.reduce((inner, part) => inner + part.text.length, 0),
    0,
  )
  const reveal = length <= REVEAL_LIMIT

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
      {reveal ? (
        <RevealProvider resetKey={item.id} {...REVEAL}>
          <Markdown paragraphs={item.paragraphs} reveal onOpenLink={onOpenLink} />
        </RevealProvider>
      ) : (
        <Markdown paragraphs={item.paragraphs} onOpenLink={onOpenLink} />
      )}
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

