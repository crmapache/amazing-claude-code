import type { AgentSystemEvent, ContentBlock, TextBlock, ToolUseBlock } from '../protocol'
import type { PanelState } from './panelState'
import { readQuestions } from './toolInput'
import { commandLabel, detailFor, formatDuration, targetFor } from './tools'
import type { BackgroundTask, DetailLine, FeedItem, TaskOutcome, ToolItem } from './types'

/**
 * Subagents and background commands - everything the CLI reports over the task_* channel.
 *
 * They live apart from the rest of the feed's assembly because they follow rules of their own: such a
 * task arrives by two routes at once (as a tool call in the agent's answer and as system events), it
 * outlives the turn that launched it, and its card is found by two different identifiers. Kept together
 * with the ordinary events, those rules buried the simple part of the assembly - a message, an answer, a
 * tool call.
 */

/**
 * A task out of the task_* system events is not necessarily a subagent.
 *
 * The CLI leads terminal commands over the same channel: every background one and every ordinary one
 * that runs longer than a few seconds. All that tells them apart is task_type ('local_bash' against
 * 'local_agent'). While the panel did not look at it, every such command got a subagent's card - hence
 * the "agent:agent" chips (a command has no subagent name) and a dev server "working as an agent" for a
 * second day. An event with no type at all is an old CLI, where only subagents travelled this way, so an
 * unknown type counts as an agent rather than a command.
 */
const isBashTask = (event: AgentSystemEvent): boolean => event.task_type === 'local_bash'

/** The card this task lives on: see taskCards. */
const cardFor = (state: PanelState, taskId: string): string => state.taskCards[taskId] ?? taskId

const outcomeOf = (status: string | undefined): TaskOutcome =>
  status === 'failed' ? 'failed' : status === 'stopped' ? 'stopped' : 'ok'



/** A tool call by its id - the cards live inside groups rather than in the feed directly. */
const findTool = (items: FeedItem[], id: string): ToolItem | undefined => {
  for (const item of items) {
    if (item.kind !== 'toolGroup') continue

    const tool = item.tools.find((candidate) => candidate.id === id)
    if (tool) return tool
  }

  return undefined
}

const isBackgroundCommand = (tool: ToolItem | undefined): boolean => {
  if (!tool || typeof tool.input !== 'object' || tool.input === null) return false
  return (tool.input as { run_in_background?: unknown }).run_in_background === true
}

/** Editing one tool call in place - it lies inside its group. */
export const mapTool = (items: FeedItem[], id: string, change: (tool: ToolItem) => ToolItem): FeedItem[] =>
  items.map((item) => {
    if (item.kind !== 'toolGroup' || !item.tools.some((tool) => tool.id === id)) return item
    return { ...item, tools: item.tools.map((tool) => (tool.id === id ? change(tool) : tool)) }
  })

/**
 * A background command gets a chip in the header: the card in the feed only says that it was launched
 * and travels upwards with the conversation, while the process lives on - sometimes for days (a dev
 * server). An ordinary command reports itself with the same event too, but its chip would be a flicker
 * for a couple of seconds: it is visible whole in the card the turn is standing for.
 */
const startBackgroundCommand = (
  state: PanelState,
  event: AgentSystemEvent,
  now: number,
): PanelState => {
  const taskId = event.task_id
  if (!taskId) return state

  const tool = event.tool_use_id ? findTool(state.items, event.tool_use_id) : undefined
  if (!isBackgroundCommand(tool)) return state

  const description = event.description ?? ''
  // The chip's caption is the command itself in two words: a description from the model runs to a whole
  // sentence and on a narrow panel pushes every other chip out. The command is taken from the very call
  // that launched it; when none is found, the description is left, if only so the chip is not nameless.
  const command = (tool?.input as { command?: unknown } | undefined)?.command
  const written = typeof command === 'string' ? command : ''
  const label = commandLabel(written)

  return {
    ...state,
    startedAt: { ...state.startedAt, [taskId]: now },
    background: [
      ...state.background,
      {
        id: taskId,
        toolUseId: event.tool_use_id,
        label: label || description || 'background command',
        description,
        command: written.split('\n')[0]?.trim() ?? '',
        duration: formatDuration(0),
      },
    ],
  }
}

