import { describe, expect, it } from 'vitest'
import { en } from './i18n/en'
import {
  INDICATORS,
  indicatorsSummary,
  normalizeHidden,
  sameHidden,
  shownIndicators,
  toggleIndicator,
} from './indicators'

describe('normalizeHidden', () => {
  // What the IDE keeps is written by a message, and by panels of other versions: a name this one does not
  // know is not an indicator it can hide.
  it('drops what it does not know, and repeats', () => {
    expect(normalizeHidden(['week', 'someday', 'week'])).toEqual(['week'])
    expect(normalizeHidden(undefined)).toEqual([])
  })

  // The screen's order, so that two lists naming the same switches are the same list - which is what
  // tells an echo of our own press from another window's change.
  it('puts the list in the screen order', () => {
    expect(normalizeHidden(['thanks', 'contextBar'])).toEqual(['contextBar', 'thanks'])
    expect(sameHidden(normalizeHidden(['thanks', 'tokens']), normalizeHidden(['tokens', 'thanks']))).toBe(true)
  })
})

describe('toggleIndicator', () => {
  it('switches one off and back on, leaving the others be', () => {
    const off = toggleIndicator(['tokens'], 'week')

    expect(off).toEqual(['week', 'tokens'])
    expect(toggleIndicator(off, 'week')).toEqual(['tokens'])
  })
})

describe('shownIndicators', () => {
  // Nothing stored means everything on - what the panel drew before the setting existed, and what a panel
  // with no IDE behind it (the harness) keeps drawing.
  it('shows everything when nothing is hidden', () => {
    const shown = shownIndicators([])

    expect(Object.values(shown).every(Boolean)).toBe(true)
    expect(Object.keys(shown).sort()).toEqual([...INDICATORS].sort())
  })

  it('hides exactly what is listed', () => {
    const shown = shownIndicators(['contextFigure', 'feedback'])

    expect(shown.contextFigure).toBe(false)
    expect(shown.feedback).toBe(false)
    expect(shown.contextBar).toBe(true)
    expect(shown.thanks).toBe(true)
  })
})

describe('indicatorsSummary', () => {
  it('counts what is on, in the sounds’ words', () => {
    expect(indicatorsSummary(en, [])).toBe(`${INDICATORS.length} on`)
    expect(indicatorsSummary(en, ['week', 'tokens'])).toBe(`${INDICATORS.length - 2} on`)
  })
})
