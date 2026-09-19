import { describe, expect, it } from 'vitest'
import {
  droppableTools,
  endPairFits,
  firstLetter,
  selectorsFit,
  toolsDropped,
  toolsWidth,
  type WritingTool,
} from './composerFit'

describe('selectorsFit', () => {
  it('keeps the captions for as long as the row holds the three at their full width', () => {
    expect(selectorsFit(500, 386.7, 267.8)).toBe('full')
    expect(selectorsFit(386.7, 386.7, 267.8)).toBe('full')
  })

  it('takes a rounding of the layout for an exact fit rather than for a pixel short', () => {
    expect(selectorsFit(386.3, 386.7, 267.8)).toBe('full')
  })

  it('drops the captions first, and gives the values up to an ellipsis only past that', () => {
    expect(selectorsFit(385, 386.7, 267.8)).toBe('terse')
    expect(selectorsFit(267.8, 386.7, 267.8)).toBe('terse')
    expect(selectorsFit(260, 386.7, 267.8)).toBe('squeezed')
  })
})

const ALL = new Set<WritingTool>(['voice', 'improve', 'attach', 'slash', 'search', 'scenarios'])
const SIZES = { square: 26, inner: 4, outer: 11 }

/** A row short of room by `short` pixels (spare when negative), with `dropped` squares already left out. */
const drop = (short: number, dropped = 0, present: ReadonlySet<WritingTool> = ALL, listening = false) =>
  toolsDropped(present, droppableTools(present, listening), dropped, { short, ...SIZES })

describe('toolsWidth', () => {
  it('adds up the squares, the gaps inside a group and the wider gaps between groups', () => {
    expect(toolsWidth((tool) => ALL.has(tool), SIZES)).toBe(3 * (26 * 2 + 4) + 2 * 11)
  })

  it('takes a group with nothing left in it out together with its gap', () => {
    expect(toolsWidth((tool) => tool !== 'voice' && tool !== 'improve', SIZES)).toBe(2 * (26 * 2 + 4) + 11)
  })
})

describe('toolsDropped', () => {
  it('leaves everything in a row with room to spare', () => {
    expect(drop(-100)).toBe(0)
    expect(drop(0)).toBe(0)
  })

  it('leaves out the fewest squares that make the row fit, the slash first', () => {
    expect(drop(10)).toBe(1)
    expect(drop(30)).toBe(1)
    expect(drop(31)).toBe(2)
  })

  it('goes on in the asked order - the search, the sparkle, the microphone', () => {
    expect(drop(60)).toBe(2)
    expect(drop(90)).toBe(3)
    // The microphone takes its whole group with it, and the gap before the next group goes too.
    expect(drop(127)).toBe(4)
  })

  it('stops at the four and leaves the rest to Queue and Send, however short the row still is', () => {
    expect(drop(1000)).toBe(4)
  })

  it('counts only the squares this panel has at all', () => {
    const noSearch = new Set<WritingTool>(['voice', 'improve', 'attach', 'slash', 'scenarios'])
    expect(drop(40, 0, noSearch)).toBe(2)
    expect(drop(1000, 0, noSearch)).toBe(3)

    // Without the scenarios the search is alone in its group, so it takes the group's gap with it.
    const noScenarios = new Set<WritingTool>(['voice', 'improve', 'attach', 'slash', 'search'])
    expect(drop(30 + 37, 0, noScenarios)).toBe(2)
  })

  it('brings the squares back in the reverse order as the row widens', () => {
    // Two out, and room for exactly one of them back (with the pixel it asks for to spare).
    expect(drop(-31, 2)).toBe(1)
    expect(drop(-61, 2)).toBe(0)
  })

  it('does not bring a square back into a row it would only just fit', () => {
    expect(drop(-30, 1)).toBe(1)
    expect(drop(-29.5, 1)).toBe(1)
  })

  it("never takes away the microphone while it is listening - it is the dictation's stop button", () => {
    expect(droppableTools(ALL, true)).toEqual(['slash', 'search', 'improve'])
    expect(drop(1000, 0, ALL, true)).toBe(3)
    // Dictation started from a hotkey with all four already gone: the microphone is back, and the row
    // counts it as out of the running rather than as the fourth one left out.
    expect(drop(37, 4, ALL, true)).toBe(3)
  })

  it('stays where it is once the row fits', () => {
    expect(drop(0, 1)).toBe(1)
    expect(drop(-5, 3)).toBe(3)
  })
})

describe('firstLetter', () => {
  it('splits a caption into its first letter and the rest', () => {
    expect(firstLetter('Send')).toEqual(['S', 'end'])
    expect(firstLetter('发送')).toEqual(['发', '送'])
  })

  it('does not cut a letter outside the basic plane in half', () => {
    expect(firstLetter('𝒜bc')).toEqual(['𝒜', 'bc'])
  })

  it('answers an empty caption with two empty halves', () => {
    expect(firstLetter('')).toEqual(['', ''])
    expect(firstLetter('Q')).toEqual(['Q', ''])
  })
})

describe('endPairFits', () => {
  // Three rings and the counter (262) and the pair (68), ten apart - measured in the harness.
  const METERS = 262
  const PAIR = 68
  const GAP = 10

  it('keeps the pair while the line holds it beside the usage', () => {
    expect(endPairFits(400, METERS, PAIR, GAP, true)).toBe(true)
    expect(endPairFits(340, METERS, PAIR, GAP, true)).toBe(true)
  })

  it('takes a rounding of the layout for an exact fit rather than for a pixel short', () => {
    expect(endPairFits(339.6, METERS, PAIR, GAP, true)).toBe(true)
  })

  // The heart used to go past the panel's edge, cut in half by its border.
  it('lets the pair go once it would stick out past the edge', () => {
    expect(endPairFits(335, METERS, PAIR, GAP, true)).toBe(false)
    expect(endPairFits(280, METERS, PAIR, GAP, true)).toBe(false)
  })

  // A pair back in a line it only just fits would be the next measurement's reason to go again.
  it('brings the pair back only with a pixel to spare', () => {
    expect(endPairFits(340, METERS, PAIR, GAP, false)).toBe(false)
    expect(endPairFits(341, METERS, PAIR, GAP, false)).toBe(true)
  })

  // With every ring and the counter switched off the pair stands alone - no gap before it.
  it('counts no gap when there is no usage beside the pair', () => {
    expect(endPairFits(68, 0, PAIR, GAP, true)).toBe(true)
    expect(endPairFits(60, 0, PAIR, GAP, true)).toBe(false)
  })
})
