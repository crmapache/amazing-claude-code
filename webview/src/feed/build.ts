import type {
  AgentEvent,
  AgentRateLimitEvent,
  AgentSystemEvent,
  AgentUsage,
  ContentBlock,
  MessageContent,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from '../protocol'
import { normalizeMode, sameModel } from '../catalog'
import { parseParagraphs } from './markdown'
import { initialPanelState, push, type PanelAction, type PanelState } from './panelState'
import { togglePin } from './pins'
import { applyApiRetry, closeRetry, closeRetryFor } from './retry'
import {
  appendAgentLog,
  applyReplayedTaskNotification,
  applyTaskNotification,
  applyTaskProgress,
  applyTaskStarted,
  mapTool,
  noteSubagent,
} from './tasks'
import { replayedMessage } from './replayed'
import { readPlan, readQuestions, readTodos } from './toolInput'
import { readReview } from './findings'
import {
  chipFor,
  detailFor,
  formatDuration,
  hunksFor,
  isEditTool,
  metaFor,
  resultToText,
  targetFor,
} from './tools'
import type {
  ClosedReason,
  CompactOutcome,
  DetailLine,
  FeedItem,
  FeedRowItem,
  LimitItem,
  TextItem,
  ThinkItem,
  TodoEntry,
  TodoItem,
  ToolGroupItem,
  MetaItem,
  ToolItem,
  UserItem,
} from './types'

/**
 * The agent's event stream turned into the feed's cards.
 *
 * One reducer for one tab: everything that arrives - the agent's events, the shell's messages, the
 * person's own actions - passes through it and leaves the tab in a new state (see [PanelState]). The
 * interface only draws that state and adds nothing of its own to it.
 *
 * What lives in modules of its own beside this one: the state's shape ([panelState]), subagents and
 * background commands ([tasks]), the pause between repeated API requests ([retry]), and reading a tool's
 * input ([toolInput]). Each of those follows rules of its own, and kept here they buried the simple part
 * of the assembly - a message, an answer, a tool call.
 */

export type { ApiRetry, PanelAction, PanelProject, PanelState } from './panelState'
export { initialPanelState } from './panelState'

/**
 * An error stands in the feed in its place - where it happened (see ErrorItem).
 *
 * One and the same refusal arrives by two routes: as text in the process's error stream and as a parsed
 * answer to a control request. Two identical red slabs in a row read as two different breakages although
 * one happened - so within the current turn one and the same text is shown once. The turn's boundary is
 * the person's last message: the same refusal an hour later is a fresh piece of trouble, and staying
 * silent about it would be worse than repeating oneself.
 */
const addError = (state: PanelState, message: string): PanelState => {
  const turnStart = state.items.map((item) => item.kind).lastIndexOf('user') + 1
  const alreadyShown = state.items
    .slice(turnStart)
    .some((item) => item.kind === 'error' && item.message === message)

  if (alreadyShown) return state

  /**
   * The CLI can say the same trouble twice: as the agent's message in the stream and as a line in
   * stderr, word for word - that is how "API Error: 500 …" arrives, for instance. The message gets there
   * first, and the feed was left with a pair of identical paragraphs in a row: an ordinary answer and a
   * red slab under it.
   *
   * Out of the two kinds we keep the slab: it names what happened an error, it can be closed with a
   * cross, and it is where a link like status.claude.com is expected. The opposite order (the error came
   * first) is handled where the message is born - see alreadyShownAsError.
   */
  const said = message.trim()
  const withoutEcho = state.items.filter(
    (item, index) => !(index >= turnStart && item.kind === 'text' && item.source.trim() === said),
  )

  return push({ ...state, items: withoutEcho }, (id) => ({ id, kind: 'error', message }))
}

export const reducePanel = (state: PanelState, action: PanelAction, now = Date.now()): PanelState => {
  switch (action.kind) {
    case 'init':
      return { ...state, project: action.project }

    case 'resumed':
      return { ...state, sessionId: action.conversationId }

    case 'project':
      // The branch and the PR now arrive as separate messages with frequencies of their own (see
      // ClaudePanel.refreshBranch/refreshPullRequest) - each field falls back to its previous value when
      // this message was not about it, rather than being wiped with emptiness.
      return {
        ...state,
        project: {
          name: state.project?.name ?? '',
          workingDirectory: state.project?.workingDirectory ?? '',
          ...state.project,
          gitBranch: action.gitBranch ?? state.project?.gitBranch,
          pullRequest: action.pullRequest ?? state.project?.pullRequest,
          pullRequestUrl: action.pullRequestUrl ?? state.project?.pullRequestUrl,
        },
      }

    case 'status': {
      // Usually an interrupted turn closes itself - with an ordinary result a little before its time, and
      // the interruption caption is put there (see below). But a turn can also break off silently: the
      // agent frees itself without sending a result at all. Then this status is the only trace of the
      // stop, and without a line of its own the feed would say nothing about it: the work simply froze
      // mid-sentence.
      // Either kind of stop: the person's, or the IDE's own to move the conversation to another
      // account (see stoppedForAccount). The second has no result at all when the turn would not stop
      // and the process was taken down, and then this status is the only trace there is.
      const stoppedSilently =
        action.status === 'idle' && (state.stopRequestedAt !== undefined || state.stoppedForAccount === true)
      // Reconnecting to a background turn (see below) counts as a new turn for the pause as well -
      // otherwise it would drag along a wait from a completely different turn, one this tab knew nothing
      // about.
      const turnReconnected = action.status === 'running' && state.turnStartedAt === undefined

      // What was running when the process went is closed with it - cards AND their counters, which live
      // apart in startedAt: a record left behind there goes on recomputing a duration for a call that
      // ended, on every tick, for as long as the tab is open.
      // Background subagents survive the person's own Stop - that stops what the turn stood for, while
      // they were launched to run apart from it. They do NOT survive a move to another account: the
      // process is replaced, and everything it was running goes with it, so a chip left ticking is a
      // clock against a CLI that is gone.
      const settled = stoppedSilently
        ? closeUnfinished(
            state,
            now,
            { reason: 'stopped', tone: 'bad' },
            state.stoppedForAccount === true ? 'none' : 'background',
          )
        : null

      const next: PanelState = {
        ...state,
        status: action.status,
        // Since a status genuinely arrived, there is nothing left to wait for - the optimistic Stop and
        // an old crash mark (if the process is working again) lose their meaning.
        stopRequestedAt: undefined,
        stoppedForAccount: undefined,
        crashed: action.status === 'running' ? false : state.crashed,
        // Usually the turn is already marked through 'prompt' - this is only the fallback route: the
        // 'running' status caught the panel up by itself, without a local prompt (after reconnecting to a
        // background turn already under way, for instance). We do not touch what is already ticking -
        // otherwise the same status arriving again would move the count backwards.
        turnStartedAt: action.status === 'running' ? (state.turnStartedAt ?? now) : undefined,
        // The turn has ended (or this is really a new one) - the pause counter is cleared along with
        // turnStartedAt, or the setInterval in App.tsx would tick for nothing until the next message,
        // while the next turn would start with someone else's pause.
        pausedMs: action.status === 'idle' || turnReconnected ? 0 : state.pausedMs,
        waitStartedAt: action.status === 'idle' ? undefined : state.waitStartedAt,
        seq: stoppedSilently ? state.seq + 1 : state.seq,
        startedAt: settled?.startedAt ?? state.startedAt,
        items: settled
          ? [
              // Without this the tool cards and the subagent chips of the broken-off turn keep their
              // live clocks against a process that no longer exists, until somebody closes the tab - the
              // same hole the result route below has always covered and this one never did.
              ...settled.items,
              {
                id: `meta-${state.seq}`,
                kind: 'meta',
                stats: [STOPPED_BY_YOU],
                outcome: {
                  state: state.stoppedForAccount === true ? ('movedAccount' as const) : ('stopped' as const),
                  duration: '',
                },
              },
            ]
          : state.items,
      }

      // The turn has ended while a chain of retries is still open - which means it was broken off right
      // in the middle of the pause: it has no event of its own for that and nobody to close it (see
      // closeRetryFor), and without this its card would go on waiting for an attempt that will not come.
      return action.status === 'idle' ? closeRetry(finishCompacting(next), 'stopped', now) : next
    }

    case 'context':
      // The exact figure displaces the estimate made during the turn: arithmetic of our own knows only
      // about the conversation, this one knows about everything in the window.
      return action.max > 0
        ? { ...state, context: { used: action.used, max: action.max }, liveContextUsed: undefined }
        : state

    case 'tick':
      return tickDurations(state, now)

    case 'error':
      return addError(state, action.message)

    case 'dismissError':
      return { ...state, items: state.items.filter((item) => item.id !== action.id) }

    case 'pin': {
      // Unchanged when the strip is full and this one is not on it (see togglePin): a state left alone is
      // a feed not rebuilt.
      const pins = togglePin(state.pins, action.id)
      return pins === state.pins ? state : { ...state, pins }
    }

    // Deliberately idempotent: App.tsx sends them on every change of awaitsYou without tracking whether
    // the same one has already been sent - leaning on the reducer is simpler than keeping a ref for it.
    case 'attentionStarted':
      return state.waitStartedAt === undefined ? { ...state, waitStartedAt: now } : state

    case 'attentionEnded':
      return state.waitStartedAt === undefined
        ? state
        : { ...state, pausedMs: state.pausedMs + (now - state.waitStartedAt), waitStartedAt: undefined }

    case 'stopRequested':
      return { ...state, stopRequestedAt: now }

    case 'stoppedForAccount':
      return { ...state, stoppedForAccount: true }

    case 'processExited':
      // The process is gone right in the middle of a pause before a retry - there is nobody left to
      // retry, and the card has to stop waiting along with it.
      return applyProcessExited(closeRetry(finishCompacting(state), 'stopped', now), action.exitCode, now)

    case 'processReplaced':
      return applyProcessReplaced(state, now)

    case 'streamPrimed': {
      // The same identifier the first delta would have handed out, and for the same reason: the card
      // being printed and the finished one have to be one node to React, or the reveal animation breaks
      // off on the answer's last words (see streamingId in panelState.ts).
      const hasText = action.text.length > 0
      return {
        ...state,
        streamingText: action.text,
        streamingThinking: action.thinking,
        streamingId: state.streamingId ?? (hasText ? `i-${state.seq}` : undefined),
        seq: state.streamingId || !hasText ? state.seq : state.seq + 1,
      }
    }

    case 'replayFinished':
      return withEarlier(applyReplayFinished(finishCompacting(state), now), action.cursor)

    case 'prompt': {
      const message: UserItem = {
        id: `user-${state.seq}`,
        kind: 'user',
        time: formatClock(now),
        tokens: action.tokens,
        quotes: action.quotes,
      }

      // A message written into a running turn starts nothing afresh: the agent carries on with its own,
      // and the unfinished answer it is printing right now must not be interrupted - clearing the
      // streaming fields would wipe it off the screen mid-sentence.
      if (action.steering) {
        return { ...state, seq: state.seq + 1, items: [...state.items, message] }
      }

      const lastTodo = [...state.items].reverse().find((item): item is TodoItem => item.kind === 'todo')
      const hideOpenList = lastTodo !== undefined && lastTodo.todos.some((todo) => todo.state !== 'done')

      const next: PanelState = {
        ...state,
        status: 'running',
        turnStartedAt: now,
        pausedMs: 0,
        waitStartedAt: undefined,
        streamingText: '',
        streamingId: undefined,
        streamingThinking: '',
        stopRequestedAt: undefined,
        crashed: false,
        seq: state.seq + 1,
        items: [...state.items, message],
        // A new request is the boundary of the new tracker's task list: see the comment on tasks in
        // PanelState. A started task with no TaskCreate answer is nothing dreadful to break off here -
        // pendingTasks will simply never resolve, which is right: its TaskUpdate would belong to the
        // previous request, and there was nowhere left to look for it.
        tasks: {},
        pendingTasks: {},
      }

      // An empty snapshot, so that the panel does not hold on to the previous unclosed list: the tasks
      // dictionary has already been reset, while latestTodo looks into the feed.
      return hideOpenList ? push(next, (id) => ({ id, kind: 'todo', todos: [] })) : next
    }

    /**
     * A bash-mode command. It neither starts nor touches the agent's turn: one may have been running at
     * that moment or not at all - the card simply takes its place in the feed.
     */
    case 'bashStarted':
      return {
        ...state,
        items: [
          ...state.items,
          { id: action.id, kind: 'bash', command: action.command, output: '', pending: true },
        ],
      }

    case 'bashFinished':
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind === 'bash' && item.id === action.id
            ? { ...item, output: action.output, exitCode: action.exitCode, pending: false }
            : item,
        ),
      }

    case 'permission':
      return {
        ...state,
        items: [
          ...state.items,
          {
            id: action.id,
            kind: 'perm',
            target: action.target,
            mode: action.mode,
            command: action.command,
            decision: null,
            reason: action.reason,
            // Not said means it will work: silence from the CLI and from the panel here means an ordinary
            // question rather than a ban (see protocol.ts).
            rememberable: action.rememberable !== false,
            taskId: action.taskId,
          },
        ],
      }

    case 'permissionResolved':
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id && item.kind === 'perm' ? { ...item, decision: action.decision } : item,
        ),
      }

    case 'modeRequested':
      return { ...state, pendingMode: action.mode }

    case 'checkpoint':
      return {
        ...state,
        seq: state.seq + 1,
        items: [
          ...state.items,
          {
            id: `cp-${state.seq}`,
            kind: 'checkpoint',
            chip: action.chip,
            target: action.target,
            targetKey: action.targetKey,
          },
        ],
      }

    // The agent's refusal returns the panel to the previous mode: showing as applied what was not applied
    // is the worst of all outcomes. The reason for the refusal is shown right in the feed, or the button
    // simply "does not press" without an explanation.
    case 'modeApplied': {
      const applied: PanelState = {
        ...state,
        pendingMode: undefined,
        permissionMode: action.applied ? action.mode : state.permissionMode,
      }
      return action.error ? addError(applied, action.error) : applied
    }

    case 'modelRequested':
      return { ...state, pendingModel: action.model }

    // The same for the model: the shell sends the one in force, and it becomes the conversation's model -
    // a rejected one leaves no trace. We remember it here rather than lean on the catalogue: on a CLI
    // build without a model list (or if the request for it never arrived) there would be nothing to
    // expand the choice with, and the caption under the panel would go on naming the previous model.
    case 'modelApplied': {
      // streamModel is dropped along with it: the count of "what the stream last named" starts anew from
      // a choice of the person's own, or the first answer after the change would be taken for a swap
      // behind their back (see noteStreamModel).
      const applied: PanelState = {
        ...state,
        pendingModel: undefined,
        model: action.model,
        ownModel: action.model,
        streamModel: undefined,
        // Whatever the agent had swapped before is answered by a choice of the person's own: the accent
        // on the button says "you did not pick this", and now they have (see PanelState.switchedFrom).
        switchedFrom: undefined,
      }
      return action.error ? addError(applied, action.error) : applied
    }

    case 'effortRequested':
      return { ...state, pendingEffort: action.effort }

    // No refusal arm here, unlike the model and the mode: the effort channel does not refuse (see
    // ClaudeSession.setEffort), so the shell's word is the last one.
    case 'effortApplied':
      return { ...state, pendingEffort: undefined, effort: action.effort }

    // The whole list rather than a change to it: the IDE holds the queue, either window may have been
    // the one that changed it, and what arrives is how it stands now (see SessionQueue.kt).
    case 'queue':
      return { ...state, queue: action.items }

    case 'agent':
      return noteOldest(applyAgentEvent(state, action.event, now, action.replay === true), action.event)

    /**
     * A page of older messages, put above everything on screen.
     *
     * The one place a conversation grows upwards. Numbered on from the state's own counter rather than
     * from zero: the identifiers are positions in a feed (see push), so a page built in a state of its
     * own comes back carrying the very numbers the screen already uses - and two cards under one key is a
     * page that half disappears.
     */
    case 'historyPage': {
      // The answer arrived, whatever is in it - a screen unlocks its control on this alone (see
      // PanelState.earlierPages). It brought nothing to look at until proven otherwise: a page dropped
      // here as stale or repeated moved no rows, and saying so is what stops the screen from asking again
      // over and over (see PanelState.lastPageRows).
      const answered = { ...state, earlierPages: state.earlierPages + 1, lastPageRows: 0 }

      // A page answers the boundary it was asked for, and only the boundary standing on screen right now
      // is worth applying: when a frame goes missing and the person asks again, both answers can arrive,
      // and the second would put the same messages in a second time.
      if (action.before !== undefined && action.before !== state.oldestEventUuid) return answered

      // The beginning has already been reached, so this is a second copy of the page that reached it: the
      // boundary above stopped moving there and cannot tell the two apart (see reachedStart).
      if (state.reachedStart) return answered

      let page: PanelState = { ...initialPanelState, seq: answered.seq }
      for (const event of action.entries) {
        page = reducePanel(page, { kind: 'agent', event, replay: true }, now)
      }

      // Whatever the page left "running" is closed the same way the end of a replay closes it: a call
      // whose result lies in the part of the conversation already on screen has nobody left to answer it,
      // and the card would spin for the rest of the tab's life.
      page = applyReplayFinished(page, now)

      // The page goes in first and the mark is rebuilt over the result: that way it stands above what has
      // just been loaded rather than where the previous one stood, in the middle of the feed.
      const merged = {
        ...answered,
        seq: page.seq,
        items: [...page.items, ...answered.items],
        lastPageRows: page.items.filter(drawnInFeed).length,
      }

      return withEarlier(merged, action.cursor ?? null)
    }
  }
}

