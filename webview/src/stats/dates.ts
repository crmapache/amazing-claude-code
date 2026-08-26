/**
 * Calendar arithmetic over the "2026-08-26" strings the ledger keys its days by.
 *
 * Strings rather than Date objects on purpose: a day in the ledger is a day by the IDE's calendar, and
 * a Date made from it would slide across midnight in any time zone but the IDE's own. All the ranges the
 * tab shows are counted in these, and only the day-of-week question needs a real date - at noon, where
 * no zone can move it.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** The day as a number of days since the epoch - what makes "how many days apart" a subtraction. */
export const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T12:00:00Z`) / DAY_MS)

const pad = (value: number): string => String(value).padStart(2, '0')

/** The day a number of days from the epoch - the reverse of dayNumber. */
export const dayFromNumber = (number: number): string => {
  const date = new Date(number * DAY_MS + DAY_MS / 2)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export const addDays = (date: string, days: number): string => dayFromNumber(dayNumber(date) + days)

/** 0 for Monday through 6 for Sunday - the calendar's rows. */
export const weekday = (date: string): number => {
  const day = new Date(Date.parse(`${date}T12:00:00Z`)).getUTCDay()
  return (day + 6) % 7
}

/** Every day from the first to the last, both included. */
export const daysBetween = (from: string, to: string): string[] => {
  const start = dayNumber(from)
  const end = dayNumber(to)
  if (end < start) return []
  const out: string[] = []
  for (let day = start; day <= end; day++) out.push(dayFromNumber(day))
  return out
}

/** "2026-08-26" out of a moment, by the browser's own calendar. */
export const dayOf = (at: number): string => {
  const date = new Date(at)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
