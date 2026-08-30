import { formatTokens } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
import type { WorkflowAgent, WorkflowView } from '../../feed/workflow'
import { useNow } from '../../hooks/useNow'
import { useT } from '../../i18n'
import s from '../feed.module.css'

/**
 * What is going on inside a workflow: its phases, and in them the agents, one line each.
 *
 * A workflow is a fleet - ten, forty agents at once - and by every ordinary route it is invisible: their
 * events never reach the panel's stream, so there are no chips to switch between and no logs to follow.
 * All the panel is given is the run's report (see feed/workflow.ts), and this draws it. Without it a
 * workflow is one tool call that falls silent for ten minutes while forty agents work behind it - which
 * is exactly how it looked before.
 *
 * A line rather than a card apiece on purpose: what one wants from nine agents is to see the nine of them
 * at once - which is running, which has finished, what it cost - and nine cards do not fit a panel
 * dragged narrow.
 */
export const WorkflowRun = ({ run }: { run: WorkflowView }) => {
  const t = useT()

  return (
    <div className={s.workflow}>
      <div className={s.workflowHead}>
        {t.feed.workflow.agents(run.total)}
        <span className={s.workflowCounts}>
          {run.running > 0 ? <span className={s.workflowRunning}>{t.feed.workflow.running(run.running)}</span> : null}
          {run.done > 0 ? <span>{t.feed.workflow.done(run.done)}</span> : null}
          {run.failed > 0 ? <span className={s.workflowFailed}>{t.feed.workflow.failed(run.failed)}</span> : null}
        </span>
      </div>

      {run.phases.map((phase, index) => (
        <div key={phase.index ?? `loose-${index}`} className={s.workflowPhase}>
          {/* A phase with no name is where agents spawned outside phase() gather - there is nothing to
              write over them, and a heading invented here would name something the script never named. */}
          {phase.title ? <div className={s.workflowPhaseTitle}>{phase.title}</div> : null}
          {phase.agents.map((agent) => (
            <AgentLine key={agent.index} agent={agent} />
          ))}
        </div>
      ))}

      {/* What the script itself printed with log(). It stands under the agents because it narrates them:
          "12 of 40 found" means nothing until one can see the forty. */}
      {run.log.map((line, index) => (
        <div key={index} className={s.workflowLog}>
          {line}
        </div>
      ))}
    </div>
  )
}

const AgentLine = ({ agent }: { agent: WorkflowAgent }) => {
  const t = useT()
  const now = useNow()

  return (
    <div className={s.workflowAgent} data-state={agent.state}>
      <span className={s.workflowDot} aria-hidden="true" />
      <span className={s.workflowLabel}>{agent.label}</span>
      <span className={s.workflowMeta}>{metaOf(agent, t, now)}</span>
    </div>
  )
}

/**
 * The right-hand side of a line: how long, how much, and anything unusual about this particular agent.
 *
 * Written as facts with a separator rather than as a sentence: nine of these stand one under another, and
 * what the eye does with them is compare them down the column.
 */
const metaOf = (agent: WorkflowAgent, t: ReturnType<typeof useT>, now: () => number): string => {
  const parts: string[] = []

  if (agent.attempt !== undefined) parts.push(t.feed.workflow.attempt(agent.attempt))
  if (agent.cached === true) parts.push(t.feed.workflow.cached)

  // A finished agent knows how long it took; a running one is counted against the clock the feed is
  // measured by - the phone's own would be a different clock (see useNow).
  if (agent.durationMs !== undefined) parts.push(formatDuration(agent.durationMs))
  else if (agent.startedAt !== undefined) parts.push(formatDuration(Math.max(0, now() - agent.startedAt)))

  if (agent.tokens !== undefined && agent.tokens > 0) parts.push(formatTokens(agent.tokens))
  if (agent.toolCalls !== undefined && agent.toolCalls > 0) parts.push(t.feed.tool.count(agent.toolCalls))
  if (agent.state === 'queued') parts.push(t.feed.workflow.queued)
  if (agent.state === 'skipped') parts.push(t.feed.workflow.skipped)
  // The reason a single agent failed is the one thing here worth a whole phrase: the run goes on without
  // it, and nothing else on screen will say what happened to it.
  if (agent.error) parts.push(agent.error)

  return parts.join(' · ')
}
