import { Reveal } from 'smooth-stream-text/react'
import { createElement, useEffect, useState } from 'react'
import { fileRef } from '../../feed/paths'
import { parseInline } from '../../feed/markdown'
import type { Paragraph, TableAlign, TableData, TextPart } from '../../feed/types'
import { copyToClipboard } from '../../clipboard'
import { CopyButton } from './CopyButton'
import { PathLink, withPathLinks } from './PathLink'
import s from '../feed.module.css'
import { useKnownFiles, useOpenFile } from '../../hooks/useOpenFile'
import { useT } from '../../i18n'

/**
 * Parsed markdown on screen - one and the same for the agent's answer and for a plan.
 *
 * A plan used to be drawn with a simplified "number + line" layout of its own, and its markup was lost
 * entirely: bold text showed up as asterisks, nested items became steps of equal standing with new
 * numbering, and everything that was not a list item (section headings, explanatory paragraphs)
 * disappeared altogether. Here both show one and the same thing - what the agent wrote.
 *
 * `reveal` switches on the word-by-word reveal wave: a printing answer needs it, while a finished plan,
 * which appears all at once, is only hindered by it.
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

/** The indent of one nesting level in a list. */
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
  const t = useT()

  if (paragraph.codeBlock) {
    const code = paragraph.parts.map((part) => part.text).join('')

    // A button of its own on every block: copying a whole answer to take one command out of it means
    // cleaning the whole account away around it afterwards.
    return (
      <div className={s.codeBlockWrap}>
        <CodeBlock code={code} reveal={reveal} />
        <CopyButton text={code} className={s.codeCopy} title={t.feed.copyBlock} />
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
      {/* A numbered item stays numbered: a step's own number matters more than a uniform dash - that is
          what a step is referred to by. */}
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
 * A table out of the agent's answer - `| a | b |` with a `|---|---|` separator after it (see
 * parseTableAt). The cells are parsed by the same parseInline as ordinary text - code, bold and links
 * inside a table work exactly the same.
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
 * A piece of text: with the reveal wave or without it. Without it this is an ordinary span/pre - the same
 * class, the same layout, the difference being only the appearance animation.
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

/**
 * One line of an answer's markup inside a card that is not an answer itself - a finding's summary, for
 * instance. Such a line is written in the same markdown as everything else the agent says (a path or an
 * identifier in backticks above all), and it has to read the same way there: through the same parsing and
 * the same pieces, without the paragraph layout a whole answer needs.
 */
export const Inline = ({ text, onOpenLink }: { text: string; onOpenLink: (url: string) => void }) => (
  <>
    {parseInline(text).map((part, index) => (
      <PartView key={index} part={part} reveal={false} onOpenLink={onOpenLink} />
    ))}
  </>
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
  const emphasis = [part.strong ? s.strong : '', part.em ? s.em : ''].filter(Boolean).join(' ')

  if (part.href) {
    const href = part.href
    return (
      <a
        href={href}
        // A link in a heading stays both a link and bold: one does not cancel the other - it is clicked,
        // but it is still a section's heading.
        className={emphasis ? `${s.link} ${emphasis}` : s.link}
        // We open it in the system browser through the host IDE: ordinary navigation would carry the
        // panel's own webview off to that address instead of showing it outside.
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
  if (emphasis) return <Piece reveal={reveal} className={emphasis}>{part.text}</Piece>
  return <PlainText text={part.text} reveal={reveal} />
}

/**
 * A stretch of ordinary text, with the files it names picked out as links.
 *
 * The agent writes paths without marking them as code most of the time - asked for a list of files it
 * answers with bare lines - and a path that cannot be clicked is the retyping this was built to remove.
 * Where there is no editor to open anything in (the phone) the text stays exactly what it was.
 */
const PlainText = ({ text, reveal }: { text: string; reveal: boolean }) => {
  const runs = withPathLinks(text, useOpenFile(), useKnownFiles())
  if (!runs) return <Piece reveal={reveal}>{text}</Piece>

  return (
    <>
      {runs.map((run, index) =>
        run.ref ? (
          <PathLink key={index} run={run}>
            <Piece reveal={reveal}>{run.text}</Piece>
          </PathLink>
        ) : (
          <Piece key={index} reveal={reveal}>
            {run.text}
          </Piece>
        ),
      )}
    </>
  )
}

/**
 * A fenced block, with the files named inside it picked out the same way.
 *
 * Asked for "a flat list of files" the agent answers with a block of paths, and that block is the most
 * literal list of files there is - every line of it worth a click.
 *
 * The reveal wave is given up on a block that holds paths: it takes a plain string to run over, and a
 * fraction of a second of animation is a poor trade for a list one cannot click. A block without paths -
 * a command, a snippet - keeps it.
 */
const CodeBlock = ({ code, reveal }: { code: string; reveal: boolean }) => {
  const runs = withPathLinks(code, useOpenFile(), useKnownFiles())
  if (!runs) {
    return (
      <Piece reveal={reveal} as="pre" className={s.codeBlock}>
        {code}
      </Piece>
    )
  }

  return (
    <pre className={s.codeBlock}>
      {runs.map((run, index) =>
        run.ref ? (
          <PathLink key={index} run={run} />
        ) : (
          run.text
        ),
      )}
    </pre>
  )
}



/** How long the copied highlight is held before the ordinary look returns. */
const COPIED_FLASH_MS = 900

/**
 * A branch's name, a flag, a path - what is most often needed out of an answer - is taken by clicking it:
 * a button of its own beside a two-word piece would be bigger than the piece.
 *
 * A click after a text selection is ignored: the selection is itself the intent to take more than this
 * one piece, and replacing the clipboard halfway through would be dishonest.
 */
const InlineCode = ({ text, reveal }: { text: string; reveal: boolean }) => {
  const t = useT()
  const openFile = useOpenFile()
  const known = useKnownFiles()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    return () => clearTimeout(timeout)
  }, [copied])

  /**
   * A path is opened rather than copied - inside an IDE that is what a click on one means, and the panel
   * stands two panes away from the editor it belongs to. Everything else in backticks keeps the copy: a
   * flag, a branch's name, an identifier are wanted in the clipboard and nowhere else.
   *
   * The tooltip says which of the two this piece is before it is clicked, so nothing here is a surprise -
   * and for a folder it says that too, because the click shows it rather than opens it (see FileRef and
   * OpenInEditor). Where there is no editor at all - the phone - there is no reference either (see
   * useOpenFile), and the path goes on copying exactly as it did.
   */
  const ref = openFile ? fileRef(text, true, known) : null
  const opens = ref?.folder ? t.feed.copy.openFolder : t.feed.copy.openFile

  return (
    <span
      className={copied ? `${s.code} ${s.codeCopied}` : ref ? `${s.code} ${s.codeFile}` : s.code}
      data-tooltip={copied ? t.feed.copy.copied : ref ? opens : t.feed.copy.click}
      onClick={() => {
        if (window.getSelection()?.isCollapsed === false) return

        if (ref && openFile) {
          // The flag stays on this side: what the path is, is a question for the disk (see OpenInEditor).
          const { folder: _folder, ...request } = ref
          openFile(request)
          return
        }

        void copyToClipboard(text).then((ok) => {
          if (ok) setCopied(true)
        })
      }}
    >
      <Piece reveal={reveal}>{text}</Piece>
    </span>
  )
}
