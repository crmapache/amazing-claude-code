import { describe, expect, it } from 'vitest'
import { blockText, caretScrollShift, isTypingField, needsTrailingSpace, placeAmong, spaceGoesWithChip } from './composerDom'

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

/**
 * Whether the space after a removed chip leaves with it - see spaceGoesWithChip. A chip comes in with a
 * space after it, and the space left behind made a field that looked empty and was not.
 */
describe('the space after a removed chip', () => {
  it('goes with a chip that was alone in the field, or at the start of a line', () => {
    expect(spaceGoesWithChip('', '')).toBe(true)
    expect(spaceGoesWithChip('\n', 'l')).toBe(true)
  })

  it('goes with a chip that had a space before it, leaving one between the words', () => {
    // "see [chip] and" - the space before the chip is the one that stays.
    expect(spaceGoesWithChip(' ', 'a')).toBe(true)
    expect(spaceGoesWithChip('\u00a0', 'a')).toBe(true)
  })

  it('goes with a chip at the end of the field or of a line', () => {
    expect(spaceGoesWithChip('e', '')).toBe(true)
    expect(spaceGoesWithChip('e', '\n')).toBe(true)
  })

  it('stays between two words the chip stood between with nothing else', () => {
    // "see[chip] and" without the chip is "see and", not "seeand".
    expect(spaceGoesWithChip('e', 'a')).toBe(false)
  })
})

/**
 * Whether a chip just put in needs a space after it - see needsTrailingSpace. The caret stands past the chip,
 * and the next letter typed goes in right there.
 */
describe('the space after a chip put in', () => {
  it('is added before a word, at the end of the field, and before a line break', () => {
    expect(needsTrailingSpace('a')).toBe(true)
    expect(needsTrailingSpace('')).toBe(true)
    // The end of a line: without it the next letter is glued to the chip.
    expect(needsTrailingSpace('\n')).toBe(true)
  })

  it('is not added before a space already standing there', () => {
    expect(needsTrailingSpace(' ')).toBe(false)
    expect(needsTrailingSpace('\u00a0')).toBe(false)
    expect(needsTrailingSpace('\t')).toBe(false)
  })
})

/**
 * Where a remembered caret goes back to - see placeAmong. A quote marked in the feed lands on this place, and
 * a place that falls one node off puts it a word or a line away from where the person was writing.
 */
describe('the place the caret is put back on', () => {
  /** "first line", a line break, a chip, "second line" - the way the field holds a draft with a quote in it. */
  const field = [
    { places: 10, text: true },
    { places: 1, text: true },
    { places: 1, text: false },
    { places: 11, text: true },
  ]

  it('is inside the text it was counted in', () => {
    expect(placeAmong(field, 0)).toEqual({ index: 0, offset: 0 })
    expect(placeAmong(field, 5)).toEqual({ index: 0, offset: 5 })
    expect(placeAmong(field, 16)).toEqual({ index: 3, offset: 4 })
  })

  it('stays at the end of a text rather than going before what follows it', () => {
    // The end of the first line, not the start of the break after it.
    expect(placeAmong(field, 10)).toEqual({ index: 0, offset: 10 })
    // Before the chip, in the text that leads up to it.
    expect(placeAmong(field, 11)).toEqual({ index: 1, offset: 1 })
  })

  it('is past a chip as the start of what follows it', () => {
    expect(placeAmong(field, 12)).toEqual({ index: 3, offset: 0 })
  })

  it('is right before a chip that stands first', () => {
    expect(placeAmong([{ places: 1, text: false }, { places: 3, text: true }], 0)).toEqual({ index: 0, offset: 0 })
  })

  it('is the end of the field for a chip that stands last, and for a draft that has grown shorter', () => {
    expect(placeAmong([{ places: 3, text: true }, { places: 1, text: false }], 4)).toBeNull()
    expect(placeAmong(field, 40)).toBeNull()
    expect(placeAmong([], 0)).toBeNull()
  })

  it('is pressed past something that is not text but holds some', () => {
    // A block the browser made of a line: a place inside it is put after it.
    expect(placeAmong([{ places: 4, text: false }, { places: 2, text: true }], 2)).toEqual({ index: 1, offset: 0 })
    expect(placeAmong([{ places: 2, text: true }, { places: 4, text: false }], 4)).toBeNull()
  })
})
