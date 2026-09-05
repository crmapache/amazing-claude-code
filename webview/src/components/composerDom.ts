import { chipLabel, chipTitle } from '../feed/reference'
import type { Chip, ChipKind, UserToken } from '../feed/types'
import s from './composer.module.css'

/**
 * The input field's DOM: text and attachments mixed together as one ribbon of characters.
 *
 * This lives apart from the component because it is not React's work at all. The field is a
 * contentEditable the browser edits itself on every keystroke, and the attachments in it are live nodes
 * with their own buttons and with an image's bytes attached to the node's identity. React must never see
 * those nodes - it cannot share the contents of a contentEditable peacefully with a browser that rewrites
 * them from underneath it.
 *
 * So the component holds the state and the reactions to keys, while everything that reads the field,
 * rebuilds it and moves the caret around inside it lives here.
 */

const CHIP_STYLE: Record<ChipKind, { background: string; borderColor: string; color: string }> = {
  file: { background: 'var(--acc-accent-12)', borderColor: 'var(--acc-accent-32)', color: 'var(--acc-accent-light)' },
  img: { background: 'var(--acc-agent-12)', borderColor: 'var(--acc-agent-32)', color: 'var(--acc-agent-light)' },
  dir: { background: 'var(--acc-ok-12)', borderColor: 'var(--acc-ok-32)', color: 'var(--acc-ok-light)' },
  cmd: { background: 'var(--acc-warn-12)', borderColor: 'var(--acc-warn-32)', color: 'var(--acc-warn-light)' },
  ref: { background: 'var(--acc-branch-12)', borderColor: 'var(--acc-branch-32)', color: 'var(--acc-branch-light)' },
  quote: { background: 'var(--acc-quote-12)', borderColor: 'var(--acc-quote-32)', color: 'var(--acc-quote)' },
  // A paste from the clipboard is the one chip with no entity behind it: it is simply text that was
  // collapsed. Hence its neutral colour - it does not stand in the same row as a file, an image and a
  // command.
  paste: { background: 'var(--acc-paste-12)', borderColor: 'var(--acc-paste-32)', color: 'var(--acc-paste)' },
}

/** Whose node this is: to get an image's bytes back we do not parse the DOM into a string. */
const chipByNode = new WeakMap<HTMLElement, Chip>()

// --- Dragging files ---------------------------------------------------------

/**
 * A file is being dragged rather than a piece of text. We check by the transfer's types rather than by
 * its list of files: during a drag the browser hides the files themselves (they are visible only at the
 * moment of the drop), and there is no list here under any circumstances.
 */
export const hasFiles = (transfer: DataTransfer | null): boolean =>
  Array.from(transfer?.types ?? []).some((type) => type === 'Files' || type === 'text/uri-list')

/** file:///path → an ordinary path; anything that is not a path on disk is thrown away. */
const filePath = (value: string): string | null => {
  if (value.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(value).pathname) || null
    } catch {
      return null
    }
  }

  return value.startsWith('/') ? value : null
}

/**
 * The paths of what was dropped: both the system file manager and the IDE's project tree put them there
 * as a list of URIs, one per line. Lines starting with a hash are comments in that format rather than
 * addresses.
 */
export const droppedPaths = (transfer: DataTransfer | null): string[] => {
  if (!transfer) return []

  const list = transfer.getData('text/uri-list') || transfer.getData('text/plain')

  return list
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(filePath)
    .filter((path): path is string => path !== null)
}

// --- The caret and the field's geometry -------------------------------------

/**
 * The caret's screen coordinates relative to origin - so that the static argument hint can be printed
 * exactly where the next character would stand, without touching the field's DOM: the hint is an overlay
 * rather than part of the contents, and it does not get into the tokens.
 */
export const caretRect = (root: HTMLElement, origin: HTMLElement): { left: number; top: number; height: number } | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  const rect = range.getBoundingClientRect()
  // An empty rectangle at (0,0) means the range could not measure itself (a rare boundary between nodes);
  // staying silent is better than putting the hint into the field's corner.
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return null

  const originRect = origin.getBoundingClientRect()
  return { left: rect.left - originRect.left, top: rect.top - originRect.top, height: rect.height || 18 }
}

