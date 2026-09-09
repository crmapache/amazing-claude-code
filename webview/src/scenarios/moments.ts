import { daysBetween } from './timetable'

/**
 * When something happened, as short as a row of a list allows.
 *
 * The whole stamp with its seconds and its AM is the width of the name beside it, and nobody reading a
 * list of past runs is choosing between two of them by the second. The clock is twenty-four hour because
 * a scheduled hour on the same screen is - two clocks in one list read as two different times.
 *
 * Here rather than on either screen because the panel and the phone both draw the list, and a second copy
 * of the formatting is what makes one of them say "5 Sep, 03:00" and the other "9/5/26, 3:00 AM".
 *
 * The formatters are built once per language and kept. Building one costs orders of magnitude more than
 * using it, and this is called for every run on the screen on every redraw of a list that redraws whenever
 * anything moves.
 */

const DAYS = new Map<string, Intl.DateTimeFormat>()
const CLOCKS = new Map<string, Intl.DateTimeFormat>()

const formatter = (
  kept: Map<string, Intl.DateTimeFormat>,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  let found = kept.get(locale)
  if (!found) {
    found = new Intl.DateTimeFormat(locale, options)
    kept.set(locale, found)
  }
  return found
}

/** "5 Sep, 03:00" - a day and the hour on it. */
export const dayAndHour = (at: number, locale: string): string =>
  formatter(DAYS, locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at))

/** "22:21" - the hour alone, for a day the row names in words. */
export const clockOnly = (at: number, locale: string): string =>
  formatter(CLOCKS, locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at))

/**
 * When a run started, as the table of past runs writes it.
 *
 * Today and yesterday are said in words because those are the two everybody is actually looking for, and
 * "8 Sep" over a run that finished an hour ago makes somebody count dates to find out it is today's.
 */
export const startedLabel = (
  at: number,
  locale: string,
  words: { todayAt: (clock: string) => string; yesterdayAt: (clock: string) => string },
  now: number = Date.now(),
): string => {
  const away = daysBetween(now, at)
  if (away === 0) return words.todayAt(clockOnly(at, locale))
  if (away === -1) return words.yesterdayAt(clockOnly(at, locale))
  return dayAndHour(at, locale)
}
