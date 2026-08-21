/**
 * Where the menu of a selected piece of text stands. Screen coordinates throughout: the menu is drawn as a
 * fixed element, so the feed's own scroll must not creep into the arithmetic.
 */

/** The part of a DOMRect the placement actually needs - so that the sums can be checked without a browser. */
export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

export interface Placement {
  x: number
  y: number
}

export interface PlacementInput {
  /** The selection's first line: the menu stands above it whenever the feed has the room. */
  head: Box
  /** The selection's last line: the fallback below, taken when the top has no room left. */
  tail: Box
  /** Where the mouse was released - the last resort for a selection that fills the feed from edge to edge. */
  pointer: { x: number; y: number }
  /** The feed's visible part: above it sits the header, below it the input field. */
  bounds: Box
  /** The menu's measured size. Never a constant: the width comes out of the font the IDE hands the panel. */
  menu: { width: number; height: number }
}

/** The breathing space between the menu and the line it belongs to. */
const GAP = 6

/** The menu is never pressed flush against the feed's edge. */
const EDGE = 8

/**
 * Above the selection, below it, or - when neither end fits - by the mouse. The first two never cover the
 * selected text itself, which is the whole point: the text is selected in order to be read and copied.
 */
export const placeSelectionMenu = ({ head, tail, pointer, bounds, menu }: PlacementInput): Placement => {
  const top = bounds.top + EDGE
  const bottom = bounds.bottom - EDGE - menu.height

  const above = head.top - GAP - menu.height
  if (above >= top) return { x: centre(middle(head), menu, bounds), y: above }

  const below = tail.bottom + GAP
  if (below <= bottom) return { x: centre(middle(tail), menu, bounds), y: below }

  // The selection is taller than the feed itself: both ends are off-screen, so the menu goes to the mouse
  // and covers whatever it covers - no free spot is left to move it to.
  const overPointer = pointer.y - GAP - menu.height
  const y = overPointer >= top ? overPointer : pointer.y + GAP

  return { x: centre(pointer.x, menu, bounds), y: Math.min(Math.max(y, top), Math.max(top, bottom)) }
}

/**
 * The selection's first and last lines out of the rectangles the browser gives for a range. The single
 * rectangle that wraps them all is no good here: for a selection of several lines it is as wide as the
 * whole paragraph, and the menu centred on it lands in the middle of the text instead of beside it.
 *
 * One line can come as several rectangles - inline code, a link, a bold word break the run - so the pieces
 * that share a line are glued back together.
 */
export const edgeLines = (rects: Box[]): { head: Box; tail: Box } | null => {
  const lines = rects.filter((rect) => rect.right > rect.left && rect.bottom > rect.top)
  if (lines.length === 0) return null

  const first = lines.reduce((best, rect) => (rect.top < best.top ? rect : best))
  const last = lines.reduce((best, rect) => (rect.bottom > best.bottom ? rect : best))

  return {
    head: merge(lines.filter((rect) => rect.top < first.bottom)),
    tail: merge(lines.filter((rect) => rect.bottom > last.top)),
  }
}

const middle = (box: Box) => (box.left + box.right) / 2

/** Centred on the text, yet never outside the feed: on a narrow panel the menu is pressed to the edge. */
const centre = (x: number, menu: PlacementInput['menu'], bounds: Box) => {
  const left = bounds.left + EDGE
  const right = bounds.right - EDGE - menu.width

  return Math.min(Math.max(x - menu.width / 2, left), Math.max(left, right))
}

const merge = (boxes: Box[]): Box =>
  boxes.reduce((joined, box) => ({
    left: Math.min(joined.left, box.left),
    right: Math.max(joined.right, box.right),
    top: Math.min(joined.top, box.top),
    bottom: Math.max(joined.bottom, box.bottom),
  }))