/**
 * The height of the opaque backing under the context bar (see .box::before in the styles): the field's
 * top pixels are covered by it, and a caret that travelled there the person would not see anyway.
 */
const FIELD_TOP_INSET_PX = 20

/** A little slack, so that the line with the caret does not stick right to the field's edge. */
const CARET_MARGIN_PX = 4

/**
 * The band on screen taken up by the line the caret stands on - or nothing, when it cannot be found at
 * all.
 *
 * A caret does not always measure itself: standing on an EMPTY line Chromium hands out no rectangles for
 * it whatsoever (checked live in the panel), and the same happens on a boundary between nodes. That
 * emptiness used to be read as "then the caret is at the end of the contents", which is true of the empty
 * last line and false of every blank line in the middle - and a message written as a list is mostly blank
 * lines. Breaking a line up in the middle of such a draft threw the field to the bottom of it, and the
 * next keystroke did it again.
 *
 * So the line is measured by the character the caret stands beside: it lies on that very line. Forward
 * first and backward second - at the end of a wrapped line the two are different lines, and the one being
 * typed into is the one ahead.
 */
const caretLine = (range: Range): { top: number; bottom: number } | null => {
  const own = range.getBoundingClientRect()
  if (own.height > 0) return own

  const node = range.startContainer
  const at = range.startOffset
  // An offset counts characters inside a text node and children inside an element - and a range over one
  // child measures that child, so both are asked in exactly the same way.
  const length = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '').length : node.childNodes.length

  for (const [from, to] of [
    [at, at + 1],
    [at - 1, at],
  ]) {
    if (from < 0 || to > length) continue

    const probe = document.createRange()
    probe.setStart(node, from)
    probe.setEnd(node, to)

    const box = probe.getBoundingClientRect()
    if (box.height > 0) return box
  }

  return null
}

/**
 * How far the field has to scroll for the line with the caret to be seen whole - zero when it already is,
 * negative upwards.
 */
export const caretScrollShift = (
  caret: { top: number; bottom: number },
  field: { top: number; bottom: number },
): number => {
  const below = caret.bottom - field.bottom
  if (below > 0) return below + CARET_MARGIN_PX

  const above = field.top + FIELD_TOP_INSET_PX - caret.top
  return above > 0 ? -(above + CARET_MARGIN_PX) : 0
}

/**
 * Keeps the caret in view.
 *
 * The field is limited in height and scrolls inside itself past that, while the browser does not always
 * bring the caret into view: a line break at the end of a long message (Shift+Enter) left the new empty
 * line below the bottom edge - one had to type blind until the field was scrolled by hand.
 */
export const scrollCaretIntoView = (root: HTMLElement) => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return

  const caret = caretLine(range)
  // Nothing measured at all: the field is left exactly where it stands. An unmeasurable caret says
  // nothing about where it is, and a guess about that costs the person the place they were writing in.
  if (!caret) return

  root.scrollTop += caretScrollShift(caret, root.getBoundingClientRect())
}

/** An empty range at the very end of the contents - the fallback when there is no caret. */
const endRange = (root: HTMLElement): Range => {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  return range
}

/** Whether a node ends in a newline - a text one; a chip can have no such tail. */
const endsWithBreak = (node: ChildNode | null): boolean =>
  node?.nodeType === Node.TEXT_NODE && (node.textContent ?? '').endsWith('\n')

/**
 * Gives the caret a place on an empty last line - and returns it there.
 *
 * A newline at the very end of the field the browser does not draw: an empty last line takes up no room,
 * and the caret has nowhere to stand on it - it collapses into the end of the previous line, and the next
 * character is printed BEFORE the break. So behind such a break we keep one more, a spare: it is what
 * gives that line. The browser does exactly the same when a break is made by insertLineBreak
 * (Shift+Enter).
 *
 * The spare break is part of the field's markup rather than of the message: it is not in the sent text,
 * the empty tail is trimmed by trimTrailingSpace.
 *
 * Returns the caret before the spare break - or nothing, when the field does not end in a break and there
 * is nothing to guard against.
 */
