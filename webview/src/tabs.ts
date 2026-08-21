import type { Session } from './components/Header'

/**
 * The new order of the tabs after a drag.
 *
 * The unit of rearrangement is a group: a conversation together with its forks. They cannot be dragged
 * apart one by one, and someone else's tab cannot be inserted inside - a group is one topic, and a tab
 * in the middle of someone else's topic would mean nothing but confusion. The order inside a group is
 * left alone too: a fork follows its parent, and swapping them would be a lie about where it came from.
 *
 * `beforeGroupId` is the group we will stand BEFORE, or null for the very end.
 */
export const moveGroup = (sessions: Session[], groupId: string, beforeGroupId: string | null): Session[] => {
  const moving = sessions.filter((session) => session.groupId === groupId)
  if (moving.length === 0 || groupId === beforeGroupId) return sessions

  const rest = sessions.filter((session) => session.groupId !== groupId)
  const at = beforeGroupId === null ? -1 : rest.findIndex((session) => session.groupId === beforeGroupId)
  const index = at < 0 ? rest.length : at

  return [...rest.slice(0, index), ...moving, ...rest.slice(index)]
}
