import type { TaskItem } from '../../feed/types'
import { useT } from '../../i18n'
import { AgentLog } from '../AgentStreamView'
import s from '../feed.module.css'
import { Caret } from './Caret'

interface TaskCardProps {
  item: TaskItem
  open: boolean
  onToggle: () => void
}

/**
 * A subagent's launch as a row of the conversation - what it was, what it was sent to do, how long it
 * took and how it ended.
 *
 * The chip in the header is not this: it is the way to watch an agent while it works, and it goes as soon
 * as the agent is done and the reading moves elsewhere (see hiddenTaskIds in App). Before this card the
 * panel kept nothing after that - a turn that had spawned five agents read afterwards as though the
 * model had answered out of thin air, and neither the errand nor the answer was anywhere to be found.
 * That is the complaint this exists for.
 *
 * Opened, it shows the errand in full and then the agent's own log with its report at the end - the same
 * lines the chip's screen shows, drawn by the same component.
 */
export const TaskCard = ({ item, open, onToggle }: TaskCardProps) => {
  const t = useT()
  const hasBody = Boolean(item.prompt) || item.log.length > 0 || Boolean(item.workflow)
  // A workflow is a fleet rather than an agent, and its own report is what the card is drawn from: the
  // chip in the header counts it the same way (see the workflow section of CLAUDE.md). The name is asked
  // for as well as the report, because the report only arrives with the first progress event - until then
  // the card would call a workflow an agent.
  const chip = item.workflow || item.target === 'workflow' ? 'WORKFLOW' : 'AGENT'

  return (
    <div className={s.tool}>
      <button type="button" className={s.toolHead} onClick={onToggle} disabled={!hasBody}>
        {hasBody ? <Caret open={open} /> : null}
        <span className={`${s.toolChip} ${s.chipAgent}`}>{chip}</span>
        <span className={`${s.toolTarget} ${item.outcome === 'failed' ? s.toolError : ''}`}>
          {item.target}
        </span>
        {/* The errand stays on the head while the agent works, unlike a tool call, whose meta is the
            outcome and has nothing to say until there is one. What the agent was sent to do is the
            answer to "what is this chip busy with" - replacing it with the word "running" cost the one
            thing worth reading in a row of several agents. That it runs is said by the ticking duration
            beside it (see .toolDur.running). */}
        <span className={s.toolMeta}>{item.meta}</span>
        <div className={s.spacer} />
        <span className={`${s.toolDur} ${item.pending ? s.running : ''}`}>
          {item.pending ? item.duration || t.feed.tool.running : item.duration}
        </span>
      </button>

      {open && hasBody ? (
        <div className={s.toolBody}>
          {item.prompt ? (
            <>
              <div className={s.taskPromptLabel}>{t.feed.task.errand}</div>
              {/* The errand as it was written, line breaks and all: a prompt is a document rather than a
                  sentence, and reflowed into one paragraph it stops being readable at all. */}
              <div className={s.taskPrompt}>{item.prompt}</div>
            </>
          ) : null}

          {item.log.length > 0 || item.workflow ? (
            <div className={s.taskLog}>
              <AgentLog item={item} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
