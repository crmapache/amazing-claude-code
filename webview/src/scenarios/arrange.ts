import type { Scenario, ScenarioScope } from '../protocol'

/**
 * The two shelves as rows in an order somebody chose, and where a row being dragged would land if it
 * were let go now.
 *
 * Pure, and apart from the screen that drags, because this is where a drag goes wrong without anybody
 * seeing why: a row that jumps a place, one that cannot be put first on the other shelf, one that flickers
 * between the two shelves while the hand stands still. Each of those is a number compared with another
 * number, and numbers are what a test can hold still.
 */

/** Each shelf's rows, top to bottom, by row key (see [rowKey]). */
export type Arrangement = Record<ScenarioScope, string[]>

/**
 * Where a row goes: which shelf, and how many of that shelf's OTHER rows stand above it.
 *
 * Counted without the row itself, so one number means the same thing on both shelves: on its own shelf it
 * is the place `arrayMove` would take it to, on the other one it is where it is put in.
 */
export interface ShelfPlace {
  shelf: ScenarioScope
  index: number
}

/** One row as it lies on the screen - its layout box, not wherever a drag has shifted it for the moment. */
export interface RowBox {
  key: string
  shelf: ScenarioScope
  top: number
  height: number
}

/**
 * A row's name for as long as it is dragged: the shelf it was read off, and its identifier.
 *
 * The identifier alone collides when both shelves hold one - a project file back from a checkout beside
 * somebody's own copy. And the key must NOT follow the row over to the other shelf mid-drag: it is what the
 * drag holds on to, and a key that changed under it would be a drag that lost the row it was dragging.
 */
export const rowKey = (scenario: Pick<Scenario, 'id' | 'scope'>): string => `${scenario.scope}:${scenario.id}`

/** The identifier back out of a row key - everything after the first colon, since a scope holds none. */
export const idOfRow = (key: string): string => key.slice(key.indexOf(':') + 1)

/** The shelves as the IDE sent them: the order on each is the one it read off the disk. */
export const arrangementOf = (scenarios: Pick<Scenario, 'id' | 'scope'>[]): Arrangement => ({
  project: scenarios.filter((one) => one.scope === 'project').map(rowKey),
  user: scenarios.filter((one) => one.scope === 'user').map(rowKey),
})

/** Which shelf a row stands on in this arrangement, or null for one that is on neither. */
export const shelfOfRow = (arrangement: Arrangement, key: string): ScenarioScope | null =>
  arrangement.project.includes(key) ? 'project' : arrangement.user.includes(key) ? 'user' : null

/** Where a row stands now, in [ShelfPlace]'s terms. */
export const placeOfRow = (arrangement: Arrangement, key: string): ShelfPlace | null => {
  const shelf = shelfOfRow(arrangement, key)
  return shelf ? { shelf, index: arrangement[shelf].indexOf(key) } : null
}

/** The shelves with one row taken from wherever it stood and put at [place]. */
export const placed = (arrangement: Arrangement, key: string, place: ShelfPlace): Arrangement => {
  const without: Arrangement = {
    project: arrangement.project.filter((one) => one !== key),
    user: arrangement.user.filter((one) => one !== key),
  }
  const rows = [...without[place.shelf]]
  rows.splice(Math.min(Math.max(place.index, 0), rows.length), 0, key)
  return { ...without, [place.shelf]: rows }
}

/**
 * What the IDE is told once a row is let go: which one, from which shelf, to which, and the row it now
 * stands before - empty for last. Null when it was put back where it was.
 *
 * The neighbour rather than the index, because the IDE places it among what is on the DISK, and another
 * window may have added a row this one has not drawn yet (see ScenarioStore.place).
 */
export const placement = (
  start: Arrangement,
  end: Arrangement,
  key: string,
): { id: string; from: ScenarioScope; to: ScenarioScope; before: string } | null => {
  const from = shelfOfRow(start, key)
  const to = shelfOfRow(end, key)
  if (!from || !to) return null
  if (from === to && start[from].join('\n') === end[to].join('\n')) return null

  const rows = end[to]
  const next = rows[rows.indexOf(key) + 1]
  return { id: idOfRow(key), from, to, before: next ? idOfRow(next) : '' }
}

