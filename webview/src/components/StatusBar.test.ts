import { describe, expect, it } from 'vitest'
import { contextColor, contextGlow } from './StatusBar'

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