export const padTrailingBreak = (root: HTMLElement): Range | null => {
  const last = root.lastChild
  if (!last || last.nodeType !== Node.TEXT_NODE) return null

  const value = last.textContent ?? ''
  if (!value.endsWith('\n')) return null

  // The spare newline may already be there - the browser may have just put it in on Shift+Enter, for
  // instance. Adding it a second time is not an option: every call would push the caret one more line
  // down, and an attachment would land not on the empty line under the text but one line past it. A pair
  // of breaks may also lie in two neighbouring nodes: the browser splits the field's text as it pleases.
  const padded = value.endsWith('\n\n') || (value === '\n' && endsWithBreak(last.previousSibling))
  if (!padded) last.textContent = `${value}\n`

  const range = document.createRange()
  range.setStart(last, padded ? value.length - 1 : value.length)
  range.collapse(true)
  return range
}

export const placeCaretAtEnd = (root: HTMLElement | null) => {
  if (!root) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(padTrailingBreak(root) ?? endRange(root))
}

/** The caret right beside a chip - on the side the arrow was travelling towards. */
export const placeCaretBeside = (node: HTMLElement, side: 'before' | 'after') => {
  const range = document.createRange()
  if (side === 'before') range.setStartBefore(node)
  else range.setStartAfter(node)
  range.collapse(true)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * The caret in the field - or the end of what has been typed, when the focus is lost and there honestly
 * is no caret.
 *
 * The end of what was typed rather than of the contents: the last thing in the field may be a newline the
 * person was about to write past. endRange would put an attachment BEHIND it, adding an empty line that
 * was not in the field; padTrailingBreak returns that very place on the empty last line where the caret
 * would have stood.
 */
export const currentRange = (root: HTMLElement): Range => {
  const selection = window.getSelection()
  return selection && selection.rangeCount > 0 && root.contains(selection.getRangeAt(0).startContainer)
    ? selection.getRangeAt(0)
    : (padTrailingBreak(root) ?? endRange(root))
}

/** Whether this is a chip or an ordinary node: our own are recognised by the same table the field is read with. */
const chipNodeOf = (node: Node | null | undefined): HTMLElement | null =>
  node instanceof HTMLElement && chipByNode.has(node) ? node : null

/**
 * The chip the caret will run into on the arrow's next step - or nothing, when what lies on that side is
 * an ordinary character.
 *
 * We check the edge specifically: in the middle of a word what lies to the left of the caret is a letter
 * rather than an attachment, and there is nothing there to stop the movement for.
 */
export const chipBesideCaret = (root: HTMLElement, direction: 'backward' | 'forward'): HTMLElement | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const { startContainer, startOffset } = range
  if (!root.contains(startContainer)) return null

  if (startContainer.nodeType === Node.TEXT_NODE) {
    const length = (startContainer.textContent ?? '').length
    if (direction === 'backward' ? startOffset > 0 : startOffset < length) return null
    return chipNodeOf(direction === 'backward' ? startContainer.previousSibling : startContainer.nextSibling)
  }

  // The caret stands right between the field's children: the offset is a child's number rather than a
  // character's.
  if (startContainer === root) {
    const children = Array.from(root.childNodes)
    return chipNodeOf(children[direction === 'backward' ? startOffset - 1 : startOffset])
  }

  return null
}

/**
 * The caret before the child with this number - the place something was just cut from. Leaving it at the
 * end of the field after Cmd+X is not an option: cutting usually happens in the middle and typing carries
 * on right there.
 */
