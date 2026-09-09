import type { Scenario, ScenarioSchedule } from '../protocol'
import { orderedSchedules } from './schedule'

/**
 * The scheduled runs as a timetable: what did not happen, then what is coming, grouped by the day it
 * falls on.
 *
 * A list of dates all wearing the same clothes is three arrangements of one scenario that read alike;
 * grouped by day with the hour in a gutter, the same three rows answer "when" before they are read. The
 * rules live here rather than in the screen for the reason the rest of this folder does - the panel and
 * the phone draw the same timetable, and a grouping written twice is a grouping that disagrees with
 * itself on the first change.
 *
 * One row per arrangement, never two. The hour it is placed by is the one it is next due at, because
 * this is a list of what is GOING to happen: an arrangement that has already run is remembered by the
 * run it started, in the list of past runs. The one exception is the one thing that leaves no other
 * trace at all - a one-off whose hour came while nobody was here. Nothing is ever started late, so that
 * arrangement has no next hour and no run behind it, and without a place of its own it would simply
 * vanish. It gets the band at the top, which is what the notice above the list is about.
 */

/** A day of the timetable: a moment inside it, and the arrangements due that day. */
export interface TimetableDay {
  /** The day's own name, as `yyyy-mm-dd` in the machine's timezone - the key React draws it by. */
  key: string
  /** Any moment inside the day, for the heading to format. */
  at: number
  /** How far off the day is: 0 is today, 1 tomorrow, and anything else is a date. */
  awayInDays: number
  rows: TimetableRow[]
}

export interface TimetableRow {
  schedule: ScenarioSchedule
  /** The scenario it belongs to, or null for one whose scenario is on neither shelf. */
  scenario: Scenario | null
  /** The moment the row is placed by: the hour it is next due, or the hour it missed. */
  at: number
  /** Whether that moment is an hour nobody was here for rather than one that is coming. */
  missed: boolean
}

export interface Timetable {
  /** The one-off hours that came and went with nobody here - the band above the days. */
  missed: TimetableRow[]
  days: TimetableDay[]
  /** How many arrangements there are altogether, missed ones included - the count on the tab. */
  count: number
}

export const timetableOf = (
  schedules: ScenarioSchedule[],
  scenarios: Scenario[],
  now: number = Date.now(),
): Timetable => {
  const missed: TimetableRow[] = []
  const days: TimetableDay[] = []

  for (const schedule of orderedSchedules(schedules)) {
    const scenario =
      scenarios.find((one) => one.id === schedule.scenarioId && one.scope === schedule.scope) ?? null

    if (schedule.nextAt <= 0) {
      // Nothing coming. Worth a row only when an hour of its own went by unrun - an arrangement with
      // neither is a row about nothing, and the IDE takes those off the list itself.
      if (schedule.missedAt > 0) missed.push({ schedule, scenario, at: schedule.missedAt, missed: true })
      continue
    }

    const row: TimetableRow = { schedule, scenario, at: schedule.nextAt, missed: false }
    const key = dayKey(schedule.nextAt)
    const day = days.find((one) => one.key === key)

    if (day) day.rows.push(row)
    else days.push({ key, at: schedule.nextAt, awayInDays: daysBetween(now, schedule.nextAt), rows: [row] })
  }

  return { missed, days, count: missed.length + days.reduce((sum, day) => sum + day.rows.length, 0) }
}

/**
 * A day as the machine's own calendar names it, so two moments of one evening land in one group.
 *
 * Built out of the local parts rather than out of `toISOString`, which is UTC: an evening in Sydney and
 * the morning after it share a UTC date, and the timetable would put tomorrow's hour under today.
 */
export const dayKey = (at: number): string => {
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * How many calendar days apart two moments are - not how many twenty-four hour stretches.
 *
 * Half past eleven tonight and half past midnight are an hour apart and are different days, and the
 * heading over them has to say "tomorrow" rather than "today".
 */
export const daysBetween = (from: number, to: number): number => {
  const start = new Date(from)
  const end = new Date(to)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

/**
 * How far off an hour is, as a reading rather than as a sentence: `6h`, `14m`, `2d`.
 *
 * The largest unit and only that one, because it stands in a gutter beside the hour itself: "in 6h 14m
 * 09s" answers a question nobody standing in front of a timetable is asking, and the exact minute is
 * already written above it. Not translated for the same reason "38h 10m" on the usage rings is not - it
 * is a reading off a dial, and the word "in" beside it is where the language lives.
 */
export const countdown = (ms: number): string => {
  if (ms <= 0) return 'now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
