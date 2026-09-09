import { describe, expect, it } from 'vitest'
import { nextDue } from './due'

/** Monday 8 September 2026, ten in the morning. */
const MONDAY_10 = new Date(2026, 8, 7, 10, 0, 0).getTime()
const on = (at: number): string => new Date(at).toString().slice(0, 21)

describe('when an hour being set would go off', () => {
  it('is later the same day when the hour is still ahead', () => {
    expect(on(nextDue({ at: 23 * 60 + 22, repeat: 'once', weekday: 1 }, MONDAY_10))).toBe(
      on(new Date(2026, 8, 7, 23, 22).getTime()),
    )
  })

  it('is tomorrow when the hour has already gone by', () => {
    expect(on(nextDue({ at: 8 * 60, repeat: 'once', weekday: 1 }, MONDAY_10))).toBe(
      on(new Date(2026, 8, 8, 8, 0).getTime()),
    )
  })

  /* Saturday and Sunday are not working mornings, so a Friday evening arrangement lands on Monday. */
  it('steps over the weekend for a weekdays rhythm', () => {
    const fridayNight = new Date(2026, 8, 11, 23, 0, 0).getTime()
    expect(on(nextDue({ at: 8 * 60, repeat: 'weekdays', weekday: 1 }, fridayNight))).toBe(
      on(new Date(2026, 8, 14, 8, 0).getTime()),
    )
  })

  it('walks to the chosen day for a weekly one', () => {
    // Monday to the coming Thursday.
    expect(on(nextDue({ at: 9 * 60, repeat: 'weekly', weekday: 4 }, MONDAY_10))).toBe(
      on(new Date(2026, 8, 10, 9, 0).getTime()),
    )
  })

  it('gives a weekly one a whole week when today is its day and the hour has gone', () => {
    expect(on(nextDue({ at: 8 * 60, repeat: 'weekly', weekday: 1 }, MONDAY_10))).toBe(
      on(new Date(2026, 8, 14, 8, 0).getTime()),
    )
  })

  it('clamps an hour and a weekday the file cannot be trusted about', () => {
    expect(nextDue({ at: -30, repeat: 'once', weekday: 0 }, MONDAY_10)).toBeGreaterThan(MONDAY_10)
    expect(nextDue({ at: 9999, repeat: 'weekly', weekday: 99 }, MONDAY_10)).toBeGreaterThan(MONDAY_10)
  })
})
