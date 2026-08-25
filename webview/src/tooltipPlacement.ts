/**
 * Where a hover hint stands. Screen coordinates throughout: the hint is drawn as a fixed element in the
 * body (see Tooltips), so no scroll of the panel's own creeps into the arithmetic.
 *
 * The markup only ever states a preference - `data-tooltip-at` says which way the hint reads best next to
 * that particular button. Whether it can go that way is decided here, against the window: the panel is a
 * tool window a person drags as narrow as they like, and a hint pinned to the left edge of a meter that
 * sits near the right edge used to unfold straight off the screen.
 */

/** The part of a DOMRect the placement actually needs - so that the sums can be checked without a browser. */
export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Above the element or below it. */
export type Side = 'top' | 'bottom'

/** Which of the element's edges the hint is pinned to before the window has its say. */
export type Align = 'left' | 'right'

export interface TooltipPlacement {
  x: number
  y: number
  /** The side it ended up on - the hint slides in from it, so the drawing needs to know (see tooltip.module.css). */
  side: Side
}

export interface TooltipInput {
  /** The element the hint belongs to. */
  anchor: Box
  /** The hint's measured size. Never a constant: the width comes out of the font the IDE hands the panel. */
  tip: { width: number; height: number }
  /** The window the hint has to stay inside. */
  viewport: Box
  /** The preferred side, out of data-tooltip-at. */
  side: Side
  /** The preferred edge, out of data-tooltip-at. */
  align: Align
}

/** The breathing space between the hint and the element it belongs to. */
const GAP = 7

/** The hint is never pressed flush against the window's edge. */
const EDGE = 8

/**
 * The preferred side when it fits, the opposite one when it does not, and - when neither fits - whichever
 * has more room, pressed inside the window. Sideways the same: the preferred edge first, then whatever it
 * takes to keep the whole hint on screen.
 */
export const placeTooltip = ({ anchor, tip, viewport, side, align }: TooltipInput): TooltipPlacement => {
  const top = viewport.top + EDGE
  const bottom = viewport.bottom - EDGE - tip.height

  const above = anchor.top - GAP - tip.height
  const below = anchor.bottom + GAP

  const chosen = pickSide({ anchor, viewport, side, fitsAbove: above >= top, fitsBelow: below <= bottom })
  const y = chosen === 'top' ? above : below

  const left = viewport.left + EDGE
  const right = viewport.right - EDGE - tip.width
  const x = align === 'left' ? anchor.left : anchor.right - tip.width

  return {
    // Math.max around the far edge for the case of a hint wider (or taller) than the window itself: with
    // the two bounds crossed the clamp has to end up at the near edge rather than past it.
    x: Math.min(Math.max(x, left), Math.max(left, right)),
    y: Math.min(Math.max(y, top), Math.max(top, bottom)),
    side: chosen,
  }
}

/**
 * The last case - neither above nor below - is a hint taller than the room left on either side: a long
 * two-line one next to a button in a panel dragged down to a couple of hundred pixels. It cannot help
 * covering something then, so it goes where it covers the least.
 */
const pickSide = ({
  anchor,
  viewport,
  side,
  fitsAbove,
  fitsBelow,
}: {
  anchor: Box
  viewport: Box
  side: Side
  fitsAbove: boolean
  fitsBelow: boolean
}): Side => {
  if (side === 'top' ? fitsAbove : fitsBelow) return side
  if (side === 'top' ? fitsBelow : fitsAbove) return side === 'top' ? 'bottom' : 'top'

  return anchor.top - viewport.top >= viewport.bottom - anchor.bottom ? 'top' : 'bottom'
}

/**
 * The markup's `data-tooltip-at`: a list of words in any order, everything unnamed staying at the default -
 * downwards, from the element's right edge leftwards.
 */
export const readTooltipAt = (value: string | null | undefined): { side: Side; align: Align } => {
  const words = (value ?? '').split(/\s+/)

  return {
    side: words.includes('top') ? 'top' : 'bottom',
    align: words.includes('left') ? 'left' : 'right',
  }
}