/**
 * Whether this item is a row on the screen the person scrolls - see FeedRowItem.
 *
 * The one place that answers it, because two of them ask. The feed itself draws by this, and a page of
 * history is measured by it: "the answer brought nothing" is a fact about rows, not about items. A page
 * made entirely of subagent launches fills state.items and moves not a pixel.
 */
export const drawnInFeed = (item: FeedItem): item is FeedRowItem =>
  item.kind !== 'todo' && item.kind !== 'ask' && item.kind !== 'perm'

/**
 * Whether Claude Code's transcript keeps this event, and so whether its identifier can be asked for a
 * page older than it (see ClaudeHistory.replayable).
 *
 * The stream carries far more than the transcript does - hook reports, status changes, the permission
 * traffic - and anchoring on one of those meant asking for "everything before a line that is not in the
 * file". The IDE answers that with the file's own last page, which is what the screen already had: the
 * request to load more brought back the same messages a second time.
 */
const keptOnDisk = (event: { type?: string; subtype?: string }): boolean =>
  event.type === 'user' || event.type === 'assistant' || event.subtype === 'local_command'

/**
 * The first event a feed ever sees is, at that moment, the oldest one it has - remembered once and left
 * alone from then on: everything arriving after it, live, is newer by definition, and only a page off the
 * disk is allowed to push the boundary further back.
 */
const noteOldest = (state: PanelState, event: AgentEvent): PanelState => {
  if (state.oldestEventUuid !== undefined || !keptOnDisk(event)) return state

  const uuid = (event as { uuid?: unknown }).uuid

  return typeof uuid === 'string' ? { ...state, oldestEventUuid: uuid } : state
}

/**
 * The boundary between what is drawn and what is still on disk, and the mark that stands for it over the
 * feed.
 *
 * `cursor` of undefined means nothing was said about the boundary and it is left as it stands - that is a
 * phone, which is handed the end of a conversation rather than its replay and keeps a boundary of its own
 * (see RemoteFeed.isReplayLine). Null means the conversation's beginning is on screen: the mark goes, and
 * with it the offer to load what is already there.
 *
 * The mark is rebuilt rather than moved: it has to stand above whatever has just been loaded, and there
 * must never be two of them.
 */
const withEarlier = (state: PanelState, cursor: string | null | undefined): PanelState => {
  if (cursor === undefined) return state

  const rest = state.items.filter((item) => !(item.kind === 'checkpoint' && item.chip === EARLIER_CHIP))
  const mark: FeedItem[] = cursor
    ? [{ id: 'earlier', kind: 'checkpoint', chip: EARLIER_CHIP, target: '', targetKey: 'earlier' as const }]
    : []

  return {
    ...state,
    items: [...mark, ...rest],
    oldestEventUuid: cursor ?? state.oldestEventUuid,
    reachedStart: cursor === null,
  }
}

/** The mark over a feed that begins mid-conversation - a button wherever there is something to fetch. */
const EARLIER_CHIP = 'EARLIER'



/**
 * While a tool or a subtask runs, its duration otherwise appears only together with the result - the
 * counter stands still, and the work looks stuck. The tick recomputes it from startedAt every second.
 *
 * turnStartedAt does not take part in this recount itself (it is read straight at render time, see
 * streamStatus in App.tsx) - but while it is set and startedAt is still empty (the turn has just begun,
 * before the first tool call), the early return below would give back the same state object, and React
 * would decide there is nothing to render: the live counter beside "Claude is thinking" would stand at
 * zero.
 */
