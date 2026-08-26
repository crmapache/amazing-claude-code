import { describe, expect, it } from 'vitest'
import { addDays, dayNumber, daysBetween, weekday } from './dates'
import { clock, compactNumber, duration, durationDelta, durationTight, groupThousands, longDate, money, shortDate, turnLength } from './format'

describe('figures', () => {
  it('sets thousands off with a narrow space', () => {
    expect(groupThousands(1284)).toBe('1 284')
    expect(groupThousands(18430)).toBe('18 430')
    expect(groupThousands(999)).toBe('999')
    expect(groupThousands(-5962)).toBe('-5 962')
  })

  it('shortens what no longer needs its last digits', () => {
    expect(compactNumber(1284)).toBe('1 284')
    expect(compactNumber(18430)).toBe('18.4k')
    expect(compactNumber(100_000)).toBe('100k')
    expect(compactNumber(41_200_000)).toBe('41.2M')
  })

  it('says minutes as hours and minutes', () => {
    expect(duration(0)).toBe('0m')
    expect(duration(45)).toBe('45m')
    expect(duration(2290)).toBe('38h 10m')
    expect(durationTight(171)).toBe('2h51')
    expect(durationTight(240)).toBe('4h')
    expect(durationDelta(360)).toBe('+6h')
    expect(durationDelta(-45)).toBe('-45m')
    expect(durationDelta(0)).toBe('±0m')
  })

  it('says a turn\'s length in seconds until it is minutes', () => {
    expect(turnLength(41_000)).toBe('41s')
    expect(turnLength(842_000)).toBe('14m 02s')
    expect(turnLength(3_780_000)).toBe('1h 03m')
  })

  it('prices in whole dollars once there are enough of them', () => {
    expect(money(974)).toBe('$974')
    expect(money(12.34)).toBe('$12.3')
    expect(money(0.4)).toBe('$0.40')
  })

  it('names dates the way the calendar does', () => {
    expect(shortDate('2026-08-14')).toBe('Aug 14')
    expect(longDate('2026-08-14')).toBe('Aug 14, 2026')
    expect(clock(10)).toBe('10:00')
    expect(clock(24)).toBe('00:00')
  })
})

describe('days', () => {
  it('counts days apart as a subtraction and walks the calendar both ways', () => {
    expect(dayNumber('2026-08-26') - dayNumber('2026-08-20')).toBe(6)
    expect(addDays('2026-08-26', -30)).toBe('2026-07-27')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-08-24', '2026-08-26')).toEqual(['2026-08-24', '2026-08-25', '2026-08-26'])
    expect(daysBetween('2026-08-26', '2026-08-24')).toEqual([])
  })

  it('knows a Monday from a Sunday', () => {
    expect(weekday('2026-08-24')).toBe(0)
    expect(weekday('2026-08-26')).toBe(2)
    expect(weekday('2026-08-30')).toBe(6)
  })
})
