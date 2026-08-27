import { describe, expect, it } from 'vitest'
import type { Session } from './components/Header'
import { groupOrder, moveTab, placeAtEnd, placeIn, STATISTICS_GROUP, type TabPlace } from './tabs'

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

/** The whole strip as it is drawn: the groups in order, with the statistics standing among them. */
const strip = (list: Session[], place: TabPlace | null): string[] => {
  const groups = groupOrder(list)
  if (!place) return groups

  const drawn = [...groups]
  drawn.splice(placeIn(place, groups), 0, STATISTICS_GROUP)
  return drawn
}

describe('rearranging the tabs', () => {
  it('moves a group whole - the forks do not lag behind their conversation', () => {
    expect(ids(moveTab(sessions, null, 'main', 'third').sessions)).toEqual([
      'second',
      'main',
      'fork-1',
      'fork-2',
      'third',
    ])
  })

  it('does not change the order inside a group', () => {
    expect(ids(moveTab(sessions, null, 'main', null).sessions)).toEqual([
      'second',
      'third',
      'main',
      'fork-1',
      'fork-2',
    ])
  })

  it('puts another tab in front of a group rather than inside it', () => {
    // The destination is always a whole group: "before main" means before the whole conversation rather
    // than between it and its fork.
    expect(ids(moveTab(sessions, null, 'third', 'main').sessions)).toEqual([
      'third',
      'main',
      'fork-1',
      'fork-2',
      'second',
    ])
  })

  it('changes nothing when dragged onto itself', () => {
    expect(moveTab(sessions, null, 'main', 'main').sessions).toBe(sessions)
  })

  it('breaks nothing for an unknown group', () => {
    expect(moveTab(sessions, null, 'no-such-group', null).sessions).toBe(sessions)
  })

  it('tells the shell the group it now stands before', () => {
    expect(moveTab(sessions, null, 'third', 'main').shell).toEqual({ groupId: 'third', beforeGroupId: 'main' })
    expect(moveTab(sessions, null, 'main', null).shell).toEqual({ groupId: 'main', beforeGroupId: null })
  })
})

describe('the statistics tab in the strip', () => {
  const atEnd = placeAtEnd(groupOrder(sessions))

  it('opens at the end of the strip', () => {
    expect(strip(sessions, atEnd)).toEqual(['main', 'second', 'third', STATISTICS_GROUP])
  })

  it('is dragged like any other tab', () => {
    const moved = moveTab(sessions, atEnd, STATISTICS_GROUP, 'second')
    expect(strip(moved.sessions, moved.statistics)).toEqual(['main', STATISTICS_GROUP, 'second', 'third'])
  })

  it('keeps the conversations - and the shell - out of a drag of its own', () => {
    const moved = moveTab(sessions, atEnd, STATISTICS_GROUP, 'main')
    expect(moved.sessions).toBe(sessions)
    expect(moved.shell).toBeNull()
  })

  it('is a tab the conversations are dragged past', () => {
    const first = moveTab(sessions, atEnd, STATISTICS_GROUP, 'second')
    const moved = moveTab(first.sessions, first.statistics, 'third', STATISTICS_GROUP)
    expect(strip(moved.sessions, moved.statistics)).toEqual(['main', 'third', STATISTICS_GROUP, 'second'])
    // The shell knows no statistics: it is told the conversation the group really landed in front of.
    expect(moved.shell).toEqual({ groupId: 'third', beforeGroupId: 'second' })
  })

  it('stays put when a conversation beside it closes', () => {
    const moved = moveTab(sessions, atEnd, STATISTICS_GROUP, 'second')
    const left = sessions.filter((session) => session.groupId !== 'main')
    expect(strip(left, moved.statistics)).toEqual([STATISTICS_GROUP, 'second', 'third'])
  })

  it('lets a conversation opened afterwards appear on its far side', () => {
    const opened = [...sessions, tab('fresh', 'fresh')]
    expect(strip(opened, atEnd)).toEqual(['main', 'second', 'third', STATISTICS_GROUP, 'fresh'])
  })
})