export const placeCaretBefore = (root: HTMLElement, index: number) => {
  const node = root.childNodes[index]
  if (!node) {
    placeCaretAtEnd(root)
    return
  }

  const range = document.createRange()
  range.setStartBefore(node)
  range.collapse(true)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export interface AtQuery {
  /** What has been typed after the "@" - the file is looked up by it. */
  query: string
  /** The text node the "@" stands in - the caret is in it too: an "@" does not occur between chips. */
  node: Text
  /** The "@"'s own offset in the node - the start of the range to be replaced when a file is chosen. */
  start: number
  /** The caret's offset - the end of that same range. */
  end: number
}

/** An "@" at the start of a line or after a space - the same word the caret is typing right now. */
const AT_QUERY = /(?:^|\s)@([^\s@]*)$/

/**
 * "@" searches from the caret's place rather than from the start of the field - unlike a slash command it
 * can be typed mid-sentence, as in a terminal ("look at @file and").
 */
export const atQueryAt = (root: HTMLElement): AtQuery | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) return null

  const node = range.startContainer as Text
  const text = node.textContent ?? ''
  const before = text.slice(0, range.startOffset)
  const match = AT_QUERY.exec(before)
  if (!match) return null

  const start = match.index + (match[0].startsWith('@') ? 0 : 1)
  return { query: match[1] ?? '', node, start, end: range.startOffset }
}

/**
 * The field's text from its start up to the caret - the piece a slash command is read from.
 *
 * A command is the field's beginning rather than the whole of it: one may return to the start of an
 * already written message and put a command in front of it. Everything past the caret is none of the
 * command's business - it was typed before it and stays as it is.
 *
 * Null when there is no caret in the field, or when an attachment stands before it: with something in
 * front of it a slash is no longer a command (see commandChip).
 */
export const headText = (root: HTMLElement): string | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  const { index, offset } = pointIn(root, range.startContainer, range.startOffset, 'start')
  const children = Array.from(root.childNodes)

  let head = ''
  for (const node of children.slice(0, index)) {
    if (chipNodeOf(node)) return null
    head += node.textContent ?? ''
  }

  // The caret stands inside a child: only what lies before it in that child belongs to the head. When
  // that child is a chip, nothing does - the caret is not in the text at all.
  const current = children[index]
  if (current && current.nodeType === Node.TEXT_NODE) head += (current.textContent ?? '').slice(0, offset)

  return head
}

/** The character right before a collapsed range - empty when this is not a text node. */
export const charBefore = (range: Range): string => {
  const { startContainer, startOffset } = range
  if (startContainer.nodeType !== Node.TEXT_NODE || startOffset === 0) return ''
  return (startContainer.textContent ?? '').charAt(startOffset - 1)
}

/** The character right after - the same logic, for checking what stands on the other side of an attachment. */
export const charAfter = (range: Range): string => {
  const { startContainer, startOffset } = range
  if (startContainer.nodeType !== Node.TEXT_NODE) return ''
  return (startContainer.textContent ?? '').charAt(startOffset)
}

/** Before an attachment a space is needed only when a non-space character already stands there - an empty start of the field needs none. */
export const needsLeadingSpace = (char: string): boolean => char.length > 0 && !/\s/.test(char)

/** After an attachment a space is always needed - the caret always needs somewhere to stand; it is not added twice. */
export const needsTrailingSpace = (char: string): boolean => char.length === 0 || !/\s/.test(char)

// --- Chips ------------------------------------------------------------------

/**
 * Take a chip out of the field.
 *
 * A chip lives outside React (the node itself is plain DOM rather than JSX), so its removal is reported
 * the same way the browser would have reported it: with an ordinary 'input' event bubbling up to the
 * onInput handler. Going around that is not an option - reading the field back is where the finishing
 * touches happen: clearing the lone <br> Chromium leaves behind (without which the placeholder does not
 * come back in an emptied field) and turning a finished command name into a chip.
 *
 * Shared by both ways of removing one: the cross on the chip itself and backspace on a chip the caret
 * has reached (see Composer). Written out twice, the next change to what removal does would land in one
 * of them and quietly miss the other.
 */
