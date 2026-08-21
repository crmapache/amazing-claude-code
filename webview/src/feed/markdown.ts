import type { Paragraph, TableAlign, TableData, TextPart } from './types'

/**
 * The panel indents no deeper: it is sometimes narrow, and a fourth nesting level would eat more room
 * than the item's own text.
 */
const MAX_LIST_DEPTH = 3

/**
 * Parsing the agent's answer into the design's paragraphs.
 *
 * Full markdown here is neither needed nor useful: the panel draws five things - a paragraph, a list
 * item, a code block, an inline code span and a bold piece. Everything else stays text rather than
 * turning into markup the design does not describe.
 */
export const parseParagraphs = (source: string): Paragraph[] => {
  const paragraphs: Paragraph[] = []
  const lines = source.split('\n')

  let codeFence: { language: string; lines: string[] } | null = null
  let plain: string[] = []
  let quoteLines: string[] = []

  const flushPlain = () => {
    if (plain.length === 0) return
    paragraphs.push({ parts: parseInline(plain.join(' ')) })
    plain = []
  }

  const flushQuote = () => {
    if (quoteLines.length === 0) return
    paragraphs.push({ quote: true, parts: parseInline(quoteLines.join(' ')) })
    quoteLines = []
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const fence = /^\s*```(\w*)\s*$/.exec(line)

    if (fence) {
      if (codeFence) {
        paragraphs.push({
          codeBlock: true,
          language: codeFence.language,
          parts: [{ text: codeFence.lines.join('\n') }],
        })
        codeFence = null
      } else {
        flushPlain()
        flushQuote()
        codeFence = { language: fence[1] ?? '', lines: [] }
      }
      continue
    }

    if (codeFence) {
      codeFence.lines.push(line)
      continue
    }

    // A table: a line with | and a separator line right under it (`---|---`, `:---|---:`…). The
    // separator's cell count has to match the header - without that an accidental line like
    // "command | another" before a horizontal rule "---" would pass for a table too.
    const table = parseTableAt(lines, index)

    if (table) {
      flushPlain()
      flushQuote()
      paragraphs.push({ table: table.data, parts: [] })
      index = table.nextIndex - 1
      continue
    }

    // A quote: one or more lines starting with ">" (a nested "> >" is a quote too, without a nesting
    // level of its own - the panel needs nothing deeper than one strip). An empty ">" inside a quote is
    // the boundary between its paragraphs, like an empty line for ordinary text: it closes what has
    // accumulated without ending the quote itself.
    const quote = /^[ \t]*(?:>[ \t]?)+(.*)$/.exec(line)

    if (quote) {
      flushPlain()
      const content = (quote[1] ?? '').trim()
      if (content.length > 0) {
        quoteLines.push(content)
      } else {
        flushQuote()
      }
      continue
    }

    // The item's number and indentation are kept: both carry meaning - a step is referred to by its
    // number in words, and the indentation shows this is a clarification of the item above rather than
    // another step of equal standing.
    const bullet = /^([ \t]*)(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line)

    if (bullet) {
      flushPlain()
      flushQuote()
      const indent = (bullet[1] ?? '').replace(/\t/g, '  ').length
      paragraphs.push({
        bullet: true,
        depth: Math.min(Math.floor(indent / 2), MAX_LIST_DEPTH),
        ...(bullet[2] ? { marker: `${bullet[2]}.` } : {}),
        parts: parseInline(bullet[3] ?? ''),
      })
      continue
    }

    // Headings get no font or size of their own - they stay a bold line, but with a heading mark: the
    // design adds a gap in front of it, so that a section does not merge with the paragraph above it
    // when drawn.
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)

    if (heading) {
      flushPlain()
      flushQuote()
      // Through the shared line parsing rather than as one piece of text: a heading may hold an address
      // and code in backticks, and those are clicked just the same. As one whole piece a link in a
      // heading stayed a plain bold line one had to select and copy by hand.
      paragraphs.push({ heading: true, parts: emphasized(heading[1] ?? '') })
      continue
    }

    if (line.trim().length === 0) {
      flushPlain()
      flushQuote()
      continue
    }

    flushQuote()
    plain.push(line.trim())
  }

  if (codeFence) {
    paragraphs.push({ codeBlock: true, language: codeFence.language, parts: [{ text: codeFence.lines.join('\n') }] })
  }

  flushPlain()
  flushQuote()
  return paragraphs
}

/** The cells of one table row - split by `|`, without the empty edges left by the framing `|`. */
const splitTableRow = (line: string): string[] => {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|')
}

/** `:---`, `---:`, `:---:` set a column's alignment; a bare `---` sets none. */
const cellAlign = (spec: string): TableAlign => {
  const trimmed = spec.trim()
  const left = trimmed.startsWith(':')
  const right = trimmed.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return undefined
}

const SEPARATOR_CELL = /^:?-+:?$/

/**
 * A table starting at line `index`: that line and the next form the header and the separator, and after
 * them the consecutive lines holding `|` are the body, up to the first line without one or to the end of
 * the text (the table is still being printed - the body is simply shorter).
 *
 * The separator's cell count has to match the header's: without that check an accidental line with `|`
 * (a command's output, for instance) before any horizontal rule "---" in an answer would pass for a
 * table too.
 */
const parseTableAt = (lines: string[], index: number): { data: TableData; nextIndex: number } | null => {
  const line = lines[index]!
  if (!line.includes('|') || index + 1 >= lines.length) return null

  const headerCells = splitTableRow(line)
  const separatorCells = splitTableRow(lines[index + 1]!)

  if (
    headerCells.length === 0 ||
    separatorCells.length !== headerCells.length ||
    !separatorCells.every((cell) => SEPARATOR_CELL.test(cell.trim()))
  ) {
    return null
  }

  const header = headerCells.map((cell) => parseInline(cell.trim()))
  const align = separatorCells.map((cell) => cellAlign(cell))
  const rows: TextPart[][][] = []

  let cursor = index + 2
  while (cursor < lines.length && lines[cursor]!.includes('|')) {
    rows.push(splitTableRow(lines[cursor]!).map((cell) => parseInline(cell.trim())))
    cursor += 1
  }

  return { data: { align, header, rows }, nextIndex: cursor }
}

/**
 * Trailing punctuation belongs to the surrounding text rather than to the address: "see
 * https://example.com." must not drag the full stop into the link. A closing bracket is cut only when it
 * does not balance an opening one inside the address itself - otherwise links like
 * "(https://example.com/foo(bar))" would break.
 */
const trimUrlPunctuation = (url: string): string => {
  let end = url.length
  while (end > 0 && ".,!?;:'\"".includes(url[end - 1]!)) end -= 1

  while (end > 0 && url[end - 1] === ')') {
    const head = url.slice(0, end)
    const opens = (head.match(/\(/g) ?? []).length
    const closes = (head.match(/\)/g) ?? []).length
    if (opens >= closes) break
    end -= 1
  }

  return url.slice(0, end)
}

/**
 * Bare addresses in ordinary text - and nothing else.
 *
 * For a user's message: what a person typed is shown exactly as they typed it (no markup - the asterisks
 * and hashes in their question were meant literally), but an address has to stay an address: it is
 * clicked to open a page rather than retyped into a browser by hand.
 */
export const linkify = (text: string): TextPart[] => {
  const parts: TextPart[] = []
  const pattern = /https?:\/\/\S+/g

  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const href = trimUrlPunctuation(match[0])
    if (!href) continue

    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ text: href, href })
    last = match.index + href.length
  }

  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/** Inline code, bold text, links (markdown and bare URLs) and branch highlighting inside a line. */
export const parseInline = (line: string): TextPart[] => {
  const parts: TextPart[] = []
  const pattern = /\[\[(.+?)\]\]|`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/\S+)/g

  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) parts.push({ text: line.slice(last, match.index) })

    if (match[1] !== undefined) {
      parts.push({ text: match[1], mark: true })
      last = match.index + match[0].length
    } else if (match[2] !== undefined) {
      parts.push({ text: match[2], code: true })
      last = match.index + match[0].length
    } else if (match[3] !== undefined) {
      // A bold piece may hold an address too - "**http://localhost:5173/**" is written all the time. We
      // parse its contents with the same parsing, or the link is lost exactly where it was singled out
      // as the most important thing in the answer.
      for (const part of emphasized(match[3])) parts.push(part)
      last = match.index + match[0].length
    } else if (match[5] !== undefined) {
      parts.push({ text: match[4] ?? match[5], href: match[5] })
      last = match.index + match[0].length
    } else if (match[6] !== undefined) {
      const href = trimUrlPunctuation(match[6])
      parts.push({ text: href, href })
      last = match.index + href.length
    }
  }

  if (last < line.length) parts.push({ text: line.slice(last) })
  return parts.length > 0 ? parts : [{ text: line }]
}

/**
 * A whole line under emphasis - a heading or the contents of a bold piece.
 *
 * It is parsed as an ordinary line, and the bold mark is laid over every part of it: a link inside stays
 * a link, code stays code. The recursion is finite: by its own pattern, the contents of a bold piece
 * hold no asterisks.
 */
const emphasized = (text: string): TextPart[] =>
  parseInline(text).map((part) => ({ ...part, strong: true }))

/**
 * The same text, but on one line and without markup - for places that have nothing to show it with. A
 * thought's preview in the feed goes on one line with an ellipsis: asterisks and hashes in it single out
 * nothing and merely stick out as rubbish mid-sentence.
 *
 * It is parsed by the same parsing as the agent's answer: starting an understanding of markup of its own
 * here serves nothing - the ready pieces are taken and joined by their text. The item's number stays:
 * "1." is part of a list's meaning rather than its decoration.
 */
export const plainLine = (source: string): string =>
  parseParagraphs(source)
    .map(plainParagraph)
    .filter((text) => text.length > 0)
    .join(' ')

const plainParagraph = (paragraph: Paragraph): string => {
  const text = paragraph.parts
    .map((part) => part.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

  return paragraph.marker ? `${paragraph.marker} ${text}`.trim() : text
}