const tickDurations = (state: PanelState, now: number): PanelState => {
  if (Object.keys(state.startedAt).length === 0 && !state.turnStartedAt && !state.retry) return state

  // A chain of retries moves nothing in the feed by itself, but the countdown in the status line is
  // computed from the current time - without a new state it would freeze at the second the attempt failed
  // (see streamStatus in App.tsx).
  let changed = Boolean(state.turnStartedAt) || Boolean(state.retry)

  const background = state.background.map((task) => {
    const started = state.startedAt[task.id]
    if (!started) return task
    changed = true
    return { ...task, duration: formatDuration(now - started) }
  })

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      if (!item.pending) return item
      const started = state.startedAt[item.id]
      if (!started) return item
      changed = true
      return { ...item, duration: formatDuration(now - started) }
    }

    if (item.kind !== 'toolGroup' || !item.pending) return item

    const tools = item.tools.map((tool) => {
      if (!tool.pending) return tool
      const started = state.startedAt[tool.id]
      if (!started) return tool
      changed = true
      return { ...tool, duration: formatDuration(now - started) }
    })

    changed = true
    return { ...item, tools, duration: formatDuration(now - item.startedAt) }
  })

  return changed ? { ...state, items, background } : state
}

/**
 * A compaction has ended - successfully or not.
 *
 * A successful end has an event of its own carrying the outcome, but a turn can break off earlier too:
 * the process fell over, the person pressed Stop, the conversation was killed. There would then be no
 * closing event at all, while a raised flag costs dearly: while it is raised the status line is not shown
 * at all, that is, this turn and every turn after it in this tab run without a single caption about what
 * is happening. Along the way we remove the half-drawn CONTEXT card - its percentage would otherwise run
 * into the ceiling and stand there.
 */
const finishCompacting = (state: PanelState): PanelState => {
  const unfinished = state.items.some((item) => item.kind === 'compact' && item.pending)
  if (!state.compacting && !unfinished) return state

  return {
    ...state,
    compacting: false,
    items: unfinished ? state.items.filter((item) => !(item.kind === 'compact' && item.pending)) : state.items,
  }
}

/**
 * The cards left "running" when there is nothing left to wait for their result from: tool calls and
 * subagents.
 *
 * Leaving them as they are means showing work that has long since gone: every such card has a counter of
 * its own, and it ticks and ticks while the tab is open. There are three reasons to be left without a
 * result - the conversation's process died, the turn ended before the call came back (usually because it
 * was interrupted), and a past conversation's replay ended on unfinished work - so the note arrives as
 * text from whoever closes them.
 *
 * [notes.tone] - only what genuinely did not finish is marked red: in a replay a call may well have ended
 * successfully, its result merely was not saved in it, and a red line would credit the conversation with
 * an error that never happened.
 *
 * [keepTasks] - what to do with the subagents still working:
 *
 * - 'all' - touch none of them. That is how a turn that ended by itself is closed: while a turn waits for
 *   a subagent it does not end - so everything still working when it ends naturally works apart from it
 *   and will live to its own notification (task_notification). Such a card may have no "background" mark
 *   at all: subagents raised by a skill (/code-review, for instance) are not launched by the main stream's
 *   own tool call - there is no "Async agent launched" answer in it, and there is no recognising them by
 *   that (see ASYNC_AGENT_LAUNCHED). They used to be closed here, and a dozen working agents disappeared
 *   from the header the moment the turn reported launching them.
 * - 'background' - keep only those marked background. That is how an interrupted turn is closed: the work
 *   was broken off mid-way, and everything the turn stood for was broken off with it.
 * - 'none' - close them all. A process's death and the end of a past conversation's replay: there is
 *   nobody left for the subagents to report to.
 */
const closeUnfinished = (
  state: PanelState,
  now: number,
  notes: { reason: ClosedReason; tone: 'bad' | 'dim' },
  keepTasks: 'all' | 'background' | 'none',
): { items: FeedItem[]; startedAt: Record<string, number> } => {
  const startedAt = { ...state.startedAt }

  const closeTool = (tool: ToolItem): ToolItem => {
    if (!tool.pending) return tool

    const started = startedAt[tool.id]
    delete startedAt[tool.id]
    const duration = started ? formatDuration(now - started) : tool.duration

    return {
      ...tool,
      pending: false,
      isError: notes.tone === 'bad' || tool.isError,
      duration,
      meta: { kind: 'closed', reason: notes.reason },
      detail: [...tool.detail, { text: '', note: { kind: 'closed', reason: notes.reason }, tone: notes.tone }],
    }
  }

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      if (!item.pending) return item
      if (keepTasks === 'all') return item
      if (keepTasks === 'background' && item.background) return item

      const started = startedAt[item.id]
      delete startedAt[item.id]
      const duration = started ? formatDuration(now - started) : item.duration

      return {
        ...item,
        pending: false,
        duration,
        outcome: 'stopped' as const,
        log: appendAgentLog(item.log, [
          { text: '', note: { kind: 'closed', reason: notes.reason }, tone: notes.tone },
        ]),
      }
    }

    if (item.kind !== 'toolGroup' || !item.pending) return item

    const tools = item.tools.map(closeTool)
    return { ...item, tools, pending: false, duration: formatDuration(now - item.startedAt) }
  })

  return { items, startedAt }
}

/**
 * A past conversation's replay has been played to the end: everything left "running" in it is closed -
 * nothing is working in this tab, and there is nobody left to wait for that work's result from.
 *
 * There would have been someone to answer for such cards only in the conversation they were launched in -
 * and its process has long been gone. This is especially about background subagents: their outcome is
 * brought by a separate system event, and a transcript holds nothing but messages. What the transcript
 * does keep is the notification the CLI wrote into the talk itself, and everything named in one is closed
 * by it (see applyReplayedTaskNotification); the rest reach this point still "running". A tab opened from
 * the history showed past agents as working right now: with
 * a running counter (it ran from the moment the tab was opened rather than from their launch), with a
 * chip in the header, with a "kill" cross - there was nothing to kill in this process - and with a
 * "Waiting for N subagents" line under the feed.
 *
 * The cards themselves stay: the conversation genuinely launched them, and that is part of its history.
 * All that changes is the note - instead of "running" they carry what is actually known about them.
 */
const applyReplayFinished = (state: PanelState, now: number): PanelState => {
  /**
   * While the replay was playing, the person may already have written into this tab - a long conversation
   * does not replay instantly. Then everything "running" in the feed belongs to a live turn already, and
   * closing it is not an option: the panel would declare finished work that is happening right now. Of
   * two evils we choose the smaller and touch nothing: in that rare case a card from the replay is left
   * hanging - exactly as before - while the live turn is intact.
   */
  if (state.turnStartedAt !== undefined) return state

  const { items, startedAt } = closeUnfinished(
    state,
    now,
    { reason: 'replay', tone: 'dim' },
    'none',
  )

  return { ...state, items, startedAt }
}

/**
 * The process died on its own rather than at our request. Any card that was "running" at that moment
 * would otherwise hang there forever - we close them outright and leave an unambiguous note in the feed
 * about what happened.
 */
/**
 * The background commands, let go of.
 *
 * They outlive the process that started them - a dev server raised by a turn is not going anywhere - but
 * there is nobody left to report about them, because the notifications came from that same CLI. So the
 * chips are dropped by the caller and into each command's card goes exactly what is true: the panel no
 * longer follows it. Saying it was interrupted would be a lie about a process that is alive.
 *
 * [startedAt] is emptied of them in place, the way [closeUnfinished] empties it: a record left there goes
 * on recomputing a duration on every tick for as long as the tab is open.
 */
const letGoBackground = (
  items: FeedItem[],
  background: PanelState['background'],
  startedAt: Record<string, number>,
  now: number,
): FeedItem[] =>
  background.reduce((current, task) => {
    const started = startedAt[task.id]
    delete startedAt[task.id]
    const duration = started ? formatDuration(now - started) : task.duration

    return task.toolUseId
      ? mapTool(current, task.toolUseId, (tool) => ({
          ...tool,
          duration,
          detail: [
            ...tool.detail,
            { text: '', note: { kind: 'closed' as const, reason: 'untracked' as const }, tone: 'dim' as const },
          ],
        }))
      : current
  }, items)

const applyProcessExited = (state: PanelState, exitCode: number, now: number): PanelState => {
  const { items, startedAt } = closeUnfinished(
    state,
    now,
    { reason: 'exited', tone: 'bad' },
    'none',
  )

  const withBackground = letGoBackground(items, state.background, startedAt, now)

  return {
    ...state,
    status: 'idle',
    streamingText: '',
    streamingId: undefined,
    streamingThinking: '',
    crashed: true,
    stopRequestedAt: undefined,
    // The turn broke off - without this turnStartedAt would hang until the next message, and the
    // setInterval in App.tsx would tick for nothing (the next turn may be a long way off).
    turnStartedAt: undefined,
    pausedMs: 0,
    waitStartedAt: undefined,
    startedAt,
    background: [],
    seq: state.seq + 1,
    items: [
      ...withBackground,
      {
        id: `crash-${state.seq}`,
        kind: 'crash',
        // The code alone: the sentence around it belongs to whatever language the card is painted in.
        ...(exitCode === 0 ? {} : { exitCode }),
      },
    ],
  }
}

/**
 * The tab's process has been swapped under it - an account chosen, or a second sign-in to the one already
 * in use - while the tab itself was saying nothing.
 *
 * A turn is not what dies here; a turn would have been interrupted, and every client told (see
 * stoppedForAccount above). What dies is everything that outlives a turn and not the process that holds
 * it: a workflow's fleet, a background subagent, a background command. Nobody was going to say so - the
 * old process is not crashing, it is being replaced on purpose - and the cards for them went on ticking
 * for the rest of the day against a CLI that no longer existed. Forty agents of a review, launched an
 * hour before the switch, read afterwards as forty agents still at work.
 *
 * Silent when there was nothing running: a swap that cost nothing is not news, and a line in the feed
 * about it would appear on every account change in every idle tab.
 */
const applyProcessReplaced = (state: PanelState, now: number): PanelState => {
  if (!isRunningSomething(state)) return state

  const { items, startedAt } = closeUnfinished(state, now, { reason: 'restarted', tone: 'bad' }, 'none')

  return {
    ...state,
    startedAt,
    // The chips go, like they do on a process's death: a background command may well outlive the CLI
    // that started it (a dev server does not die with it), but the notifications about it came from
    // that CLI - so the panel says it has let go rather than showing a clock nobody is winding.
    background: [],
    seq: state.seq + 1,
    items: [
      ...letGoBackground(items, state.background, startedAt, now),
      {
        id: `meta-${state.seq}`,
        kind: 'meta',
        // Not the English marker its neighbours carry (see MetaItem.stats): that one travels to the IDE
        // to say "this turn was cut short, do not push about it", and no turn was cut short here.
        stats: [],
        outcome: { state: 'restarted' as const, duration: '' },
      },
    ],
  }
}

/** Whether anything in this tab is still counting - a call, an agent, a background command. */
const isRunningSomething = (state: PanelState): boolean =>
  state.background.length > 0 ||
  state.items.some((item) => (item.kind === 'task' || item.kind === 'toolGroup') && item.pending)

/**
 * A message's content as a list of blocks - however it arrived.
 *
 * A bare string instead of a list arrives with the summary after `/compact`, for instance, and the whole
 * panel used to break on it: the parsing called array methods on the content straight away. A string is
 * shown as text, as it is, while anything else unexpected silently counts as emptiness - an unfamiliar
 * event shape is no reason to lose the conversation.
 */
