/**
 * The panel's own text size - a whole number of points, or nought for "the console font's".
 *
 * The page never draws at this size itself: the IDE zooms the whole page from it (see IdeTypography.kt),
 * which is what keeps every padding and chip in proportion with the text. What lives here is only the
 * arithmetic the settings screen does with it. The bounds are the IDE's (ClaudePreferences.textSize) - a
 * value outside them is refused there and read back as "follows".
 */

export const TEXT_SIZE_FOLLOW = 0
export const TEXT_SIZE_MIN = 8
export const TEXT_SIZE_MAX = 32

/** The console font's size while the IDE has not said it yet: the panel's own design size. */
export const DESIGN_SIZE = 13

export interface TextSize {
  /** What the setting holds: a size in points, or [TEXT_SIZE_FOLLOW]. */
  chosen: number
  /** The console font's size, which may be fractional - the IDE accepts 13.5. */
  console: number
}

/** A size from the IDE or from a press, held to what the IDE would keep. */
export const normalizeTextSize = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= TEXT_SIZE_MIN && value <= TEXT_SIZE_MAX
    ? value
    : TEXT_SIZE_FOLLOW

/** The size the panel is drawn at: its own, or the console's while it has none. */
export const drawnSize = (size: TextSize): number =>
  size.chosen === TEXT_SIZE_FOLLOW ? size.console : size.chosen

/**
 * One press of the smaller or larger button: a whole point away from what is drawn now.
 *
 * From a fractional console size the first step lands on the whole point next to it rather than a whole
 * point past it - 13.5 goes to 14 or to 13, not to 14.5 and 12.5, which are not sizes this setting can
 * hold, nor to 15 and 12, which skip one the person could see was there.
 */
export const stepTextSize = (size: TextSize, direction: 1 | -1): number => {
  const from = drawnSize(size)
  const next = direction > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1

  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, next))
}

/**
 * What "a size of its own" picks when it is pressed: the size already set, or - coming from the console's -
 * the whole point nearest to what is on the screen, so that choosing to stop following changes nothing
 * that can be seen. Only the IDE's next change of font stops reaching the panel.
 */
export const ownTextSize = (size: TextSize): number => {
  if (size.chosen !== TEXT_SIZE_FOLLOW) return size.chosen

  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(size.console)))
}

/** How a size is written on the screen - the unit is the IDE's own, and the same in every language. */
export const formatPoints = (size: number): string =>
  `${Number.isInteger(size) ? size : Number(size.toFixed(1))} pt`
