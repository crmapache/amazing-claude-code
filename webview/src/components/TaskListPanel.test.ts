import { describe, expect, it } from 'vitest'
import type { TodoEntry } from '../feed/types'
import { pickCurrent, pickVisible } from './TaskListPanel'

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

describe('pickCurrent', () => {
  it('текущая — бегущая задача, остальные уходят в rest', () => {
    const todos = [entry('1', 'done'), entry('2', 'active'), entry('3', 'todo')]

    const { current, rest } = pickCurrent(todos)

    expect(current?.id).toBe('2')
    expect(rest.map((t) => t.id)).toEqual(['1', '3'])
  })

  it('бегущей нет — текущая первая ещё не начатая', () => {
    const todos = [entry('1', 'done'), entry('2', 'done'), entry('3', 'todo'), entry('4', 'todo')]

    const { current, rest } = pickCurrent(todos)

    expect(current?.id).toBe('3')
    expect(rest.map((t) => t.id)).toEqual(['1', '2', '4'])
  })

  it('задача одна — она и текущая, rest пуст', () => {
    const todos = [entry('1', 'todo')]

    expect(pickCurrent(todos)).toEqual({ current: todos[0], rest: [] })
  })

  it('все выполнены — текущей нет, rest содержит всё как есть', () => {
    const todos = [entry('1', 'done'), entry('2', 'done')]

    expect(pickCurrent(todos)).toEqual({ current: undefined, rest: todos })
  })
})