export const removeChip = (root: HTMLElement, node: HTMLElement) => {
  node.remove()
  root.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * A collapsed paste was returned to the field as ordinary text. By the same route as a removal: we
 * replace the node and tell the field through 'input'.
 *
 * normalize() is there so that the text taking the chip's place merges with its neighbouring pieces into
 * one node: otherwise reading the field would return several text tokens in a row instead of one, and a
 * later edit of that place would count as an edit of different pieces.
 */
const onChipExpanded = (root: HTMLElement, node: HTMLElement, text: string) => {
  node.replaceWith(document.createTextNode(text))
  root.normalize()
  root.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * A chip together with its buttons, tied to a particular field: both buttons edit its contents, so both
 * have to know that field.
 */
export const chipNodeIn = (root: HTMLElement, chip: Chip): HTMLElement => {
  const node: HTMLElement = renderChipNode(
    chip,
    () => removeChip(root, node),
    // There is something to expand back only for a paste: behind the other chips' captions stands a path
    // or bytes rather than text that was typed by hand.
    chip.kind === 'paste' ? () => onChipExpanded(root, node, chip.text ?? '') : undefined,
  )
  return node
}

/** Rebuilds the DOM from tokens, from scratch - for programmatic edits only, not for typing. */
export const rebuildDom = (root: HTMLElement, tokens: UserToken[]) => {
  root.innerHTML = ''

  for (const token of tokens) {
    if (token.kind === 'text') {
      root.appendChild(document.createTextNode(token.value))
      continue
    }

    const node = chipNodeIn(root, token.chip)
    root.appendChild(node)
  }

  /*
   * The spare last line, put in here rather than left to placeCaretAtEnd below.
   *
   * It is guesswork down there and a fact up here: a message never carries a spare (withoutCaretLine
   * takes it off), so a field just built from one has none, whereas a live field's text cannot say which
   * of its trailing breaks is markup and which the person typed. The guess reads a pair of them as
   * "already spare" - true of a field the browser has just padded, false of a message that ends on a
   * blank line, and a list written with an empty line at the end is exactly that.
   *
   * Read as spare, that blank line was dropped on every rebuild - a tab switched, the layout changed, a
   * rewrite come back - and the caret came back to the end of the line above it, where the next character
   * was then typed.
   */
  const last = root.lastChild
  if (last?.nodeType === Node.TEXT_NODE) {
    const tail = last.textContent ?? ''
    if (tail.endsWith('\n')) last.textContent = `${tail}\n`
  }

  placeCaretAtEnd(root)
}

/** Reads the DOM back into tokens - called after every keystroke and every edit. */
/**
 * Where a pasted picture ended up on disk, written onto the chip that is already in the field.
 *
 * The path arrives a moment after the paste - the shell has to decode and write the bytes first (see
 * PastedFiles.kt) - and by then the chip is long since standing in the field. Nothing on screen changes:
 * the caption stays the number it was, and only what the chip means outside the panel gets better, which
 * is exactly what a copy of the message will need.
 *
 * Matched by the bytes rather than by position: between the paste and the answer the person may have
 * typed, pasted again or deleted something else entirely. Two chips holding the same bytes are the same
 * picture pasted twice, and one file is the honest answer for both.
 */
export const notePastedPath = (root: HTMLElement, data: string, path: string): boolean => {
  let changed = false

  for (const node of Array.from(root.childNodes)) {
    if (!(node instanceof HTMLElement)) continue

    const chip = chipByNode.get(node)
    if (!chip || chip.kind !== 'img' || chip.data !== data || chip.path === path) continue

    chipByNode.set(node, { ...chip, path })
    changed = true
  }

  return changed
}

/**
 * How many lines a text would take in the field as it stands - the lines a person sees, not the ones the
 * text is written in.
 *
 * The folding of a long paste is set in lines (see collapsesPaste), and counting only the line breaks
 * missed the case it exists for: a wall of text copied out of a browser or a log viewer often arrives as
 * one single line, and one line is below every threshold. In a field a few hundred pixels wide that line
 * is forty, and the message it was pasted into had to be scrolled to be read.
 *
 * Measured rather than guessed from a character count: the panel is narrow at one desk and half a screen
 * wide at another, and the same paragraph is four lines here and one there. The measuring copy carries
 * the field's own font and width - the font comes from the IDE's settings and is nothing this side can
 * assume.
 */
export const wrappedLineCount = (field: HTMLElement, text: string, atLeast = 1): number => {
  const style = getComputedStyle(field)
  const width = field.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
  if (!(width > 0) || text.length === 0) return 0

  /*
   * Long texts are answered without laying them out at all. No character in any font at any size is
   * narrower than a few pixels, so a text longer than "the widest possible line times the number of lines
   * asked about" cannot fit into fewer lines than that - and laying out a hundred kilobytes to learn it
   * costs a visible pause on the very paste that most needs to be quick.
   */
  const ceiling = Math.max(1, atLeast) * Math.ceil(width / NARROWEST_CHARACTER)
  if (text.length > ceiling) return Math.max(1, atLeast)

  const ruler = document.createElement('div')
  ruler.style.position = 'fixed'
  ruler.style.top = '-10000px'
  ruler.style.left = '0'
  ruler.style.visibility = 'hidden'
  ruler.style.pointerEvents = 'none'
  ruler.style.width = `${width}px`
  ruler.style.font = style.font
  ruler.style.letterSpacing = style.letterSpacing
  ruler.style.whiteSpace = 'pre-wrap'
  ruler.style.overflowWrap = style.overflowWrap
  ruler.style.wordBreak = style.wordBreak
  ruler.style.tabSize = style.tabSize

  document.body.append(ruler)

  // One line of this font at this width, asked of the same element - `line-height: normal` is a number
  // nobody outside the layout knows, and every count here is a division by it.
  ruler.textContent = 'X'
  const line = ruler.getBoundingClientRect().height

  ruler.textContent = text
  const height = ruler.getBoundingClientRect().height

  ruler.remove()

  return line > 0 ? Math.max(1, Math.round(height / line)) : 0
}

/** No glyph is thinner than this, whatever the font - see the ceiling above. */
const NARROWEST_CHARACTER = 4

/**
 * What an element of the field that is not a chip puts into the message.
 *
 * Every such element is the browser's own doing: against our intentions it splits the field into blocks
 * (see handleKeyDown about Shift+Enter), and it writes a <br> of its own wherever the caret needs a line
 * to stand on. Both draw a line, so both are read as one - a line break, and after it whatever text the
 * element holds.
 *
 * An EMPTY one is that line break and nothing else, and skipping it is what this is here to stop. Chromium
 * leaves one behind whenever a delete takes the last character off the spare last line (see
 * padTrailingBreak): the <br> it puts in place of the spare newline draws exactly the line that newline
 * drew - `one` + `\n` + `<br>` and `one` + `\n` + `\n` are the same two lines on screen, measured. Read as
 * nothing, it made the message one break shorter than the field was showing, and withoutCaretLine below
 * then took the person's own last break for the spare and ate it too.
 *
 * What that cost was the line itself, one rebuild later. The field is rebuilt from the message whenever
 * anything comes from outside - a tab switched, the layout changed under a resized panel, a rewrite come
 * back - and it was rebuilt one line shorter: the empty last line went, and the caret went with it, to the
 * end of the line above. The next character was then typed there, a line up from where it was asked for.
 *
 * Nothing at all is put in while nothing has been read yet: an empty field is a lone <br> in Chromium, and
 * a break read out of that one would be a draft that is never empty again (see applyEdit).
 */
export const blockText = (text: string, hasEarlier: boolean): string | null => {
  if (hasEarlier) return `\n${text}`
  return text || null
}

export const extractTokens = (root: HTMLElement): UserToken[] => {
  const tokens: UserToken[] = []

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? ''
      if (value) tokens.push({ kind: 'text', value })
      continue
    }

    if (node instanceof HTMLElement) {
      const chip = chipByNode.get(node)
      if (chip) {
        tokens.push({ kind: 'chip', chip })
        continue
      }

      // Losing a whole node silently is not an option - that is how a second line used to disappear when
      // the browser, against our intentions, split the field into blocks, and how the spare last line's
      // <br> used to take the person's last break down with it. The rule is in blockText above.
      const value = blockText(node.textContent ?? '', tokens.length > 0)
      if (value !== null) tokens.push({ kind: 'text', value })
    }
  }

  return withoutCaretLine(tokens)
}