/**
 * How a background command ended, written straight into the card that launched it: it has no card of its
 * own and needs none - the one that launched it already stands in the feed, and the right place for "how
 * long it ran and how it ended" is precisely there.
 *
 * Apart from the chip's own bookkeeping below, because a replay reaches the same end by another road: it
 * learns the outcome from the transcript without ever having seen the command start, and has no honest
 * duration to give (see applyReplayedTaskNotification).
 */
const noteBackgroundEnd = (
  items: FeedItem[],
  toolUseId: string,
  duration: string,
  outcome: TaskOutcome,
  summary: string | undefined,
): FeedItem[] => {
  const tone = outcome === 'failed' ? ('bad' as const) : ('dim' as const)
  // The CLI's text explains a failure to the point ("exit code 3"), while on an ordinary end it repeats
  // the command's description, which already stands in the card.
  const detail = outcome === 'failed' && summary ? detailFor(summary) : []

  return mapTool(items, toolUseId, (tool) => ({
    ...tool,
    duration: duration || tool.duration,
    isError: tool.isError || outcome === 'failed',
    detail: [
      ...tool.detail,
      { text: '', note: { kind: 'backgroundEnded' as const, outcome, duration }, tone },
      ...detail,
    ],
  }))
}

/** A background command has ended: the chip leaves the header, the outcome goes into its card. */
const finishBackgroundCommand = (
  state: PanelState,
  task: BackgroundTask,
  event: AgentSystemEvent,
  now: number,
): PanelState => {
  const started = state.startedAt[task.id]
  const duration = started ? formatDuration(now - started) : task.duration
  const startedAt = { ...state.startedAt }
  delete startedAt[task.id]

  const items = task.toolUseId
    ? noteBackgroundEnd(state.items, task.toolUseId, duration, outcomeOf(event.status), event.summary)
    : state.items

  return { ...state, startedAt, background: state.background.filter((item) => item.id !== task.id), items }
}

/**
 * A background subagent of a skill or workflow (/code-review and the like) - it used to have no card at
 * all, because it has no Task tool call in the assistant's stream: a skill raises it directly, bypassing
 * the turn's ordinary cycle. The card is the same one an ordinary Task gets - the consumers below (the
 * stream dropdown, the agent screen) do not care where a kind:'task' came from.
 */
export const applyTaskStarted = (state: PanelState, event: AgentSystemEvent, now: number): PanelState => {
  const taskId = event.task_id
  if (!taskId) return state

  // A terminal command is not an agent, although it arrives over the same channel.
  if (isBashTask(event)) return startBackgroundCommand(state, event, now)

  /**
   * The same subagent, but arriving by the second route: a tool_use block in the agent's answer has
   * already created a card for it. Here we only tie the task_id to that card and refine the caption -
   * creating a second one would show one agent as two chips in the header.
   */
  const linked = event.tool_use_id
  if (linked && state.items.some((item) => item.kind === 'task' && item.id === linked)) {
    return {
      ...state,
      taskCards: { ...state.taskCards, [taskId]: linked },
      items: state.items.map((item) =>
        item.kind === 'task' && item.id === linked
          ? {
              ...item,
              // The task's real name arrives only here - the card was created by the tool call, and that
              // knows nothing but its own identifier.
              taskId,
              target: event.subagent_type ?? item.target,
              meta: item.meta || (event.description ?? ''),
            }
          : item,
      ),
    }
  }

  return {
    ...state,
    startedAt: { ...state.startedAt, [taskId]: now },
    taskByToolUseId: event.tool_use_id
      ? { ...state.taskByToolUseId, [event.tool_use_id]: taskId }
      : state.taskByToolUseId,
    items: [
      ...state.items,
      {
        id: taskId,
        kind: 'task',
        taskId,
        target: event.subagent_type ?? 'agent',
        meta: event.description ?? '',
        duration: '',
        percent: 0,
        log: [],
        pending: true,
      },
    ],
  }
}

export const applyTaskProgress = (state: PanelState, event: AgentSystemEvent): PanelState => {
  const taskId = event.task_id
  if (!taskId) return state

  const card = cardFor(state, taskId)

  return {
    ...state,
    items: state.items.map((item) => {
      if (item.kind !== 'task' || item.id !== card) return item

      // The very same call may already have arrived through the subagent's main stream (noteSubagent, a
      // line like "Bash…"/"Bash: command") - this channel reports the same name afterwards, and without
      // this the log turned into pairs of repeated lines on every call.
      const lastLine = item.log.at(-1)?.text
      const isDuplicate = Boolean(event.last_tool_name && lastLine?.startsWith(event.last_tool_name))

      return {
        ...item,
        meta: event.description ?? item.meta,
        log:
          event.last_tool_name && !isDuplicate
            ? appendAgentLog(item.log, [{ text: `→ ${event.last_tool_name}` }])
            : item.log,
      }
    }),
  }
}

