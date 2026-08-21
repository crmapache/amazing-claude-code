import type { Chip } from './types'

export interface SelectionSpan {
  path: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  wholeLines: boolean
}

/**
 * The range's caption for a reference from the editor.
 *
 * Columns are shown only when the selection cuts a line: for whole lines they add no precision while
 * taking up room in the panel. The format is one and the same in the input field and in the message to
 * the agent - there should be nothing to compare by eye.
 */
export const rangeLabel = (span: SelectionSpan): string => {
  const { startLine, startColumn, endLine, endColumn, wholeLines } = span

  if (wholeLines) return startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`
  if (startLine === endLine) return `L${startLine}:${startColumn}-${endColumn}`

  return `L${startLine}:${startColumn}-L${endLine}:${endColumn}`
}

export const referenceChip = (span: SelectionSpan): Chip => ({
  kind: 'ref',
  value: span.path,
  range: rangeLabel(span),
})

/**
 * What travels to the agent. The path goes through @, as in the terminal: that is how the agent
 * understands the file has to be read. The range is appended, so that it knows which piece is meant
 * while still seeing the file whole.
 */
export const referenceText = (chip: Chip): string =>
  chip.range ? `@${chip.value} (${chip.range})` : `@${chip.value}`

/** Past this a name is not shown whole: the middle is cut out, the extension stays visible. */
const MAX_LABEL_LENGTH = 28

const truncateMiddle = (text: string, max = MAX_LABEL_LENGTH): string => {
  if (text.length <= max) return text

  const head = Math.ceil((max - 1) * 0.6)
  const tail = max - 1 - head
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

/** How many words of a quote are shown in the chip itself - past that it cannot be made out anyway. */
const QUOTE_PREVIEW_WORDS = 5

/**
 * "ref1: a couple of words…" - the chip goes by word count rather than character length, so that the
 * preview does not break off mid-word.
 */
const quotePreview = (text: string): string => {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const preview = words.slice(0, QUOTE_PREVIEW_WORDS).join(' ')
  return words.length > QUOTE_PREVIEW_WORDS ? `${preview}…` : preview
}

/**
 * How many words of a paste are shown in the chip. More than for a quote: a quote has its number in
 * front of the preview and is recognised by it, while a paste is recognised only by the start of its
 * text - that is all one knows about it at a glance.
 */
const PASTE_PREVIEW_WORDS = 7

/**
 * A character ceiling on top of the word one - seven words by themselves are no protection against
 * length: let one of them be a bare URL or a path without spaces, and the chip would stretch into a
 * narrow long strip instead of staying compact like its neighbours (see MAX_LABEL_LENGTH above - the
 * same guard in spirit for a file's name).
 */
const PASTE_PREVIEW_CHARS = 40

/**
 * How many characters of a paste are enough for a preview. Past that we do not look at all: a chip's
 * caption is built on every repaint of the feed, and people paste hundred-kilobyte logs into the field -
 * parsing such a text whole for the sake of seven words serves nothing.
 *
 * With room to spare: seven words even of long paths fit well inside it.
 */
const PASTE_SCAN_CHARS = 300

/**
 * The start of pasted text - the ellipsis at the end is always there, even when the text fits whole: a
 * paste is collapsed precisely because it is multi-line, and past the first line there is always
 * something else in it.
 */
const pastePreview = (text: string): string => {
  const words = text.slice(0, PASTE_SCAN_CHARS).trim().split(/\s+/).filter(Boolean)
  const preview = words.slice(0, PASTE_PREVIEW_WORDS).join(' ')
  return `${preview.slice(0, PASTE_PREVIEW_CHARS)}…`
}

/**
 * How much text is taken into a paste shown as a block. There are three lines on screen either way (the
 * layout cuts it), but taking exactly three lines here is impossible: they may hold ten characters or a
 * thousand - only the screen itself knows the width.
 */
const PASTE_BLOCK_CHARS = 600

/**
 * The start of a paste for the wide chip - the one with nothing after it in the message, where the room
 * can be taken whole. Unlike the in-line caption, here the text goes as it is, with its line breaks:
 * that is how one recognises what exactly was pasted.
 */
export const pasteBlockPreview = (text: string): string => {
  const body = text.trim()
  return body.length > PASTE_BLOCK_CHARS ? `${body.slice(0, PASTE_BLOCK_CHARS)}…` : body
}

/**
 * How many lines a paste holds - a figure for the hover tooltip rather than for the caption.
 *
 * We count the newlines rather than cut the text into an array: for a hundred-kilobyte log that is
 * thousands of needless strings in memory on every repaint of the feed.
 */
export const pasteLineCount = (text: string): number => {
  const body = text.trimEnd()
  if (!body) return 0

  let lines = 1
  for (let index = body.indexOf('\n'); index >= 0; index = body.indexOf('\n', index + 1)) lines += 1
  return lines
}

/**
 * How much of a paste's text is shown in the hover tooltip. A system tooltip will not show more anyway -
 * but a node's attribute takes whatever it is given.
 */
const PASTE_TITLE_CHARS = 2_000

/**
 * What a chip shows on hover. One function for every place it is drawn: in the input field as a DOM
 * node and in the feed as React markup - those two tooltips must not drift apart, the chip is one and
 * the same to the person.
 *
 * For a collapsed paste this is its size and its whole text: the caption shows only the beginning, and
 * there is no other way to see what is inside without expanding the chip.
 */
export const chipTitle = (chip: Chip): string => {
  if (chip.kind === 'quote') return chip.text ?? ''

  if (chip.kind === 'paste') {
    const text = chip.text ?? ''
    const shown = text.length > PASTE_TITLE_CHARS ? `${text.slice(0, PASTE_TITLE_CHARS)}\n…` : text
    return `${pasteLineCount(text)} lines pasted\n\n${shown}`
  }

  return chip.range ? `${chip.value} ${chip.range}` : chip.value
}

/**
 * In the chip itself a path is shortened to the file's name: a full one does not fit, and for a file
 * outside the project (from Downloads, say) it is an absolute path at that. The full path stays in the
 * text the agent receives and in the hover tooltip - here is only what is seen by eye.
 */
export const chipLabel = (chip: Chip): string => {
  if (chip.kind === 'quote') return `${chip.value}: ${quotePreview(chip.text ?? '')}`
  if (chip.kind === 'paste') return pastePreview(chip.text ?? '')
  // With the slash, the way it was typed: without one a command chip reads as an ordinary word.
  if (chip.kind === 'cmd') return `/${chip.value}`

  // Empty pieces are dropped: a folder's path ends with a slash, and the last piece there is an empty
  // string - the chip would be left with no caption at all.
  const parts = chip.value.split('/').filter(Boolean)
  const name = truncateMiddle(parts.at(-1) ?? chip.value)
  return chip.range ? `${name} ${chip.range}` : name
}
