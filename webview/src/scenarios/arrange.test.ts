import { describe, expect, it } from 'vitest'
import type { ScenarioScope } from '../protocol'
import {
  arrangementOf,
  heldAt,
  idOfRow,
  landing,
  placed,
  placement,
  rowKey,
  stepped,
  type Arrangement,
  type RowBox,
} from './arrange'

/**
 * Dragging a scenario to a new place, on its own shelf or over onto the other one.
 *
 * Laid out like the real hub: rows 60 high with 6 between them, the second shelf's heading in the gap
 * after the first shelf - a section's 16 below the last row, 11 of heading, 8 before the next row.
 */

const ROW = 60
const GAP = 6
/** An empty shelf while a row is carried: exactly the place that row would take (see Shelf). */
const EMPTY = ROW

/** Both shelves stacked down one column, as the hub draws them, and the line between them. */
const layout = (arrangement: Arrangement, empty = EMPTY): { rows: RowBox[]; boundary: number } => {
  const rows: RowBox[] = []
  let y = 0
  for (const key of arrangement.project) {
    rows.push({ key, shelf: 'project', top: y, height: ROW })
    y += ROW + GAP
  }
  // The last row's gap becomes the section's margin, then the heading of the second shelf.
  const heading = (arrangement.project.length > 0 ? y - GAP : y + empty) + 16
  y = heading + 11 + 8
  for (const key of arrangement.user) {
    rows.push({ key, shelf: 'user', top: y, height: ROW })
    y += ROW + GAP
  }
  return { rows, boundary: heading + 11 / 2 }
}

const both = { project: true, user: true }
const shelves: Arrangement = { project: ['project:a', 'project:b', 'project:c'], user: ['user:x', 'user:y'] }

/** Where [key] lands with its card's top edge at [top]. */
const at = (arrangement: Arrangement, key: string, top: number, open = both, empty = EMPTY) => {
  const { rows, boundary } = layout(arrangement, empty)
  const slot = rows.find((row) => row.key === key)!
  const from: ScenarioScope = arrangement.project.includes(key) ? 'project' : 'user'
  return landing({ key, from, top, bottom: top + ROW, origin: slot.top, rows, boundary, open })
}

describe('row keys', () => {
  it('tell two scenarios under one identifier apart, and give the identifier back', () => {
    expect(rowKey({ id: 'abc', scope: 'project' })).not.toBe(rowKey({ id: 'abc', scope: 'user' }))
    expect(idOfRow(rowKey({ id: 'abc', scope: 'user' }))).toBe('abc')
  })

  it('keeps the order each shelf was sent in', () => {
    const got = arrangementOf([
      { id: 'b', scope: 'project' },
      { id: 'x', scope: 'user' },
      { id: 'a', scope: 'project' },
    ])
    expect(got).toEqual({ project: ['project:b', 'project:a'], user: ['user:x'] })
  })
})

