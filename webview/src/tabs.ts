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

/**
 * The new order of a group's own tabs after a fork has been dragged inside it.
 *
 * The group as a whole is dragged by [moveTab] above; this is the other half of the same gesture - the
 * one that rearranges a conversation's forks between themselves. A fork stays inside its group either
 * way: dropped anywhere else it goes back where it was, because a tab in the middle of somebody else's
 * subject means nothing.
 *
 * The group's first tab is the conversation everything here grew out of, and it keeps its place: the
 * strip marks a group by its head - the gap before it, the colour bar, the indent of the forks under it -
 * and a fork standing first would say the group began with a branch of something that is not there.
 *
 * `beforeId` is the tab we will stand BEFORE, or null for the end of the group.
 */
export const moveWithinGroup = (sessions: Session[], id: string, beforeId: string | null): Session[] => {
  const moving = sessions.find((session) => session.id === id)
  if (!moving || id === beforeId) return sessions

  const group = sessions.filter((session) => session.groupId === moving.groupId)
  // Nothing to rearrange: a lone conversation, or the head of the group, which does not move.
  if (group.length < 3 || group[0]?.id === id) return sessions

  const rest = group.filter((session) => session.id !== id)
  const at = beforeId === null ? -1 : rest.findIndex((session) => session.id === beforeId)
  // Never before the head - and never past the end of its own group.
  const index = at < 0 ? rest.length : Math.max(1, at)
  const ordered = [...rest.slice(0, index), moving, ...rest.slice(index)]

  if (ordered.every((session, place) => group[place]?.id === session.id)) return sessions

  // The group occupies one unbroken run of the strip (see groupOrder), so its tabs are put back in the
  // place they came from and everything around them stays exactly as it was.
  const from = sessions.findIndex((session) => session.groupId === moving.groupId)
  return [...sessions.slice(0, from), ...ordered, ...sessions.slice(from + group.length)]
}
