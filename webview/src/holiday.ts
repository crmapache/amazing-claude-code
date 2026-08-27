/**
 * The holiday layer's gate: whether the panel is decorated right now.
 *
 * Three ornaments hang off this one answer - the garland under the header, the snow behind the feed
 * and the frozen Send button (see components/Holiday.tsx and the [data-holiday] rules). Nothing else
 * changes: the decorations are sibling nodes and one attribute, never overrides of the existing
 * cascade, so the panel outside the window is byte-for-byte the panel of the rest of the year.
 *
 * The clock is the machine's own. The panel is drawn by JCEF on the very machine the IDE runs on, so
 * `new Date()` here is the IDE's calendar - the skew that hooks/useNow.ts exists for is the phone's
 * problem, and the phone is not decorated.
 */

/** December 24 - the evening the window opens. */
const HOLIDAY_FROM = { month: 12, day: 24 }

/** January 3 - the last decorated day, inclusive. */
const HOLIDAY_TO = { month: 1, day: 3 }

export type HolidayOverride = 'auto' | 'on' | 'off'

/**
 * The switch that outranks the calendar.
 *
 * 'auto' is the shipping value: the window decides. 'on' and 'off' exist to look at the layer in the
 * sandbox and in the harness on an ordinary August afternoon.
 *
 * It has to read 'auto' when the plugin is published - anything else ships either a permanent winter or
 * a December with no winter at all - and that is held by a test rather than by remembering: the whole
 * point of the switch is that it gets flipped, and a promise kept by hand is a promise kept until the
 * one time it is not.
 */
export const HOLIDAY_OVERRIDE: HolidayOverride = 'auto'

/** Is the given moment inside the holiday window, by the local calendar? */
export const isHolidaySeason = (now: Date): boolean => {
  const month = now.getMonth() + 1
  const day = now.getDate()

  if (month === HOLIDAY_FROM.month) return day >= HOLIDAY_FROM.day
  if (month === HOLIDAY_TO.month) return day <= HOLIDAY_TO.day

  return false
}

/**
 * Whether the panel is decorated under a given switch: the switch first, the calendar otherwise.
 *
 * The switch is a parameter rather than the constant read straight from here, because a constant is
 * narrowed to the one value it currently holds: with it set to 'auto' the compiler calls the other two
 * branches unreachable and refuses the file. Passed in, all three stay live - and all three get tested.
 */
export const holidayUnder = (override: HolidayOverride, now: Date): boolean => {
  if (override === 'on') return true
  if (override === 'off') return false

  return isHolidaySeason(now)
}

/** Whether the panel is decorated right now. */
export const holidayOn = (now: Date): boolean => holidayUnder(HOLIDAY_OVERRIDE, now)

/**
 * How long until the local day turns over, plus a second of slack.
 *
 * A panel is left open for weeks, and December 23 has to become December 24 without anyone touching
 * it. The slack is there so the timer that fires on the boundary reads the new day rather than the
 * last millisecond of the old one.
 */
export const msUntilNextDay = (now: Date): number => {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  return midnight.getTime() - now.getTime() + 1000
}
