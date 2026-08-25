import { describe, expect, it } from 'vitest'
import { placeTooltip, readTooltipAt, type Box } from './tooltipPlacement'

/** A panel of ordinary width, as a tool window inside the IDE. */
const viewport: Box = { left: 0, right: 400, top: 0, bottom: 700 }

/** A hint of two lines, the widest the panel draws. */
const tip = { width: 220, height: 34 }

const box = (left: number, top: number, width = 40, height = 22): Box => ({
  left,
  right: left + width,
  top,
  bottom: top + height,
})

describe('placeTooltip', () => {
  it('hangs under the element and ends at its right edge', () => {
    const anchor = box(300, 100)

    expect(placeTooltip({ anchor, tip, viewport, side: 'bottom', align: 'right' })).toEqual({
      // The right edge, 340, minus the hint's width.
      x: 120,
      // Under the element: 122 of its bottom plus 7 of gap.
      y: 129,
      side: 'bottom',
    })
  })

  it('keeps a left-pinned hint inside the window instead of letting it run off the right edge', () => {
    // The meter in the status row, near the panel's right edge: pinned to its left edge the hint would
    // reach 545 - a hundred and fifty pixels past the window.
    const anchor = box(325, 620, 46)
    const placed = placeTooltip({ anchor, tip, viewport, side: 'top', align: 'left' })

    // Pressed to the right edge with the usual breathing space: 400 - 8 - 220.
    expect(placed.x).toBe(172)
    expect(placed.x + tip.width).toBeLessThanOrEqual(viewport.right)
  })

  it('presses a hint against the left edge when its own element is already there', () => {
    const anchor = box(4, 300)

    expect(placeTooltip({ anchor, tip, viewport, side: 'bottom', align: 'right' }).x).toBe(8)
  })

  it('flips upwards when there is no room below', () => {
    const anchor = box(120, 680)
    const placed = placeTooltip({ anchor, tip, viewport, side: 'bottom', align: 'right' })

    expect(placed.side).toBe('top')
    // Above the element: 680 - 7 of gap - 34 of height.
    expect(placed.y).toBe(639)
  })

  it('flips downwards when there is no room above', () => {
    const anchor = box(120, 6)
    const placed = placeTooltip({ anchor, tip, viewport, side: 'top', align: 'right' })

    expect(placed.side).toBe('bottom')
    expect(placed.y).toBe(35)
  })

  it('stays on screen in a window too short for either side, going where it covers less', () => {
    const short: Box = { left: 0, right: 400, top: 0, bottom: 90 }
    const anchor = box(120, 50)
    const placed = placeTooltip({ anchor, tip, viewport: short, side: 'bottom', align: 'right' })

    expect(placed.side).toBe('top')
    expect(placed.y).toBeGreaterThanOrEqual(short.top)
    expect(placed.y + tip.height).toBeLessThanOrEqual(short.bottom)
  })

  it('lands at the near edge when the hint is wider than the panel itself', () => {
    const narrow: Box = { left: 0, right: 200, top: 0, bottom: 700 }

    expect(placeTooltip({ anchor: box(150, 100), tip, viewport: narrow, side: 'bottom', align: 'right' }).x).toBe(8)
  })
})

describe('readTooltipAt', () => {
  it('unfolds downwards from the right edge by default', () => {
    expect(readTooltipAt(null)).toEqual({ side: 'bottom', align: 'right' })
    expect(readTooltipAt('')).toEqual({ side: 'bottom', align: 'right' })
  })

  it('reads the words in any order', () => {
    expect(readTooltipAt('top')).toEqual({ side: 'top', align: 'right' })
    expect(readTooltipAt('top left')).toEqual({ side: 'top', align: 'left' })
    expect(readTooltipAt('left top')).toEqual({ side: 'top', align: 'left' })
  })
})
