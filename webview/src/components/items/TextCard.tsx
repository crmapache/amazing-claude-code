import { useEffect, useState } from 'react'
import type { Paragraph, TextItem, TextPart } from '../../feed/types'
import s from '../feed.module.css'

interface TextCardProps {
  item: TextItem
}

/** Сколько подряд держим галочку после копирования, прежде чем вернуть иконку. */
const COPIED_FLASH_MS = 1500

/**
 * Капсула, а не голый текст вподряд с остальной лентой: по ней сразу видно, где
 * кончились технические логи (мысли, вызовы инструментов) и начался настоящий
 * ответ — тот же приём, что и у сообщения пользователя, только с другой стороны.
 */
export const TextCard = ({ item }: TextCardProps) => {
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

      {item.paragraphs.map((paragraph, index) => (
        <ParagraphView key={index} paragraph={paragraph} />
      ))}
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

const ParagraphView = ({ paragraph }: { paragraph: Paragraph }) => {
  if (paragraph.codeBlock) {
    return <pre className={s.codeBlock}>{paragraph.parts.map((part) => part.text).join('')}</pre>
  }

  return (
    <div className={s.para}>
      {paragraph.bullet ? <span className={s.bullet}>—</span> : null}
      <div className={s.paraBody}>
        {paragraph.parts.map((part, index) => (
          <PartView key={index} part={part} />
        ))}
      </div>
    </div>
  )
}

const PartView = ({ part }: { part: TextPart }) => {
  if (part.code) return <span className={s.code}>{part.text}</span>
  if (part.mark) return <span className={s.mark}>{part.text}</span>
  if (part.strong) return <span className={s.strong}>{part.text}</span>
  return <span>{part.text}</span>
}
