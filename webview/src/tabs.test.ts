import { describe, expect, it } from 'vitest'
import type { Session } from './components/Header'
import {
  groupOrder,
  isPanelTab,
  moveTab,
  moveWithinGroup,
  placeAtEnd,
  runOfTab,
  runTabId,
  SCENARIOS_GROUP,
  stripOrder,
  stripTabs,
  STATISTICS_GROUP,
  tabAfterClosing,
  tabAfterElsewhere,
  type PanelTabPlace,
} from './tabs'

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

/** One tab that holds no conversation, standing at the end of the strip as it does when it opens. */
const panel = (id: string, list: Session[] = sessions): PanelTabPlace[] => [
  { id, place: placeAtEnd(groupOrder(list)) },
]

describe('rearranging the tabs', () => {
  it('moves a group whole - the forks do not lag behind their conversation', () => {
    expect(ids(moveTab(sessions, [], 'main', 'third').sessions)).toEqual([
      'second',
      'main',
      'fork-1',
      'fork-2',
      'third',
    ])
  })

  it('does not change the order inside a group', () => {
    expect(ids(moveTab(sessions, [], 'main', null).sessions)).toEqual([
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
    expect(ids(moveTab(sessions, [], 'third', 'main').sessions)).toEqual([
      'third',
      'main',
      'fork-1',
      'fork-2',
      'second',
    ])
  })

  it('changes nothing when dragged onto itself', () => {
    expect(moveTab(sessions, [], 'main', 'main').sessions).toBe(sessions)
  })

  it('breaks nothing for an unknown group', () => {
    expect(moveTab(sessions, [], 'no-such-group', null).sessions).toBe(sessions)
  })

  it('tells the shell the group it now stands before', () => {
    expect(moveTab(sessions, [], 'third', 'main').shell).toEqual({ groupId: 'third', beforeGroupId: 'main' })
    expect(moveTab(sessions, [], 'main', null).shell).toEqual({ groupId: 'main', beforeGroupId: null })
  })
})

describe('the tabs that hold no conversation', () => {
  const stats = panel(STATISTICS_GROUP)

  it('opens at the end of the strip', () => {
    expect(stripOrder(sessions, stats)).toEqual(['main', 'second', 'third', STATISTICS_GROUP])
  })

  it('is dragged like any other tab', () => {
    const moved = moveTab(sessions, stats, STATISTICS_GROUP, 'second')
    expect(stripOrder(moved.sessions, moved.panels)).toEqual(['main', STATISTICS_GROUP, 'second', 'third'])
  })

  it('keeps the conversations - and the shell - out of a drag of its own', () => {
    const moved = moveTab(sessions, stats, STATISTICS_GROUP, 'main')
    expect(moved.sessions).toBe(sessions)
    expect(moved.shell).toBeNull()
  })

  it('is a tab the conversations are dragged past', () => {
    const first = moveTab(sessions, stats, STATISTICS_GROUP, 'second')
    const moved = moveTab(first.sessions, first.panels, 'third', STATISTICS_GROUP)
    expect(stripOrder(moved.sessions, moved.panels)).toEqual(['main', 'third', STATISTICS_GROUP, 'second'])
    // The shell knows no such tab: it is told the conversation the group really landed in front of.
    expect(moved.shell).toEqual({ groupId: 'third', beforeGroupId: 'second' })
  })

  it('stays put when a conversation beside it closes', () => {
    const moved = moveTab(sessions, stats, STATISTICS_GROUP, 'second')
    const left = sessions.filter((session) => session.groupId !== 'main')
    expect(stripOrder(left, moved.panels)).toEqual([STATISTICS_GROUP, 'second', 'third'])
  })

  it('lets a conversation opened afterwards appear on its far side', () => {
    const opened = [...sessions, tab('fresh', 'fresh')]
    expect(stripOrder(opened, stats)).toEqual(['main', 'second', 'third', STATISTICS_GROUP, 'fresh'])
  })

  // A scenario hub, a run being watched and the statistics can all stand in the strip at once, and every
  // one of them is dragged past the others.
  it('lets several of them stand among the conversations at once', () => {
    const run = runTabId('r1')
    const three: PanelTabPlace[] = [
      { id: SCENARIOS_GROUP, place: { at: 1, among: ['main', 'second', 'third'] } },
      { id: run, place: { at: 1, among: ['main', 'second', 'third'] } },
      { id: STATISTICS_GROUP, place: { at: 3, among: ['main', 'second', 'third'] } },
    ]

    expect(stripOrder(sessions, three)).toEqual([
      'main',
      SCENARIOS_GROUP,
      run,
      'second',
      'third',
      STATISTICS_GROUP,
    ])

    const moved = moveTab(sessions, three, run, SCENARIOS_GROUP)
    expect(stripOrder(moved.sessions, moved.panels)).toEqual([
      'main',
      run,
      SCENARIOS_GROUP,
      'second',
      'third',
      STATISTICS_GROUP,
    ])
    expect(moved.shell).toBeNull()
  })

  it('knows its own tabs from a conversation', () => {
    expect(isPanelTab(STATISTICS_GROUP)).toBe(true)
    expect(isPanelTab(SCENARIOS_GROUP)).toBe(true)
    expect(isPanelTab(runTabId('r1'))).toBe(true)
    expect(isPanelTab('main')).toBe(false)

    expect(runOfTab(runTabId('r1'))).toBe('r1')
    expect(runOfTab(SCENARIOS_GROUP)).toBe('')
  })
})

describe('the tab to look at once one is closed', () => {
  const stats = panel(STATISTICS_GROUP)

  it('unfolds the strip into tabs, forks and all', () => {
    expect(stripTabs(sessions, stats)).toEqual([
      'main',
      'fork-1',
      'fork-2',
      'second',
      'third',
      STATISTICS_GROUP,
    ])
  })

  it('takes the neighbour on the right', () => {
    expect(tabAfterClosing(sessions, [], 'second')).toBe('third')
    expect(tabAfterClosing(sessions, [], 'main')).toBe('fork-1')
  })

  it('takes the one on the left when the closed tab stood last', () => {
    expect(tabAfterClosing(sessions, [], 'third')).toBe('second')
  })

  it('holds no conversation of a tab above one that does', () => {
    const only = [tab('main', 'main')]
    expect(tabAfterClosing(only, panel(SCENARIOS_GROUP, only), 'main')).toBe(SCENARIOS_GROUP)
  })

  it('steps from one tab of its own to the next', () => {
    const run = runTabId('r1')
    const two: PanelTabPlace[] = [
      { id: SCENARIOS_GROUP, place: { at: 0, among: [] } },
      { id: run, place: { at: 0, among: [] } },
    ]
    expect(tabAfterClosing([], two, SCENARIOS_GROUP)).toBe(run)
  })

  it('skips the neighbours that went with it - several may close at once', () => {
    const gone = new Set(['second', 'third'])
    expect(tabAfterClosing(sessions, stats, 'second', (id) => !gone.has(id))).toBe(STATISTICS_GROUP)
  })

  it('says nothing when the strip is left empty', () => {
    const only = [tab('main', 'main')]
    expect(tabAfterClosing(only, [], 'main')).toBe('')
  })
})

describe('rearranging the forks inside a group', () => {
  /** The same conversation with three forks: two of them have something to be rearranged between. */
  const withThree: Session[] = [
    tab('main', 'main'),
    tab('fork-1', 'main', 1),
    tab('fork-2', 'main', 1),
    tab('fork-3', 'main', 1),
    tab('second', 'second'),
  ]

  it('moves one fork past another and leaves everything else alone', () => {
    expect(ids(moveWithinGroup(withThree, 'fork-3', 'fork-2'))).toEqual([
      'main',
      'fork-1',
      'fork-3',
      'fork-2',
      'second',
    ])
  })

  it('sends a fork dropped at the end to the end of its own group, not of the strip', () => {
    expect(ids(moveWithinGroup(withThree, 'fork-1', null))).toEqual([
      'main',
      'fork-2',
      'fork-3',
      'fork-1',
      'second',
    ])
  })

  // The head of the group is the conversation the forks grew out of, and it keeps its place.
  it('never puts a fork in front of its conversation', () => {
    expect(ids(moveWithinGroup(withThree, 'fork-2', 'main'))).toEqual([
      'main',
      'fork-2',
      'fork-1',
      'fork-3',
      'second',
    ])
  })

  it('does not move the head of a group', () => {
    expect(moveWithinGroup(withThree, 'main', 'fork-2')).toBe(withThree)
  })

  // A single fork under an unmovable head has nothing to be rearranged with - the strip drags the whole
  // group by it instead (see Header).
  it('leaves a group of two alone', () => {
    const two = [tab('main', 'main'), tab('fork-1', 'main', 1)]
    expect(moveWithinGroup(two, 'fork-1', null)).toBe(two)
  })

  it('returns the same list when nothing moved', () => {
    expect(moveWithinGroup(withThree, 'fork-3', null)).toBe(withThree)
  })
})

/**
 * Which tab a screen shows when the one it had open was closed somewhere else - another IDE window, or
 * the phone.
 *
 * The neighbour is worked out over the strip as it was BEFORE the news arrived, and that is the whole of
 * this rule. The list that comes with the news no longer has the closed tab in it, so asked against that
 * one the question "what stood next to it" has no answer at all and the screen falls back to the very
 * first tab of the strip - which is exactly the case this was written for.
 */
describe('tabAfterElsewhere', () => {
  it('moves to the neighbour on the right, not to the front of the strip', () => {
    const known = ['main', 'fork-1', 'fork-2', 'third']

    expect(tabAfterElsewhere(sessions, [], known, 'second')).toBe('third')
  })

  it('falls back to the left when the closed tab stood last', () => {
    const known = ['main', 'fork-1', 'fork-2', 'second']

    expect(tabAfterElsewhere(sessions, [], known, 'third')).toBe('second')
  })

  /** This screen's own tabs are on no such list and are never closed by it. */
  it("leaves a tab of this panel's own alone and counts it as a neighbour", () => {
    const known = ['main', 'fork-1', 'fork-2', 'second']
    const panels = panel(STATISTICS_GROUP)

    expect(tabAfterElsewhere(sessions, panels, known, STATISTICS_GROUP)).toBe(STATISTICS_GROUP)
    expect(tabAfterElsewhere(sessions, panels, known, 'third')).toBe(STATISTICS_GROUP)
  })

  it('stays put when the tab is still there', () => {
    expect(tabAfterElsewhere(sessions, [], ids(sessions), 'second')).toBe('second')
  })
})