/** A subagent's card closed by what is known about its end - see applyTaskNotification. */
const finishTaskCard = (
  state: PanelState,
  card: string,
  outcome: TaskOutcome,
  summary: string | undefined,
  now: number,
): PanelState => {
  const startedTime = state.startedAt[card]
  const duration = startedTime ? formatDuration(now - startedTime) : ''
  const startedAt = { ...state.startedAt }
  delete startedAt[card]
  const lines = summary ? detailFor(summary) : []
  // A killed or failed agent used to look exactly like one that had finished: green circle, summary in
  // place. The mark goes on the first line - it also explains why the summary breaks off mid-way.
  const log =
    outcome === 'ok'
      ? lines
      : [{ text: '', note: { kind: 'taskEnded' as const, outcome }, tone: 'bad' as const }, ...lines]

  return {
    ...state,
    startedAt,
    items: state.items.map((item) =>
      item.kind === 'task' && item.id === card
        ? {
            ...item,
            pending: false,
            percent: 100,
            duration,
            outcome,
            log: log.length > 0 ? appendAgentLog(item.log, log) : item.log,
          }
        : item,
    ),
  }
}

export const applyTaskNotification = (state: PanelState, event: AgentSystemEvent, now: number): PanelState => {
  const taskId = event.task_id
  if (!taskId) return state

  const running = state.background.find((task) => task.id === taskId)
  if (running) return finishBackgroundCommand(state, running, event, now)

  return finishTaskCard(state, cardFor(state, taskId), outcomeOf(event.status), event.summary, now)
}

const NOTIFICATION_BLOCK = /<task-notification>[\s\S]*?<\/task-notification>/g
const NOTIFIED_TOOL_USE = /<tool-use-id>([\s\S]*?)<\/tool-use-id>/
const NOTIFIED_STATUS = /<status>([\s\S]*?)<\/status>/
const NOTIFIED_SUMMARY = /<summary>([\s\S]*?)<\/summary>/

const tagOf = (pattern: RegExp, text: string): string | undefined => pattern.exec(text)?.[1]?.trim() || undefined

/**
 * The very same notification, but out of a past conversation rather than out of a live run.
 *
 * Live, a task reports its end over the task_* channel - a system event nobody keeps: a transcript holds
 * messages alone. What it does hold is the notification itself, because the CLI hands it to the agent as
 * a message written in the person's own name - the whole block of markup that used to land in the feed as
 * though the person had typed "<task-notification><task-id>…" by hand.
 *
 * So it is read here for what it is: the outcome of a subagent or of a background command, put into the
 * card that launched it. Only in a replay - in a live run the same end arrives over its own channel, and
 * reading both would write the outcome into the card twice.
 *
 * The card is found by tool-use-id rather than by task-id: the map from one to the other is built by
 * task_started, and in a replay that event never came. A notification without a tool-use-id (the CLI
 * sums up several orphaned tasks of a dead session in one) names no card at all - there is nothing to
 * apply and nothing to show.
 */
export const applyReplayedTaskNotification = (
  state: PanelState,
  blocks: ContentBlock[],
  now: number,
): PanelState => {
  const text = blocks
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  const notifications = text.match(NOTIFICATION_BLOCK)
  if (!notifications) return state

  return notifications.reduce((current, notification) => {
    const toolUseId = tagOf(NOTIFIED_TOOL_USE, notification)
    if (!toolUseId) return current

    const outcome = outcomeOf(tagOf(NOTIFIED_STATUS, notification))
    const summary = tagOf(NOTIFIED_SUMMARY, notification)

    if (current.items.some((item) => item.kind === 'task' && item.id === toolUseId)) {
      return finishTaskCard(current, toolUseId, outcome, summary, now)
    }

    // An ordinary command travels this channel too (see isBashTask), and its card was closed by its own
    // result long ago - a "background command finished" line under it would say what never happened.
    const tool = findTool(current.items, toolUseId)
    if (!isBackgroundCommand(tool)) return current

    return { ...current, items: noteBackgroundEnd(current.items, toolUseId, '', outcome, summary) }
  }, state)
}

