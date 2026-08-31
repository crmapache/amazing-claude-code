import { describe, expect, it } from 'vitest'
import { PASTE_COLLAPSE_MAX, PASTE_COLLAPSE_MIN, clampPasteCollapse } from './pasteCollapse'

/**
 * The screen lets a number be typed, and what is typed is not always a number the setting can hold. The
 * rule breaks quietly - a paste that stops folding, or folds at a size nobody asked for - so it is held
 * here rather than by the field it is typed into.
 */
describe('clampPasteCollapse', () => {
  it('keeps a number that is already inside the bounds', () => {
    expect(clampPasteCollapse('12')).toBe(12)
    expect(clampPasteCollapse(String(PASTE_COLLAPSE_MIN))).toBe(PASTE_COLLAPSE_MIN)
    expect(clampPasteCollapse(String(PASTE_COLLAPSE_MAX))).toBe(PASTE_COLLAPSE_MAX)
  })

  it('pulls anything past the bounds to the nearest one it could have meant', () => {
    expect(clampPasteCollapse('1')).toBe(PASTE_COLLAPSE_MIN)
    // Zero is the other row of the screen - "never fold" - and typing it here does not mean that.
    expect(clampPasteCollapse('0')).toBe(PASTE_COLLAPSE_MIN)
    expect(clampPasteCollapse('9000')).toBe(PASTE_COLLAPSE_MAX)
  })

  it('leaves the setting where it stood when there is no number to read', () => {
    expect(clampPasteCollapse('', 25)).toBe(25)
    expect(clampPasteCollapse('   ', 25)).toBe(25)
    expect(clampPasteCollapse('nonsense', 25)).toBe(25)
  })
})
