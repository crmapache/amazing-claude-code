import type { Paragraph, TableAlign, TableData, TextPart } from './types'

/**
 * The panel indents no deeper: it is sometimes narrow, and a fourth nesting level would eat more room
 * than the item's own text.
 */
const MAX_LIST_DEPTH = 3

/**
 * Parsing the agent's answer into the design's paragraphs.
 *
 * Full markdown here is neither needed nor useful: the panel draws six things - a paragraph, a list
 * item, a code block, an inline code span, a bold piece and an italic one. Everything else stays text
 * rather than turning into markup the design does not describe.
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

/**
 * Inline code, bold and italic text, links (markdown and bare URLs) and branch highlighting inside a
 * line.
 *
 * The italic halves are deliberately stricter than the bold ones. A lone asterisk is an ordinary
 * character in an answer about code - a glob, a multiplication, a footnote - so a piece only counts as
 * italic when it neither opens nor closes on a space: `2 * 3 * 4` and `*.ts and *.tsx` stay what they
 * were written as. An underscore is stricter still: it lives inside identifiers (`MAX_LIST_DEPTH`), so a
 * pair with a word character against it on either side is left alone as text.
 */
export const parseInline = (line: string): TextPart[] => {
  const parts: TextPart[] = []
  const pattern =
    /\[\[(.+?)\]\]|`([^`]+)`|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|_([^_\s](?:[^_]*[^_\s])?)_|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/\S+)/g

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
      for (const part of emphasized(match[3], { strong: true, em: true })) parts.push(part)
      last = match.index + match[0].length
    } else if (match[4] !== undefined) {
      // A bold piece may hold an address too - "**http://localhost:5173/**" is written all the time. We
      // parse its contents with the same parsing, or the link is lost exactly where it was singled out
      // as the most important thing in the answer.
      for (const part of emphasized(match[4], { strong: true })) parts.push(part)
      last = match.index + match[0].length
    } else if (match[5] !== undefined) {
      for (const part of emphasized(match[5], { em: true })) parts.push(part)
      last = match.index + match[0].length
    } else if (match[6] !== undefined) {
      const end = match.index + match[0].length
      // Inside a word this is no italic at all but a name written as it is spelled in the code.
      if (WORD_CHARACTER.test(line[match.index - 1] ?? '') || WORD_CHARACTER.test(line[end] ?? '')) {
        parts.push({ text: match[0] })
      } else {
        for (const part of emphasized(match[6], { em: true })) parts.push(part)
      }
      last = end
    } else if (match[8] !== undefined) {
      parts.push({ text: match[7] ?? match[8], href: match[8] })
      last = match.index + match[0].length
    } else if (match[9] !== undefined) {
      const href = trimUrlPunctuation(match[9])
      parts.push({ text: href, href })
      last = match.index + href.length
    }
  }

  if (last < line.length) parts.push({ text: line.slice(last) })
  return parts.length > 0 ? joinPlain(parts) : [{ text: line }]
}

const WORD_CHARACTER = /[\p{L}\p{N}_]/u

/**
 * Plain neighbours back into one piece.
 *
 * They appear where a pair of underscores turned out to be part of a name (`my_file_name.ts`): the run
 * is put back as text, in three pieces. On screen that reads the same, but a piece is also the unit the
 * paths in prose are looked for in (see PlainText) - and a name cut in three is a name none of them
 * finds, so the one link the person actually wanted goes missing.
 */
const joinPlain = (parts: TextPart[]): TextPart[] =>
  parts.reduce<TextPart[]>((joined, part) => {
    const previous = joined[joined.length - 1]
    const bare = (piece: TextPart): boolean => Object.keys(piece).length === 1

    if (previous && bare(previous) && bare(part)) {
      joined[joined.length - 1] = { text: previous.text + part.text }
      return joined
    }

    joined.push(part)
    return joined
  }, [])

/**
 * A whole line under emphasis - a heading, or the contents of a bold or italic piece.
 *
 * It is parsed as an ordinary line, and the mark is laid over every part of it: a link inside stays a
 * link, code stays code, and italic inside bold keeps both. The recursion is finite: the contents of a
 * piece never hold the character that closed it, so every step is shorter than the one before.
 */
const emphasized = (text: string, mark: { strong?: boolean; em?: boolean } = { strong: true }): TextPart[] =>
  parseInline(text).map((part) => ({ ...part, ...mark }))

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

/**
 * The paragraphs back into text - what travels into the clipboard when a whole answer is copied.
 *
 * The rule is one: the block structure survives, the inline decoration does not. Bold and code spans
 * lose their asterisks and backticks - in the clipboard they single nothing out and merely stick out as
 * rubbish mid-sentence. A list, a quote, a code block and a table have no plain-text spelling at all:
 * strip their markup and a numbered step loses the number it is referred to by, a snippet merges with
 * the prose around it, and a table disappears altogether - its text lives in cells rather than in
 * `parts`, so joining the pieces of the paragraph gave an empty line where the table was.
 */
export const paragraphsText = (paragraphs: Paragraph[]): string => {
  const lines: string[] = []

  paragraphs.forEach((paragraph, index) => {
    // An empty line between the blocks, and only the items of one list stand shoulder to shoulder. On a
    // single newline everything ran together into one sheet: paste it back anywhere that understands
    // markdown and two paragraphs became one, while the text above stuck to the head of a table.
    const previous = paragraphs[index - 1]
    const sameList = Boolean(previous?.bullet && paragraph.bullet)
    if (index > 0 && !sameList) lines.push('')
    lines.push(...blockLines(paragraph))
  })

  return lines.join('\n')
}

const blockLines = (paragraph: Paragraph): string[] => {
  const text = paragraph.parts.map((part) => part.text).join('')

  if (paragraph.table) return tableLines(paragraph.table)
  if (paragraph.codeBlock) return ['```' + (paragraph.language ?? ''), text, '```']
  if (paragraph.quote) return [`> ${text}`]

  if (paragraph.bullet) {
    // The number and the nesting are the meaning of an enumeration rather than its styling: a dash for
    // every item turned "do step 3" into a text with no third step in it, and a flat list lost which
    // item was a clarification of which.
    const indent = '  '.repeat(paragraph.depth ?? 0)
    return [`${indent}${paragraph.marker ?? '-'} ${text}`]
  }

  return [text]
}

/** A table as it was written: the head, the separator with the alignment, the rows. */
const tableLines = (table: TableData): string[] => {
  const row = (cells: TextPart[][]): string =>
    `| ${cells.map((cell) => cell.map((part) => part.text).join('').trim()).join(' | ')} |`

  const separator = table.header.map((_, index) => SEPARATOR_SPEC[table.align[index] ?? 'none'])

  return [row(table.header), `| ${separator.join(' | ')} |`, ...table.rows.map(row)]
}

const SEPARATOR_SPEC: Record<'left' | 'center' | 'right' | 'none', string> = {
  left: ':---',
  center: ':---:',
  right: '---:',
  none: '---',
}