/**
 * A cap on an agent's log - otherwise a very long subagent would grow in memory without bound. 300 lines
 * is well past what a real subagent's turn takes; on overflow the oldest lines go under one summary mark
 * instead of disappearing silently.
 */
const AGENT_LOG_LIMIT = 300

export const appendAgentLog = (log: DetailLine[], lines: DetailLine[]): DetailLine[] => {
  if (lines.length === 0) return log

  const merged = [...log, ...lines]
  if (merged.length <= AGENT_LOG_LIMIT) return merged

  // The running total is carried as a number, not read back out of the sentence that was drawn from it.
  // A log that overflowed three times has to say so, and a mark recovered by matching English prose
  // would stop matching the moment that prose was translated - silently, back to zero, with no test to
  // notice (see DetailLine.note).
  const mark = merged[0]?.note
  const trimmedBefore = mark?.kind === 'trimmed' ? mark.count : 0
  const withoutMark = mark?.kind === 'trimmed' ? merged.slice(1) : merged
  const keep = withoutMark.slice(withoutMark.length - (AGENT_LOG_LIMIT - 1))
  const trimmedNow = withoutMark.length - keep.length

  return [
    { text: '', tone: 'dim' as const, note: { kind: 'trimmed', count: trimmedBefore + trimmedNow } },
    ...keep,
  ]
}

/**
 * Resolves the id of the call that spawned a subagent into the real task_id of its card. For the
 * background channel (task_started and the rest) those are two different values - the map is built in
 * applySystem. For a direct Task/Agent tool_use they coincide (the card itself was created with an id
 * equal to that call), so no map is needed for it - it resolves to itself through the ?? .
 */
const resolveTaskId = (state: PanelState, parentToolUseId: string): string =>
  state.taskByToolUseId[parentToolUseId] ?? parentToolUseId

/**
 * A subagent's messages go into its own card's log rather than into the shared feed - it has a tab of
 * its own (see AgentStreamView).
 *
 * The AskUserQuestion branch below is for the future rather than for today's Claude Code: by the Agent
 * SDK's official documentation (user-input.md, the Limitations section; sub-agents.md, "Control subagent
 * capabilities") AskUserQuestion is currently unavailable to subagents launched through Task/Agent
 * altogether - the SDK strips it out of the tool set before a subagent can call it. Since the tool is
 * unreachable, in reality it never comes to this branch: it does not cure some breakage in answer
 * delivery, it is simply ready for the moment Anthropic lifts that restriction - and then a question from
 * a subagent will not be lost as a single line without answer options, the way it used to be.
 */
export const noteSubagent = (
  state: PanelState,
  parentToolUseId: string,
  blocks: ContentBlock[],
  /** A past conversation's replay rather than a live turn - see applyAgentEvent. */
  replay = false,
): PanelState => {
  const taskId = resolveTaskId(state, parentToolUseId)
  if (!state.items.some((item) => item.kind === 'task' && item.id === taskId)) return state

  const askBlock = blocks.find(
    (block): block is ToolUseBlock => block.type === 'tool_use' && block.name === 'AskUserQuestion',
  )

  let next = state
  const questions = askBlock ? readQuestions((askBlock.input ?? {}) as Record<string, unknown>) : []
  // See applyToolUse: without questions there is nothing to close the card with, it would hang.
  if (askBlock && questions.length > 0) {
    next = {
      ...next,
      items: [
        ...next.items,
        {
          id: askBlock.id,
          kind: 'ask',
          questions,
          taskId,
          // See applyToolUse: a question out of a replay holds nobody.
          historic: replay,
        },
      ],
    }
  }

  const workingDirectory = state.project?.workingDirectory ?? ''

  const lines = blocks.flatMap((block): DetailLine[] => {
    if (block.type === 'text' && block.text.trim()) return [{ text: block.text.trim().split('\n')[0] ?? '' }]

    if (block.type === 'tool_use') {
      // targetFor always returns something - with no more precise target it simply returns the tool's own
      // name; that case is not duplicated.
      const target = targetFor(block.name, block.input, workingDirectory)
      return [{ text: target === block.name ? `${block.name}…` : `${block.name}: ${target}`, tone: 'dim' as const }]
    }

    return []
  })

  return {
    ...next,
    items: next.items.map((item) =>
      item.id === taskId && item.kind === 'task'
        ? { ...item, log: appendAgentLog(item.log, lines), percent: Math.min(item.percent + 12, 92) }
        : item,
    ),
  }
}