/**
 * Where the dragged row would land if let go now: which shelf by the card's MIDDLE, which place on it by
 * the card's LEADING edge.
 *
 * The place is snakein's rule, for the reason those lists have it. Rows here are not one height - one with
 * a run going carries a strip under it - and a centre compared with centres makes a tall row hard to move
 * past a short one: its middle is far from the hand holding it. So the edge in front leads - the top one
 * while the card is above its slot, the bottom one while it is below - and the row takes a neighbour's
 * place once that edge is past the neighbour's middle.
 *
 * The shelf cannot be read off that edge, and this is the whole of why the two questions are answered
 * differently. Crossing moves the row's slot to the other side of the line, so the card that was below its
 * slot is now above it - and the edge that leads flips with it, to the one on the far side of the line.
 * Read that way, a row let onto the other shelf was immediately read as belonging back on the first, and it
 * bounced between the two while the hand stood still until the panel died of a render loop. The middle
 * does not flip: it is where the card actually is, and the hand holds the row by the middle anyway.
 *
 * The line between the shelves is the middle of the second shelf's heading. It does not move while a row
 * crosses: the shelf the row leaves keeps its place open at exactly its height, and the one it lands on
 * makes room of the same height (see the slot in Shelf). A line that moved under a card that had just
 * crossed read as "it belongs back where it was", which is the loop above.
 *
 * A shelf that will not take the row (see `open`) is one it simply stays off; it is then placed on its own
 * shelf by the same edge, which is first or last.
 */
export const landing = ({
  key,
  from,
  top,
  bottom,
  origin,
  rows,
  boundary,
  open,
}: {
  key: string
  /** The shelf the row's slot is on now - not necessarily where the drag started. */
  from: ScenarioScope
  /** The dragged card, where it is drawn now. */
  top: number
  bottom: number
  /** The top of the row's own slot: above it the top edge leads, below it the bottom one. */
  origin: number
  /** Every row of both shelves, in their layout boxes. */
  rows: RowBox[]
  /** The line between the shelves (see above), or null when there is none to cross. */
  boundary: number | null
  /** Which shelves this row may be put on. */
  open: Record<ScenarioScope, boolean>
}): ShelfPlace => {
  const edge = top < origin ? top : bottom
  const middle = (top + bottom) / 2
  const across: ScenarioScope = boundary === null ? from : middle < boundary ? 'project' : 'user'
  const shelf = open[across] ? across : from

  const index = rows.filter(
    (row) => row.shelf === shelf && row.key !== key && row.top + row.height / 2 < edge,
  ).length
  return { shelf, index }
}

/**
 * One press of an arrow key: the next place down or up, over the line onto the other shelf when this one
 * has no more, and the same place when there is nowhere to go.
 */
export const stepped = (
  arrangement: Arrangement,
  key: string,
  at: ShelfPlace,
  down: boolean,
  open: Record<ScenarioScope, boolean>,
): ShelfPlace => {
  const others = (shelf: ScenarioScope) => arrangement[shelf].filter((one) => one !== key).length

  if (down) {
    if (at.index < others(at.shelf)) return { shelf: at.shelf, index: at.index + 1 }
    if (at.shelf === 'project' && open.user) return { shelf: 'user', index: 0 }
  } else {
    if (at.index > 0) return { shelf: at.shelf, index: at.index - 1 }
    if (at.shelf === 'user' && open.project) return { shelf: 'project', index: others('project') }
  }
  return at
}

/**
 * Where to hold the dragged card so that [landing] reads [place] - which is how an arrow key moves it.
 *
 * The keyboard has no hand to follow, so it is given a top edge instead. Onto the other shelf: the card's
 * middle a pixel past the line, because that is what decides the shelf. Along its own: the leading edge a
 * pixel past the middle of the neighbour it has to pass, because that is what decides the place. Worked out
 * against [landing] rather than beside it, since a key that put the card anywhere else would skip a place
 * or refuse one - the first place on the other shelf was the one that went missing.
 *
 * Null when the line is needed and there is none: then the key does nothing.
 */
export const heldAt = ({
  arrangement,
  key,
  place,
  height,
  origin,
  rows,
  boundary,
}: {
  arrangement: Arrangement
  key: string
  place: ShelfPlace
  /** The dragged card's height. */
  height: number
  /** The top of the row's own slot (see [landing]). */
  origin: number
  rows: RowBox[]
  boundary: number | null
}): number | null => {
  const slot = placeOfRow(arrangement, key)
  if (!slot) return null

  // Onto the other shelf: the middle a pixel over the line, which is what the shelf is read from.
  if (place.shelf !== slot.shelf) {
    if (boundary === null) return null
    return (place.shelf === 'user' ? boundary + 1 : boundary - 1) - height / 2
  }

  const others = rows.filter((row) => row.shelf === place.shelf && row.key !== key)

  if (place.index > slot.index) {
    // Down its own shelf: the bottom edge, just past the neighbour that will stand above it.
    const above = others[place.index - 1]
    return above ? above.top + above.height / 2 + 1 - height : origin
  }

  if (place.index < slot.index) {
    // Up its own shelf: the top edge, just short of the neighbour that will stand below it.
    const below = others[place.index]
    return below ? below.top + below.height / 2 - 1 : origin
  }

  return origin
}
