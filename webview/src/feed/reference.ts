import { isOpenablePath, type FileRef } from './paths'
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
 * From how many lines a pasted text folds into a chip instead of going into the field as it is.
 *
 * Two is "every paste that has a line break in it", which is what the field always did and stays the
 * default. It is a setting because the same behaviour is right for a hundred-line log and wrong for a
 * two-line stack trace one wants to edit before sending - and the second case is the one people wrote
 * in about (see the pasted-text screen in SideMenu).
 */
export const PASTE_COLLAPSE_DEFAULT = 2

/** Never fold, whatever was pasted - the value the "off" entry of that screen saves. */
export const PASTE_COLLAPSE_NEVER = 0

/**
 * The setting as it arrives from the IDE, as a number of lines.
 *
 * Absent is not the same as zero: nothing said means the default above, while a genuine zero means the
 * person switched the folding off. Anything unreadable is treated as nothing said - a stored value from
 * a future version must not turn the field's behaviour into a surprise.
 */
export const pasteCollapseLines = (value: string | undefined): number => {
  if (value === undefined || value.trim() === '') return PASTE_COLLAPSE_DEFAULT

  const lines = Number.parseInt(value, 10)
  if (!Number.isFinite(lines) || lines < 0) return PASTE_COLLAPSE_DEFAULT

  return lines
}

/**
 * Whether this paste goes in as a chip.
 *
 * Two counts, and the larger of them wins. The text's own lines are what the chip then says about itself,
 * so the threshold on the settings screen means what it looks like it means. But a wall of text pasted as
 * ONE line has no line breaks at all and used to walk straight into the field - which is the very thing
 * the folding exists to prevent: the field it lands in is a few hundred pixels wide, and there that one
 * line is forty. So the caller may also say how many lines it actually takes where it is going (see
 * wrappedLineCount), and that count decides too.
 *
 * Measured rather than guessed from the character count on purpose: how many lines a text takes depends
 * on the width of the panel, and the panel is narrow at one desk and half a screen wide at another.
 */
export const collapsesPaste = (text: string, minLines: number, drawnLines = 0): boolean =>
  minLines > PASTE_COLLAPSE_NEVER && Math.max(pasteLineCount(text), drawnLines) >= minLines

/**
 * How much of a text a hover hint takes - lines of a paste, characters of a quote.
 *
 * A hint is a reminder of what is inside, not a way of reading it: the panel draws all of them with one
 * element of its own (see Tooltips), and that element takes whatever it is given. A paste's whole text
 * used to be given, and a hundred lines in a hint 220 pixels wide unfolded into a strip of twenty
 * characters down the whole window, cut off wherever the window ended - unreadable, and with no way to
 * scroll it: the hint lets the pointer straight through. What is inside is read by expanding the paste
 * in the message itself (see PasteView in UserCard).
 */
const TITLE_LINES = 5
const TITLE_LINE_CHARS = 70
const QUOTE_TITLE_CHARS = 400

/** The first few lines, each of them short enough to stay a line rather than wrap into a paragraph. */
const titlePreview = (text: string): string => {
  const body = text.trim()
  const lines: string[] = []

  for (let at = 0; at < body.length && lines.length < TITLE_LINES; ) {
    const end = body.indexOf('\n', at)
    const line = body.slice(at, end < 0 ? undefined : end)
    lines.push(line.length > TITLE_LINE_CHARS ? `${line.slice(0, TITLE_LINE_CHARS)}…` : line)
    if (end < 0) return lines.join('\n')
    at = end + 1
  }

  return `${lines.join('\n')}\n…`
}

/**
 * What a chip shows on hover. One function for every place it is drawn: in the input field as a DOM
 * node and in the feed as React markup - those two tooltips must not drift apart, the chip is one and
 * the same to the person.
 *
 * Nothing here is translated, and nothing here needs to be: a path, a range and the start of the text
 * itself are the thing rather than words about it. Whatever the panel says in its own voice about a
 * paste - how many lines it holds, that it opens on a click - is said beside the chip, where the words
 * come from the dictionary.
 */
export const chipTitle = (chip: Chip): string => {
  if (chip.kind === 'quote') {
    const text = (chip.text ?? '').trim()
    return text.length > QUOTE_TITLE_CHARS ? `${text.slice(0, QUOTE_TITLE_CHARS)}…` : text
  }

  if (chip.kind === 'paste') return titlePreview(chip.text ?? '')

  /**
   * A file's chip usually needs no hint at all: the caption is the file's own name, and the hint would
   * repeat it with the folders above it in front. A hover that answers with what is already on screen is
   * a hover spent for nothing, and it covers the line under the chip while it does it.
   *
   * The exception is a name that did not fit: cut in the middle it is not readable at all, and then the
   * hint is the only place the whole of it exists.
   */
  const title = chip.range ? `${chip.value} ${chip.range}` : chip.value
  return chipLabel(chip).includes('…') ? title : ''
}

