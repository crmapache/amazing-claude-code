import { describe, expect, it } from 'vitest'
import type { Session } from './components/Header'
import { moveGroup } from './tabs'

const tab = (id: string, groupId: string, depth = 0): Session => ({
  id,
  title: id,
  state: 'idle',
  groupId,
  depth,
  titleSource: 'default',
})

/** A conversation with two forks and two ordinary conversations around it. */
const sessions: Session[] = [
  tab('main', 'main'),
  tab('fork-1', 'main', 1),
  tab('fork-2', 'main', 1),
  tab('second', 'second'),
  tab('third', 'third'),
]

const ids = (list: Session[]) => list.map((session) => session.id)

describe('rearranging the tabs', () => {
  it('moves a group whole - the forks do not lag behind their conversation', () => {
    expect(ids(moveGroup(sessions, 'main', 'third'))).toEqual(['second', 'main', 'fork-1', 'fork-2', 'third'])
  })

  it('does not change the order inside a group', () => {
    const moved = moveGroup(sessions, 'main', null)
    expect(ids(moved)).toEqual(['second', 'third', 'main', 'fork-1', 'fork-2'])
  })

  it('puts another tab in front of a group rather than inside it', () => {
    // The destination is always a whole group: "before main" means before the whole conversation rather
    // than between it and its fork.
    expect(ids(moveGroup(sessions, 'third', 'main'))).toEqual(['third', 'main', 'fork-1', 'fork-2', 'second'])
  })

  it('changes nothing when dragged onto itself', () => {
    expect(moveGroup(sessions, 'main', 'main')).toBe(sessions)
  })

  it('breaks nothing for an unknown group', () => {
    expect(moveGroup(sessions, 'no-such-group', null)).toBe(sessions)
  })
})