const blocksOf = (content: MessageContent | undefined): ContentBlock[] => {
  if (Array.isArray(content)) return content
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : []
  return []
}

/**
 * The limit statuses that mean all is well: the request went through. About those we stay silent - the
 * event arrives in ordinary life too, and the feed is not a subscription status report.
 */
const ALLOWED_RATE_LIMIT = new Set(['allowed', 'allowed_warning', 'ok'])

/**
 * What a limit event actually amounts to.
 *
 * A "rejected" status alone is not a stop, and reading it as one is what used to put a red error over
 * work that never paused (see LimitItem):
 *
 * - extra usage - the requests go through past the limit and are billed on top of the plan; the CLI
 *   itself checks these very flags before deciding that anything has halted;
 * - the grace period - the window is over, but the step under way is allowed to finish;
 * - a stale signal - its reset time has already passed, so it describes a window that no longer exists;
 *   the CLI throws such a one away, and a panel that does not would announce a limit that has reset.
 *
 * Whatever survives all three is a genuine stop until the window resets.
 *
 * The same three rules live once more on the plugin's side, where the usage rings and the phone's
 * notifications need them (see ClaudeRateLimit.kt): what is doubled is a rule of the CLI's, not of ours,
 * and neither side can read the other's language.
 */
const rateLimitState = (
  info: NonNullable<AgentRateLimitEvent['rate_limit_info']>,
  now: number,
): 'extra' | 'waiting' | null => {
  if (!info.status || ALLOWED_RATE_LIMIT.has(info.status.toLowerCase())) return null
  if (info.isUsingOverage || info.overageInUse) return 'extra'
  if (info.rateLimitGraceActive) return null
  // resetsAt arrives in seconds, as is customary in the CLI itself.
  if (info.resetsAt && info.resetsAt * 1000 <= now) return null

  return 'waiting'
}

/**
 * A real model - or nothing.
 *
 * Some messages are signed not with a model but with an internal mark in angle brackets: "<synthetic>",
 * for instance - the placeholder the CLI closes a turn interrupted by the person with. No model of that
 * name exists, and letting it through means declaring the conversation has moved to it: the panel would
 * name it in the bottom line and offer it as a separate row in the model list.
 */
const realModel = (model: string | undefined): string | undefined =>
  model && !model.startsWith('<') ? model : undefined

/**
 * The stream has named a model - remember it, and if it is not the one that was working, say so in the
 * feed.
 *
 * Comparison against the previous signature rather than against [PanelState.model]: that one holds a
 * choice ("fable", "default") until the agent has answered, and any first answer would look like a swap.
 * The first signature of all, then, changes nothing - there is nothing to compare it with, and the model
 * that a conversation simply starts on is not news.
 *
 * [reason] is the CLI's explanation when the swap arrived as an event of its own (see applyModelFallback)
 * and empty when it was noticed by the signature alone: in a past conversation's replay, for instance,
 * where only the messages are kept and the system event that explained the swap is not.
 */
const noteStreamModel = (state: PanelState, named: string, reason = '', replay = false): PanelState => {
  const previous = state.streamModel
  const moved = { ...state, model: named, streamModel: named }

  // sameModel rather than a string comparison: one model is signed differently from one answer to the
  // next - with a build date, with or without the window mark - and every such difference would otherwise
  // be announced as a swap (see modelKey in catalog.ts).
  if (!previous || sameModel(previous, named)) return moved

  return push(swapNoted(moved, previous, replay), (id) => ({ id, kind: 'model', from: previous, to: named, reason }))
}

/**
 * The swap remembered on the tab, so that the bottom line can wear its accent (see PanelState.switchedFrom).
 *
 * Not in a replay: there the swap is a page of a conversation's history rather than news, and the model
 * it ended on is simply the model this tab now works on. Marking it would light the accent on every
 * opening of any old chat where the agent once fell back.
 */
const swapNoted = (state: PanelState, previous: string, replay: boolean): PanelState =>
  replay ? state : { ...state, switchedFrom: previous }

const applyAgentEvent = (
  incoming: PanelState,
  event: AgentEvent,
  now: number,
  /** A past conversation's replay rather than a live turn - see PanelAction. */
  replay = false,
): PanelState => {
  // The first event after a chain of retries is the whole account of how it ended: its end has no event
  // of its own (see closeRetryFor).
  const state = closeRetryFor(incoming, event, now)

  switch (event.type) {
    case 'system':
      return applySystem(state, event, now, replay)

    /**
     * The subscription limit. The event arrives in ordinary life too - with a "let through" status - and
     * even a refusal does not always mean the work has stopped, so what lands in the feed is decided by
     * rateLimitState rather than by the status alone.
     *
     * One row per state per window: the CLI repeats the event on every turn while the state holds, and a
     * fresh "the limit is used up" under every answer would say nothing new. Two things do get a row of
     * their own, because both are news: a change of state (extra usage after a wait), and the same state
     * in the next window - the reset time tells them apart. Without that second check a limit used up
     * twice in one conversation would be announced once: the first row has taken itself away by then
     * (see LimitItem), and silence would be all that is left of the second.
     */
    case 'rate_limit_event': {
      const info = event.rate_limit_info
      if (!info) return state

      const limitState = rateLimitState(info, now)
      if (!limitState) return state

      const resetsAt = info.resetsAt ? info.resetsAt * 1000 : undefined
      const last = state.items.filter((item): item is LimitItem => item.kind === 'limit').at(-1)
      if (last?.state === limitState && last.resetsAt === resetsAt) return state

      return push(state, (id) => ({
        id,
        kind: 'limit',
        state: limitState,
        window: info.rateLimitType ?? '',
        ...(resetsAt ? { resetsAt } : {}),
      }))
    }

    // Along with the feed, everything describing the conversation that has gone is reset: the taken
    // context window, the usage, the unread errors, the task list. Otherwise the context meter would show
    // the previous percentage on an empty chat - that is, lie about the one thing /clear is usually called
    // for.
    case 'conversation_reset': {
      // A compaction may have been running at the very moment of the clear - it will never get its closing
      // event (compact_result/compact_boundary) now that the conversation being compacted has been wiped.
      // This is the same case finishCompacting exists for (see its comment about "the conversation was
      // killed"): not clearing the flag here means an empty status line for every following turn in this
      // tab.
      const uncompacted = finishCompacting(state)

      return {
        ...uncompacted,
        seq: uncompacted.seq + 1,
        sessionId: event.new_conversation_id ?? uncompacted.sessionId,
        usage: initialPanelState.usage,
        context: undefined,
        liveContextUsed: undefined,
        cost: 0,
        tasks: {},
        pendingTasks: {},
        streamingText: '',
        streamingId: undefined,
        streamingThinking: '',
        // The same reset of the turn's state as in case 'result': /clear closes the conversation
        // unconditionally, even a turn that has not reached its result yet (if the clear arrived while the
        // agent was still thinking, for instance). Without this "Claude is thinking" hung forever - there
        // was nobody left to wait for, now that the whole history that turn was answering has just been
        // wiped.
        status: 'idle',
        turnStartedAt: undefined,
        pausedMs: 0,
        waitStartedAt: undefined,
        stopRequestedAt: undefined,
        starting: false,
        items: [
          { id: `cleared-${state.seq}`, kind: 'checkpoint', chip: 'CLEAR', target: '', targetKey: 'cleared' },
        ],
      }
    }

    case 'stream_event': {
      const delta = event.event.delta
      if (event.event.type !== 'content_block_delta') return state
      // A subagent's text and its thinking do not flow into the main feed: it has a card of its own.
      if (event.parent_tool_use_id) return state

      if (delta?.type === 'text_delta') return appendStreamingText(state, delta.text ?? '')
      if (delta?.type === 'thinking_delta') {
        return { ...state, streamingThinking: state.streamingThinking + (delta.thinking ?? '') }
      }
      return state
    }

    case 'assistant': {
      // A subagent answers with a model of its own - not the one the conversation runs on.
      if (event.parent_tool_use_id) {
        return noteSubagent(state, event.parent_tool_use_id, blocksOf(event.message.content), replay)
      }

      /**
       * The model is taken from every answer rather than only from the system event at the session's
       * start: the agent can change it mid-conversation itself - that is how the guard that moves a turn
       * to another model fires. The signature under an answer is the one trace of such a swap that never
       * goes missing: the event announcing it is not kept in a transcript, so in a replay this is all
       * there is (see noteStreamModel - it is the one that puts the mark into the feed).
       */
      const named = realModel(event.message.model)
      const signed = named ? noteStreamModel(state, named, '', replay) : state
      // The window taken at this step - until the exact figure from the CLI arrives (see
      // liveContextUsed). Only for the main conversation: a subagent has gone off into its own branch
      // above, and its context has nothing to do with this window.
      //
      // And only for a live turn: in a past conversation's replay those same numbers speak of a step long
      // gone, and the window's size cannot be learned from it at all - on a "1M" model the estimate
      // divided by the ordinary two hundred thousand, and a conversation opened from the history looked
      // overflowing. The exact figure the IDE asks the CLI for separately (see PanelUsage.refreshContext).
      const liveContextUsed = replay
        ? signed.liveContextUsed
        : contextUsedOf(event.message.usage) ?? signed.liveContextUsed
      // The conversation has been answered - the start-up is over, and the next result closes a turn,
      // whatever it turns out to be (see starting and the "zero" turn above). The number of turns is no
      // measure here: placeholders from <synthetic> - a refusal about an unknown command, an answer
      // instead of a turn forbidden by a hook - arrive as a message in the feed, while the turn count
      // stays at zero.
      return applyAssistant(
        { ...signed, liveContextUsed, starting: false },
        blocksOf(event.message.content),
        now,
        replay,
        event.uuid,
      )
    }

    case 'user': {
      const blocks = blocksOf(event.message.content)
      // A task's own report about its end: in a replay this record is all that is left of it - the event
      // it arrives by in a live run is not kept anywhere (see applyReplayedTaskNotification).
      const noted = replay ? applyReplayedTaskNotification(state, blocks, now) : state
      // In a live conversation a person's message lands in the feed at the moment of sending (see
      // 'prompt'), and the same thing out of the stream would double it. In a replay there was nobody to
      // put it there: that record is the only trace that the person said anything at all, and without it
      // a past conversation's feed consisted of answers alone.
      const withPrompt = replay ? addReplayedPrompt(noted, event, now) : noted
      return applyToolResults(withPrompt, blocks, now, replay)
    }

    case 'result': {
      // A conversation that has just come up the CLI closes with a "zero" turn: right after system/init a
      // result arrives holding zero turns and no answer. That was not a turn - the agent had not even got
      // to the person's message yet.
      //
      // It shows most clearly on a fork: there the process comes up together with the first message, and
      // the panel cleared its spinner by that result and captioned the turn "Worked 0.1s", although the
      // agent was only beginning to think. From outside it looked as though the send had not caught - and
      // the person sent the next message, which the CLI honestly queued behind the first.
      //
      // Only right after the start-up (see starting): a turn that genuinely ended with nothing has to
      // clear the spinner like any other.
      //
      // And only while the result is empty. The CLI puts zero turns where a turn did happen but it chose
      // not to carry it out: an unknown slash command (including a command of an MCP server that did not
      // come up this time) is closed with an "Unknown command: …" answer - a placeholder from <synthetic>,
      // without any request to the model and therefore without turns. Swallow such a result, and nobody
      // will close the turn: "Claude is thinking" with a running counter hangs for the rest of the tab's
      // life. Text in the result is the sure sign that this turn was answered.
      //
      // The conversation's identifier is still taken from here: a fork has a new one, and without it the
      // conversation cannot be continued afterwards.
      if (
        state.starting &&
        event.num_turns === 0 &&
        !event.is_error &&
        !event.result &&
        state.stopRequestedAt === undefined
      ) {
        return { ...state, starting: false, sessionId: event.session_id ?? state.sessionId }
      }

      // When a turn called several tools in a row inside itself (num_turns > 1), the top-level usage
      // fields are a SUM over every internal step: that suits the overall usage counter below, but as "how
      // much of the context window is taken now" it gives a figure many times too high. The real snapshot
      // of the current state is in the last step of iterations; with one step it coincides with usage
      // anyway.
      //
      // Not from a replay, for the same reason liveContextUsed is not taken from one: those figures
      // belong to a turn that ended long ago, and the meter reads them as "how full the window is now".
      // A day-long conversation opened from the history therefore came up with a red 100% - its last
      // turn's cached tokens against the fallback window - until the IDE's own answer arrived (see
      // INIT_MARKER in ClaudeSessionHub). Left alone, the meter stays quiet until that answer.
      const usage = replay ? state.usage : mergeUsage(state.usage, contextSnapshot(event))
      // An interruption does not tear the stream with an event of its own - the agent simply closes the
      // turn with an ordinary result a little before its time (see ClaudeSession.interrupt). The only
      // trace that this is not a natural end but a Stop/Escape is that the stop request is still standing
      // uncleared at this moment.
      const cancelled = state.stopRequestedAt !== undefined || state.stoppedForAccount === true
      const outcome = resultOutcome(event, cancelled, state.stoppedForAccount === true)
      const stats = resultStats(outcome)

      // The refusal goes into the feed BEFORE the turn's result: it happened earlier, and "Worked 3s"
      // under it reads as the end of this very turn rather than of the next one.
      const withError = finishCompacting(
        event.is_error && event.result ? addError(state, event.result) : state,
      )

      /**
       * The turn has ended - which means every tool call of its own has ended with it. An interrupted turn
       * throws a call away right in the middle of its work (Stop arrives while something is running -
       * otherwise there would be nothing to interrupt), and without this its card stayed "running" forever
       * with a live counter: the turn below has long been captioned "Stopped by you" while the work looks
       * as though it is still going. The same closes calls whose result never reached the panel.
       *
       * Subagents are not calls: a turn that ended by itself could not have been waiting for any of them
       * (had it been, it would not have ended), so the ones still working are not touched at all and their
       * chips stay in the header until their own notifications. An interrupted turn is another matter:
       * what it stood for was broken off with it (see keepTasks in closeUnfinished).
       */
      const { items: settled, startedAt } = closeUnfinished(
        withError,
        now,
        cancelled
          ? {
              reason: 'stopped' as const,
              tone: 'bad',
            }
          : {
              reason: 'turnEnded' as const,
              tone: 'bad',
            },
        // The same rule as the silent stop above: a move takes the process down with everything on it.
        !cancelled ? 'all' : state.stoppedForAccount === true ? 'none' : 'background',
      )

      return {
        ...withError,
        startedAt,
        status: 'idle',
        streamingText: '',
        streamingId: undefined,
        streamingThinking: '',
        stopRequestedAt: undefined,
        stoppedForAccount: undefined,
        // The turn ended here and now with a real result - we do not wait for a separate status:'idle'
        // from the backend to clear turnStartedAt: until it arrived the setInterval in App.tsx would tick
        // for nothing a while longer.
        turnStartedAt: undefined,
        pausedMs: 0,
        waitStartedAt: undefined,
        starting: false,
        usage,
        cost: event.total_cost_usd ?? state.cost,
        sessionId: event.session_id ?? state.sessionId,
        seq: withError.seq + 1,
        suppressNextMeta: false,
        items: state.suppressNextMeta
          ? settled
          : [...settled, { id: `meta-${withError.seq}`, kind: 'meta', stats, outcome }],
      }
    }

    default:
      return state
  }
}

