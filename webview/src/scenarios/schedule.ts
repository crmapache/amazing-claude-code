import type { ScenarioSchedule, ScenarioScope } from '../protocol'

/**
 * What a scenario's hour says on the screen, as facts rather than words.
 *
 * The IDE keeps the hour and works out when it is next due (see ScheduleClock); this side only has to
 * decide what to show about it, and that is two answers - a run coming and an hour that was missed. There
 * used to be a third, "a one-off that has already been and gone", and it is gone with the record: an
 * arrangement that actually started something is remembered by the run it started, in the list of past
 * runs, and a list of what is GOING to happen would otherwise fill up with things that already have.
 *
 * Facts rather than sentences for the reason the whole feed works that way: the panel speaks ten languages
 * and the words are chosen where they are drawn. The list rules live here for the reason the rest of this
 * folder does - two screens read them, the panel and the phone.
 */
export interface ScheduleNote {
  /** When the next run is due, in epoch millis - null when nothing is coming. */
  next: number | null
  /** The hour that came while nobody was here, when there was one. */
  missed: number | null
}

export const scheduleNote = (schedule: ScenarioSchedule): ScheduleNote => ({
  next: schedule.nextAt > 0 ? schedule.nextAt : null,
  missed: schedule.missedAt > 0 ? schedule.missedAt : null,
})

/** The scheduled runs of one scenario, in the order the list draws them (see [orderedSchedules]). */
export const schedulesOf = (
  schedules: ScenarioSchedule[],
  scenario: { id: string; scope: ScenarioScope },
): ScenarioSchedule[] =>
  orderedSchedules(
    schedules.filter((one) => one.scenarioId === scenario.id && one.scope === scenario.scope),
  )

/**
 * The order the scheduled runs are read in: what did not happen first, then what is coming, soonest last.
 *
 * A missed hour leads because it is news - nothing is ever started late, so that row is the only trace a
 * night nobody was here for leaves at all, and a list that buries it under tomorrow's arrangements buries
 * the one line somebody has to see.
 *
 * The rest go by the moment they are next due rather than by the hour on the clock. A one-off set at ten
 * in the morning for eight is due TOMORROW at eight, and sorted by minutes-from-midnight it would stand
 * above this evening's - a list that says, of two rows, that the later one comes first.
 */
export const orderedSchedules = (schedules: ScenarioSchedule[]): ScenarioSchedule[] =>
  [...schedules].sort((a, b) => {
    const missed = Number(b.missedAt > 0 && b.nextAt === 0) - Number(a.missedAt > 0 && a.nextAt === 0)
    if (missed !== 0) return missed
    if (a.nextAt !== b.nextAt) return (a.nextAt || Number.MAX_SAFE_INTEGER) - (b.nextAt || Number.MAX_SAFE_INTEGER)
    return a.at - b.at
  })

/**
 * What a scenario's row says about its scheduled runs: how many there are and what is worth saying.
 *
 * One line and one line only, whatever the number, because that row is a row of a list: with the count,
 * the soonest hour and a missed one all on it at once, the whole thing wraps to three lines in a panel
 * 350 pixels wide, and a shelf where one row is three deep reads as broken.
 *
 * Null for a scenario nobody has scheduled - then the row says nothing at all, as it did before any of
 * this existed.
 */
export interface ScheduleSummary {
  count: number
  next: number | null
  missed: number | null
}

export const nextNote = (schedules: ScenarioSchedule[]): ScheduleSummary | null => {
  if (schedules.length === 0) return null

  /*
   * A missed hour is taken from the arrangements that still have one coming, and only from those.
   *
   * The mark is drawn INSTEAD of the next run (see HourLine), so whoever holds it speaks for the whole
   * scenario. A one-off that was missed holds it for ever - there is no later hour of its own to clear it
   * - and holding it, one dead arrangement hid the coming run of a daily one on that row for good, while
   * that one ran perfectly every single morning.
   *
   * With nothing coming anywhere it IS the only thing left to say, so then it is said: a shelf row that
   * goes silent about a morning nobody was here for is the other half of the same mistake.
   */
  const living = schedules.filter((one) => one.nextAt > 0)
  const speaking = living.length > 0 ? living : schedules
  const missed = speaking.map((one) => one.missedAt).filter((at) => at > 0)

  return {
    count: schedules.length,
    next: living.length > 0 ? Math.min(...living.map((one) => one.nextAt)) : null,
    // The most recent one, because that is the night somebody is being told about.
    missed: missed.length > 0 ? Math.max(...missed) : null,
  }
}