/**
 * Removes the spare newline the caret stands on (see padTrailingBreak): it is part of the field's markup
 * rather than of the message that was typed.
 *
 * Without this it got into the panel's state and came back into the field on every restore - an undo, the
 * message history, a tab switch - while the field appended a spare one afresh, and the tail grew every
 * time.
 */
const withoutCaretLine = (tokens: UserToken[]): UserToken[] => {
  const last = tokens[tokens.length - 1]
  if (!last || last.kind !== 'text' || !last.value.endsWith('\n')) return tokens

  const value = last.value.slice(0, -1)
  return value ? [...tokens.slice(0, -1), { kind: 'text', value }] : tokens.slice(0, -1)
}

/** A selection boundary's place in the field: which child, and how many characters from its start. */
interface Point {
  index: number
  offset: number
}

/**
 * Brings a selection's boundary to the field's flat coordinates.
 *
 * The field's children are flat - top-level text nodes and chips - while the browser puts a boundary
 * anywhere: in the field itself between children, inside text, and inside a chip, having landed in its
 * icon or its cross. A chip is indivisible, so a boundary inside one is pressed to the nearest edge: a
 * selection's start to the left one, its end to the right one. Otherwise, selecting a chip with the
 * mouse, a person would copy half of its insides.
 */
const pointIn = (root: HTMLElement, container: Node, offset: number, side: 'start' | 'end'): Point => {
  const children = Array.from(root.childNodes)

  // The boundary is in the field itself: the offset is a child's number rather than a character's.
  if (container === root) return { index: Math.min(offset, children.length), offset: 0 }

  let node: Node | null = container
  while (node && node.parentNode !== root) node = node.parentNode

  const index = node ? children.indexOf(node as ChildNode) : -1
  // The boundary is not from this field at all - we count it as past its end.
  if (index < 0) return { index: children.length, offset: 0 }

  if (node === container && container.nodeType === Node.TEXT_NODE) return { index, offset }

  return side === 'start' ? { index, offset: 0 } : { index: index + 1, offset: 0 }
}

