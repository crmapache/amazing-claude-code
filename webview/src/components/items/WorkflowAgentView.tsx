import { useEffect } from 'react'
import type { WorkflowAgent } from '../../feed/workflow'
import { useAgentTranscripts } from '../../hooks/useAgentTranscript'
import { useNow } from '../../hooks/useNow'
import { useT } from '../../i18n'
import s from '../feed.module.css'
import { agentFacts } from './WorkflowRun'

interface WorkflowAgentViewProps {
  agent: WorkflowAgent
  /** Whether the run is still going - the same fact the fleet's lines are drawn by (see WorkflowRun). */
  live: boolean
  onClose: () => void
}

/**
 * What one agent of a fleet did, over the output area.
 *
 * A window rather than a fold inside the line, and the difference is the reading. What an agent returns
 * is a page: forty findings as JSON, a report, a diff of its own. Unfolded under its line it was read in
 * a column indented twice over, pushing the conversation off the screen - and the fleet above it, the one
 * thing that says what the other thirty-nine are doing, went with it. Over the output area the same text
 * has the whole width of the panel, the feed stays exactly where it was, and the way out is a cross
 * rather than finding the line again.
 *
 * The agent is handed in whole and re-read on every repaint by whoever owns the window (see OpenedAgent):
 * a run reports as it goes, and an agent that finishes while its window is open has to show its answer
 * without being reopened.
 */
export const WorkflowAgentView = ({ agent, live, onClose }: WorkflowAgentViewProps) => {
  const t = useT()
  const now = useNow()
  const transcripts = useAgentTranscripts()
  const transcript = agent.agentId ? transcripts?.of(agent.agentId) : undefined

  // The transcript wins over the report wherever it has anything: the report's copy is cut to 400
  // characters, which for an agent with a schema is the opening brace of its JSON and nothing else.
  const prompt = transcript?.prompt || agent.prompt
  const output = transcript?.output || agent.result
  const steps = transcript?.steps ?? []

  const { agentId, state } = agent
  useEffect(() => {
    if (!agentId || !transcripts) return
    // The state travels with the request and the answer remembers it: a transcript read while the agent
    // was running holds no answer, so a finished one is worth reading again - once (see AgentTranscript).
    transcripts.request(agentId, state)
  }, [agentId, state, transcripts])

  /*
   * Escape closes it, in the capture phase and ahead of the panel's own handler - which would stop the
   * turn instead, exactly as the search window and the confirm dialog guard against (see Search.tsx).
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <>
      {/* Clicking beside the window closes it, like the menus - and the shade says the feed is still
          there rather than replaced. */}
      <div className={s.agentScrim} onClick={onClose} />
      <div className={s.agentWindow} role="dialog" aria-label={agent.label}>
        <div className={s.agentWindowHead}>
          <span className={s.agentWindowDot} data-state={dotOf(agent, live)} aria-hidden="true" />
          <span className={s.agentWindowLabel}>{agent.label}</span>
          {/* The very facts the line carried, because the window stands over that line: how long it took,
              what it cost, and anything unusual about it (see agentFacts). */}
          <span className={s.agentWindowFacts}>
            {agentFacts(agent, t, now, { dropped: dotOf(agent, live) === 'dropped', error: false })}
          </span>
          <div className={s.spacer} />
          {/* The model is worth a word here and nowhere else: on the line it would be one fact too many
              in a column of forty, and in the window it answers "who was this run by". */}
          {agent.model ? <span className={s.agentWindowModel}>{agent.model}</span> : null}
          <button type="button" className={s.agentWindowClose} onClick={onClose} aria-label={t.common.close}>
            ×
          </button>
        </div>

        <div className={s.agentWindowBody}>
          {agent.error ? <div className={s.agentWindowError}>{agent.error}</div> : null}

          {prompt ? (
            <>
              <div className={s.taskPromptLabel}>{t.feed.task.errand}</div>
              {/* Line breaks and all, like a subagent's errand in its own card: a prompt is a document
                  rather than a sentence, and reflowed into a paragraph it stops being readable. */}
              <div className={s.agentWindowText}>{prompt}</div>
            </>
          ) : null}

          {steps.length > 0 ? (
            <>
              <div className={s.taskPromptLabel}>{t.feed.workflow.steps}</div>
              <div className={s.agentWindowSteps}>
                {steps.map((step, index) => (
                  <div key={index} className={s.agentWindowStep}>
                    {step}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {output ? (
            <>
              <div className={s.taskPromptLabel}>{t.feed.workflow.returned}</div>
              <div className={s.agentWindowText}>{output}</div>
            </>
          ) : null}

          {/* Said only when it changes what is above: a body standing on the report's previews looks
              whole, and comparing two agents by the first 400 characters of their answers is comparing
              their JSON braces. */}
          {transcript?.truncated === true ? <div className={s.workflowNote}>{t.feed.workflow.cut}</div> : null}
          {transcript?.state === 'missing' ? (
            <div className={s.workflowNote}>{t.feed.workflow.noTranscript}</div>
          ) : null}
          {transcript?.state === 'loading' && !output ? (
            <div className={s.workflowNote}>{t.feed.workflow.reading}</div>
          ) : null}
        </div>
      </div>
    </>
  )
}

/** The same dot the fleet's line carries, so the window is recognisably about that line. */
const dotOf = (agent: WorkflowAgent, live: boolean): string =>
  !live && (agent.state === 'running' || agent.state === 'queued') ? 'dropped' : agent.state
