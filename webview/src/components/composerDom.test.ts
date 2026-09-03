import { describe, expect, it } from 'vitest'
import { caretScrollShift } from './composerDom'

/**
 * How far the input field scrolls to keep the line being typed in sight - see scrollCaretIntoView.
 *
 * Checked here because it is wrong silently and expensively: the field carrying a person away from the
 * line they are writing on is noticed only after the fact, when the place is already lost.
 */

/** A field 100 pixels tall, standing at 200 on screen. */
const field = { top: 200, bottom: 300 }

/** A line of text 17 pixels tall, with its top at y. */
const line = (y: number) => ({ top: y, bottom: y + 17 })

describe('the shift that brings the caret into view', () => {
  it('is nothing at all while the line is already in sight', () => {
    expect(caretScrollShift(line(240), field)).toBe(0)
    // Right against the bottom edge, and against the top one below the bar covering it.
    expect(caretScrollShift(line(283), field)).toBe(0)
    expect(caretScrollShift(line(220), field)).toBe(0)
  })

  it('is downwards, with a margin, for a line below the field', () => {
    expect(caretScrollShift(line(310), field)).toBe(31)
  })

  it('is upwards for a line above the field - and for one under the bar over its first pixels', () => {
    expect(caretScrollShift(line(150), field)).toBe(-74)
    // The line is inside the field but under the opaque backing at its top: not seen means not in sight.
    expect(caretScrollShift(line(205), field)).toBe(-19)
  })
})
