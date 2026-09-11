import { describe, expect, it } from 'vitest'
import { CALM_VIVID_CALM, CALM_VIVID_FULL, calmColorsSummary, calmVividOf, clampVivid } from './calmColors'
import { en } from './i18n/en'

describe('clampVivid', () => {
  it('keeps a figure that is already on the scale', () => {
    expect(clampVivid(42)).toBe(42)
    expect(clampVivid(CALM_VIVID_CALM)).toBe(CALM_VIVID_CALM)
    expect(clampVivid(CALM_VIVID_FULL)).toBe(CALM_VIVID_FULL)
  })

  it('pulls anything past the ends onto them', () => {
    expect(clampVivid(-5)).toBe(CALM_VIVID_CALM)
    expect(clampVivid(137)).toBe(CALM_VIVID_FULL)
  })

  it('rounds, because the figure travels as a whole number', () => {
    expect(clampVivid(42.6)).toBe(43)
  })

  /* Not the full ladder by accident: a figure nobody can read is one nobody chose. */
  it('falls back to the full ladder when there is no figure to read', () => {
    expect(clampVivid(Number.NaN)).toBe(CALM_VIVID_FULL)
  })
})

/**
 * The tolerant read, and the reason it is held by a test: the two sides are updated apart, so a client
 * newer than the plugin it talks to is ordinary. Broken, this fails silently and only for the person who
 * turned the mode on a year ago - their gauges come back red and nothing says why.
 */
describe('calmVividOf', () => {
  it('takes the figure when there is one', () => {
    expect(calmVividOf({ vivid: 42 })).toBe(42)
    expect(calmVividOf({ vivid: CALM_VIVID_CALM })).toBe(CALM_VIVID_CALM)
  })

  it('reads the old switch when that is all that came', () => {
    expect(calmVividOf({ on: true })).toBe(CALM_VIVID_CALM)
    expect(calmVividOf({ on: false })).toBe(CALM_VIVID_FULL)
  })

  it('prefers the figure over the switch beside it', () => {
    expect(calmVividOf({ vivid: 42, on: true })).toBe(42)
  })

  it('draws the ladder when nothing was said at all', () => {
    expect(calmVividOf({})).toBe(CALM_VIVID_FULL)
  })
})

describe('calmColorsSummary', () => {
  it('names the two ends and shows the figure between them', () => {
    expect(calmColorsSummary(en, CALM_VIVID_FULL)).toBe(en.calmColors.full)
    expect(calmColorsSummary(en, CALM_VIVID_CALM)).toBe(en.calmColors.none)
    expect(calmColorsSummary(en, 60)).toBe('60%')
  })
})