/**
 * The system events by which the CLI announces that it has moved the conversation to another model on its
 * own: safeguards that flagged the message (`model_refusal_fallback`) and a model that needs credits or a
 * consent nobody gave (`model_consent_fallback`). Both hold the swap for the whole session, not for one
 * request.
 */
const MODEL_FALLBACK_SUBTYPES = ['model_refusal_fallback', 'model_consent_fallback']

/**
 * The swap, announced by the CLI itself - with the reason, in its own words.
 *
 * It is the same card the signature under an answer would produce a moment later (see noteStreamModel);
 * putting it here is worth it for the one thing the signature cannot carry - why. Being first, it also
 * takes the swap off the signature's hands: from here on the new model is the one the stream last named,
 * and the answers that follow add nothing.
 *
 * Without the model it moved to there is nothing to draw at all: the state is left as it was, and the
 * swap is noticed by the next answer's signature - a card that names no model explains less than none.
 */
const applyModelFallback = (state: PanelState, event: AgentSystemEvent, replay: boolean): PanelState => {
  const to = realModel(event.fallbackModel)
  if (!to) return state

  const from = realModel(event.originalModel) ?? state.streamModel
  const moved: PanelState = { ...state, model: to, streamModel: to }
  if (from === to) return moved

  return push(from ? swapNoted(moved, from, replay) : moved, (id) => ({
    id,
    kind: 'model',
    from,
    to,
    reason: (event.content ?? '').trim(),
  }))
}

const applySystem = (
  state: PanelState,
  event: AgentSystemEvent,
  now: number,
  /** A past conversation's replay rather than a live turn - see applyAgentEvent. */
  replay = false,
): PanelState => {
  const isMainStreamEvent = event.task_id === undefined

  // Only the main stream's events speak about the conversation's model: a subagent comes up with a model
  // of its own, and its start-up used to be enough to rewrite the name in the bottom line - the panel then
  // named someone else's model as the one the talk was running on.
  const named = isMainStreamEvent ? realModel(event.model) : undefined
  const signed = named ? noteStreamModel(state, named, '', replay) : state

  const base: PanelState = {
    ...signed,
    sessionId: event.session_id ?? signed.sessionId,
    permissionMode: event.permissionMode ? normalizeMode(event.permissionMode) : signed.permissionMode,
    slashCommands: event.slash_commands ?? signed.slashCommands,
    // The working directory the agent reports itself; without it the paths in the cards stay full and do
    // not fit the panel.
    project: event.cwd
      ? { name: signed.project?.name ?? '', ...signed.project, workingDirectory: event.cwd }
      : signed.project,
    // A task_id means a particular subagent is compacting rather than the main stream; its own timer in
    // the agent's tab (see AgentStreamView) ticks honestly through the whole compaction without this
    // flag, while the main status line must not go dark because of what is happening in someone else's,
    // parallel stream.
    compacting: event.status === 'compacting' && isMainStreamEvent ? true : signed.compacting,
    // The process has come up: the "zero" turn result that follows is about the start-up itself rather
    // than about the agent's work (see case 'result').
    starting: event.subtype === 'init' ? true : signed.starting,
  }

  // The request failed and will go again after a pause - the only thing happening in the conversation
  // while that pause lasts (see applyApiRetry).
  if (event.subtype === 'api_retry') return applyApiRetry(base, event, now)

  // The CLI moved the conversation to another model by itself - the one event that says so out loud, and
  // with a reason (see applyModelFallback).
  if (isMainStreamEvent && MODEL_FALLBACK_SUBTYPES.includes(event.subtype)) {
    return applyModelFallback(base, event, replay)
  }

  // The CONTEXT card itself has to be visible before the finished result - otherwise the only trace that
  // anything is happening is the shimmering status line, which does not stay in the history (see the
  // complaint this was started over). Only for the main stream: the card has no owner by task_id, and a
  // subagent has no need of it at all - its compaction is visible from the ticking timer in its own tab.
  if (isMainStreamEvent && event.status === 'compacting' && !state.compacting) {
    return {
      ...base,
      seq: base.seq + 1,
      items: [
        ...base.items,
        {
          id: `compact-${base.seq}`,
          kind: 'compact',
          target: '',
          outcome: { state: 'running' },
          pending: true,
          // The clock of the machine the IDE runs on, and the moment the CLI announced the compaction -
          // in a feed restored from the journal that is the real start rather than "just now".
          startedAt: now,
        },
      ],
    }
  }

  // The outcome of a compaction attempt arrives as a separate status line rather than a compact_boundary
  // when there turned out to be nothing to compact - the pending card would then stay half-drawn unless
  // it is removed right here, outright.
  if (isMainStreamEvent && event.compact_result !== undefined) {
    const finished = finishCompacting(base)

    return event.compact_result === 'failed' && event.compact_error
      ? addError(finished, event.compact_error)
      : finished
  }

  if (isMainStreamEvent && event.subtype === 'compact_boundary') {
    const outcome = compactOutcome(event.compact_metadata)
    // The boundary is the compaction's end: from here on the card stands in the feed with its figures,
    // and the status line speaks about the turn again.
    const done = { ...base, compacting: false }
    // While a compaction runs nothing else arrives in the feed (the context is being rewritten at that
    // very moment) - the pending card, if there is one, is always the last.
    const last = done.items.at(-1)

    if (last?.kind === 'compact' && last.pending) {
      return { ...done, items: [...done.items.slice(0, -1), { ...last, outcome, pending: false }] }
    }

    return {
      ...done,
      seq: done.seq + 1,
      items: [
        ...done.items,
        { id: `compact-${done.seq}`, kind: 'compact', target: '', outcome, pending: false, startedAt: now },
      ],
    }
  }

  if (event.subtype === 'task_started' && event.task_id) return applyTaskStarted(base, event, now)
  if (event.subtype === 'task_progress' && event.task_id) return applyTaskProgress(base, event)
  if (event.subtype === 'task_notification' && event.task_id) return applyTaskNotification(base, event, now)

  return base
}

/**
 * The placeholder the CLI closes a turn with when there is no real answer (after a local command such as
 * /clear, for instance - it calls no model). The one sign that tells it from a real answer is that it
 * arrives alone, without a single other block.
 */
