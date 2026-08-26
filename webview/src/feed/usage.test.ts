import { describe, expect, it } from 'vitest'
import {
  contextColor,
  contextGlow,
  FIVE_HOUR_MS,
  limitWindowName,
  limitWindowRing,
  paceColor,
  RING_LENGTH,
  ringDash,
  timeLeft,
} from './usage'

describe('contextColor', () => {
  it('paints by the same thresholds as the context bar in the composer', () => {
    expect(contextColor(0)).toBe('var(--acc-meter-green)')
    expect(contextColor(49)).toBe('var(--acc-meter-green)')
    expect(contextColor(50)).toBe('var(--acc-warn)')
    expect(contextColor(69)).toBe('var(--acc-warn)')
    expect(contextColor(70)).toBe('var(--acc-orange)')
    expect(contextColor(84)).toBe('var(--acc-orange)')
    expect(contextColor(85)).toBe('var(--acc-bad-light)')
    expect(contextColor(100)).toBe('var(--acc-bad-light)')
  })
})

describe('contextGlow', () => {
  it('keeps the glow at the same level as the colour - they do not part ways at the boundaries', () => {
    expect(contextGlow(49)).toEqual({ strong: 'var(--acc-meter-green-80)', soft: 'var(--acc-meter-green-35)' })
    expect(contextGlow(50)).toEqual({ strong: 'var(--acc-warn-80)', soft: 'var(--acc-warn-35)' })
    expect(contextGlow(70)).toEqual({ strong: 'var(--acc-orange-80)', soft: 'var(--acc-orange-35)' })
    expect(contextGlow(85)).toEqual({ strong: 'var(--acc-bad-light-80)', soft: 'var(--acc-bad-light-35)' })
  })
})

describe('timeLeft', () => {
  it('counts a long window in days - "97h 12m" is a figure one has to divide before it means anything', () => {
    const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

    expect(timeLeft(inHours(2.5))).toMatch(/^2h 3\dm$/)
    expect(timeLeft(inHours(0.5))).toMatch(/^\d\dm$/)
    expect(timeLeft(inHours(50))).toMatch(/^2d \dh$/)
  })

  it('says nothing rather than something wrong when the reset time is unknown or past', () => {
    expect(timeLeft('')).toBeNull()
    expect(timeLeft('not a date')).toBeNull()
    expect(timeLeft(new Date(Date.now() - 60_000).toISOString())).toBeNull()
  })
})

describe('paceColor', () => {
  const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

  it('reads the same percentage differently by how much of the window is left', () => {
    // Half the five-hour window gone: half the limit spent is exactly on plan, and nearly all of it
    // is not - the figure is the same in both cases.
    expect(paceColor(50, inHours(2.5), FIVE_HOUR_MS)).toBe('var(--acc-meter-green)')
    expect(paceColor(80, inHours(2.5), FIVE_HOUR_MS)).toBe('var(--acc-orange)')
  })

  it('keeps an absolute ceiling: at the limit, time no longer saves anyone', () => {
    // The window is nearly over, so spending nearly all of it is exactly on plan - the pace alone
    // would paint both of these green. The ceiling overrules it: at 90% orange, at 96% red.
    expect(paceColor(91, inHours(0.4), FIVE_HOUR_MS)).toBe('var(--acc-orange)')
    expect(paceColor(97, inHours(0.1), FIVE_HOUR_MS)).toBe('var(--acc-bad-light)')
  })
})

describe('ringDash', () => {
  it('leaves the whole arc unturned at nothing spent and closes it at the limit', () => {
    expect(ringDash(0)).toBeCloseTo(RING_LENGTH)
    expect(ringDash(100)).toBeCloseTo(0)
    expect(ringDash(50)).toBeCloseTo(RING_LENGTH / 2)
  })

  it('clamps rather than drawing an arc that runs backwards', () => {
    expect(ringDash(-10)).toBeCloseTo(RING_LENGTH)
    expect(ringDash(140)).toBeCloseTo(0)
  })
})

describe('the limit windows', () => {
  it('names them the way the CLI does', () => {
    expect(limitWindowName('five_hour')).toBe('5-hour')
    expect(limitWindowName('seven_day')).toBe('weekly')
    expect(limitWindowName('seven_day_opus')).toBe('weekly Opus')
  })

  // A bucket that appears in a later CLI must not turn into "your seven_day_whatever limit" in the panel.
  it('says nothing about a window it does not know', () => {
    expect(limitWindowName('seven_day_whatever')).toBe('')
    expect(limitWindowName(undefined)).toBe('')
  })

  it('sends every weekly window to the weekly ring, and everything else to the five-hour one', () => {
    expect(limitWindowRing('seven_day')).toBe('week')
    expect(limitWindowRing('seven_day_opus')).toBe('week')
    expect(limitWindowRing('seven_day_overage_included')).toBe('week')
    expect(limitWindowRing('five_hour')).toBe('session')
    // The five-hour window runs out several times a day and is nearly always the one meant.
    expect(limitWindowRing(undefined)).toBe('session')
    expect(limitWindowRing('brand_new_bucket')).toBe('session')
  })
})