/**
 * The hour as it is written on a clock: 570 is "09:30".
 *
 * Not translated and not localised into twelve-hour time on purpose - it is the value of the field the
 * hour was typed into (`<input type="time">`, which is 24-hour in its value whatever it draws), and a row
 * that says a different number from the form that set it reads as a row about something else.
 */
export const clockLabel = (minutes: number): string => {
  const safe = Math.min(Math.max(Math.round(minutes), 0), 24 * 60 - 1)
  const hours = Math.floor(safe / 60)
  return `${String(hours).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

/** Two digits, as a clock writes them: 9 is "09". */
export const pad2 = (value: number): string => String(value).padStart(2, '0')

/**
 * What the two little menus of the hour offer.
 *
 * Menus rather than a `<input type="time">`, which the browser inside the IDE draws in its own white
 * system panel - a chunk of Chromium in the middle of the panel's own dark form, and the one control on
 * the screen that belongs to somebody else. These are the same buttons MODEL and MODE are (see Picker).
 *
 * Five minutes at a time, because this is a standing arrangement with a morning rather than an alarm: an
 * hour on the dot is what people set, and the whole hour in one-minute steps is sixty rows to scroll for
 * a choice nobody makes.
 */
export const HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour)

export const MINUTES: readonly number[] = Array.from({ length: 12 }, (_, step) => step * 5)

/**
 * The hour the form opens on when the scenario has none: about an hour from now.
 *
 * An hour ahead rather than a fixed nine in the morning, because the commonest thing to schedule is the
 * thing being looked at right now - "not this second, but let me finish what I am doing first". Nine was
 * a guess about somebody's morning; this is a guess about the next hour of theirs, which is the one they
 * are actually in.
 *
 * Rounded UP to the five minutes the menu offers (see MINUTES), so the suggestion is always a little more
 * than an hour rather than a little less - and always a value the minute menu can show.
 */
export const defaultHour = (now: number = Date.now()): number => {
  const then = new Date(now)
  const minutes = then.getHours() * 60 + then.getMinutes() + 60
  const rounded = Math.ceil(minutes / 5) * 5

  // Past midnight it is tomorrow's small hours, and an hour of a day is what this is: 23:40 gives 00:40.
  return rounded % (24 * 60)
}

/**
 * The day a weekly hour falls on, as Monday-first indexes for the row of buttons.
 *
 * The IDE numbers days the way java.time does - Monday is 1, Sunday is 7 - and so does this, because a
 * second numbering on the wire is the kind of difference that shows up as "it ran on Sunday instead".
 */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/** A weekday's own name, from the browser, in the panel's language. */
export const weekdayName = (weekday: number, locale: string, style: 'short' | 'long' = 'short'): string => {
  // 6 January 2025 was a Monday, so day 1 is that date and the rest follow it.
  const date = new Date(Date.UTC(2025, 0, 5 + Math.min(Math.max(weekday, 1), 7)))
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(date)
}

/**
 * A moment as a row of the list writes it: the weekday and the clock, in the same twenty-four hour form
 * the hour was typed in.
 *
 * Left to the locale this comes back as "09:00 AM" beside the row's own "09:00", which reads as two
 * different times rather than one written twice - and the hour is a setting somebody typed, not a date to
 * be presented.
 *
 * The formatter is built once per language and kept. Building one costs orders of magnitude more than
 * using it, and this is called for every scheduled run on the screen, up to three times each, on every
 * redraw of a hub that redraws whenever anything moves.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

export const whenLabel = (at: number, locale: string): string => {
  let formatter = FORMATTERS.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    FORMATTERS.set(locale, formatter)
  }

  return formatter.format(new Date(at))
}