const isNoContentPlaceholder = (blocks: ContentBlock[]): boolean => {
  if (blocks.length !== 1) return false
  const block = blocks[0]!
  return block.type === 'text' && block.text.trim() === '(no content)'
}

/** Whether this same text has already been shown as an error in the current turn - then repeating it serves nothing. */
const alreadyShownAsError = (state: PanelState, text: string): boolean => {
  const turnStart = state.items.map((item) => item.kind).lastIndexOf('user') + 1
  const message = text.trim()

  return state.items
    .slice(turnStart)
    .some((item) => item.kind === 'error' && item.message.trim() === message)
}

/**
 * The agent's answer as a card in the feed.
 *
 * `id` is the number the printing card had already taken: the same answer, only whole, keeps it rather
 * than appearing beside itself. Nothing was printing (a local command's output, for instance, appears at
 * once and whole) - the card takes the next number like any other.
 */
const addAnswer = (state: PanelState, id: string | undefined, text: string, uuid?: string): PanelState => {
  const paragraphs = parseParagraphs(text)
  const item: TextItem = { id: id ?? '', kind: 'text', paragraphs, source: text, ...(uuid ? { uuid } : {}) }

  return id
    ? { ...state, items: [...state.items, item] }
    : push(state, (itemId) => ({ ...item, id: itemId }))
}

const applyAssistant = (
  state: PanelState,
  blocks: ContentBlock[],
  now: number,
  /** A past conversation's replay rather than a live turn - see applyAgentEvent. */
  replay = false,
  /** The transcript's name for this answer, kept on its text so a search can jump to it (see TextItem.uuid). */
  uuid?: string,
): PanelState => {
  if (isNoContentPlaceholder(blocks)) {
    return { ...state, streamingText: '', streamingId: undefined, suppressNextMeta: true }
  }

  let next: PanelState = { ...state, streamingText: '', streamingThinking: '' }
  // The number taken by the printing card goes to the first text block - it is the same answer, only
  // whole. The remaining blocks take numbers as usual, and if there turned out to be no text in the
  // message at all, the taken number is simply lost: a gap in the numbering troubles nobody, while a
  // repeat would break the keys in the feed.
  let reserved = state.streamingId
  next = { ...next, streamingId: undefined }

  for (const block of blocks) {
    if (block.type === 'text') {
      // An answer that begins with a service block the model has printed back at itself: what is shown is
      // what it said after that block, if it said anything at all (see spokenAnswer).
      const said = spokenAnswer(block.text)
      if (!said.trim()) continue
      // The same text already stands in the feed as a red slab - a second time, as an ordinary answer, it
      // adds nothing. That is how a failed compaction arrives: the CLI reports it both as a separate event
      // and as the agent's message, word for word.
      if (alreadyShownAsError(next, said)) continue

      /**
       * A code review's findings are a card of their own rather than the wall of JSON they arrive in:
       * `/code-review` is run by the CLI itself, and in streaming mode its whole outcome comes back as an
       * ordinary answer with a fenced block inside (see readReview). Whatever was said around the block
       * stays the answer it was, and stands above the card.
       */
      const review = readReview(said)
      const id = reserved
      reserved = undefined

      if (review) {
        if (review.intro) next = addAnswer(next, id, review.intro, uuid)
        next = push(next, (itemId) => ({ id: itemId, kind: 'findings', findings: review.findings }))
        continue
      }

      next = addAnswer(next, id, said, uuid)
      continue
    }

    // A card of its own rather than a line in the neighbouring group of calls: there it drowns in the
    // first collapsed "N tools" and is invisible until the group is expanded.
    if (block.type === 'thinking') {
      if (!block.thinking.trim()) continue
      next = addThought(next, block.thinking.trim())
      continue
    }

    if (block.type === 'tool_use') {
      next = applyToolUse(next, block, now, replay)
    }
  }

  return next
}

/**
 * The thought the next ones accumulate into: the last thought card of this piece of the turn. A piece
 * ends where the agent spoke for itself - with an ordinary answer or with a plan - and from then on it
 * thinks about something else, which deserves a card of its own.
 *
 * Tool calls deliberately do not break a piece: between them the model thinks almost always, and that is
 * exactly the case the thoughts are gathered together for.
 */
export const openThought = (items: FeedItem[]): number => {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!
    if (item.kind === 'think') return index
    if (item.kind === 'user' || item.kind === 'text' || item.kind === 'plan') return -1
  }

  return -1
}

/**
 * A thought goes into this piece of the turn's open card rather than as a separate line at the end of the
 * feed. That is also why the calls around it stay one group: what stands last in the feed is still their
 * group rather than a thought wedged between them.
 */
const addThought = (state: PanelState, thought: string): PanelState => {
  const index = openThought(state.items)
  if (index < 0) return push(state, (id) => ({ id, kind: 'think', thoughts: [thought], pending: false }))

  const card = state.items[index] as ThinkItem
  const items = [...state.items]
  items[index] = { ...card, thoughts: [...card.thoughts, thought] }

  return { ...state, items }
}

/**
 * Consecutive calls of ordinary tools fold into one group until something else interrupts them (text, a
 * todo, a plan, a question, a subagent's task). Between the internal steps of one agent turn a group may
 * briefly resolve entirely and immediately continue with the next call without a single text block
 * between them - that is the very unbroken "burst" of calls that should stay one group. So we look only
 * at what the feed's last item was rather than at its pending. The group's own pending, meanwhile, is
 * honestly derived from its children rather than set blindly: the model's thinking, for instance, is
 * added already resolved - if a group became pending again from the mere fact of an addition, there would
 * be nobody left to resolve it back.
 */
const appendToolCall = (state: PanelState, tool: ToolItem, now: number): PanelState => {
  const last = state.items.at(-1)

  /**
   * An edit is never folded in with its neighbours: it neither joins the group in front of it nor lets
   * the next call join it, so it stands as a row of its own with its diff open (see ToolCard).
   *
   * It is the one call a person has to see whether they were looking for it or not - it changes their
   * files. Folded into a burst of reads and greps it ended up behind two closed carets, the group's and
   * the card's, and a wrong edit went past unnoticed, which is the whole reason for watching an agent
   * work. Which tools those are is asked of one place (see isEditTool).
   */
  const alone = isEditTool(tool.toolName)

  if (!alone && last?.kind === 'toolGroup' && !isEditTool(last.tools.at(-1)?.toolName ?? '')) {
    const tools = [...last.tools, tool]
    const group: ToolGroupItem = { ...last, tools, pending: tools.some((t) => t.pending) }
    return {
      ...state,
      startedAt: tool.pending ? { ...state.startedAt, [tool.id]: now } : state.startedAt,
      items: [...state.items.slice(0, -1), group],
    }
  }

  const group: ToolGroupItem = {
    id: `g-${tool.id}`,
    kind: 'toolGroup',
    tools: [tool],
    pending: tool.pending,
    duration: '',
    startedAt: now,
  }
  return {
    ...state,
    startedAt: tool.pending ? { ...state.startedAt, [tool.id]: now } : state.startedAt,
    items: [...state.items, group],
  }
}

const applyToolUse = (
  state: PanelState,
  block: ToolUseBlock,
  now: number,
  /** A past conversation's replay rather than a live turn - see applyAgentEvent. */
  replay = false,
): PanelState => {
  const input = (block.input ?? {}) as Record<string, unknown>
  const workingDirectory = state.project?.workingDirectory ?? ''

  if (block.name === 'TodoWrite') {
    return {
      ...state,
      items: [...state.items, { id: block.id, kind: 'todo', todos: readTodos(input), ...(replay ? { replayed: true } : {}) }],
    }
  }

  // This version of the CLI leads its task list not through TodoWrite (one call carrying the whole list)
  // but through separate TaskCreate/TaskUpdate calls - see the pendingTasks type. A task's appearance in
  // the panel is deferred until the TaskCreate answer (see applyTaskCreated): before that there is
  // nothing to show - the number TaskUpdate will recognise it by is known only from there.
  if (block.name === 'TaskCreate') {
    const subject = typeof input.subject === 'string' ? input.subject : ''
    if (!subject) return state
    const activeForm = typeof input.activeForm === 'string' ? input.activeForm : ''
    return {
      ...state,
      pendingTasks: { ...state.pendingTasks, [block.id]: { subject, activeForm: activeForm || undefined } },
    }
  }

  if (block.name === 'TaskUpdate') {
    const taskId = typeof input.taskId === 'string' ? input.taskId : ''
    const existing = state.tasks[taskId]
    // The task is not from our list (it belongs to a background agent, for instance) - and there is
    // nothing to touch.
    if (!existing) return state

    if (input.status === 'deleted') {
      const { [taskId]: _removed, ...tasks } = state.tasks
      return push(
        { ...state, tasks },
        (id) => ({ id, kind: 'todo', todos: orderedTasks(tasks), ...(replay ? { replayed: true } : {}) }),
      )
    }

    const subject = typeof input.subject === 'string' ? input.subject : existing.text
    const activeForm = typeof input.activeForm === 'string' ? input.activeForm : ''
    const tasks = {
      ...state.tasks,
      [taskId]: {
        ...existing,
        text: subject,
        state: taskState(input.status, existing.state),
        activeForm: activeForm || existing.activeForm,
      },
    }
    return push({ ...state, tasks }, (id) => ({ id, kind: 'todo', todos: orderedTasks(tasks), ...(replay ? { replayed: true } : {}) }))
  }

  if (block.name === 'ExitPlanMode') {
    const paragraphs = readPlan(input)
    const steps = paragraphs.filter((paragraph) => paragraph.bullet && (paragraph.depth ?? 0) === 0).length

    return {
      ...state,
      items: [
        ...state.items,
        {
          id: block.id,
          kind: 'plan',
          // Steps are the top-level items - the same thing a person counts by eye; nested clarifications
          // do not sound like steps of their own. The number alone: the card says it in its own words.
          steps,
          duration: '',
          paragraphs,
          // A plan out of a replay waits for no decision - see PlanItem.historic.
          historic: replay,
        },
      ],
    }
  }

  if (block.name === 'AskUserQuestion') {
    const questions = readQuestions(input)
    // Without a single question there is nothing to block with and nothing to show - and a card without
    // questions cannot even be closed (there is nothing to answer), it would hang.
    if (questions.length === 0) return state

    return {
      ...state,
      items: [
        ...state.items,
        {
          id: block.id,
          kind: 'ask',
          questions,
          // A question out of a replay holds nothing: the turn that asked it ended some time in the past
          // (see AskItem.historic).
          historic: replay,
        },
      ],
    }
  }

/**
 * How much of a subagent's errand the card keeps.
 *
 * A prompt is written for a machine and runs to whatever length the model felt like: the card shows it
 * whole up to here and says nothing beyond, because the state of the feed is copied on every repaint and
 * a fleet of agents carrying ten kilobytes of instructions each is paid for on every one of them. What is
 * cut is the tail of the instructions - the errand itself always stands at the front.
 */
const TASK_PROMPT_CHARS = 4000

const taskPrompt = (input: Record<string, unknown>): string => {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (prompt.length <= TASK_PROMPT_CHARS) return prompt

  return `${prompt.slice(0, TASK_PROMPT_CHARS)}…`
}

  if (block.name === 'Task' || block.name === 'Agent' || block.name === 'Workflow') {
    /**
     * A workflow is a fleet rather than a subagent and has no subagent_type at all - the same name the
     * system event gives it (see applyTaskStarted), so that the two roads to one card agree.
     *
     * It goes through this branch rather than becoming an ordinary tool card because its end never comes
     * as a tool result: it arrives as a task notification, into the task's card. Left as a tool call, the
     * launch stood in the feed marked "unfinished" for ever, beside the card that did have the answer.
     */
    const subagent =
      block.name === 'Workflow'
        ? 'workflow'
        : typeof input.subagent_type === 'string'
          ? input.subagent_type
          : 'general'
    const prompt = taskPrompt(input)
    /**
     * A card for this subagent has already been created by the task_started system event - it arrives
     * before the tool_use block when the subagent is raised not by the turn but by a skill. There must be
     * no second card (see taskCards): we refine the one that exists - the call's input holds a fuller
     * description than the event.
     */
    const known = state.taskByToolUseId[block.id]
    if (known) {
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind === 'task' && item.id === known
            ? {
                ...item,
                target: subagent,
                meta: targetFor(block.name, input, workingDirectory),
                // The card the system event made knows the errand in one line at best - the call is the
                // only place the whole of it is ever said.
                prompt: prompt || item.prompt,
              }
            : item,
        ),
      }
    }

    return {
      ...state,
      startedAt: { ...state.startedAt, [block.id]: now },
      items: [
        ...state.items,
        {
          id: block.id,
          kind: 'task',
          target: subagent,
          meta: targetFor(block.name, input, workingDirectory),
          prompt,
          duration: '',
          percent: 0,
          log: [],
          pending: true,
        },
      ],
    }
  }

  const tool: ToolItem = {
    id: block.id,
    kind: 'tool',
    chip: chipFor(block.name),
    toolName: block.name,
    input,
    target: targetFor(block.name, input, workingDirectory),
    meta: { kind: 'none' },
    duration: '',
    detail: [],
    hunks: [],
    isError: false,
    pending: true,
  }

  return appendToolCall(state, tool, now)
}

