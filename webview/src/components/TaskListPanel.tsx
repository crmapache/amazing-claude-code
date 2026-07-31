import { useState } from 'react'
import type { TodoEntry, TodoItem } from '../feed/types'
import s from './composer.module.css'

interface TaskListPanelProps {
  /** Последний присланный агентом список задач — или ничего, если его ещё не было. */
  item: TodoItem | undefined
}

const VISIBLE_LIMIT = 5

/**
 * Закреплённая read-only панель над полем ввода — по образцу Queue/Quotes.
 * В отличие от прежней карточки в ленте, ничего не листается: пользователь
 * ничего не отмечает сам, это чистое зеркало состояния, которое прислал агент.
 */
export const TaskListPanel = ({ item }: TaskListPanelProps) => {
  const [expanded, setExpanded] = useState(false)

  if (!item || item.todos.length === 0) return null

  const { todos } = item
  const done = todos.filter((todo) => todo.state === 'done').length
  if (done === todos.length) return null

  const overflowing = todos.length > VISIBLE_LIMIT
  const { visible, hidden } = expanded || !overflowing ? { visible: todos, hidden: [] as TodoEntry[] } : pickVisible(todos)
  const hiddenDone = hidden.filter((todo) => todo.state === 'done').length

  return (
    <div className={s.taskPanel}>
      <div className={s.taskPanelHead}>
        <span className={s.taskPanelLabel}>TASK LIST</span>
        <div className={s.spacer} />
        <span className={s.taskPanelProgress}>
          {done} / {todos.length} done
        </span>
      </div>

      <div className={`${s.taskPanelList} ${expanded && overflowing ? s.taskPanelListScroll : ''}`}>
        {visible.map((todo) => (
          <div key={todo.id} className={s.taskPanelRow}>
            <span
              className={`${s.taskPanelBox} ${todo.state === 'done' ? s.taskPanelBoxDone : ''} ${
                todo.state === 'active' ? s.taskPanelBoxActive : ''
              }`}
            >
              {todo.state === 'done' ? '✓' : ''}
            </span>
            {/* Текст и подпись RUNNING — своей группой: чекбокс остаётся по центру
                строки, а разнокегельный текст выравнивается по базовой линии. */}
            <span className={s.taskPanelTextGroup}>
              <span
                className={`${s.taskPanelText} ${todo.state === 'done' ? s.taskPanelTextDone : ''} ${
                  todo.state === 'active' ? s.taskPanelTextActive : ''
                }`}
              >
                {todo.text}
              </span>
              {todo.state === 'active' ? <span className={s.taskPanelRunning}>RUNNING</span> : null}
            </span>
          </div>
        ))}
      </div>

      {overflowing ? (
        <button type="button" className={s.taskPanelMore} onClick={() => setExpanded((current) => !current)}>
          {expanded ? '▴ Show less' : `▾ +${hidden.length} more · ${hiddenDone} done`}
        </button>
      ) : null}
    </div>
  )
}

/** Невыполненные — в приоритете, выполненные схлопываются первыми. Порядок внутри видимых не меняется. */
export const pickVisible = (todos: TodoEntry[]): { visible: TodoEntry[]; hidden: TodoEntry[] } => {
  const notDone = todos.filter((todo) => todo.state !== 'done')
  const done = todos.filter((todo) => todo.state === 'done')
  const shown = new Set([...notDone, ...done].slice(0, VISIBLE_LIMIT).map((todo) => todo.id))

  return {
    visible: todos.filter((todo) => shown.has(todo.id)),
    hidden: todos.filter((todo) => !shown.has(todo.id)),
  }
}
