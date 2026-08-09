import { describe, expect, it } from 'vitest'
import type { Session } from './components/Header'
import { moveGroup } from './tabs'

const tab = (id: string, groupId: string, depth = 0): Session => ({
  id,
  title: id,
  state: 'idle',
  groupId,
  depth,
})

/** Разговор с двумя форками и два обычных разговора вокруг него. */
const sessions: Session[] = [
  tab('main', 'main'),
  tab('fork-1', 'main', 1),
  tab('fork-2', 'main', 1),
  tab('second', 'second'),
  tab('third', 'third'),
]

const ids = (list: Session[]) => list.map((session) => session.id)

describe('перестановка вкладок', () => {
  it('группа едет целиком — форки не отстают от своего разговора', () => {
    expect(ids(moveGroup(sessions, 'main', 'third'))).toEqual(['second', 'main', 'fork-1', 'fork-2', 'third'])
  })

  it('порядок внутри группы не меняется', () => {
    const moved = moveGroup(sessions, 'main', null)
    expect(ids(moved)).toEqual(['second', 'third', 'main', 'fork-1', 'fork-2'])
  })

  it('чужая вкладка встаёт перед группой, а не внутрь неё', () => {
    // Место назначения — всегда группа целиком: «перед main» значит перед всем
    // разговором, а не между ним и его форком.
    expect(ids(moveGroup(sessions, 'third', 'main'))).toEqual(['third', 'main', 'fork-1', 'fork-2', 'second'])
  })

  it('перетаскивание на самоё себя ничего не меняет', () => {
    expect(moveGroup(sessions, 'main', 'main')).toBe(sessions)
  })

  it('неизвестная группа ничего не ломает', () => {
    expect(moveGroup(sessions, 'нет-такой', null)).toBe(sessions)
  })
})