/**
 * A Task/Agent call in background mode (the default) answers with this text at once, without waiting for
 * the subagent - it is a confirmation of the launch rather than the outcome of its work. The real end is
 * brought later by a separate task_notification event (see below). Taking this confirmation for a result,
 * the card would close instantly - the agent had not even begun while the chip in the header went out as
 * though it had finished.
 *
 * A Workflow answers the same way since CLI 2.1.257, in its own words: "Workflow launched in background.
 * Task ID: …" - and then runs its fleet for ten minutes as a background task, reporting through
 * task_progress and ending with a task_notification (recorded against that CLI). Read as a result, the
 * launch closed the card at 0.0s, the chip went out with it, and an orchestration of a dozen agents was
 * nowhere on screen while it worked - exactly the complaint that brought this line here.
 */
const ASYNC_AGENT_LAUNCHED = /^(Async agent launched successfully|Workflow launched in background)/

/** The tags a service block is written with - the opening ones are needed on their own in spokenAnswer. */
const SERVICE_TAGS = [
  'system-reminder',
  'local-command-caveat',
  'local-command-stdout',
  'command-message',
  'task-notification',
] as const

/**
 * The internal things the CLI puts into a person's message in their own words: a reminder to itself, the
 * preamble about local commands and their output, the notification about a task that has ended. In a past
 * conversation's feed that would look like something the person said - a background command reported
 * itself in the middle of the talk with a wall of markup signed with the person's name and time.
 *
 * The notification is not merely dropped: before this it goes into the card of the task it speaks about
 * (see applyReplayedTaskNotification).
 */
const SERVICE_BLOCK = new RegExp(`<(${SERVICE_TAGS.join('|')})>[\\s\\S]*?</\\1>`, 'g')

/**
 * The wrapper of closing tags a model invents around such a block: it prints the block as though it were
 * the result of a call, and the invented end of that result stays in the answer.
 */
const STRAY_CLOSERS = /^(?:\s*<\/(?:antml:)?(?:parameter|invoke|function_calls|function_results)>)+/
const INVENTED_END = /<\/(?:antml:)?function_results>/

/** The answer that stood after a service block, with the invented wrapper taken off its front. */
const spokenTail = (rest: string): string => rest.replace(STRAY_CLOSERS, '').trimStart()

/**
 * What the agent said, out of an answer that begins with a service block.
 *
 * This is neither the panel's doing nor the CLI's: handed a reminder that a background agent has finished,
 * the model sometimes prints the reminder back as its own answer - the reminder itself, the subagent's
 * whole report inside it, the invented wrapper above, and only after all that the one sentence it meant to
 * say. In the feed it reads as a broken panel, although the panel showed honestly what came to it.
 *
 * Only the beginning of an answer and only once. In the middle of an answer the same tag is the agent
 * talking about it - explaining what a reminder is, quoting one in an example - and cutting there would
 * eat the conversation instead of the noise.
 *
 * An unclosed block is the usual shape of this - the model opens the tag and never closes it - so the
 * invented wrapper serves as the second boundary: what stands after it is the answer. With neither
 * boundary the whole message is service text, and there is nothing to show at all.
 */
export const spokenAnswer = (text: string): string => {
  const started = text.trimStart()
  if (!started.startsWith('<')) return text

  const opened = SERVICE_TAGS.find((tag) => started.startsWith(`<${tag}>`))
  // A tag that has only half arrived: the answer is printed as it streams, and without this the wall
  // shows itself for a frame - and then the printing card is handed a text that has grown shorter, which
  // the even stream it is printed by does not expect (see useSmoothStream in Feed).
  if (!opened) return SERVICE_TAGS.some((tag) => `<${tag}>`.startsWith(started)) ? '' : text

  const closing = `</${opened}>`
  const closed = started.indexOf(closing)
  if (closed >= 0) return spokenTail(started.slice(closed + closing.length))

  const invented = INVENTED_END.exec(started)
  return invented ? spokenTail(started.slice(invented.index + invented[0].length)) : ''
}

/** A slash command lies in a transcript as markup rather than as the string "/deploy 0.7.11". */
const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/

/** The CLI's mark about a stop - not a message: the interrupted turn itself speaks about that. */
const INTERRUPTED = '[Request interrupted by user]'

/**
 * What in a past conversation's record was a real message from the person. Empty means there is nothing
 * to show: the whole record is internal.
 */
const replayedPromptText = (blocks: ContentBlock[]): string => {
  const text = blocks
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()

  const name = text.match(COMMAND_NAME)?.[1]?.trim()
  if (name) {
    const args = text.match(COMMAND_ARGS)?.[1]?.trim()
    return args ? `${name} ${args}` : name
  }

  const spoken = text.replace(SERVICE_BLOCK, '').trim()
  return spoken === INTERRUPTED ? '' : spoken
}

/**
 * What the agent has already said in this conversation - what tells a quotation of its words from a
 * sentence somebody merely put in quotation marks (see replayedMessage).
 *
 * The last few answers rather than all of them: a quote is picked up from what is on screen, which is
 * to say from the recent part of the talk, and scanning a whole day's answers on every replayed message
 * would be work for nothing.
 */
const QUOTABLE_ANSWERS = 40

const agentAnswers = (state: PanelState): string[] =>
  state.items
    .filter((item): item is TextItem => item.kind === 'text')
    .slice(-QUOTABLE_ANSWERS)
    .map((item) => item.source)

/**
 * A person's message out of a past conversation's replay.
 *
 * A live conversation puts it into the feed itself, when the person presses Send - in a replay this is
 * its only trace, and without it a conversation opened from the history consisted of answers alone, as
 * though nobody had asked for any of it.
 */
const addReplayedPrompt = (
  state: PanelState,
  event: Extract<AgentEvent, { type: 'user' }>,
  now: number,
): PanelState => {
  // A record written by the CLI rather than the person, and a message of a nested stream: a subagent is
  // written to by the turn rather than by the person, and its correspondence has nothing to do with this
  // feed.
  if (event.isMeta || event.parent_tool_use_id) return state

  const text = replayedPromptText(blocksOf(event.message.content))
  if (!text) return state

  // The time is taken from when it was said: in a replay "now" is the moment the tab was opened, and the
  // whole past conversation would look like today's.
  const said = Date.parse(event.timestamp ?? '')

  // Back into the pieces it was sent as - a file, an image, a quote of the agent's words - rather than
  // as the one string a transcript keeps (see replayed.ts). Without it a conversation opened from the
  // history read as a wall of paths and quotation marks where at the desk it had been a line of chips.
  const { tokens, quotes } = replayedMessage(text, agentAnswers(state))

  return push(state, (id) => ({
    id,
    kind: 'user',
    time: formatClock(Number.isNaN(said) ? now : said),
    tokens: tokens.length > 0 ? tokens : [{ kind: 'text', value: text }],
    quotes,
    // The transcript's name for the line, so a search hit on it can be found in the feed (see rowOf).
    ...(event.uuid ? { uuid: event.uuid } : {}),
  }))
}

const applyToolResults = (
  state: PanelState,
  blocks: ContentBlock[],
  now: number,
  /** A past conversation's replay rather than a live turn - see applyAgentEvent. */
  replay = false,
): PanelState => {
  const results = blocks.filter((block): block is ToolResultBlock => block.type === 'tool_result')
  if (results.length === 0) return state

  const startedAt = { ...state.startedAt }

  const resolveTool = (item: ToolItem): ToolItem => {
    const result = results.find((candidate) => candidate.tool_use_id === item.id)
    if (!result) return item

    const started = state.startedAt[item.id]
    const duration = started ? formatDuration(now - started) : ''
    delete startedAt[item.id]

    const text = resultToText(result.content)
    const isError = result.is_error === true
    const hunks = hunksFor(item.id, item.toolName, item.input, text, isError)

    return {
      ...item,
      pending: false,
      isError,
      duration,
      meta: metaFor(item.toolName, item.input, text, isError),
      // With a diff we do not show the tool's raw answer: it repeats the same thing with lines like "the
      // file was updated" and a piece of code around the edit.
      detail: hunks.length > 0 ? [] : detailFor(text),
      hunks,
    }
  }

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      // A subagent's card lives either under the call's id or under a system event's task_id - whichever
      // came first (see taskByToolUseId).
      const result = results.find(
        (candidate) => (state.taskByToolUseId[candidate.tool_use_id] ?? candidate.tool_use_id) === item.id,
      )
      if (!result) return item

      const text = resultToText(result.content)
      // Not the outcome yet - merely a confirmation that a background subagent has started. We wait for
      // its real end through task_notification rather than putting the card out on the CLI's first word.
      // We also mark it background along the way: the turn's end does not close such a card (see
      // closeUnfinished), its outcome notification arrives after it.
      if (ASYNC_AGENT_LAUNCHED.test(text)) return item.background ? item : { ...item, background: true }

      const started = state.startedAt[item.id]
      const duration = started ? formatDuration(now - started) : ''
      delete startedAt[item.id]

      const isError = result.is_error === true
      const tone = isError ? ('bad' as const) : ('ok' as const)
      return {
        ...item,
        pending: false,
        percent: 100,
        duration,
        outcome: isError ? ('failed' as const) : ('ok' as const),
        log: appendAgentLog(item.log, detailFor(text).map((line): DetailLine => ({ ...line, tone }))),
      }
    }

    if (item.kind !== 'toolGroup') return item

    const tools = item.tools.map(resolveTool)
    const pending = tools.some((tool) => tool.pending)

    if (item.pending && !pending) {
      return { ...item, tools, pending, duration: formatDuration(now - item.startedAt) }
    }

    return { ...item, tools, pending }
  })

  return applyTaskCreated({ ...state, items, startedAt }, results, replay)
}

