import { describe, expect, it } from 'vitest'
import type { TodoEntry } from '../feed/types'
import { pickCurrent, pickVisible } from './TaskListPanel'

const entry = (id: string, state: TodoEntry['state']): TodoEntry => ({ id, text: id, state })

describe('pickVisible', () => {
  it('shows everything up to 5 tasks, with none hidden', () => {
    const todos = [entry('1', 'done'), entry('2', 'active'), entry('3', 'todo')]

    expect(pickVisible(todos)).toEqual({ visible: todos, hidden: [] })
  })

  it('gives the unfinished ones priority on overflow, collapsing the finished ones first', () => {
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

  it('fills the remaining slots with finished ones when there are fewer unfinished than the limit', () => {
    const todos = [
      entry('1', 'done'),
      entry('2', 'done'),
      entry('3', 'done'),
      entry('4', 'active'),
      entry('5', 'todo'),
      entry('6', 'done'),
    ]

    const { visible, hidden } = pickVisible(todos)

    // The original order is kept: the visible ones are the same ids as in the list, without the unfinished id 6.
    expect(visible.map((t) => t.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(hidden.map((t) => t.id)).toEqual(['6'])
  })
})

describe('pickCurrent', () => {
  it('makes the running task the current one and sends the rest into rest', () => {
    const todos = [entry('1', 'done'), entry('2', 'active'), entry('3', 'todo')]

    const { current, rest } = pickCurrent(todos)

    expect(current?.id).toBe('2')
    expect(rest.map((t) => t.id)).toEqual(['1', '3'])
  })

  it('makes the first not-yet-started one current when none is running', () => {
    const todos = [entry('1', 'done'), entry('2', 'done'), entry('3', 'todo'), entry('4', 'todo')]

    const { current, rest } = pickCurrent(todos)

    expect(current?.id).toBe('3')
    expect(rest.map((t) => t.id)).toEqual(['1', '2', '4'])
  })

  it('makes a single task the current one with an empty rest', () => {
    const todos = [entry('1', 'todo')]

    expect(pickCurrent(todos)).toEqual({ current: todos[0], rest: [] })
  })

  it('leaves no current one when all are finished and keeps everything in rest as it is', () => {
    const todos = [entry('1', 'done'), entry('2', 'done')]

    expect(pickCurrent(todos)).toEqual({ current: undefined, rest: todos })
  })
})
