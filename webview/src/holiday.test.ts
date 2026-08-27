import { describe, expect, it } from 'vitest'
import { HOLIDAY_OVERRIDE, holidayOn, holidayUnder, isHolidaySeason, msUntilNextDay } from './holiday'

/** Local time on purpose: the window is a calendar one, and the calendar is the machine's. */
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute)

describe('isHolidaySeason', () => {
  it('opens on 24 December and not a day earlier', () => {
    expect(isHolidaySeason(at(2026, 12, 23, 23, 59))).toBe(false)
    expect(isHolidaySeason(at(2026, 12, 24, 0, 0))).toBe(true)
  })

  it('runs across the turn of the year', () => {
    expect(isHolidaySeason(at(2026, 12, 31))).toBe(true)
    expect(isHolidaySeason(at(2027, 1, 1))).toBe(true)
  })

  it('closes after 3 January', () => {
    expect(isHolidaySeason(at(2027, 1, 3, 23, 59))).toBe(true)
    expect(isHolidaySeason(at(2027, 1, 4, 0, 0))).toBe(false)
  })

  it('leaves the rest of the year alone', () => {
    expect(isHolidaySeason(at(2026, 8, 27))).toBe(false)
    expect(isHolidaySeason(at(2026, 11, 24))).toBe(false)
    expect(isHolidaySeason(at(2026, 2, 3))).toBe(false)
  })
})

describe('holidayUnder', () => {
  const inside = at(2026, 12, 25)
  const outside = at(2026, 8, 27)

  it('leaves the answer to the calendar under "auto"', () => {
    expect(holidayUnder('auto', inside)).toBe(true)
    expect(holidayUnder('auto', outside)).toBe(false)
  })

  it('overrules the calendar both ways', () => {
    expect(holidayUnder('on', outside)).toBe(true)
    expect(holidayUnder('off', inside)).toBe(false)
  })
})

describe('the switch as it is committed', () => {
  /*
   * The one test here that is about the repository rather than about the code. The switch exists to be
   * flipped while somebody looks at the decorations, and a flip left behind ships either a permanent
   * winter or a December with none. Nothing else would catch it: with the layer forced on, every other
   * test still passes and the panel still works - it is just decorated in July.
   */
  it('is back on "auto", so the window decides', () => {
    expect(HOLIDAY_OVERRIDE).toBe('auto')
    expect(holidayOn(at(2026, 8, 27))).toBe(false)
    expect(holidayOn(at(2026, 12, 25))).toBe(true)
  })
})

describe('msUntilNextDay', () => {
  it('waits out the rest of the day, plus a second past the boundary', () => {
    const hour = 60 * 60 * 1000

    expect(msUntilNextDay(at(2026, 12, 23, 23, 0))).toBe(hour + 1000)
    expect(msUntilNextDay(at(2026, 12, 23, 0, 0))).toBe(24 * hour + 1000)
  })

  it('lands on the next day, not on the same one', () => {
    const now = at(2026, 12, 31, 22, 30)
    const woken = new Date(now.getTime() + msUntilNextDay(now))

    expect(woken.getFullYear()).toBe(2027)
    expect(woken.getMonth()).toBe(0)
    expect(woken.getDate()).toBe(1)
  })
})
