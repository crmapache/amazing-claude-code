import { describe, expect, it } from 'vitest'
import type { TodoEntry } from '../feed/types'
import { pickVisible } from './TaskListPanel'

const entry = (id: string, state: TodoEntry['state']): TodoEntry => ({ id, text: id, state })

describe('pickVisible', () => {
  it('до 5 задач показывает всё, скрытых нет', () => {
    const todos = [entry('1', 'done'), entry('2', 'active'), entry('3', 'todo')]

    expect(pickVisible(todos)).toEqual({ visible: todos, hidden: [] })
  })

  it('при переполнении невыполненные в приоритете, выполненные схлопываются первыми', () => {
    const todos = [
      entry('1', 'done'),
      entry('2', 'done'),
      entry('3', 'active'),
      entry('4', 'todo'),
      entry('5', 'todo'),
      entry('6', 'todo'),
      entry('7', 'todo'),
    ]

    const { visible, hidden } = pickVisible(todos)

    expect(visible.map((t) => t.id)).toEqual(['3', '4', '5', '6', '7'])
    expect(hidden.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('если невыполненных меньше лимита, слоты добираются выполненными', () => {
    const todos = [
      entry('1', 'done'),
      entry('2', 'done'),
      entry('3', 'done'),
      entry('4', 'active'),
      entry('5', 'todo'),
      entry('6', 'done'),
    ]

    const { visible, hidden } = pickVisible(todos)

    // Исходный порядок сохраняется: видимые — те же id, что и в списке, без невыполненных id 6 нет.
    expect(visible.map((t) => t.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(hidden.map((t) => t.id)).toEqual(['6'])
  })
})
