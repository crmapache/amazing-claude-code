import type { Session } from './components/Header'

/**
 * The strip holds two kinds of tab, and only one of them is a conversation.
 *
 * The other kind - the statistics, the scenarios, a scenario run being watched - holds no conversation
 * and belongs to this screen alone: the shell's list of tabs has no line for any of them. They take part
 * in the strip as groups of one, so the hand drags them by the same arithmetic as everything else rather
 * than by a second one written beside it. The same string is what `active` holds while such a tab is the
 * one being looked at - the strip and the body name a tab the same way.
 */
export const STATISTICS_GROUP = '__statistics__'

/** The hub: both shelves of scenarios, and the runs that came of them. */
export const SCENARIOS_GROUP = '__scenarios__'

/**
 * One run being watched, by its own identifier.
 *
 * A tab each rather than one that swaps its contents, because that is what a run is: it goes on for
 * hours whether or not anybody is looking at it, and two of them - the one going now and the one from
 * last night somebody is reading - are two different things to have open at once.
 */
const RUN_TAB = '__scenario_run__'

export const runTabId = (runId: string): string => `${RUN_TAB}${runId}`

/** The run a tab is watching, or an empty string when the tab is not one. */
export const runOfTab = (id: string): string => (id.startsWith(RUN_TAB) ? id.slice(RUN_TAB.length) : '')

/** Whether this identifier belongs to the strip rather than to any conversation. */
export const isPanelTab = (id: string): boolean =>
  id === STATISTICS_GROUP || id === SCENARIOS_GROUP || id.startsWith(RUN_TAB)

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

/** Where a tab that holds no conversation stands - see [TabPlace]. */
export interface PanelTabPlace {
  id: string
  place: TabPlace
}

export interface TabMove {
  /** The tabs in their new order. The same array when nothing moved - there is nothing to redraw. */
  sessions: Session[]
  /** The tabs that hold no conversation, in the order the strip now draws them. */
  panels: PanelTabPlace[]
  /**
   * What the shell is told, if anything. It keeps the conversations' order and knows nothing of the
   * tabs that hold none, so a drag that only carried one of those past a neighbour is this screen's
   * business alone.
   */
  shell: { groupId: string; beforeGroupId: string | null } | null
}

/**
 * The strip as it is drawn: the conversation groups with the panel's own tabs standing among them.
 *
 * One list rather than "the conversations, and then the others after them" - otherwise those tabs could
 * be dragged anywhere and would still snap back to the end.
 */
export const stripOrder = (sessions: Session[], panels: PanelTabPlace[]): string[] => {
  const groups = groupOrder(sessions)
  const order = [...groups]

  // Their own order breaks a tie: two tabs that work out to the same place keep the order they were
  // already drawn in, rather than swapping every time a conversation beside them closes.
  const placed = panels
    .map((panel, index) => ({ id: panel.id, index, at: placeIn(panel.place, groups) }))
    .sort((one, two) => one.at - two.at || one.index - two.index)

  placed.forEach((panel, shift) => order.splice(panel.at + shift, 0, panel.id))
  return order
}

/**
 * The new order of the strip after a drag.
 *
 * The unit of rearrangement is a group: a conversation together with its forks. They cannot be dragged
 * apart one by one, and someone else's tab cannot be inserted inside - a group is one topic, and a tab in
 * the middle of someone else's topic would mean nothing but confusion. The order inside a group is left
 * alone too: a fork follows its parent, and swapping them would be a lie about where it came from.
 *
 * The panel's own tabs take part as groups of one (see [STATISTICS_GROUP]): they are dragged like the
 * rest and the rest are dragged past them. What they do not do is reach the shell - the conversations'
 * order there is a list they have no line in.
 *
 * `beforeGroupId` is the group we will stand BEFORE, or null for the very end.
 */
export const moveTab = (
  sessions: Session[],
  panels: PanelTabPlace[],
  groupId: string,
  beforeGroupId: string | null,
): TabMove => {
  const groups = groupOrder(sessions)
  const order = stripOrder(sessions, panels)
  const held = new Set(panels.map((panel) => panel.id))

  const from = order.indexOf(groupId)
  if (from < 0 || groupId === beforeGroupId) return { sessions, panels, shell: null }

  const rest = order.filter((id) => id !== groupId)
  const at = beforeGroupId === null ? -1 : rest.indexOf(beforeGroupId)
  const index = at < 0 ? rest.length : at
  const next = [...rest.slice(0, index), groupId, ...rest.slice(index)]

  const nextGroups = next.filter((id) => !held.has(id))
  // A panel tab moving past a neighbour leaves the conversations exactly as they were: their order is
  // the same list, and there is nothing to tell the shell or to redraw in the tabs themselves.
  const sameOrder = nextGroups.every((id, place) => groups[place] === id)

  // Counted in conversation groups rather than in strip positions: that is what [placeIn] reads back,
  // and what makes the place survive a neighbour closing (see TabPlace).
  const nextPanels: PanelTabPlace[] = []
  let passed = 0
  for (const id of next) {
    if (held.has(id)) nextPanels.push({ id, place: { at: passed, among: nextGroups } })
    else passed += 1
  }

  return {
    sessions: sameOrder ? sessions : nextGroups.flatMap((id) => sessions.filter((s) => s.groupId === id)),
    panels: nextPanels,
    shell:
      sameOrder || held.has(groupId)
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
