import { describe, expect, it } from 'vitest'
import { blockText, caretScrollShift, isTypingField } from './composerDom'

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

/**
 * What the browser's own elements inside the field say - see blockText.
 *
 * Checked here for the same reason as the shift above: it is wrong silently. A break read as nothing does
 * not show up until the field is next rebuilt from the message, and by then it looks like the caret
 * jumping a line by itself.
 */
describe('an element of the browser own making, read as a message', () => {
  it('is a line break and its text, once there is something before it', () => {
    expect(blockText('two', true)).toBe('\ntwo')
  })

  it('is a line break even with nothing to say - that is the spare last line the caret stands on', () => {
    // Chromium leaves a <br> here as soon as a delete empties that line; before, it was read as nothing
    // and the person's own last break was eaten in its place.
    expect(blockText('', true)).toBe('\n')
  })

  it('is nothing while nothing has been read yet - an empty field is a lone <br>', () => {
    expect(blockText('', false)).toBe(null)
  })

  it('opens the message with its own text, without a break before it', () => {
    expect(blockText('one', false)).toBe('one')
  })
})

/**
 * Which focused elements a rebuild of the input field leaves the keyboard with - see rebuildDom. The case
 * it came from: `/rename` sent from the field opens the tab's name, and the draft cleared by that very
 * send put the caret back into the message, closing the name before a letter went in.
 */
describe('a field being typed into elsewhere', () => {
  it('is a text field or a textarea, whatever the text field is for', () => {
    expect(isTypingField('INPUT', 'text')).toBe(true)
    expect(isTypingField('INPUT', '')).toBe(true)
    expect(isTypingField('INPUT', 'search')).toBe(true)
    expect(isTypingField('TEXTAREA', '')).toBe(true)
  })

  it('is not a checkbox, a button or anything that is not a field', () => {
    expect(isTypingField('INPUT', 'checkbox')).toBe(false)
    expect(isTypingField('INPUT', 'Range')).toBe(false)
    expect(isTypingField('BUTTON', '')).toBe(false)
    expect(isTypingField('DIV', '')).toBe(false)
  })
})
