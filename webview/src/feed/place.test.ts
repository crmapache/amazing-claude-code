import { describe, expect, it } from 'vitest'
import { placeShift, rowAtEdge, type FeedPlace } from './place'

/**
 * Where a tab's feed stands and how it is put back there - see place.ts.
 *
 * Checked here rather than on screen because it is wrong silently: a place restored a few rows off looks
 * exactly like a place restored properly until the person notices they are reading something else.
 */

/** A feed of rows fifty pixels tall each, standing from the top of the view downwards. */
const feed = (count: number, height = 50) => ({
  count,
  bottomOf: (index: number) => (index + 1) * height,
})

describe('the row at the top edge', () => {
  it('is the row the edge falls inside', () => {
    const { count, bottomOf } = feed(10)

    expect(rowAtEdge(count, bottomOf, 0)).toBe(0)
    expect(rowAtEdge(count, bottomOf, 120)).toBe(2)
    // The edge sitting exactly on a seam belongs to the row below it: that row is the one on screen.
    expect(rowAtEdge(count, bottomOf, 100)).toBe(2)
  })

  it('is the count itself when every row ends above the edge', () => {
    const { count, bottomOf } = feed(4)

    expect(rowAtEdge(count, bottomOf, 1000)).toBe(4)
    expect(rowAtEdge(0, () => 0, 0)).toBe(0)
  })

  it('is found by halving, not by walking', () => {
    let measured = 0
    const height = 50
    const found = rowAtEdge(
      1000,
      (index) => {
        measured += 1
        return (index + 1) * height
      },
      40_000,
    )

    expect(found).toBe(800)
    expect(measured).toBeLessThan(12)
  })
})

describe('putting a place back', () => {
  const place = (offset: number): FeedPlace => ({ stick: false, row: 'r-7', offset, top: 0 })

  it('asks the row to stand where it stood', () => {
    // The view's top edge is at 80; the row was 20 pixels below it and now stands 300 below.
    expect(placeShift(place(20), 380, 80)).toBe(280)
  })

  it('holds a row that began above the view just as well', () => {
    // A long answer covering the whole screen: its top was 200 pixels above the edge.
    expect(placeShift(place(-200), -50, 80)).toBe(70)
  })

  it('asks for nothing when the row already stands where it was', () => {
    expect(placeShift(place(-40), 40, 80)).toBe(0)
  })
})
