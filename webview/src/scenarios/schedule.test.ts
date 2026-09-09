import { describe, expect, it } from 'vitest'
import type { ScenarioSchedule } from '../protocol'
import {
  clockLabel,
  defaultHour,
  HOURS,
  MINUTES,
  nextNote,
  orderedSchedules,
  pad2,
  scheduleNote,
  schedulesOf,
  weekdayName,
} from './schedule'

const schedule = (over: Partial<ScenarioSchedule> = {}): ScenarioSchedule => ({
  id: 'h1',
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

  it('says nothing about a schedule that has not fired and is not due', () => {
    const note = scheduleNote(schedule())

    expect(note).toEqual({ next: null, missed: null })
  })
})

describe('schedulesOf and orderedSchedules', () => {
  it('takes the arrangements of one scenario off its own shelf', () => {
    const list = [
      schedule({ id: 'a', scenarioId: 's1', scope: 'project' }),
      schedule({ id: 'b', scenarioId: 's1', scope: 'user' }),
      schedule({ id: 'c', scenarioId: 's2', scope: 'project' }),
    ]

    expect(schedulesOf(list, { id: 's1', scope: 'project' }).map((one) => one.id)).toEqual(['a'])
  })

  /**
   * A night nobody was here for is the one line somebody has to see: nothing is ever started late, so
   * that row is the only trace it leaves at all.
   */
  it('puts a missed hour above everything that is still coming', () => {
    const list = [
      schedule({ id: 'coming', nextAt: 5_000 }),
      schedule({ id: 'missed', nextAt: 0, missedAt: 1_000 }),
    ]

    expect(orderedSchedules(list).map((one) => one.id)).toEqual(['missed', 'coming'])
  })

  /**
   * By the moment it is due rather than by the hour on the clock: an eight o'clock arrangement made at
   * ten is due TOMORROW, and sorted by minutes-from-midnight it would stand above tonight's.
   */
  it('orders what is coming by when it is actually due', () => {
    const list = [
      schedule({ id: 'tomorrow-morning', at: 8 * 60, nextAt: 9_000 }),
      schedule({ id: 'tonight', at: 21 * 60, nextAt: 5_000 }),
    ]

    expect(orderedSchedules(list).map((one) => one.id)).toEqual(['tonight', 'tomorrow-morning'])
  })
})

describe('nextNote', () => {
  it('says nothing for a scenario nobody has scheduled', () => {
    expect(nextNote([])).toBeNull()
  })

  it('counts the arrangements and names the soonest hour', () => {
    const note = nextNote([schedule({ nextAt: 9_000 }), schedule({ nextAt: 5_000 })])

    expect(note).toEqual({ count: 2, next: 5_000, missed: null })
  })

  it('carries the most recent missed hour among the arrangements that still have one coming', () => {
    const note = nextNote([
      schedule({ nextAt: 9_000, missedAt: 100 }),
      schedule({ nextAt: 5_000, missedAt: 400 }),
    ])

    expect(note?.missed).toBe(400)
    expect(note?.next).toBe(5_000)
  })

  /**
   * A one-off that was missed keeps its mark for ever - there is no later hour to clear it, and its own
   * row in the list below is the only place the morning is written down. On the shelf that mark must not
   * speak for the whole scenario: drawn INSTEAD of the coming hour, one dead arrangement hid the next run
   * of a daily one on that row for good, while it ran perfectly every morning.
   */
  it('lets a dead arrangement not speak over the ones that are still coming', () => {
    const note = nextNote([
      schedule({ nextAt: 9_000 }),
      schedule({ nextAt: 0, missedAt: 400 }),
    ])

    expect(note?.missed).toBeNull()
    expect(note?.next).toBe(9_000)
  })

  /** With nothing coming at all it is the only thing left to say, so it is said. */
  it('names a missed hour when nothing is coming anywhere', () => {
    const note = nextNote([schedule({ nextAt: 0, missedAt: 400 })])

    expect(note?.missed).toBe(400)
    expect(note?.next).toBeNull()
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
