/**
 * Where a tab's feed was left standing, so that coming back to the tab is coming back to the same place.
 *
 * A feed of its own per tab (see the key in App) means a feed that is built from nothing on every switch,
 * and a feed built from nothing starts at the bottom: reading something in the middle of a long chat,
 * glancing at a neighbouring tab and coming back threw the reading away every time. The memory therefore
 * lives outside the feed - the feed is precisely what does not survive the switch.
 */
export interface FeedPlace {
  /**
   * The feed stood at its end and stuck there. Remembered as the fact rather than as an offset: while the
   * tab was away an answer may have printed into it, and what the person left off at is "the end", not
   * the pixel the end happened to be at.
   */
  stick: boolean
  /**
   * The row that covered the top edge of the view, by its id in the feed.
   *
   * The reading is held by a row rather than by an offset because the feed grows in the middle as well as
   * at the bottom: a background command answers, a subagent reports, a workflow redraws its fleet. Every
   * one of those is above a person reading higher up, and a remembered number of pixels would slide them
   * by the height of something they never looked at. Missing when there was no row to hold on to.
   */
  row?: string
  /** Where that row's own top stood against the edge - negative for a row that begins above the view. */
  offset: number
  /** The plain offset, kept as the answer for a row that is no longer in the feed. */
  top: number
}

/** Reading and writing one tab's place - the map itself belongs to whoever owns the tabs. */
export interface FeedMemory {
  read: () => FeedPlace | undefined
  write: (place: FeedPlace) => void
}

/**
 * The row covering the top edge of the view, as an index into rows standing in feed order.
 *
 * Found by halving rather than by walking: the rows stand in order, so "does this one reach past the
 * edge" only ever turns from no to yes once - and a chat scrolled through for a day is hundreds of rows
 * that would otherwise all be measured on every scroll event. Answers the count itself when every row
 * ends above the edge (an empty feed, or one scrolled past its last row).
 */
export const rowAtEdge = (count: number, bottomOf: (index: number) => number, edge: number): number => {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >> 1
    if (bottomOf(middle) > edge) high = middle
    else low = middle + 1
  }
  return low
}

/**
 * How far to scroll to put a remembered place back, given where its row stands now and where the view's
 * top edge is. Both measurements are the browser's own, so the answer is a plain difference: the row is
 * asked to stand where it stood.
 */
export const placeShift = (place: FeedPlace, rowTop: number, edge: number): number => rowTop - edge - place.offset
