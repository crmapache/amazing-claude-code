import type { WorkflowProgress } from '../protocol'

/**
 * The inside of a running workflow, read out of the CLI's report - see `workflow_progress` in
 * protocol.ts.
 *
 * A workflow is one tool call with a fleet of agents behind it, and those agents are invisible by every
 * ordinary route: not one of their events reaches the panel's stream, so there are no chips to show and
 * no logs to follow. Everything the panel can say about them it says from here - which is why this is a
 * plain function over the report rather than anything that accumulates: the CLI keeps the list in the
 * task and hands over the whole of it every time, already merged.
 *
 * Nothing here is put into words. The card picks those at drawing time, in the language of the moment
 * (see the rule about the reducer in CLAUDE.md).
 */

export type WorkflowAgentState = 'queued' | 'running' | 'done' | 'failed' | 'skipped'

export interface WorkflowAgent {
  /** Its number in the run - the key the CLI merges the report by, and a stable one for React. */
  index: number
  label: string
  state: WorkflowAgentState
  model?: string
  /** Milliseconds it took, once it is over. */
  durationMs?: number
  /** When it began, for one that is still going - the card counts from it against the clock. */
  startedAt?: number
  tokens?: number
  toolCalls?: number
  /** Set only past the first: a retried agent is worth seeing as retried. */
  attempt?: number
  /** A resumed run handed this one back from the journal instead of running it again. */
  cached?: boolean
  error?: string
}

export interface WorkflowPhase {
  /** Undefined for agents spawned outside any phase() - they gather under a nameless one at the end. */
  index?: number
  title?: string
  agents: WorkflowAgent[]
}

export interface WorkflowView {
  phases: WorkflowPhase[]
  /** The script's own log() lines, oldest first. */
  log: string[]
  running: number
  done: number
  failed: number
  total: number
}

/**
 * 'start' means both "queued" and "running", and the two are told apart by the moment the agent actually
 * began: a fleet of forty against a ceiling of sixteen stands mostly in the queue, and a queue drawn as
 * work is a workflow that looks four times busier than it is.
 */
const stateOf = (entry: Extract<WorkflowProgress, { type: 'workflow_agent' }>): WorkflowAgentState => {
  if (entry.state === 'done') return 'done'
  if (entry.state === 'error') return entry.skipped === true ? 'skipped' : 'failed'
  return entry.startedAt === undefined ? 'queued' : 'running'
}

/** The report as the card needs it - or nothing at all, when there is no report to read. */
export const workflowView = (entries: WorkflowProgress[] | undefined): WorkflowView | undefined => {
  if (!entries || entries.length === 0) return undefined

  const titles = new Map<number, string>()
  const log: string[] = []
  const agents: Array<WorkflowAgent & { phaseIndex?: number }> = []

  for (const entry of entries) {
    if (entry.type === 'workflow_phase') {
      if (entry.title) titles.set(entry.index, entry.title)
      continue
    }

    if (entry.type === 'workflow_log') {
      if (entry.message) log.push(entry.message)
      continue
    }

    if (entry.type !== 'workflow_agent') continue

    agents.push({
      index: entry.index,
      // A prompt of one's own is the last resort: an agent with neither is still worth a line, and the
      // number is what the workflows screen calls it by anyway.
      label: entry.label || entry.promptPreview || `#${entry.index}`,
      state: stateOf(entry),
      phaseIndex: entry.phaseIndex,
      ...(entry.model ? { model: entry.model } : {}),
      ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
      ...(entry.startedAt !== undefined ? { startedAt: entry.startedAt } : {}),
      ...(entry.tokens !== undefined ? { tokens: entry.tokens } : {}),
      ...(entry.toolCalls !== undefined ? { toolCalls: entry.toolCalls } : {}),
      ...(entry.attempt !== undefined && entry.attempt > 1 ? { attempt: entry.attempt } : {}),
      ...(entry.cached === true ? { cached: true } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    })
  }

  if (agents.length === 0 && log.length === 0 && titles.size === 0) return undefined

  return {
    phases: intoPhases(agents, titles),
    log,
    running: agents.filter((agent) => agent.state === 'running').length,
    done: agents.filter((agent) => agent.state === 'done').length,
    failed: agents.filter((agent) => agent.state === 'failed').length,
    total: agents.length,
  }
}

/**
 * The agents laid out under their phases, in the order the phases were announced - which is the order
 * the script runs them in, and the order the eye expects to read them in.
 *
 * A phase nobody has reached yet is not drawn: an empty heading promises work that may never be reached
 * at all - a script decides its own phases as it goes.
 */
const intoPhases = (
  agents: Array<WorkflowAgent & { phaseIndex?: number }>,
  titles: Map<number, string>,
): WorkflowPhase[] => {
  const phases: WorkflowPhase[] = []
  const byIndex = new Map<number | undefined, WorkflowPhase>()

  for (const agent of agents) {
    const { phaseIndex, ...line } = agent
    let phase = byIndex.get(phaseIndex)

    if (!phase) {
      phase = {
        ...(phaseIndex !== undefined ? { index: phaseIndex } : {}),
        ...(phaseIndex !== undefined && titles.has(phaseIndex) ? { title: titles.get(phaseIndex) } : {}),
        agents: [],
      }
      byIndex.set(phaseIndex, phase)
      phases.push(phase)
    }

    phase.agents.push(line)
  }

  return phases
}
