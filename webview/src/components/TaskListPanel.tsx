import { useEffect, useState } from 'react'
import { isSideComposerLayout, type ComposerLayout } from '../composerLayout'
import type { TodoEntry, TodoItem } from '../feed/types'
import { Chevron } from './Chevron'
import s from './composer.module.css'
import { useT } from '../i18n'

interface TaskListPanelProps {
  /** The last task list the agent sent - or nothing, when there has not been one yet. */
  item: TodoItem | undefined
  /**
   * The same layout as the whole panel's (see App.tsx) - what matters here is whether it is a tight one
   * (compact and left/right, see isSideComposerLayout): that saves height, and instead of an expanded
   * card there is one line with the current task while the rest fold under an arrow (see below).
   */
  layout: ComposerLayout
}

const VISIBLE_LIMIT = 5

/**
 * A pinned read-only panel above the input field - after the pattern of Queue/Quotes. Unlike the former
 * card in the feed, nothing is scrolled here: the user ticks nothing themselves, this is a pure mirror of
 * the state the agent sent.
 */
export const TaskListPanel = ({ item, layout }: TaskListPanelProps) => {
  const t = useT()
  const compact = layout === 'compact' || isSideComposerLayout(layout)
  const [expanded, setExpanded] = useState(false)

  // One instance of the panel outlives a layout change (App.tsx changes only the compact prop, with no
  // key and no remount) - without a reset, a list expanded in one layout would leak into another, where
  // the user never opened it.
  useEffect(() => {
    setExpanded(false)
  }, [compact])

  const todos = item?.todos ?? []
  const done = todos.filter((todo) => todo.state === 'done').length
  const hasOpenTasks = todos.length > 0 && done < todos.length

  if (compact) {
    if (!hasOpenTasks) return null

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
          <span className={s.taskPanelLabel}>{t.chrome.tasks.label}</span>
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

          {canExpand ? (
            <button
              type="button"
              className={s.taskCompactArrow}
              aria-label={expanded ? t.chrome.tasks.collapse : t.chrome.tasks.expand}
              onClick={() => setExpanded((current) => !current)}
            >
              <Chevron className={`${s.taskCompactCaret} ${expanded ? '' : s.taskCompactCaretUp}`} />
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
        <span className={s.taskPanelLabel}>{t.chrome.tasks.listLabel}</span>
        <div className={s.spacer} />
        <span className={s.taskPanelProgress}>
          {t.chrome.tasks.progress(done, todos.length)}
        </span>
      </div>

      <div className={`${s.taskPanelList} ${expanded && overflowing ? s.taskPanelListScroll : ''}`}>
        {visible.map((todo) => (
          <div key={todo.id} className={s.taskPanelRow}>
            <TodoCheckbox todo={todo} />
            {/* The text and the RUNNING caption go in a group of their own: the checkbox stays centred in
                the row, while text of different sizes lines up on the baseline. */}
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

/** Unfinished ones take priority, finished ones fold away first. The order among the visible ones does not change. */
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
 * The task compact keeps in the row itself (see TaskListPanel): the one running, or - when there is none
 * right now - the first one not yet started. The rest go into the list the arrow expands.
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

