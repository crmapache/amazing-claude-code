import type { AgentStatus, AgentTab } from '../components/StreamSwitcher'
import type { CardState, PlanDecision } from '../hooks/useCardState'
import type { PanelState } from './panelState'
import { formatDuration } from './tools'
import type { AskItem, FeedItem, PermItem, PlanItem, TaskItem } from './types'

/**
 * Whether the turn stands on this feed item waiting for the person. A permission request, a question with
 * options and a shown plan hold it equally fast, so their rule is one: parting ways, it would lie now
 * through the status line, now through the tab's dot - depending on where which case was forgotten.
 */
export const awaitsYou = (item: FeedItem, cards: CardState): boolean =>
  (item.kind === 'perm' && item.decision === null) ||
  (item.kind === 'ask' && !item.historic && !cards.answeredAsks.includes(item.id)) ||
  (item.kind === 'plan' && !item.historic && cards.planDecisions[item.id] === undefined)

/** The main stream rather than a separate subagent: that one has a tab and a status of its own. */
export const ownStream = (item: FeedItem): boolean => !('taskId' in item) || item.taskId === undefined

/**
 * The one thing the main stream is standing on, or nothing at all.
 *
 * A permission before a plan before a question: a permission holds a call that is happening this second,
 * while a plan and a question hold a turn that is prepared to wait. Within a kind, the most recent - the
 * older ones are answered, replayed, or belong to a conversation that has since restarted.
 *
 * One function rather than the same three lines written wherever it is needed. A phone asks it twice -
 * once for the strip that says something is waiting, once for the screen that shows what - and when
 * those two were written separately the strip went by permissions alone: a question then held the
 * conversation with nothing on screen offering to answer it, since a question is not drawn in the feed
 * either (the panel pins it over the input field instead).
 */
export const awaiting = (items: FeedItem[], cards: CardState): PermItem | PlanItem | AskItem | undefined => {
  const pending = items.filter((item) => ownStream(item) && awaitsYou(item, cards))
  const latest = <T extends FeedItem>(kind: FeedItem['kind']) =>
    [...pending].reverse().find((item): item is T => item.kind === kind)

  return latest<PermItem>('perm') ?? latest<PlanItem>('plan') ?? latest<AskItem>('ask')
}

/**
 * While an unanswered permission request or a question from the MAIN stream hangs there, the turn is not
 * genuinely thinking - it stands and waits for the person's decision. A "Claude is thinking" at that moment
 * would be untrue. A particular agent's decision does not count here: the status in the dropdown and the
 * agent's own tab answer for that - if the main status line reacted to them too, it would itself become the
 * very dishonest caption the whole redesign was undertaken to get away from.
 *
 * The elapsed time is written right here rather than waiting for the turn's outcome: the "Worked Ns" under a
 * finished answer arrives only with its end, and until then how much had already passed was not visible at
 * all. It is counted from turnStartedAt less pausedMs - the total time of every such wait over this turn
 * (see attentionStarted/attentionEnded in feed/build.ts and the effect in App that sends them): otherwise
 * after a decision the idle seconds would be charged to the agent retroactively, as though it had been
 * "thinking" all that time. It is updated once a second by the same tick that moves the tool calls'
 * durations (see tickDurations in feed/build.ts).
 *
 * `now` is a parameter because the two clients do not share a clock. The panel counts against its own
 * Date.now() and everything in the state was written by that same clock, so it passes nothing. The
 * phone's state, though, was built out of moments stamped by the machine with the IDE, and answering
 * against the phone's own clock subtracts one machine's time from another's - see mobile/clock.ts.
 */
export const streamStatus = (panel: PanelState, cards: CardState, now: number = Date.now()): string => {
  /**
   * The request to the model failed and waits for a retry: at that moment the turn is not running at all -
   * no text, no calls, no question - and a "Claude is thinking" with a running counter would be an outright
   * lie. It is precisely because of it that the panel looked hung: the only thing happening was shown
   * nowhere.
   *
   * Before compacting: the request that compacts the context can fail too, and then what has to be told
   * about is the failure rather than the compacting standing still because of it.
   */
  if (panel.retry) {
    // The attempts and the countdown are told about by the card in the feed right above this line (see
    // RetryRow) - here goes only what is not in it: how long all of this has already dragged on. The line's
    // familiar shape is kept - "what is happening - how long it has run" - and exactly what was untrue
    // changes.
    return `${panel.retry.label} · waiting ${formatDuration(now - panel.retry.startedAt)}`
  }

  // The compacting is spoken about by its own card in the feed (a CONTEXT with a growing percentage) -
  // there must be no second caption about the same thing right under it.
  if (panel.compacting) return ''

  const awaitingDecision = panel.items.some((item) => ownStream(item) && awaitsYou(item, cards))
  if (awaitingDecision) return 'Waiting for you'

  /**
   * The main stream's own turn may have ended already (the agent started a background subagent and fell
   * silent at that - which is what the Task tool does outside a skill) while the subagent has not. Without
   * this branch the only trace of anything still happening would be a dot on the subagent's chip, which one
   * first has to notice and then work out what it means.
   */
  if (panel.status !== 'running') {
    const pending = panel.items.filter((item) => item.kind === 'task' && item.pending).length
    if (pending === 0) return ''
    return pending === 1 ? 'Waiting for subagent' : `Waiting for ${pending} subagents`
  }

  /**
   * What exactly is being done right now has already been named by a card in the feed itself (the tool call,
   * its command, its description). Repeating the same thing here a second time in different words is not an
   * account of what is happening but a duplicate of what is visible a line above anyway. While the turn runs
   * and no decision is awaited from the person, there is exactly one honest caption here - the turn is
   * thinking.
   */
  const label = 'Claude is thinking'
  if (!panel.turnStartedAt) return label

  // A decision has just been taken: awaitingDecision is already false, but the effect that carries
  // waitStartedAt into pausedMs has not run yet (it fires after this render) - we count the current pause in
  // right here so that the number does not jump on the next tick.
  const ongoingWait = panel.waitStartedAt ? now - panel.waitStartedAt : 0
  const elapsed = formatDuration(now - panel.turnStartedAt - panel.pausedMs - ongoingWait)
  return `${label} · ${elapsed}`
}

