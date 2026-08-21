import type { AgentEvent, AgentStatus, AgentUsage } from '../protocol'
import type { BackgroundTask, FeedItem, TodoEntry, UserToken } from './types'

/**
 * Everything one tab holds, and everything that may happen to it.
 *
 * The shape lives apart from the reducer that changes it (see build.ts): the state is read by half the
 * interface - the feed, the status line, the composer, the sound watcher - while changing it is one
 * file's business. Kept together, the description of what a tab is drowned in the rules of how it moves
 * from one state to the next.
 */

export interface PanelProject {
  name: string
  workingDirectory: string
  gitBranch?: string
  /** The current branch's pull request number, when it has one. */
  pullRequest?: string
  /** The same PR's address - the page opens by it. */
  pullRequestUrl?: string
}

/**
 * A chain of repeated API requests that is running right now.
 *
 * It lives beside the card in the feed rather than only inside it: by this field the status line under
 * the feed replaces "Claude is thinking" with the truth about what is happening (see streamStatus in
 * App.tsx), and by it the next attempt finds the card already created instead of putting a second one
 * just like it into the feed.
 */
export interface ApiRetry {
  /** This chain's card in the feed. */
  itemId: string
  label: string
  attempt: number
  maxRetries: number
  retryAt: number
  /** When the first request failed - the whole chain's duration is counted from it. */
  startedAt: number
}