/** "Task #3 created successfully: …" - the only place TaskCreate names the number it assigned. */
const TASK_CREATED = /^Task #(\d+) created successfully/

/**
 * Appends the tasks whose TaskCreate has just been confirmed to the list - under the very number
 * TaskUpdate will call them by. When the number could not be recognised (the answer's wording will change
 * one day - we have no power over the tool's words), the task is left as it is, neither shown nor
 * breaking the rest of the list: a missing line is better than the whole list with mixed-up numbers.
 */
const applyTaskCreated = (state: PanelState, results: ToolResultBlock[], replay: boolean): PanelState => {
  const pendingIds = Object.keys(state.pendingTasks).filter((id) => results.some((r) => r.tool_use_id === id))
  if (pendingIds.length === 0) return state

  const pendingTasks = { ...state.pendingTasks }
  const tasks = { ...state.tasks }

  for (const toolUseId of pendingIds) {
    const created = pendingTasks[toolUseId]
    delete pendingTasks[toolUseId]

    const result = results.find((r) => r.tool_use_id === toolUseId)
    const match = TASK_CREATED.exec(resultToText(result?.content).trim())
    if (!match) continue

    tasks[match[1]!] = {
      id: `task-${match[1]}`,
      text: created?.subject ?? '',
      state: 'todo',
      activeForm: created?.activeForm,
    }
  }

  return push({ ...state, tasks, pendingTasks }, (id) => ({
    id,
    kind: 'todo',
    todos: orderedTasks(tasks),
    ...(replay ? { replayed: true } : {}),
  }))
}

/** pending/in_progress/completed - the same state dictionary TodoWrite has. */
const taskState = (status: unknown, fallback: TodoEntry['state']): TodoEntry['state'] => {
  if (status === 'completed') return 'done'
  if (status === 'in_progress') return 'active'
  if (status === 'pending') return 'todo'
  return fallback
}

/** By the task's number, as TaskCreate assigns them - not by the order of the last edit. */
const orderedTasks = (tasks: Record<string, TodoEntry>): TodoEntry[] =>
  Object.keys(tasks)
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => tasks[id]!)

// --- Small things -----------------------------------------------------------

/**
 * A chunk of a printing answer. Along with the first chunk we take a number in the feed as well - the
 * answer will later lie under it as a finished block (see streamingId).
 */
const appendStreamingText = (state: PanelState, text: string): PanelState => {
  if (!text) return state
  if (state.streamingId) return { ...state, streamingText: state.streamingText + text }

  return { ...state, streamingText: state.streamingText + text, streamingId: `i-${state.seq}`, seq: state.seq + 1 }
}

const mergeUsage = (current: Required<AgentUsage>, incoming?: AgentUsage): Required<AgentUsage> => ({
  input_tokens: incoming?.input_tokens ?? current.input_tokens,
  output_tokens: incoming?.output_tokens ?? current.output_tokens,
  cache_read_input_tokens: incoming?.cache_read_input_tokens ?? current.cache_read_input_tokens,
  cache_creation_input_tokens:
    incoming?.cache_creation_input_tokens ?? current.cache_creation_input_tokens,
})

/**
 * "How much of the context window is taken now" is a snapshot of the LAST internal step rather than a sum
 * over all of them (see the comment at the call site). With a single-step turn the top-level usage
 * fields coincide with the snapshot anyway, so they can safely be taken. With a multi-step one
 * (num_turns > 1) and no snapshot in iterations, though, the top-level fields are certainly a sum rather
 * than a snapshot; trusting them silently is not an option, so state.usage is left untouched rather than
 * inflated.
 */
const contextSnapshot = (event: Extract<AgentEvent, { type: 'result' }>): AgentUsage | undefined => {
  const last = event.usage?.iterations?.at(-1)
  if (last) return withoutEmpty(last)
  if ((event.num_turns ?? 1) > 1) return undefined
  return withoutEmpty(event.usage)
}

/**
 * How much the context took at the moment of this request to the model: the whole input part of usage -
 * both fresh tokens and what the model read out of the cache.
 *
 * An empty usage (an internal turn that never went to the model at all) returns nothing rather than zero:
 * otherwise the meter would fall to zero mid-conversation - the same trap as with the snapshot from a
 * result, see withoutEmpty.
 */
const contextUsedOf = (usage?: AgentUsage): number | undefined => {
  const filled = withoutEmpty(usage)
  if (!filled) return undefined

  return (
    (filled.input_tokens ?? 0) +
    (filled.cache_read_input_tokens ?? 0) +
    (filled.cache_creation_input_tokens ?? 0)
  )
}

/**
 * An empty snapshot is not "the context has been reset" but "this turn never went to the model at all".
 *
 * That is how an internal command's turn is closed: `/model`, for instance, the CLI carries out itself,
 * without a single request to the model, and sends zeros in its result. Taking those for a snapshot of
 * the window, the context meter fell to zero right in the middle of a conversation, although the whole
 * transcript had gone nowhere.
 */
const withoutEmpty = (usage?: AgentUsage): AgentUsage | undefined => {
  if (!usage) return undefined

  const total =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)

  return total > 0 ? usage : undefined
}

/** The caption of an interrupted turn - one for every route it could have broken off by. */
export const STOPPED_BY_YOU = 'Stopped by you'

/**
 * How the turn ended, out of a result event: tokens, price and model are noise under every turn, and out
 * of all of it only the duration is wanted.
 *
 * This is what the row on screen is worded from, and what the marker beside it is built out of.
 */
const resultOutcome = (
  event: Extract<AgentEvent, { type: 'result' }>,
  cancelled: boolean,
  forAccount: boolean,
): MetaItem['outcome'] => ({
  state: !cancelled ? 'worked' : forAccount ? 'movedAccount' : 'stopped',
  duration: typeof event.duration_ms === 'number' ? formatDuration(event.duration_ms) : '',
})

/**
 * The same result as the marker line the IDE reads - in English, and staying English (see
 * MetaItem.stats).
 *
 * Built out of the outcome rather than out of the event a second time. The two carry one fact between
 * them and used to be worked out side by side from the same input, which is a fact with two chances to
 * be wrong: the row could say the turn was stopped while the marker said it worked, and the marker is
 * the half nobody looks at - it is read by NotificationReasons.kt, out in the IDE.
 */
const resultStats = (outcome: MetaItem['outcome']): string[] => {
  if (!outcome) return []

  const { state, duration } = outcome
  if (state === 'worked') return duration ? [`Worked ${duration}`] : []

  // Not "Worked": the turn did not work through, it was broken off halfway, and the caption is obliged to
  // say exactly that - otherwise an interrupted turn is indistinguishable from a finished one. One
  // marker for both ways of being broken off, because what reads it wants one thing - that this turn is
  // not worth a notification (see MetaItem.stats). Which of the two it was, the row says in words.
  return [duration ? `${STOPPED_BY_YOU} · ${duration}` : STOPPED_BY_YOU]
}

export const formatTokens = (value: number): string => {
  // A million is written as a million: with large models the context window is exactly that, and
  // "1000.0k" on the meter reads worse than "1.0M".
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

/** The text of a finished CONTEXT card - with real before and after figures and a time, when the IDE sent them. */
const compactOutcome = (meta: AgentSystemEvent['compact_metadata']): CompactOutcome => ({
  state: 'done',
  manual: meta?.trigger === 'manual',
  ...(meta?.pre_tokens !== undefined ? { before: meta.pre_tokens } : {}),
  ...(meta?.post_tokens !== undefined ? { after: meta.post_tokens } : {}),
  ...(meta?.duration_ms !== undefined ? { took: formatDuration(meta.duration_ms) } : {}),
})

const formatClock = (ms: number): string => {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * What the context meter shows: taken, total and the share.
 *
 * The window's size comes from the CLI itself (see PanelState.context): it depends on the model, with
 * "1M" models it is five times the usual, and arithmetic of ours cannot guess it.
 *
 * What is taken, though, is chosen by freshness. The exact figure from the CLI arrives only at a turn's
 * end, so while a turn runs we show the estimate from the agent's latest answer (liveContextUsed):
 * without it, through the longest request - the first - the bar did not move at all, although the window
 * fills up in that time. As soon as the turn ends, the exact figure displaces that estimate (see case
 * 'context').
 */
export const contextOf = (
  state: PanelState,
  fallbackLimit = 200_000,
): { percent: number; used: number; limit: number } => {
  const context = state.context
  const known = context && context.max > 0 ? context : undefined
  const live = state.liveContextUsed

  if (known || live !== undefined) {
    const limit = known?.max ?? (fallbackLimit > 0 ? fallbackLimit : 200_000)
    const used = live ?? known?.used ?? 0

    return { percent: Math.min(Math.round((used / limit) * 100), 100), used, limit }
  }

  const used =
    state.usage.input_tokens + state.usage.cache_read_input_tokens + state.usage.cache_creation_input_tokens
  const limit = fallbackLimit > 0 ? fallbackLimit : 200_000

  return { percent: contextUsage(state.usage, limit), used, limit }
}

/**
 * The share of the context window taken, for the meter in the bottom line. The window's size depends on
 * the model, so it arrives from outside; two hundred thousand is only the fallback.
 */
export const contextUsage = (usage: Required<AgentUsage>, limit = 200_000): number => {
  const used = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  // A parameter's default fires only on a literal undefined - an explicit 0 (or a negative value) would
  // slip past it straight into used / 0 = Infinity, and Math.min(Infinity, 100) gives exactly 100, a false
  // "the context is full".
  const safeLimit = limit > 0 ? limit : 200_000
  return Math.min(Math.round((used / safeLimit) * 100), 100)
}
