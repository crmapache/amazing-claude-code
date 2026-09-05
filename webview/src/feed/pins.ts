import { paragraphsText } from './markdown'
import { chipLabel, hintPreview } from './reference'
import type { FeedItem, FeedRowItem, TextItem, UserItem } from './types'

/**
 * The messages pinned to the top of a conversation - what the strip above the feed is built from.
 *
 * The rules live here rather than in the components because they break silently: a pin that resolves to
 * the wrong row jumps somewhere plausible and wrong, and a preview that keeps the whole of a hundred
 * kilobyte paste is a hover hint the width of the window (see chipTitle for that same lesson).
 */

/**
 * How many pins the strip holds.
 *
 * Three lines is the most that can stand over a feed without becoming a second feed: past that the thing
 * meant to help one read the conversation starts taking the room the conversation is read in.
 *
 * A fourth is refused rather than let in over the oldest: a pin is a mark somebody put there on purpose,
 * and quietly dropping one of three to make room throws away exactly that. The panel says so before the
 * press instead - the buttons of everything not yet pinned go dead and their hint asks for a pin to be
 * taken off first (see PinButton).
 */
export const PIN_LIMIT = 3

/**
 * What can be pinned: a message of one's own and the agent's answer, and nothing else.
 *
 * Everything else in the feed is machinery - a call, a thought, a turn's outcome - and machinery is
 * looked at while it runs rather than come back to. What one comes back to is the errand that was given
 * and the answer that was got.
 */
export type PinnedItem = UserItem | TextItem

export const isPinnable = (item: FeedItem): item is PinnedItem => item.kind === 'user' || item.kind === 'text'

/**
 * Pin or unpin, by the row's number in the feed.
 *
 * A full strip takes nothing new, and the same array comes back: the buttons are dead by then anyway (see
 * PinButton), and the rule lives here rather than only in them because it is the one that decides what a
 * pin is worth - a mark that stays until it is taken off, not the last three things touched.
 *
 * What the strip shows is the order of the conversation itself (see pinnedRows), not the order kept here:
 * three pins read as a small table of contents only while they stand in the order they were said in.
 */
export const togglePin = (pins: readonly string[], id: string): readonly string[] => {
  if (pins.includes(id)) return pins.filter((one) => one !== id)
  // The very same array when there is no room: the reducer above compares it and leaves the state alone.
  return pins.length >= PIN_LIMIT ? pins : [...pins, id]
}

/**
 * The pinned rows, in the order they stand in the conversation.
 *
 * Resolved against the feed rather than remembered as text: a pin that names a row no longer there - a
 * conversation cleared, a journal replayed afresh - simply drops out of the strip instead of leading
 * somewhere that no longer exists.
 */
export const pinnedRows = (rows: readonly FeedRowItem[], pins: readonly string[]): PinnedItem[] =>
  pins.length === 0 ? [] : rows.filter((item): item is PinnedItem => isPinnable(item) && pins.includes(item.id))

/**
 * A sent message as plain text - the chips wearing the captions they wear on screen rather than the paths
 * the agent was handed (see clipboardText for the other side of that choice). This is a reminder of what
 * was said, and a reminder has to look like what one saw.
 */
const sentText = (item: UserItem): string =>
  [
    ...item.quotes.map((quote) => `> ${quote}`),
    item.tokens.map((token) => (token.kind === 'text' ? token.value : chipLabel(token.chip))).join(''),
  ]
    .filter((part) => part.trim() !== '')
    .join('\n')

const pinText = (item: PinnedItem): string =>
  item.kind === 'text' ? paragraphsText(item.paragraphs) : sentText(item)

/**
 * How much of a pinned message reaches the strip.
 *
 * The visible cut is the browser's own (one line, an ellipsis at the end - see .pinText), and it follows
 * the panel's width the way no count of characters could. This is the guard under it: what goes into the
 * DOM is a line rather than the hundred kilobytes somebody pasted, and the strip is rebuilt on every
 * chunk of an answer printing below it.
 */
const PIN_LINE_CHARS = 200

/** The pinned message on one line: whitespace collapsed, and only as much of it as a line can want. */
export const pinLine = (item: PinnedItem): string => {
  const text = pinText(item).replace(/\s+/g, ' ').trim()
  return text.length > PIN_LINE_CHARS ? `${text.slice(0, PIN_LINE_CHARS)}…` : text
}

/**
 * The same message on hover - the first few lines of it, cut exactly as a chip's hint is.
 *
 * Not the whole text, and the rule is the panel's rather than this strip's: one element draws every hint
 * in the panel, 220 pixels wide, and text that gets past the source unfolds into a strip down the whole
 * window with no way to scroll it (see chipTitle and tooltip.module.css).
 */
export const pinHint = (item: PinnedItem): string => hintPreview(pinText(item))