/**
 * Splits the field's contents by a selection: what fell inside it and what is left.
 *
 * The chips' data is taken from the same table by the live node as extractTokens uses - which is why an
 * image's bytes survive a copy although they are not in the DOM at all.
 */
export const splitTokens = (
  root: HTMLElement,
  range: Range,
): { picked: UserToken[]; rest: UserToken[]; caret: number } => {
  const start = pointIn(root, range.startContainer, range.startOffset, 'start')
  const end = pointIn(root, range.endContainer, range.endOffset, 'end')

  const picked: UserToken[] = []
  const rest: UserToken[] = []
  /** How much of what stood BEFORE the selection is left - the caret goes back there. */
  let caret = 0

  const keep = (token: UserToken | null, before: boolean) => {
    if (token) rest.push(token)
    if (before) caret = rest.length
  }
  const asText = (value: string): UserToken | null => (value ? { kind: 'text', value } : null)

  /**
   * Not our node - read by the same rule as in extractTokens (see blockText), so that the two walks say
   * the same thing about the same field: an empty one is a line break of its own rather than nothing.
   */
  const asBlock = (value: string, into: UserToken[]): UserToken | null =>
    asText(blockText(value, into.length > 0) ?? '')

  Array.from(root.childNodes).forEach((node, index) => {
    if (node instanceof HTMLElement) {
      const chip = chipByNode.get(node)
      const raw = node.textContent ?? ''

      // A chip takes its place whole: it is inside the selection only when the selection began no later
      // than it and ended strictly after it.
      if (index >= start.index && index < end.index) {
        const token = chip ? ({ kind: 'chip', chip } as UserToken) : asBlock(raw, picked)
        if (token) picked.push(token)
        return
      }

      keep(chip ? { kind: 'chip', chip } : asBlock(raw, rest), index < start.index)
      return
    }

    const value = node.textContent ?? ''

    if (index < start.index) {
      keep(asText(value), true)
      return
    }
    if (index > end.index) {
      keep(asText(value), false)
      return
    }

    const from = index === start.index ? Math.min(start.offset, value.length) : 0
    const to = index === end.index ? Math.min(end.offset, value.length) : value.length

    const inside = asText(value.slice(from, to))
    if (inside) picked.push(inside)
    keep(asText(value.slice(0, from)), true)
    keep(asText(value.slice(to)), false)
  })

  return { picked, rest, caret }
}