const statusOf = (task: TaskItem, items: FeedItem[], answeredAsks: string[]): AgentStatus => {
  // An agent cut short is not the same as one that ran its course: a killed and a crashed one used to get
  // the same green dot as one that made it to the end.
  if (!task.pending) return task.outcome === 'failed' ? 'failed' : task.outcome === 'stopped' ? 'stopped' : 'done'

  const blocked = items.some(
    (item) =>
      (item.kind === 'perm' && item.taskId === task.id && item.decision === null) ||
      (item.kind === 'ask' && item.taskId === task.id && !item.historic && !answeredAsks.includes(item.id)),
  )
  return blocked ? 'needs-input' : 'running'
}

export const mainStatusOf = (panel: PanelState, answeredAsks: string[]): AgentStatus => {
  const blocked = panel.items.some(
    (item) =>
      (item.kind === 'perm' && item.taskId === undefined && item.decision === null) ||
      (item.kind === 'ask' && item.taskId === undefined && !item.historic && !answeredAsks.includes(item.id)),
  )
  if (blocked) return 'needs-input'
  return panel.status === 'running' ? 'running' : 'idle'
}

/** A batch hidden by clearFinishedAgents disappears from the dropdown - the history itself went nowhere. */
export const buildAgentTabs = (
  panel: PanelState,
  answeredAsks: string[],
  hiddenTaskIds: ReadonlySet<string>,
): AgentTab[] =>
  panel.items
    .filter((item): item is TaskItem => item.kind === 'task' && !hiddenTaskIds.has(item.id))
    .map((task) => ({
      id: task.id,
      label: `agent:${task.target}`,
      meta: task.meta,
      status: statusOf(task, panel.items, answeredAsks),
      percent: task.percent,
      duration: task.duration,
      // There is nothing to kill in one that has already finished, and nothing to kill it with until the
      // CLI has named the task (see TaskItem.taskId).
      stopId: task.pending ? task.taskId : undefined,
    }))

/**
 * Whose stream this actually is. A taskId without the task it refers to (if the agent_id / task_id match
 * one day stops holding on a new version of the CLI, say) is no reason to hide a decision for good: without
 * this it would show up nowhere and quietly expire on a timeout. We count such a case as the main stream
 * rather than as a separate stream that does not exist.
 */
const ownerStream = (taskId: string | undefined, items: FeedItem[]): string => {
  if (taskId === undefined) return 'main'
  const known = items.some((item) => item.kind === 'task' && item.id === taskId)
  return known ? taskId : 'main'
}

/** The last question the agent asked in the current stream that has not been answered yet. */
export const pendingAsk = (items: FeedItem[], answered: string[], stream: string): AskItem | undefined =>
  [...items]
    .reverse()
    .find(
      (item): item is AskItem =>
        item.kind === 'ask' &&
        // A question from a past conversation's replay is not shown as a card - see AskItem.historic.
        !item.historic &&
        !answered.includes(item.id) &&
        ownerStream(item.taskId, items) === stream,
    )

/** The current stream's last call that is still waiting for a permission decision. */
export const pendingPermission = (items: FeedItem[], stream: string): PermItem | undefined =>
  [...items]
    .reverse()
    .find(
      (item): item is PermItem =>
        item.kind === 'perm' && item.decision === null && ownerStream(item.taskId, items) === stream,
    )

/**
 * A shown plan with no decision on it yet: while it is there, the turn stands on it.
 *
 * Only for a running turn: a plan card stays in the feed forever, including in a conversation raised from
 * the history - and there is nothing left to decide there, the turn ended somewhere in the past. Without
 * this check the very first message in a restored tab would travel not as a prompt but as a remark on an
 * ancient plan.
 */
export const pendingPlan = (
  panel: PanelState,
  decisions: Record<string, PlanDecision>,
): PlanItem | undefined =>
  panel.status === 'running'
    ? [...panel.items].reverse().find((item): item is PlanItem => item.kind === 'plan' && decisions[item.id] === undefined)
    : undefined