describe('landing', () => {
  it('stays put while the card is held over its own slot', () => {
    expect(at(shelves, 'project:b', 66)).toEqual({ shelf: 'project', index: 1 })
  })

  it('takes the next place once the bottom edge is past the next row’s middle', () => {
    // c is at 132..192, its middle at 162: the card's bottom at 161 has not passed it, at 163 it has.
    expect(at(shelves, 'project:b', 161 - ROW)).toEqual({ shelf: 'project', index: 1 })
    expect(at(shelves, 'project:b', 163 - ROW)).toEqual({ shelf: 'project', index: 2 })
  })

  it('takes the place above once the top edge is past the row above’s middle', () => {
    expect(at(shelves, 'project:b', 31)).toEqual({ shelf: 'project', index: 1 })
    expect(at(shelves, 'project:b', 29)).toEqual({ shelf: 'project', index: 0 })
  })

  it('crosses onto the second shelf, first place, once the middle is past its heading', () => {
    const { boundary } = layout(shelves)
    expect(at(shelves, 'project:c', boundary - 1 - ROW / 2)).toEqual({ shelf: 'project', index: 2 })
    expect(at(shelves, 'project:c', boundary + 1 - ROW / 2)).toEqual({ shelf: 'user', index: 0 })
  })

  it('crosses onto the first shelf, last place, once the middle is above the heading', () => {
    const { boundary } = layout(shelves)
    expect(at(shelves, 'user:x', boundary + 1 - ROW / 2)).toEqual({ shelf: 'user', index: 0 })
    expect(at(shelves, 'user:x', boundary - 1 - ROW / 2)).toEqual({ shelf: 'project', index: 3 })
  })

  /*
   * Let into the second shelf, the card must stay there while the hand does not move. The first shelf
   * closes up under it, the heading rises by a row, and the slot opens right under the heading - read
   * against the new layout, the same card has to land where it was just put.
   */
  it('does not bounce back once the other shelf opens up under the card', () => {
    const top = layout(shelves).boundary + 1 - ROW / 2
    expect(at(shelves, 'project:c', top)).toEqual({ shelf: 'user', index: 0 })

    const after = placed(shelves, 'project:c', { shelf: 'user', index: 0 })
    expect(at(after, 'project:c', top)).toEqual({ shelf: 'user', index: 0 })
  })

  it('does not bounce back going up either', () => {
    const top = layout(shelves).boundary - 1 - ROW / 2
    expect(at(shelves, 'user:x', top)).toEqual({ shelf: 'project', index: 3 })

    const after = placed(shelves, 'user:x', { shelf: 'project', index: 3 })
    expect(at(after, 'user:x', top)).toEqual({ shelf: 'project', index: 3 })
  })

  it('goes into an empty shelf', () => {
    const lonely: Arrangement = { project: ['project:a', 'project:b'], user: [] }
    const { boundary } = layout(lonely)
    expect(at(lonely, 'project:b', boundary + 1 - ROW / 2)).toEqual({ shelf: 'user', index: 0 })
  })

  /*
   * The empty shelf is the case that killed the panel, and it is about heights.
   *
   * While a row is carried, a shelf with nothing on it keeps open exactly the place that row would take,
   * so the line between the shelves does not move when the row crosses - and a card that crossed stays
   * crossed. With the capsule an empty shelf wears otherwise - two lines of prose, taller than a row -
   * the line moved back under the card, the card was read as belonging to the other shelf again, and it
   * bounced between the two while the hand stood still.
   */
  it('keeps a row let into an empty shelf above it', () => {
    const lonely: Arrangement = { project: [], user: ['user:x'] }
    const top = layout(lonely).boundary - 1 - ROW / 2
    expect(at(lonely, 'user:x', top)).toEqual({ shelf: 'project', index: 0 })

    const after = placed(lonely, 'user:x', { shelf: 'project', index: 0 })
    expect(at(after, 'user:x', top)).toEqual({ shelf: 'project', index: 0 })
  })

  it('keeps a row let into an empty shelf below it', () => {
    const lonely: Arrangement = { project: ['project:a'], user: [] }
    const top = layout(lonely).boundary + 1 - ROW / 2
    expect(at(lonely, 'project:a', top)).toEqual({ shelf: 'user', index: 0 })

    const after = placed(lonely, 'project:a', { shelf: 'user', index: 0 })
    expect(at(after, 'project:a', top)).toEqual({ shelf: 'user', index: 0 })
  })

  // The same drag against the capsule an empty shelf wears when nothing is being carried: it bounces.
  it('would bounce if an empty shelf stood taller than a row', () => {
    const CAPSULE = 64
    const lonely: Arrangement = { project: [], user: ['user:x'] }
    const top = layout(lonely, CAPSULE).boundary - 1 - ROW / 2
    expect(at(lonely, 'user:x', top, both, CAPSULE)).toEqual({ shelf: 'project', index: 0 })

    const after = placed(lonely, 'user:x', { shelf: 'project', index: 0 })
    expect(at(after, 'user:x', top, both, CAPSULE)).toEqual({ shelf: 'user', index: 0 })
  })

  // A project with no folder, or a shelf that already holds this identifier: the row stays on its own.
  it('keeps off a shelf that will not take the row', () => {
    const { boundary } = layout(shelves)
    const closed = { project: true, user: false }
    expect(at(shelves, 'project:c', boundary + 40 - ROW / 2, closed)).toEqual({ shelf: 'project', index: 2 })
  })
})