/**
 * How much of a paste is drawn when it is expanded in the message. People paste hundred-kilobyte logs
 * into the field, and a hundred kilobytes of text laid out inside the feed is a repaint the panel feels
 * on every chunk of a printing answer.
 *
 * The rest is not lost: the copy button beside the text copies the paste whole, however much of it is
 * on screen.
 */
const PASTE_OPEN_CHARS = 20_000

export interface PasteBody {
  /** The text to draw. */
  text: string
  /** How many lines of it are on screen and how many there are in all - equal when nothing was cut. */
  shownLines: number
  lines: number
}

/**
 * The expanded paste: its text, cut at the ceiling on a line boundary rather than mid-word. The cut is
 * reported as a pair of figures instead of a ready sentence - the words around them are the panel's own
 * and are chosen where it is drawn, in the language of the moment.
 */
export const pasteBody = (text: string): PasteBody => {
  const body = text.trimEnd()
  const lines = pasteLineCount(body)

  if (body.length <= PASTE_OPEN_CHARS) return { text: body, shownLines: lines, lines }

  const cut = body.lastIndexOf('\n', PASTE_OPEN_CHARS)
  const shown = body.slice(0, cut > 0 ? cut : PASTE_OPEN_CHARS)

  return { text: shown, shownLines: pasteLineCount(shown), lines }
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

/**
 * Where a reference from the editor points, read back out of its caption - so that the chip in a sent
 * message opens the editor on the very piece it was made from.
 *
 * The caption is the four shapes rangeLabel writes and nothing else: `L12`, `L12-L18`, `L12:5-30`,
 * `L12:5-L18:30`. Anything else is nobody's caption, and then the chip opens the file at its top rather
 * than somewhere guessed.
 *
 * The end column is written the way the editor counts a selection's end - the column AFTER the last
 * selected character (see SelectionReference.kt) - while a range the editor is asked to select ends on
 * its last character, the way a person counts (see OpenInEditor.select). Hence the one subtracted here:
 * without it the reopened selection was a character longer than the one that was made.
 */
export const rangePlace = (range: string): Omit<FileRef, 'path'> | null => {
  const match = RANGE.exec(range.trim())
  if (!match) return null

  const line = Number(match[1])
  const column = match[2] ? Number(match[2]) : undefined
  const endLine = match[3] ? Number(match[3]) : undefined
  const written = match[4] ?? match[5]
  const endColumn = written ? Number(written) - 1 : undefined

  return {
    line,
    ...(column === undefined ? {} : { column }),
    ...(endLine === undefined ? {} : { endLine }),
    // A selection that ends where it began on the same line is no selection: the caret alone is enough.
    ...(endColumn === undefined || (endLine === undefined && column !== undefined && endColumn < column)
      ? {}
      : { endColumn }),
  }
}

/** `L12`, `L12-L18`, `L12:5-30`, `L12:5-L18:30` - the end column of one line in the last group, of another line in the fourth. */
const RANGE = /^L(\d+)(?::(\d+))?(?:-(?:L(\d+)(?::(\d+))?|(\d+)))?$/

/**
 * The file a chip in a sent message opens, or nothing when it stands for no file.
 *
 * An attached file opens itself; a reference from the editor opens on its own selection; a pasted
 * picture opens the file the shell wrote it into (see PastedFiles.kt) - when there is one, which an old
 * shell or a failed write leaves out. A folder is not a file, a command and a quote are not even paths,
 * and a paste has its own way of opening (see PasteView).
 *
 * The same refusals as for a path in an answer (see isOpenablePath): a chip's path comes from the file
 * chooser and from what was typed after "@", and neither is a reason to reach for a network share.
 */
export const chipFile = (chip: Chip): FileRef | null => {
  if (chip.kind === 'file') return isOpenablePath(chip.value) ? { path: chip.value } : null
  if (chip.kind === 'img') return chip.path && isOpenablePath(chip.path) ? { path: chip.path } : null
  if (chip.kind === 'ref') {
    if (!isOpenablePath(chip.value)) return null
    return { path: chip.value, ...(chip.range ? rangePlace(chip.range) ?? {} : {}) }
  }
  return null
}
