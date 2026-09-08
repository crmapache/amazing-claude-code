import { describe, expect, it } from 'vitest'
import type { ScenarioSchedule } from '../protocol'
import { clockLabel, defaultHour, HOURS, MINUTES, pad2, scheduleNote, weekdayName } from './schedule'

const schedule = (over: Partial<ScenarioSchedule> = {}): ScenarioSchedule => ({
  scenarioId: 's',
  scope: 'project',
  at: 9 * 60,
  repeat: 'daily',
  weekday: 1,
  inputs: {},
  nextAt: 0,
  lastAt: 0,
  missedAt: 0,
  ...over,
})

describe('scheduleNote', () => {
  it('says when the next run is due', () => {
    expect(scheduleNote(schedule({ nextAt: 1_700_000_000_000 })).next).toBe(1_700_000_000_000)
  })

  it('says an hour that came while nobody was here, alongside the next one', () => {
    const note = scheduleNote(schedule({ nextAt: 200, missedAt: 100 }))

    expect(note.missed).toBe(100)
    expect(note.next).toBe(200)
  })

  /**
   * A one-off keeps its record after it fires, and then the only thing left to say about it is that it
   * happened - with a next hour on the row there is no room for that and no need.
   */
  it('mentions the last run only when nothing is coming', () => {
    expect(scheduleNote(schedule({ nextAt: 0, lastAt: 100 })).ran).toBe(100)
    expect(scheduleNote(schedule({ nextAt: 200, lastAt: 100 })).ran).toBeNull()
  })

  it('says nothing about a schedule that has not fired and is not due', () => {
    const note = scheduleNote(schedule())

    expect(note).toEqual({ next: null, missed: null, ran: null })
  })
})

describe('clockLabel', () => {
  it('writes the hour as a clock does', () => {
    expect(clockLabel(0)).toBe('00:00')
    expect(clockLabel(9 * 60 + 5)).toBe('09:05')
    expect(clockLabel(23 * 60 + 59)).toBe('23:59')
  })

  it('holds an impossible hour inside the day', () => {
    expect(clockLabel(-30)).toBe('00:00')
    expect(clockLabel(9999)).toBe('23:59')
  })
})

describe('the hour menus', () => {
  it('offers every hour of the day and the minutes in fives', () => {
    expect(HOURS).toHaveLength(24)
    expect(HOURS[0]).toBe(0)
    expect(HOURS[23]).toBe(23)
    expect(MINUTES).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  })

  it('writes a number the way a clock does', () => {
    expect(pad2(0)).toBe('00')
    expect(pad2(9)).toBe('09')
    expect(pad2(23)).toBe('23')
  })
})

describe('defaultHour', () => {
  /** Local time, because the hour is set in the machine's own timezone (see ScenarioSchedule). */
  const at = (hours: number, minutes: number): number => new Date(2025, 0, 6, hours, minutes).getTime()

  it('suggests about an hour from now, rounded up to a value the menu offers', () => {
    expect(defaultHour(at(13, 26))).toBe(14 * 60 + 30)
    expect(defaultHour(at(10, 0))).toBe(11 * 60)
    expect(defaultHour(at(9, 1))).toBe(10 * 60 + 5)
  })

  it('wraps past midnight into the small hours', () => {
    expect(defaultHour(at(23, 40))).toBe(40)
    expect(defaultHour(at(23, 15))).toBe(15)
  })

  it('only ever suggests an hour the minute menu can show', () => {
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      expect(MINUTES).toContain(defaultHour(at(Math.floor(minute / 60), minute % 60)) % 60)
    }
  })
})

describe('weekdayName', () => {
  /** Monday is 1 and Sunday is 7, the way the IDE numbers them - a second numbering runs on the wrong day. */
  it('numbers the days from Monday, as the IDE does', () => {
    expect(weekdayName(1, 'en-GB', 'long')).toBe('Monday')
    expect(weekdayName(7, 'en-GB', 'long')).toBe('Sunday')
  })
})
