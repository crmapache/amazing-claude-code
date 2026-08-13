import { useEffect, useState } from 'react'
import type { ComposerLayout } from '../composerLayout'
import type { TodoEntry, TodoItem } from '../feed/types'
import s from './composer.module.css'
import { BranchChip } from './StatusBar'

interface TaskListPanelProps {
  /** Последний присланный агентом список задач — или ничего, если его ещё не было. */
  item: TodoItem | undefined
  /**
   * Та же раскладка, что и у всей панели (см. App.tsx) — здесь важно только
   * compact: экономит высоту, вместо развёрнутой карточки — одна строка с
   * текущей задачей, а остальные сворачиваются под стрелку (см. ниже).
   */
  layout: ComposerLayout
  /**
   * Только для compact: своей строки статуса там нет (см. App.tsx), ветка и
   * её PR переезжают в тот же ряд, что и задачи, — а при их отсутствии эта
   * строка остаётся единственным местом, откуда ветку вообще видно.
   */
  gitBranch?: string
  pullRequest?: string
  onOpenPullRequest?: () => void
}

const VISIBLE_LIMIT = 5

/**
 * Закреплённая read-only панель над полем ввода — по образцу Queue/Quotes.
 * В отличие от прежней карточки в ленте, ничего не листается: пользователь
 * ничего не отмечает сам, это чистое зеркало состояния, которое прислал агент.
 */
export const TaskListPanel = ({ item, layout, gitBranch, pullRequest, onOpenPullRequest }: TaskListPanelProps) => {
  const compact = layout === 'compact'
  const [expanded, setExpanded] = useState(false)

  // Один инстанс панели переживает переключение раскладки (App.tsx меняет
  // только проп compact, без key/ремонта) — без сброса разворот списка из
  // одной раскладки протекал бы в другую, где пользователь его не открывал.
  useEffect(() => {
    setExpanded(false)
  }, [compact])

  const todos = item?.todos ?? []
  const done = todos.filter((todo) => todo.state === 'done').length
  const hasOpenTasks = todos.length > 0 && done < todos.length

  if (compact) {
    // Ни одной незавершённой задачи — обычно эта панель вовсе не рисуется
    // (см. ниже), но ветка не должна пропадать вместе с ней: тут единственное
    // место, где она видна в compact (своей строки статуса у него нет).
    if (!hasOpenTasks) {
      if (!gitBranch) return null
      return (
        <div className={`${s.taskCompactRow} ${s.taskCompactBleed}`}>
          {/* Спейсер держит чип у правого края и здесь — как в ряду с
              открытыми задачами ниже, — иначе чип прыгает между краями по
              мере появления и завершения задач в рамках одной сессии. */}
          <div className={s.spacer} />
          <BranchChip gitBranch={gitBranch} pullRequest={pullRequest} onOpenPullRequest={onOpenPullRequest} />
        </div>
      )
    }

    const { current, rest } = pickCurrent(todos)
    const canExpand = rest.length > 0

    return (
      <>
        {expanded && canExpand ? (
          <div className={`${s.taskCompactExpanded} ${s.taskCompactBleed}`}>
            {rest.map((todo) => (
              <div key={todo.id} className={s.taskCompactExpandedRow}>
                <TodoCheckbox todo={todo} />
                <span className={s.taskPanelTextGroup}>
                  <TodoLabel todo={todo} />
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className={`${s.taskCompactRow} ${s.taskCompactBleed}`}>
          <span className={s.taskPanelLabel}>TASKS</span>
          <span className={s.taskPanelProgress}>
            {done}/{todos.length}
          </span>

          {current ? (
            <>
              <TodoCheckbox todo={current} />
              <span className={s.taskCompactCurrentText}>
                <TodoLabel todo={current} />
              </span>
            </>
          ) : null}

          <div className={s.spacer} />

          <BranchChip gitBranch={gitBranch} pullRequest={pullRequest} onOpenPullRequest={onOpenPullRequest} />

          {canExpand ? (
            <button
              type="button"
              className={s.taskCompactArrow}
              aria-label={expanded ? 'Collapse the task list' : 'Show the rest of the task list'}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? '▼' : '▲'}
            </button>
          ) : null}
        </div>
      </>
    )
  }

  if (!hasOpenTasks) return null

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
            <TodoCheckbox todo={todo} />
            {/* Текст и подпись RUNNING — своей группой: чекбокс остаётся по центру
                строки, а разнокегельный текст выравнивается по базовой линии. */}
            <span className={s.taskPanelTextGroup}>
              <TodoLabel todo={todo} />
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

/**
 * Задача, которую compact держит в самой строке (см. TaskListPanel):
 * бегущая, а если такой сейчас нет — первая ещё не начатая. Остальные уходят
 * в список, что раскрывает стрелка.
 */
export const pickCurrent = (todos: TodoEntry[]): { current: TodoEntry | undefined; rest: TodoEntry[] } => {
  const current = todos.find((todo) => todo.state === 'active') ?? todos.find((todo) => todo.state !== 'done')
  return { current, rest: current ? todos.filter((todo) => todo.id !== current.id) : todos }
}

const TodoCheckbox = ({ todo }: { todo: TodoEntry }) => (
  <span
    className={`${s.taskPanelBox} ${todo.state === 'done' ? s.taskPanelBoxDone : ''} ${
      todo.state === 'active' ? s.taskPanelBoxActive : ''
    }`}
  >
    {todo.state === 'done' ? '✓' : ''}
  </span>
)

const TodoLabel = ({ todo }: { todo: TodoEntry }) => (
  <>
    <span
      className={`${s.taskPanelText} ${todo.state === 'done' ? s.taskPanelTextDone : ''} ${
        todo.state === 'active' ? s.taskPanelTextActive : ''
      }`}
    >
      {todo.text}
    </span>
    {todo.state === 'active' ? <span className={s.taskPanelRunning}>RUNNING</span> : null}
  </>
)