export interface PanelState {
  items: FeedItem[]
  /** The text of the answer being printed right now. It lives until the finished message arrives. */
  streamingText: string
  /**
   * The number the printing answer will take in the feed when it arrives as a finished block. It is
   * handed out in advance, on the very first delta, so that the printing card and the finished one are
   * one and the same node to React: otherwise it would throw one card away and create a second, and with
   * it the reveal animation would break off - right on the answer's last words.
   */
  streamingId?: string
  /** The same, but for a thought - until the finished thinking block arrives. */
  streamingThinking: string
  status: AgentStatus
  sessionId?: string
  model?: string
  permissionMode?: string
  /**
   * A mode chosen but not yet confirmed. The button and the menu show it until the agent answers:
   * otherwise the choice looks lost, and after a refusal, accepted.
   */
  pendingMode?: string
  /**
   * A model chosen but not yet confirmed - for the same reason as the mode: the agent's answer does not
   * arrive instantly, and it can genuinely refuse.
   */
  pendingModel?: string
  project?: PanelProject
  usage: Required<AgentUsage>
  /**
   * The taken context window - as a figure from the CLI itself (see protocol, the context message).
   * Arithmetic of our own over usage stays as the fallback: it knows neither the window's real size
   * (with "1M" models it is five times the usual) nor what sits in the context besides the conversation
   * - the system prompt, the tool descriptions, the project's memory.
   */
  context?: { used: number; max: number }
  /**
   * How much of the window is taken right now, by the agent's latest answer.
   *
   * The CLI's figure arrives only at a turn's end: while the first - and longest - request runs there
   * would simply be nothing to show, and the bar would stand at zero exactly where the context is being
   * watched. Every answer from the agent, meanwhile, carries a usage of its own, and its input part is
   * literally what went to the model, that is, the window taken at that step. We count by it until the
   * exact figure arrives, and clear it when it does: that one knows about the system prompt and the tool
   * descriptions, which a turn's usage does not show.
   */
  liveContextUsed?: number
  cost: number
  /** The slash command list arrives from the agent itself when a session starts. */
  slashCommands: string[]
  /** The start time of every unfinished call - its duration is counted from it. */
  startedAt: Record<string, number>
  /**
   * When the current turn began - undefined when none is running. The live counter beside "Claude is
   * thinking" grows out of it (see streamStatus in App.tsx): "Worked Ns" under the answer itself arrives
   * only with its end, and until then how long it has been going was invisible.
   */
  turnStartedAt?: number
  /**
   * How much of the current turn has gone into waiting for a person's decision - a permission,
   * ExitPlanMode, AskUserQuestion. It is subtracted from elapsed in streamStatus (App.tsx): while such a
   * card hangs there, the turn is not thinking but standing, and after the decision those seconds must
   * not retroactively become "Claude is thinking". It accumulates through attentionStarted/
   * attentionEnded - App.tsx sends those, having noticed by awaitsYou that the main stream's cards
   * changed state.
   */
  pausedMs: number
  /** When the current wait for a person's decision began - undefined when we are not waiting. */
  waitStartedAt?: number
  /**
   * A subagent's card by the tool_use_id of the Task/Agent call that spawned it - out of the task_started
   * system event. The subagent's own messages carry only a tool_use_id in parent_tool_use_id, while the
   * card may live under a task_id: without this map there is nothing to tie them together with.
   */
  taskByToolUseId: Record<string, string>
  /**
   * A subagent's card by task_id - the other side of the same link. One and the same subagent arrives by
   * two routes: as a tool_use block in the agent's answer (with the call's own identifier) and as task_*
   * system events (with a task_id of their own). The card is created by whichever came first, and the
   * second finds the existing one through this map - otherwise one subagent would have two of them and
   * take up two chips in the header at once.
   */
  taskCards: Record<string, string>
  /**
   * Commands launched in the background and running right now. From then on they live as a chip in the
   * header: while a dev server is up, that is the only place this is visible.
   */
  background: BackgroundTask[]
  seq: number
  /**
   * When Stop was pressed - until that moment the status changes only by an event that genuinely
   * arrived rather than optimistically: lying "free" is cheaper than later explaining why the agent
   * still does not answer.
   */
  stopRequestedAt?: number
  /** The conversation's process has died on its own since the last turn - the tab has something to point at. */
  crashed: boolean
  /** A context compaction is running right now - the status line should name that rather than "working". */
  compacting: boolean
  /**
   * A request to the model failed, and the CLI is waiting the refusal out before repeating it. While
   * this field is set, nothing at all happens in the conversation (see RetryItem), and saying "Claude is
   * thinking" is untrue.
   */
  retry?: ApiRetry
  /**
   * Local commands such as /clear do not call the model, but the CLI still closes the turn with an
   * internal "(no content)" message and a result - in a terminal they are invisible, while here the
   * copy capsule and the turn duration line would be empty noise. Set on that placeholder, cleared on
   * the next result.
   */
  suppressNextMeta: boolean
  /**
   * The conversation's process has just come up and has not got down to business yet.
   *
   * Set on system/init and cleared by the first turn result. Needed to tell the internal "zero" turn the
   * CLI closes its own start-up with from a real turn that genuinely ended with nothing - see case
   * 'result'.
   */
  starting: boolean
  /**
   * The new tracker's task list (TaskCreate/TaskUpdate), by its number - the same one TaskUpdate calls it
   * by. Unlike the former TodoWrite there is no single call carrying the whole list: the list has to be
   * assembled out of separate create and update calls (see applyToolUse/applyTaskCreated).
   *
   * The tool itself does not separate one conversation's different requests - from its point of view
   * this is one list for the whole session. That does not suit the panel: the list over the input field
   * has to answer "how is what I have just asked for going" rather than grow forever with items from the
   * request before last. So the list is reset not by the tasks' state (a deceptive signal - that same
   * list may briefly be entirely closed in the middle of one piece of work, if the agent runs its tasks
   * one at a time rather than in a batch) but by a new message from the person - see case 'prompt', that
   * is the real boundary between the "previous" and the "new" request. Along with the dictionary an
   * empty snapshot is put into the feed: the panel over the field mirrors the last todo item, and
   * without it it would go on showing the previous request, while TaskUpdate by the old numbers would no
   * longer find them and silently do nothing.
   */
  tasks: Record<string, TodoEntry>
  /**
   * A task's subject by the id of its TaskCreate call - until the number assigned to it becomes known.
   * The tool does not hand the numbers over in any structured form at all, only in the words of its
   * answer's text ("Task #3 created…"), and learning it is impossible before that answer arrives.
   */
  pendingTasks: Record<string, { subject: string; activeForm?: string }>
}