/**
 * Brings the images' captions into line with their place in the field.
 *
 * The number in a chip used to be remembered at the moment of insertion and then lied: delete the first
 * of two images and the second stayed "#2", although it will travel to the agent first. We count the
 * number from the facts, as the message's text does, so that what is seen and what is sent agree. The
 * chip is rebuilt as a new object rather than edited in place: that same object lies in the panel's
 * state, and changing it behind its back is not an option.
 */
export const relabelImages = (root: HTMLElement, base: number): boolean => {
  let ordinal = base
  let changed = false

  for (const node of Array.from(root.childNodes)) {
    if (!(node instanceof HTMLElement)) continue

    const chip = chipByNode.get(node)
    if (!chip || chip.kind !== 'img' || !chip.data) continue

    ordinal += 1
    const value = `Image #${ordinal}`
    if (chip.value === value) continue

    const next: Chip = { ...chip, value }
    chipByNode.set(node, next)
    node.title = value

    const label = Array.from(node.childNodes).find((child) => child.nodeType === Node.TEXT_NODE)
    if (label) label.textContent = chipLabel(next)
    changed = true
  }

  return changed
}

/**
 * Builds an attachment chip as an ordinary DOM node rather than JSX: React cannot peacefully share the
 * contents of a contentEditable with a browser that edits the DOM itself on every typed character - these
 * nodes React must never see.
 */
const renderChipNode = (chip: Chip, onRemove: () => void, onExpand?: () => void): HTMLElement => {
  const node = document.createElement('span')
  node.className = s.token ?? ''
  node.contentEditable = 'false'
  // Empty means "nothing a hover would add" (see chipTitle) - and an empty title attribute is not a
  // hover at all, which is exactly what is wanted.
  node.title = chipTitle(chip)
  Object.assign(node.style, CHIP_STYLE[chip.kind])

  // There is deliberately no attachment type icon here: it added nothing to the caption while taking up
  // room at the chip's start. The type is visible from the colour and from the caption itself.
  node.appendChild(document.createTextNode(chipLabel(chip)))

  /**
   * Only on a collapsed paste: it is the one chip with nothing behind it but text - which means there is
   * something to expand back. A drawn pencil rather than a character from the font: a pilcrow stood here
   * and said nothing at all about what the button does, while an arrow the panel's monospaced font does not
   * have at all - it gets substituted from another one and stands beside the cross at a slightly different
   * size. Drawn in the same manner as the rest of the composer's icons (see Paperclip in Composer.tsx).
   */
  if (onExpand) {
    const expand = document.createElement('button')
    expand.type = 'button'
    expand.className = s.tokenExpand ?? ''
    expand.innerHTML =
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>'
    expand.title = 'Insert as plain text'
    expand.addEventListener('click', (event) => {
      event.stopPropagation()
      onExpand()
    })
    node.appendChild(expand)
  }

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = s.tokenRemove ?? ''
  remove.textContent = '×'
  remove.addEventListener('click', (event) => {
    event.stopPropagation()
    onRemove()
  })
  node.appendChild(remove)

  chipByNode.set(node, chip)
  return node
}
