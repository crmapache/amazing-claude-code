import type { Session } from './components/Header'

/**
 * The statistics tab's place in the strip - an id no conversation will ever carry.
 *
 * The strip rearranges by group (a conversation together with its forks), and the statistics is a group
 * of one: that way the hand drags it by the same arithmetic as everything else rather than by a second
 * one written beside it. The same string is what `active` holds while the tab is the one being looked at
 * - the strip and the body name that tab the same way.
 */
export const STATISTICS_GROUP = '__statistics__'

/**
 * The groups in the order the strip draws them: a conversation with its forks counts once. A group's tabs
 * always stand together (nothing may be dropped inside one), so a glance at the neighbour is enough.
 */
export const groupOrder = (sessions: Session[]): string[] => {
  const groups: string[] = []
  for (const session of sessions) {
    if (groups.at(-1) !== session.groupId) groups.push(session.groupId)
  }
  return groups
}

/**
 * Where a tab that belongs to no conversation stands: how many groups were to its left, and which groups
 * the strip held when that was decided.
 *
 * The snapshot is what makes the place survive the list changing underneath it, and a bare number does
 * not: with the statistics standing second and the conversation before it closed, "second" now points
 * past its former neighbour and the tab drifts to the right on its own. Counting instead the neighbours
 * it was put after, it stays where the hand left it - and a conversation opened afterwards, being nobody
 * it knows, appears to its right.
 */
export interface TabPlace {
  at: number
  among: string[]
}

/** The place as it stands in today's strip - see TabPlace. */
export const placeIn = (place: TabPlace, groups: string[]): number => {
  const left = new Set(place.among.slice(0, place.at))
  return groups.filter((groupId) => left.has(groupId)).length
}

/** Where a tab goes when it opens: the end of the strip, after every conversation. */
export const placeAtEnd = (groups: string[]): TabPlace => ({ at: groups.length, among: groups })

export interface TabMove {
  /** The tabs in their new order. The same array when nothing moved - there is nothing to redraw. */
  sessions: Session[]
  /** Where the statistics stands afterwards, or null when its tab is not in the strip at all. */
  statistics: TabPlace | null
  /**
   * What the shell is told, if anything. It keeps the conversations' order and knows nothing of the
   * statistics, so a drag that only carried that tab past a neighbour is this screen's business alone.
   */
  shell: { groupId: string; beforeGroupId: string | null } | null
}

/**
 * The new order of the strip after a drag.
 *
 * The unit of rearrangement is a group: a conversation together with its forks. They cannot be dragged
 * apart one by one, and someone else's tab cannot be inserted inside - a group is one topic, and a tab in
 * the middle of someone else's topic would mean nothing but confusion. The order inside a group is left
 * alone too: a fork follows its parent, and swapping them would be a lie about where it came from.
 *
 * The statistics takes part as a group of its own (see STATISTICS_GROUP): it is dragged like the rest and
 * the rest are dragged past it. What it does not do is reach the shell - the conversations' order there
 * is a list this tab has no line in.
 *
 * `beforeGroupId` is the group we will stand BEFORE, or null for the very end.
 */
export const moveTab = (
  sessions: Session[],
  statistics: TabPlace | null,
  groupId: string,
  beforeGroupId: string | null,
): TabMove => {
  const groups = groupOrder(sessions)
  const statsAt = statistics ? placeIn(statistics, groups) : null

  const order = [...groups]
  if (statsAt !== null) order.splice(statsAt, 0, STATISTICS_GROUP)

  const from = order.indexOf(groupId)
  if (from < 0 || groupId === beforeGroupId) return { sessions, statistics, shell: null }

  const rest = order.filter((id) => id !== groupId)
  const at = beforeGroupId === null ? -1 : rest.indexOf(beforeGroupId)
  const index = at < 0 ? rest.length : at
  const next = [...rest.slice(0, index), groupId, ...rest.slice(index)]

  const nextGroups = next.filter((id) => id !== STATISTICS_GROUP)
  // The statistics moving past a neighbour leaves the conversations exactly as they were: their order is
  // the same list, and there is nothing to tell the shell or to redraw in the tabs themselves.
  const sameOrder = nextGroups.every((id, place) => groups[place] === id)

  return {
    sessions: sameOrder ? sessions : nextGroups.flatMap((id) => sessions.filter((s) => s.groupId === id)),
    statistics: statsAt === null ? null : { at: next.indexOf(STATISTICS_GROUP), among: nextGroups },
    shell:
      sameOrder || groupId === STATISTICS_GROUP
        ? null
        : { groupId, beforeGroupId: nextGroups[nextGroups.indexOf(groupId) + 1] ?? null },
  }
}
