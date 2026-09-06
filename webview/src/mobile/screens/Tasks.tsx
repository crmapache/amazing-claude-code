import { useMemo } from 'react'
import { buildAgentTabs } from '../../feed/streamStatus'
import type { CardState } from '../../hooks/useCardState'
import type { PanelState } from '../../feed/panelState'
import type { FeedItem, TodoItem } from '../../feed/types'
import type { AgentTab } from '../../components/StreamSwitcher'
import { Back } from './Back'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

/** The phone has no "clear finished agents", so every agent the turn ever ran stays on this screen. */
const NO_HIDDEN_TASKS: ReadonlySet<string> = new Set()

interface TasksProps {
  feed: PanelState
  cards: CardState
  title: string
  /** Open one agent's own stream, which is a screen of its own here. */
  onAgent: (taskId: string) => void
  onStopTask: (taskId: string) => void
  onBack: () => void
}

/**
 * What this turn said it would do, who is doing it, and what is running behind it.
 *
 * Three bands on one screen, because they answer one question between them - "what is this conversation
 * actually busy with" - and on a phone that question is asked from somewhere else entirely, which is
 * exactly when nobody can see the panel's own three places to answer it.
 *
 * At the desk they are three separate things: a card pinned over the field, a strip of chips above the
 * feed, and another chip beside it. There is room for that there. Here the field is where a thumb lives
 * and every one of the three would have to fold; folded, all three say a number and nothing else.
 */
export const Tasks = ({ feed, cards, title, onAgent, onStopTask, onBack }: TasksProps) => {
  const t = useT()

  const todo = useMemo(() => latestTodo(feed.items), [feed.items])
  const agents = useMemo(
    () => buildAgentTabs(feed, cards.answeredAsks, NO_HIDDEN_TASKS),
    [feed, cards.answeredAsks],
  )

  const done = todo?.todos.filter((one) => one.state === 'done').length ?? 0
  const nothing = !todo && agents.length === 0 && feed.background.length === 0

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{t.mobile.tasks.title}</span>
            <span className={m.threadWhere}>{title}</span>
          </span>
        </div>
      </header>

      <div className={m.list}>
        {nothing && <p className={m.empty}>{t.mobile.tasks.nothing}</p>}

        {todo && todo.todos.length > 0 && (
          <>
            <div className={m.bandHead}>
              <span className={m.bandTitleInline}>{t.mobile.tasks.label}</span>
              <span className={m.bandCount}>{t.mobile.tasks.doneOf(done, todo.todos.length)}</span>
            </div>

            <div className={m.card}>
              {todo.todos.map((one) => (
                <div
                  key={one.id}
                  className={`${m.todoRow} ${one.state === 'active' ? m.todoRowActive : ''}`}
                >
                  <span className={`${m.todoBox} ${one.state === 'done' ? m.todoBoxDone : ''} ${one.state === 'active' ? m.todoBoxActive : ''}`}>
                    {one.state === 'done' ? '✓' : ''}
                  </span>
                  <span className={`${m.todoText} ${one.state === 'done' ? m.todoTextDone : ''}`}>
                    {one.text}
                  </span>
                  {one.state === 'active' && <span className={m.todoRunning}>{t.mobile.tasks.running}</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {agents.length > 0 && (
          <>
            <p className={m.bandTitle}>{t.mobile.tasks.agents}</p>
            {agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onOpen={() => onAgent(agent.id)}
                onStop={
                  agent.stopId
                    ? () => {
                        if (window.confirm(t.mobile.thread.stopAgent(agent.label))) onStopTask(agent.id)
                      }
                    : undefined
                }
              />
            ))}
          </>
        )}

        {/* Commands the agent left running behind the turn. They are the one thing on this screen a
            person may genuinely want to end from a sofa: a dev server left up on a laptop is a fan that
            runs all evening. */}
        {feed.background.length > 0 && (
          <>
            <p className={m.bandTitle}>{t.mobile.tasks.background}</p>
            {feed.background.map((task) => (
              <div key={task.id} className={m.bgRow}>
                <span className={m.bgChip}>BASH</span>
                <span className={m.bgCommand}>{task.command || task.description}</span>
                <span className={m.bgTime}>{task.duration}</span>
                <button
                  type="button"
                  className={m.bgStop}
                  onClick={() => {
                    if (window.confirm(t.mobile.thread.stopAgent(task.command || task.description))) {
                      onStopTask(task.id)
                    }
                  }}
                >
                  {t.mobile.composer.stop}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}

/** One subagent: what it is doing, for how long, and the way into what it has said. */
const AgentRow = ({
  agent,
  onOpen,
  onStop,
}: {
  agent: AgentTab
  onOpen: () => void
  onStop?: () => void
}) => (
  <div className={`${m.agentRow} ${agent.status === 'running' ? m.agentRowLive : ''}`}>
    <button type="button" className={m.agentMain} onClick={onOpen}>
      <span className={`${m.dot} ${agent.status === 'running' ? m.dotAgentLive : m.dotDone}`} />
      <span className={m.agentText}>
        <span className={m.agentName}>{agent.label}</span>
        <span className={m.agentMeta}>
          {agent.meta}
          {agent.duration ? ` · ${agent.duration}` : ''}
        </span>
      </span>
      <span className={m.taskRowChevron}>›</span>
    </button>

    {onStop && (
      <button type="button" className={m.agentStop} onClick={onStop}>
        ×
      </button>
    )}
  </div>
)

/**
 * The newest task list of this conversation - the panel's own rule (see latestTodo in App.tsx).
 *
 * A list out of a past conversation's replay is not one of them: nothing is happening in a conversation
 * opened for reading, and yesterday's list drawn as work in progress reads as work that has hung.
 */
const latestTodo = (items: FeedItem[]): TodoItem | undefined =>
  [...items].reverse().find((item): item is TodoItem => item.kind === 'todo' && !item.replayed)

