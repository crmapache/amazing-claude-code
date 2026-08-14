import { Reveal } from 'smooth-stream-text/react'
import { createElement, useEffect, useState } from 'react'
import type { Paragraph, TableAlign, TableData, TextPart } from '../../feed/types'
import { CopyButton, copyToClipboard } from './CopyButton'
import s from '../feed.module.css'

/**
 * Разобранный markdown на экране — один и тот же для ответа агента и для плана.
 *
 * Раньше план рисовался своей упрощённой раскладкой «номер + строка», и его
 * разметка терялась целиком: жирный текст показывался звёздочками, вложенные
 * пункты становились равноправными шагами с новой нумерацией, а всё, что не
 * пункт списка (заголовки разделов, абзацы-пояснения), пропадало вовсе. Здесь
 * же и там, и там показывается одно и то же — то, что агент написал.
 *
 * `reveal` включает волну проявления по словам: она нужна печатающемуся ответу
 * и мешает готовому плану, который появляется разом.
 */
interface MarkdownProps {
  paragraphs: Paragraph[]
  reveal?: boolean
  onOpenLink: (url: string) => void
}

export const Markdown = ({ paragraphs, reveal = false, onOpenLink }: MarkdownProps) => (
  <>
    {paragraphs.map((paragraph, index) => (
      <ParagraphView key={index} paragraph={paragraph} reveal={reveal} onOpenLink={onOpenLink} />
    ))}
  </>
)

/** Отступ одного уровня вложенности списка. */
const INDENT_PX = 14

const ParagraphView = ({
  paragraph,
  reveal,
  onOpenLink,
}: {
  paragraph: Paragraph
  reveal: boolean
  onOpenLink: (url: string) => void
}) => {
  if (paragraph.codeBlock) {
    const code = paragraph.parts.map((part) => part.text).join('')

    // Своя кнопка у каждого блока: копировать ответ целиком, чтобы забрать из
    // него одну команду, значит потом вычищать вокруг неё весь рассказ.
    return (
      <div className={s.codeBlockWrap}>
        <Piece reveal={reveal} as="pre" className={s.codeBlock}>
          {code}
        </Piece>
        <CopyButton text={code} className={s.codeCopy} title="Copy this block" />
      </div>
    )
  }

  if (paragraph.table) return <TableView table={paragraph.table} reveal={reveal} onOpenLink={onOpenLink} />

  const paraClass = [
    s.para,
    paragraph.bullet && s.paraBullet,
    paragraph.heading && s.paraHeading,
    paragraph.quote && s.paraQuote,
  ]
    .filter(Boolean)
    .join(' ')

  const depth = paragraph.depth ?? 0

  return (
    <div className={paraClass} style={depth > 0 ? { marginLeft: depth * INDENT_PX } : undefined}>
      {/* Нумерованный пункт остаётся нумерованным: свой номер у шага важнее
          единообразного тире, по нему на шаг и ссылаются. */}
      {paragraph.bullet ? <span className={s.bullet}>{paragraph.marker ?? '—'} </span> : null}
      {paragraph.parts.map((part, index) => (
        <PartView key={index} part={part} reveal={reveal} onOpenLink={onOpenLink} />
      ))}
    </div>
  )
}

const ALIGN_CLASS: Record<Exclude<TableAlign, undefined>, string> = {
  center: s.tableCellCenter,
  right: s.tableCellRight,
  left: '',
}

const alignClass = (align: TableAlign): string | undefined => (align ? ALIGN_CLASS[align] : undefined)

/**
 * Таблица из ответа агента — `| a | b |` и разделитель `|---|---|` следом
 * (см. parseTableAt). Ячейки разобраны тем же parseInline, что и обычный
 * текст — код, жирное и ссылки внутри таблицы работают точно так же.
 */
const TableView = ({
  table,
  reveal,
  onOpenLink,
}: {
  table: TableData
  reveal: boolean
  onOpenLink: (url: string) => void
}) => (
  <div className={s.tableWrap}>
    <table className={s.table}>
      <thead>
        <tr>
          {table.header.map((cell, index) => (
            <th key={index} className={alignClass(table.align[index])}>
              {cell.map((part, partIndex) => (
                <PartView key={partIndex} part={part} reveal={reveal} onOpenLink={onOpenLink} />
              ))}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className={alignClass(table.align[cellIndex])}>
                {cell.map((part, partIndex) => (
                  <PartView key={partIndex} part={part} reveal={reveal} onOpenLink={onOpenLink} />
                ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

/**
 * Кусок текста: с волной проявления или без. Без неё это обычный span/pre —
 * тот же класс, та же вёрстка, разница только в анимации появления.
 */
const Piece = ({
  reveal,
  as,
  className,
  children,
}: {
  reveal: boolean
  as?: 'pre' | 'span'
  className?: string
  children: string
}) =>
  reveal ? (
    <Reveal as={as} className={className}>
      {children}
    </Reveal>
  ) : (
    createElement(as ?? 'span', { className }, children)
  )

const PartView = ({
  part,
  reveal,
  onOpenLink,
}: {
  part: TextPart
  reveal: boolean
  onOpenLink: (url: string) => void
}) => {
  if (part.href) {
    const href = part.href
    return (
      <a
        href={href}
        // Ссылка в заголовке остаётся и ссылкой, и жирной: одно другого не
        // отменяет — по ней кликают, но это по-прежнему заголовок раздела.
        className={part.strong ? `${s.link} ${s.strong}` : s.link}
        // Открываем в системном браузере через хост-IDE: обычная навигация увела бы
        // сам вебвью панели на этот адрес вместо показа его снаружи.
        onClick={(event) => {
          event.preventDefault()
          onOpenLink(href)
        }}
      >
        <Piece reveal={reveal}>{part.text}</Piece>
      </a>
    )
  }

  if (part.code) return <InlineCode text={part.text} reveal={reveal} />
  if (part.mark) return <Piece reveal={reveal} className={s.mark}>{part.text}</Piece>
  if (part.strong) return <Piece reveal={reveal} className={s.strong}>{part.text}</Piece>
  return <Piece reveal={reveal}>{part.text}</Piece>
}

/** Сколько держим подсветку скопированного, прежде чем вернуть обычный вид. */
const COPIED_FLASH_MS = 900

/**
 * Имя ветки, флаг, путь — то, что чаще всего и нужно из ответа, — забирается
 * кликом по нему же: своя кнопка у куска в два слова была бы больше него.
 *
 * Клик после выделения текста игнорируем: выделение и есть намерение забрать
 * не только этот кусок, а подменять им буфер на полпути нечестно.
 */
const InlineCode = ({ text, reveal }: { text: string; reveal: boolean }) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    return () => clearTimeout(timeout)
  }, [copied])

  return (
    <span
      className={copied ? `${s.code} ${s.codeCopied}` : s.code}
      title={copied ? 'Copied' : 'Click to copy'}
      onClick={() => {
        if (window.getSelection()?.isCollapsed === false) return
        void copyToClipboard(text).then((ok) => {
          if (ok) setCopied(true)
        })
      }}
    >
      <Piece reveal={reveal}>{text}</Piece>
    </span>
  )
}
