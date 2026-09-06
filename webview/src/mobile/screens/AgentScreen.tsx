import { AgentStreamView } from '../../components/AgentStreamView'
import type { TaskItem } from '../../feed/types'
import { Back } from './Back'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

interface AgentScreenProps {
  /** Absent when the agent has gone from the feed under this screen - see the note below. */
  task: TaskItem | undefined
  onStop: () => void
  onBack: () => void
}

/**
 * One subagent, on a screen of its own: what it was told to do, what it has done, and what it answered.
 *
 * At the desk this is a strip of chips and a pane that swaps under them - the feed stays on screen, and
 * an agent is glanced at without leaving the conversation. A phone has no width for the two side by
 * side, and the strip there would be a row of chips too small to hit; so an agent gets a screen, and the
 * back arrow is the way out that a chip's second press is at the desk.
 *
 * The stream itself is the panel's own component, for the reason the feed is: an agent's log that reads
 * differently on the two screens is worse than one that is only on one of them.
 */
export const AgentScreen = ({ task, onStop, onBack }: AgentScreenProps) => {
  const t = useT()

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.agentHeadName}>
              <span className={`${m.dot} ${task?.pending ? m.dotAgentLive : m.dotDone}`} />
              {task?.target || t.mobile.tasks.agent}
            </span>
            <span className={m.threadWhere}>
              {task ? [task.meta, task.duration].filter(Boolean).join(' · ') : ''}
            </span>
          </span>

          {/* Only while there is something to stop. A finished agent's cross would be a button that
              answers a press with nothing, which is the one thing a control must never do. */}
          {task?.pending && task.taskId ? (
            <button type="button" className={m.agentStopWide} onClick={onStop}>
              {t.mobile.composer.stop}
            </button>
          ) : null}
        </div>
      </header>

      <div className={m.thread}>
        {/* The agent is gone from the feed under this screen - the conversation was switched, or its
            journal was reset. Saying so beats a blank screen with a back arrow on it. */}
        {task ? <AgentStreamView item={task} /> : <p className={m.empty}>{t.mobile.tasks.agentGone}</p>}
      </div>
    </>
  )
}
