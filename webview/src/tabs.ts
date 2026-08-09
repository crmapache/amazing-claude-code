import type { Session } from './components/Header'

/**
 * Новый порядок вкладок после перетаскивания.
 *
 * Единица перестановки — группа: разговор вместе со своими форками. Поштучно их
 * не растащить и чужую вкладку внутрь не вставить — группа это одна тема, и
 * вкладка посреди чужой темы не значила бы ничего, кроме путаницы. Порядок
 * внутри группы тоже не трогаем: форк идёт за своим родителем, и менять их
 * местами было бы враньём про то, откуда он взялся.
 *
 * `beforeGroupId` — группа, ПЕРЕД которой встанем, или null — в самый конец.
 */
export const moveGroup = (sessions: Session[], groupId: string, beforeGroupId: string | null): Session[] => {
  const moving = sessions.filter((session) => session.groupId === groupId)
  if (moving.length === 0 || groupId === beforeGroupId) return sessions

  const rest = sessions.filter((session) => session.groupId !== groupId)
  const at = beforeGroupId === null ? -1 : rest.findIndex((session) => session.groupId === beforeGroupId)
  const index = at < 0 ? rest.length : at

  return [...rest.slice(0, index), ...moving, ...rest.slice(index)]
}