export type PanelAction =
  /**
   * steering marks a message written into a turn already running: the agent will pick it up between
   * steps rather than start a new turn with it. Such a message is only added to the feed and interrupts
   * nothing in it.
   */
  | { kind: 'prompt'; tokens: UserToken[]; quotes: string[]; steering?: boolean }
  /**
   * replay marks an event of a past conversation's replay rather than a live turn: it lands in the feed
   * the same way but tells nothing about the conversation right now (see 'assistant').
   */
  | { kind: 'agent'; event: AgentEvent; replay?: boolean }
  /**
   * The replay is over - from here on this tab holds a live conversation only. Everything the replay
   * left unfinished is closed here: there is nobody left to wait for its result from (see
   * applyReplayFinished).
   */
  | { kind: 'replayFinished' }
  | { kind: 'status'; status: AgentStatus }
  | { kind: 'error'; message: string }
  | { kind: 'init'; project: PanelProject }
  /** The branch and its pull request arrive later: the number is fetched from GitHub. */
  | { kind: 'project'; gitBranch?: string; pullRequest?: string; pullRequestUrl?: string }
  /** This conversation's taken context window - a figure from the CLI itself. */
  | { kind: 'context'; used: number; max: number }
  /** A bash-mode command: first the card with it, then its output. */
  | { kind: 'bashStarted'; id: string; command: string }
  | { kind: 'bashFinished'; id: string; output: string; exitCode: number }
  | {
      kind: 'permission'
      id: string
      target: string
      command: string
      mode: string
      reason?: string
      rememberable?: boolean
      taskId?: string
    }
  | { kind: 'permissionResolved'; id: string; decision: 'once' | 'always' | 'deny' }
  | { kind: 'modeRequested'; mode: string }
  | { kind: 'modeApplied'; mode: string; applied: boolean; error?: string }
  | { kind: 'modelRequested'; model: string }
  /** The model now in force: on the agent's refusal the previous one rather than the chosen one. */
  | { kind: 'modelApplied'; model: string; error?: string }
  /** A mark from the panel in the feed: that this conversation was branched off another, for instance. */
  | { kind: 'checkpoint'; chip: string; target: string }
  /** Once a second it pulls up the duration of the calls that have not finished. */
  | { kind: 'tick' }
  /** Stop was pressed - the status is genuinely awaited rather than assumed. */
  | { kind: 'stopRequested' }
  /**
   * The process died on its own. Everything that was "running" would hang like that forever unless it is
   * closed outright and the user told what happened.
   */
  | { kind: 'processExited'; exitCode: number }
  /** An error was removed from the feed by hand - it has been read, and keeping it serves nothing. */
  | { kind: 'dismissError'; id: string }
  /**
   * The turn has stopped on a person's decision (a permission/ask/plan of the main stream) - from this
   * moment on the time goes into pausedMs rather than into the "Claude is thinking" counter.
   */
  | { kind: 'attentionStarted' }
  /** The decision has been taken - the waiting time goes into the current turn's pausedMs. */
  | { kind: 'attentionEnded' }

export const initialPanelState: PanelState = {
  items: [],
  streamingText: '',
  streamingThinking: '',
  status: 'idle',
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  cost: 0,
  startedAt: {},
  taskByToolUseId: {},
  taskCards: {},
  background: [],
  slashCommands: [],
  seq: 1,
  crashed: false,
  compacting: false,
  suppressNextMeta: false,
  starting: false,
  tasks: {},
  pendingTasks: {},
  pausedMs: 0,
}

/** A new item in the feed, with the next number of its own. */
export const push = (state: PanelState, make: (id: string) => FeedItem): PanelState => ({
  ...state,
  seq: state.seq + 1,
  items: [...state.items, make(`i-${state.seq}`)],
})
