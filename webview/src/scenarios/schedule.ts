import type { ScenarioSchedule } from '../protocol'

/**
 * What a scenario's hour says on the screen, as facts rather than words.
 *
 * The IDE keeps the hour and works out when it is next due (see ScheduleClock); this side only has to
 * decide what to show about it, and that decision has three answers rather than one - a run coming, an
 * hour that was missed, and a one-off that has already been and gone. Facts rather than sentences for the
 * reason the whole feed works that way: the panel speaks ten languages and the words are chosen where
 * they are drawn.
 */
export interface ScheduleNote {
  /** When the next run is due, in epoch millis - null when nothing is coming. */
  next: number | null
  /** The hour that came while nobody was here, when there was one. */
  missed: number | null
  /** When it last started something, for a one-off with nothing left to come. */
  ran: number | null
}

export const scheduleNote = (schedule: ScenarioSchedule): ScheduleNote => ({
  next: schedule.nextAt > 0 ? schedule.nextAt : null,
  missed: schedule.missedAt > 0 ? schedule.missedAt : null,
  // Only worth saying when nothing is coming: with a next hour on the row, "it ran this morning" is the
  // less useful of the two and the row has space for one.
  ran: schedule.nextAt === 0 && schedule.lastAt > 0 ? schedule.lastAt : null,
})

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
