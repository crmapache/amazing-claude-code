/**
 * What lies in a clipboard, and which of the two clipboards a paste is taken from.
 *
 * Split out of clipboard.ts and held by a test for the same reason as clipboardKeys: it is wrong
 * silently and on one system only. The bridge exists for Linux alone, so a paste taking the wrong side
 * here is invisible on a Mac and is reported as "the panel pastes the same thing every time" - which is
 * exactly how it was reported.
 *
 * There are two clipboards because on Linux the embedded browser has no window and therefore no
 * ownership of the system one, and quietly keeps a private one in memory instead (see clipboard.ts).
 * That private one is filled by copying inside the panel and by nothing else, ever - and every such copy
 * the bridge mirrors into the system clipboard anyway. So the system clipboard knows everything the
 * private one knows and everything else besides, and the private one, once filled, goes on answering
 * with its one snapshot for the rest of the session.
 *
 * Hence the rule this file exists for: **the system clipboard wins, and the browser's is a spare.** The
 * spare is not decoration: reading on X11 is a request to another application that is free to stay
 * silent, and without it a paste inside the panel - the one case that works today without leaving the
 * browser - would stop working on a clipboard that does not answer.
 */

/** The clipboard's contents in the shape the page understands. */
export interface ClipboardContent {
  text: string
  html: string
  /** An image as a data URL: there is no other way to carry bytes through a text channel. */
  image: string
  /** Files as they came: a document copied in a file manager is one, and has no data URL at all. */
  files: File[]
}

export const EMPTY_CLIPBOARD: ClipboardContent = { text: '', html: '', image: '', files: [] }

/**
 * Whether there is anything at all to paste. Files count: a screenshot arrives precisely as one, and
 * there may be no text beside it.
 */
export const isEmptyClipboard = (content: ClipboardContent): boolean =>
  !content.text && !content.html && !content.image && content.files.length === 0

/**
 * Which of the two is pasted.
 *
 * Not "whichever is fuller" and not "whichever is newer" - neither is knowable. The system clipboard is
 * taken whenever it said anything at all, and the browser's snapshot only stands in for a clipboard that
 * answered with nothing: either it is genuinely empty, in which case the spare is the only thing there
 * is, or it never answered, in which case the spare is better than a paste that does nothing.
 */
export const pickPasted = (system: ClipboardContent, browser: ClipboardContent): ClipboardContent =>
  isEmptyClipboard(system) ? browser : system