describe('placed and placement', () => {
  it('moves a row along its own shelf and names the row it now stands before', () => {
    const after = placed(shelves, 'project:a', { shelf: 'project', index: 2 })
    expect(after.project).toEqual(['project:b', 'project:c', 'project:a'])
    expect(placement(shelves, after, 'project:a')).toEqual({ id: 'a', from: 'project', to: 'project', before: '' })
  })

  it('moves a row over to the other shelf', () => {
    const after = placed(shelves, 'project:b', { shelf: 'user', index: 1 })
    expect(after).toEqual({ project: ['project:a', 'project:c'], user: ['user:x', 'project:b', 'user:y'] })
    expect(placement(shelves, after, 'project:b')).toEqual({ id: 'b', from: 'project', to: 'user', before: 'y' })
  })

  it('says nothing for a row put back where it was', () => {
    const away = placed(shelves, 'project:b', { shelf: 'user', index: 0 })
    const back = placed(away, 'project:b', { shelf: 'project', index: 1 })
    expect(placement(shelves, back, 'project:b')).toBeNull()
  })
})

describe('the arrow keys', () => {
  /** Where one press leaves the card, read back the way a drag reads it. */
  const press = (arrangement: Arrangement, key: string, down: boolean, from = placeOf(arrangement, key)) => {
    const next = stepped(arrangement, key, from, down, both)
    const { rows, boundary } = layout(arrangement)
    const slot = rows.find((row) => row.key === key)!
    const top = heldAt({ arrangement, key, place: next, height: ROW, origin: slot.top, rows, boundary })
    expect(top).not.toBeNull()
    return { next, read: at(arrangement, key, top!) }
  }

  const placeOf = (arrangement: Arrangement, key: string) => {
    const shelf: ScenarioScope = arrangement.project.includes(key) ? 'project' : 'user'
    return { shelf, index: arrangement[shelf].indexOf(key) }
  }

  it('moves one place down and one place up, and the drag reads the same place', () => {
    const down = press(shelves, 'project:a', true)
    expect(down.next).toEqual({ shelf: 'project', index: 1 })
    expect(down.read).toEqual(down.next)

    const up = press(shelves, 'project:c', false)
    expect(up.next).toEqual({ shelf: 'project', index: 1 })
    expect(up.read).toEqual(up.next)
  })

  // Two presses before letting go: the slot has not moved, only where the card is held.
  it('keeps counting from where the last press left it', () => {
    const second = press(shelves, 'project:a', true, { shelf: 'project', index: 1 })
    expect(second.next).toEqual({ shelf: 'project', index: 2 })
    expect(second.read).toEqual(second.next)
  })

  it('crosses to the first place of the other shelf, not the second', () => {
    const down = press(shelves, 'project:c', true)
    expect(down.next).toEqual({ shelf: 'user', index: 0 })
    expect(down.read).toEqual(down.next)
  })

  it('crosses back up to the last place of the first shelf', () => {
    const up = press(shelves, 'user:x', false)
    expect(up.next).toEqual({ shelf: 'project', index: 3 })
    expect(up.read).toEqual(up.next)
  })

  it('stays put at the very top and the very bottom', () => {
    expect(stepped(shelves, 'project:a', { shelf: 'project', index: 0 }, false, both)).toEqual({
      shelf: 'project',
      index: 0,
    })
    expect(stepped(shelves, 'user:y', { shelf: 'user', index: 1 }, true, both)).toEqual({ shelf: 'user', index: 1 })
  })
})
