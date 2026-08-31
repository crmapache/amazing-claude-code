import { PASTE_COLLAPSE_DEFAULT, PASTE_COLLAPSE_NEVER } from './feed/reference'
import type { Dict } from './i18n/en'

/**
 * From how many lines a pasted text folds into a chip in the input field.
 *
 * A number typed rather than a step picked off a ladder: what one is choosing here is "a paste of what
 * size is worth hiding", and where that line falls is a matter of what one pastes all day - four fixed
 * steps answered for everybody and were right for nobody in particular.
 *
 * The floor is two because one is not a smaller answer but a different one: every paste has at least a
 * line, so folding from one would fold everything, which is not what this screen is for. Zero is not on
 * the scale either - "never fold" is the other row of the screen, not the bottom of this number.
 *
 * The ceiling is round rather than argued: five hundred lines is already past any paste meant to be read
 * before sending, and a field that swallows six digits invites a number that quietly means "off" without
 * ever saying so.
 */
export const PASTE_COLLAPSE_MIN = 2
export const PASTE_COLLAPSE_MAX = 500

/**
 * What is typed in the field turns into what gets saved: a whole number inside the bounds.
 *
 * Half-typed and unreadable are the same thing here - the field is being written in, and a person who
 * has just cleared it to type a new number has not asked for anything yet. That is what the fallback is
 * for: it keeps the setting standing where it stood.
 */
export const clampPasteCollapse = (typed: string, fallback: number = PASTE_COLLAPSE_DEFAULT): number => {
  const lines = Number.parseInt(typed, 10)
  if (!Number.isFinite(lines)) return fallback

  return Math.min(PASTE_COLLAPSE_MAX, Math.max(PASTE_COLLAPSE_MIN, lines))
}

/**
 * The row's value in the settings screen. A number outside the bounds is possible - a value saved by a
 * later version, say - and it is named rather than left blank: a settings row that shows nothing reads
 * as a broken one.
 */
export const pasteCollapseSummary = (t: Dict, lines: number): string =>
  lines === PASTE_COLLAPSE_NEVER ? t.pasteCollapse.never : t.pasteCollapse.from(lines)
