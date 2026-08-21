import { describe, expect, it } from 'vitest'
import { edgeLines, placeSelectionMenu, type Box } from './selectionPlacement'

/** The feed of a panel of ordinary width: the header takes the top, the input field the bottom. */
const bounds: Box = { left: 0, right: 400, top: 40, bottom: 600 }
const menu = { width: 200, height: 32 }

const line = (top: number, left: number, right: number): Box => ({ left, right, top, bottom: top + 18 })

describe('placeSelectionMenu', () => {
  it('stands above the selection and is centred on its first line', () => {
    const head = line(300, 100, 260)

    expect(placeSelectionMenu({ head, tail: head, pointer: { x: 180, y: 316 }, bounds, menu })).toEqual({
      // 180 is the centre of the line, minus half the menu's width.
      x: 80,
      // Above the line: 300 - 6 of gap - 32 of height.
      y: 262,
    })
  })

  it('drops below the selection when the top has no room, and is centred on the last line', () => {
    const head = line(50, 100, 380)
    const tail = line(68, 20, 120)

    expect(placeSelectionMenu({ head, tail, pointer: { x: 120, y: 86 }, bounds, menu })).toEqual({
      // The centre of the last line, 70, would take the menu off to the left of the feed.
      x: 8,
      // Below the last line: 68 + 18 of height + 6 of gap.
      y: 92,
    })
  })

  it('never covers the selection itself while either of its ends has room', () => {
    const head = line(300, 100, 260)
    const tail = line(400, 100, 260)
    const above = placeSelectionMenu({ head, tail, pointer: { x: 180, y: 418 }, bounds, menu })

    expect(above.y + menu.height).toBeLessThanOrEqual(head.top)

    const pressed = { ...bounds, top: 296 }
    const below = placeSelectionMenu({ head, tail, pointer: { x: 180, y: 418 }, bounds: pressed, menu })

    expect(below.y).toBeGreaterThanOrEqual(tail.bottom)
  })

  it('goes to the mouse when the selection fills the feed from edge to edge', () => {
    const head = line(20, 100, 380)
    const tail = line(700, 20, 380)

    expect(placeSelectionMenu({ head, tail, pointer: { x: 200, y: 500 }, bounds, menu })).toEqual({
      x: 100,
      // There is room above the mouse, so the menu does not sit on the line being pointed at.
      y: 462,
    })
  })

  it('slips below the mouse when the mouse itself is pressed against the top of the feed', () => {
    const head = line(20, 100, 380)
    const tail = line(700, 20, 380)

    expect(placeSelectionMenu({ head, tail, pointer: { x: 200, y: 60 }, bounds, menu })).toEqual({
      x: 100,
      y: 66,
    })
  })

  it('keeps the menu inside a narrow panel instead of centring it beyond the edge', () => {
    const narrow: Box = { left: 0, right: 220, top: 40, bottom: 600 }
    const head = line(300, 180, 216)

    expect(placeSelectionMenu({ head, tail: head, pointer: { x: 200, y: 316 }, bounds: narrow, menu }).x).toBe(12)
  })
})

describe('edgeLines', () => {
  it('takes the first and the last line of a selection of several lines', () => {
    const rects = [line(100, 200, 380), line(118, 20, 380), line(136, 20, 90)]

    expect(edgeLines(rects)).toEqual({
      head: { left: 200, right: 380, top: 100, bottom: 118 },
      tail: { left: 20, right: 90, top: 136, bottom: 154 },
    })
  })

  it('glues back together the pieces of one line broken up by inline code', () => {
    const rects = [line(100, 20, 90), line(100, 90, 140), line(100, 140, 300)]

    expect(edgeLines(rects)).toEqual({
      head: { left: 20, right: 300, top: 100, bottom: 118 },
      tail: { left: 20, right: 300, top: 100, bottom: 118 },
    })
  })

  it('ignores empty rectangles and gives nothing at all when they are the only ones', () => {
    expect(edgeLines([{ left: 10, right: 10, top: 100, bottom: 100 }])).toBeNull()
    expect(edgeLines([])).toBeNull()
  })
})
