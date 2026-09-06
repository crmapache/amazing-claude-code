import { formatTokens } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
import type { WorkflowAgent, WorkflowView } from '../../feed/workflow'
import { useOpenAgent } from '../../hooks/useOpenAgent'
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
 * dragged narrow. What one agent actually said is one press away, in a window over the output area (see
 * WorkflowAgentView).
 */
export const WorkflowRun = ({
  run,
  id,
  live,
}: {
  run: WorkflowView
  /** The card this fleet belongs to - what an opened agent is named by (see OpenedAgent). */
  id: string
  /**
   * Whether the run is still going. Its report says nothing about this - it is the last one the CLI
   * sent, and a process taken down sends no farewell - so a fleet that died with its process went on
   * reading "2 running", with two blue dots and two clocks counting up against a CLI that was gone. That
   * is the whole complaint this flag answers: what the report calls running is only running while the
   * task holding it is (see AgentLine).
   */
  live: boolean
}) => {
  const t = useT()

  return (
    <div className={s.workflow}>
      <div className={s.workflowHead}>
        {t.feed.workflow.agents(run.total)}
        <span className={s.workflowCounts}>
          {live && run.running > 0 ? (
            <span className={s.workflowRunning}>{t.feed.workflow.running(run.running)}</span>
          ) : null}
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
            <AgentLine key={agent.index} agent={agent} card={id} live={live} />
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

/**
 * One agent of the fleet: a line to compare with its neighbours, and a press away - everything it said.
 *
 * The press opens a window over the output area rather than unfolding the line (see WorkflowAgentView).
 * What an agent returns is a page, and a page read under its own line pushed the other thirty-nine off
 * the screen - the one thing on this card that says what the fleet is doing.
 */
const AgentLine = ({ agent, card, live }: { agent: WorkflowAgent; card: string; live: boolean }) => {
  const t = useT()
  const now = useNow()
  const openAgent = useOpenAgent()

  // Neither running nor queued once the run is over: whatever it was doing went with the process, and
  // the report - the last one sent before that - is the only thing that still believes otherwise.
  const dropped = !live && (agent.state === 'running' || agent.state === 'queued')

  // Nothing to open for an agent still in the queue: it has neither errand nor answer yet, and a window
  // onto emptiness is worse than a line that does not open.
  const hasBody = Boolean(agent.prompt || agent.result || agent.agentId)

  return (
    <button
      type="button"
      className={s.workflowAgent}
      data-state={dropped ? 'dropped' : agent.state}
      onClick={() => openAgent?.(card, agent.index)}
      disabled={!hasBody || !openAgent}
    >
      <span className={s.workflowDot} aria-hidden="true" />
      <span className={s.workflowLabel}>{agent.label}</span>
      <span className={s.workflowMeta}>{agentFacts(agent, t, now, { dropped, error: true })}</span>
    </button>
  )
}

/**
 * The right-hand side of a line: how long, how much, and anything unusual about this particular agent.
 *
 * Written as facts with a separator rather than as a sentence: nine of these stand one under another, and
 * what the eye does with them is compare them down the column. Exported because the window that opens
 * over the line covers it, and the same facts are the head of that window (see WorkflowAgentView) - two
 * spellings of "18s · 42.1k · 11 tools" would drift apart on the first change to either.
 */
export const agentFacts = (
  agent: WorkflowAgent,
  t: ReturnType<typeof useT>,
  now: () => number,
  options: {
    /** The run ended under an agent the report still calls running - see AgentLine. */
    dropped: boolean
    /**
     * Whether why it failed belongs here.
     *
     * On the line it does: the run goes on without that agent, and nothing else on screen would say what
     * happened to it. In the window it does not - the reason stands in the body, in full and in red, and
     * a message repeated in the head of the same window is a message read twice and understood once.
     */
    error: boolean
  },
): string => {
  const { dropped, error } = options
  const parts: string[] = []

  if (agent.attempt !== undefined) parts.push(t.feed.workflow.attempt(agent.attempt))
  if (agent.cached === true) parts.push(t.feed.workflow.cached)

  // A finished agent knows how long it took; a running one is counted against the clock the feed is
  // measured by - the phone's own would be a different clock (see useNow). A dropped one is counted
  // against nothing at all: the count would run for as long as the tab stays open, which is exactly the
  // dead clock this whole flag exists to stop.
  if (agent.durationMs !== undefined) parts.push(formatDuration(agent.durationMs))
  else if (agent.startedAt !== undefined && !dropped) {
    parts.push(formatDuration(Math.max(0, now() - agent.startedAt)))
  }

  if (agent.tokens !== undefined && agent.tokens > 0) parts.push(formatTokens(agent.tokens))
  if (agent.toolCalls !== undefined && agent.toolCalls > 0) parts.push(t.feed.tool.count(agent.toolCalls))
  if (dropped) parts.push(t.feed.workflow.dropped)
  else if (agent.state === 'queued') parts.push(t.feed.workflow.queued)
  if (agent.state === 'skipped') parts.push(t.feed.workflow.skipped)
  // The reason a single agent failed is the one thing here worth a whole phrase - see [options.error].
  if (agent.error && error) parts.push(agent.error)

  return parts.join(' · ')
}
