import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent, AgentRateLimitEvent } from '../protocol'
import { contextOf, contextUsage, initialPanelState, reducePanel, spokenAnswer, type PanelState } from './build'
import type {
  AskItem,
  CompactItem,
  FindingsItem,
  LimitItem,
  PlanItem,
  RetryItem,
  TaskItem,
  TextItem,
  ThinkItem,
  TodoItem,
  ToolGroupItem,
  UserItem,
} from './types'

/**
 * The stream was recorded from a live run of the agent rather than made up: only that way are both the
 * order of the events and the types we did not expect visible.
 */
const streamEvents = (): AgentEvent[] =>
  readFileSync(join(import.meta.dirname, '../__fixtures__/stream.ndjson'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AgentEvent)

const play = (events: AgentEvent[], state = initialPanelState): PanelState =>
  events.reduce((acc, event) => reducePanel(acc, { kind: 'agent', event }, 1_700_000_000_000), state)

const toolUseEvent = (id: string, name: string, input: unknown = {}): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name, input }] },
})

const toolResultEvent = (id: string, content = 'ok'): AgentEvent => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content }] },
})

const textEvent = (text: string): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
})

const resultEvent = (durationMs: number): AgentEvent => ({
  type: 'result',
  subtype: 'success',
  duration_ms: durationMs,
})

const taskStartedEvent = (taskId: string, toolUseId: string, subagentType: string): AgentEvent => ({
  type: 'system',
  subtype: 'task_started',
  task_id: taskId,
  tool_use_id: toolUseId,
  subagent_type: subagentType,
  description: 'Demo task',
})

const subagentMessageEvent = (parentToolUseId: string, text: string): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
  parent_tool_use_id: parentToolUseId,
})

const subagentToolUseEvent = (parentToolUseId: string, id: string, name: string, input: unknown = {}): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name, input }] },
  parent_tool_use_id: parentToolUseId,
})

const taskProgressEvent = (taskId: string, lastToolName: string): AgentEvent => ({
  type: 'system',
  subtype: 'task_progress',
  task_id: taskId,
  last_tool_name: lastToolName,
})

/** How it arrives from a live CLI: a subagent has a task_id of its own, separate from the call's id. */
const agentTaskStartedEvent = (taskId: string, toolUseId: string, subagentType: string): AgentEvent => ({
  type: 'system',
  subtype: 'task_started',
  task_id: taskId,
  tool_use_id: toolUseId,
  subagent_type: subagentType,
  description: 'Discover files',
  task_type: 'local_agent',
})

/** The CLI leads terminal commands down the same channel - there is no subagent in them at all. */
const bashTaskStartedEvent = (taskId: string, toolUseId: string, description: string): AgentEvent => ({
  type: 'system',
  subtype: 'task_started',
  task_id: taskId,
  tool_use_id: toolUseId,
  description,
  task_type: 'local_bash',
})

const taskNotificationEvent = (taskId: string, status?: string, summary?: string): AgentEvent => ({
  type: 'system',
  subtype: 'task_notification',
  task_id: taskId,
  ...(status ? { status } : {}),
  ...(summary ? { summary } : {}),
})

const compactingStatusEvent = (taskId?: string): AgentEvent => ({
  type: 'system',
  subtype: 'status',
  status: 'compacting',
  ...(taskId ? { task_id: taskId } : {}),
})

const compactBoundaryEvent = (
  metadata: {
    trigger?: string
    pre_tokens?: number
    post_tokens?: number
    duration_ms?: number
  },
  taskId?: string,
): AgentEvent => ({
  type: 'system',
  subtype: 'compact_boundary',
  compact_metadata: metadata,
  ...(taskId ? { task_id: taskId } : {}),
})

const compactResultEvent = (result: string, error?: string): AgentEvent => ({
  type: 'system',
  subtype: 'status',
  compact_result: result,
  ...(error ? { compact_error: error } : {}),
})

const subagentAskEvent = (parentToolUseId: string): AgentEvent => ({
  type: 'assistant',
  message: {
    content: [
      {
        type: 'tool_use',
        id: 'ask-1',
        name: 'AskUserQuestion',
      input: { questions: [{ question: 'Carry on?', header: 'Branch', options: [{ label: 'Yes' }, { label: 'No' }] }] },
      },
    ],
  },
  parent_tool_use_id: parentToolUseId,
})

/** The texts of the errors standing in the feed - in the same order they stand there. */
const errorTexts = (state: PanelState): string[] =>
  state.items.filter((item) => item.kind === 'error').map((item) => item.message)

describe('errors in the feed', () => {
  const refusal = 'Cannot set permission mode to bypassPermissions'

  it('does not draw two identical cards for one refusal that arrived by two routes', () => {
    // The CLI's refusal arrives both as text in the process's error stream and as a parsed answer to the
    // control request that changes the mode.
    const state = [
      { kind: 'error', message: refusal } as const,
      { kind: 'modeApplied', mode: 'bypassPermissions', applied: false, error: refusal } as const,
    ].reduce(reducePanel, initialPanelState)

    expect(errorTexts(state)).toEqual([refusal])
  })

  it('still shows both when the errors differ', () => {
    const state = [
      { kind: 'error', message: refusal } as const,
      { kind: 'error', message: 'claude exited with code 1' } as const,
    ].reduce(reducePanel, initialPanelState)

    expect(errorTexts(state)).toHaveLength(2)
  })

  it('shows the same refusal again in a new turn - that is a fresh piece of trouble', () => {
    let state = reducePanel(initialPanelState, { kind: 'error', message: refusal })
    state = reducePanel(state, { kind: 'prompt', tokens: [{ kind: 'text', value: 'once more' }], quotes: [] })
    state = reducePanel(state, { kind: 'error', message: refusal })

    expect(errorTexts(state)).toEqual([refusal, refusal])
  })

  it('lives in the feed rather than as a separate card - and is dismissed by its own id', () => {
    const state = reducePanel(initialPanelState, { kind: 'error', message: refusal })
    const error = state.items.find((item) => item.kind === 'error')
    expect(error).toBeDefined()

    const dismissed = reducePanel(state, { kind: 'dismissError', id: error!.id })
    expect(errorTexts(dismissed)).toEqual([])
  })

  /**
   * A failed CLI request speaks twice: first as the agent's line in the stream, then as the same string in
   * stderr. Because of that two identical paragraphs stood in the feed one after another - an ordinary
   * answer and a red card under it.
   */
  it('an error crowds out its own duplicate that arrived as the agent answer', () => {
    const apiError = 'API Error: 500 Internal server error. Check https://status.claude.com.'
    let state = reducePanel(initialPanelState, { kind: 'agent', event: textEvent(apiError) })
    expect(state.items.filter((item) => item.kind === 'text')).toHaveLength(1)

    state = reducePanel(state, { kind: 'error', message: apiError })

    expect(state.items.filter((item) => item.kind === 'text')).toHaveLength(0)
    expect(errorTexts(state)).toEqual([apiError])
  })

  it('leaves an ordinary answer beside an error in place', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: textEvent('Fixing the build.') })
    state = reducePanel(state, { kind: 'error', message: 'claude exited with code 1' })

    expect(state.items.filter((item) => item.kind === 'text')).toHaveLength(1)
    expect(errorTexts(state)).toEqual(['claude exited with code 1'])
  })
})


describe('changing the model', () => {
  it('shows the chosen one rather than the previous one before the agent answers', () => {
    const state = reducePanel(initialPanelState, { kind: 'modelRequested', model: 'sonnet' })

    expect(state.pendingModel).toBe('sonnet')
  })

  it('makes the chosen one the model of the conversation once the agent agrees - with no catalogue', () => {
    let state = reducePanel(initialPanelState, { kind: 'modelRequested', model: 'sonnet' })
    state = reducePanel(state, { kind: 'modelApplied', model: 'sonnet' })

    expect(state.pendingModel).toBeUndefined()
    expect(state.model).toBe('sonnet')
  })

  it('brings the previous model back on a refusal and explains the reason in the feed', () => {
    let state = reducePanel(initialPanelState, { kind: 'modelApplied', model: 'opus' })
    state = reducePanel(state, { kind: 'modelRequested', model: 'haiku' })
    state = reducePanel(state, {
      kind: 'modelApplied',
      model: 'opus',
      error: 'Model haiku is not available on your plan',
    })

    expect(state.pendingModel).toBeUndefined()
    expect(state.model).toBe('opus')
    expect(errorTexts(state)).toEqual(['Model haiku is not available on your plan'])
  })
})

/** An answer signed by a model, the way a live stream signs every one of them. */
const signedTextEvent = (model: string, text: string): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }], model },
})

const initEvent = (model: string): AgentEvent => ({ type: 'system', subtype: 'init', model })

/**
 * The CLI moved the conversation to another model itself - recorded from a live run (CLI 2.1.238), field
 * for field: that is where the wording of the reason and the names of both models come from.
 */
const modelFallbackEvent = (originalModel: string, fallbackModel: string, content: string): AgentEvent => ({
  type: 'system',
  subtype: 'model_refusal_fallback',
  originalModel,
  fallbackModel,
  content,
})

const modelSwitches = (state: PanelState) => state.items.filter((item) => item.kind === 'model')

describe('the model swapped by the CLI itself', () => {
  const reason = "Fable 5's safeguards flagged this message. Switched to Opus 4.8."

  it("names the swap in the feed, with the reason in the CLI's own words", () => {
    const state = play([
      initEvent('claude-fable-5'),
      signedTextEvent('claude-fable-5', 'Looking at the relay.'),
      modelFallbackEvent('claude-fable-5', 'claude-opus-4-8', reason),
    ])

    expect(state.model).toBe('claude-opus-4-8')
    expect(modelSwitches(state)).toEqual([
      { id: expect.any(String), kind: 'model', from: 'claude-fable-5', to: 'claude-opus-4-8', reason },
    ])
  })

  it('does not repeat the card when the answers start arriving signed by the new model', () => {
    const state = play([
      initEvent('claude-fable-5'),
      modelFallbackEvent('claude-fable-5', 'claude-opus-4-8', reason),
      signedTextEvent('claude-opus-4-8', 'Carrying on.'),
      signedTextEvent('claude-opus-4-8', 'Still here.'),
    ])

    expect(modelSwitches(state)).toHaveLength(1)
  })

  /**
   * A transcript keeps the messages alone - the event that explained the swap is not among them (see
   * ClaudeHistory.replayable). The signature under an answer is then the only trace of it left.
   */
  it('notices a swap by the signature alone, and says nothing about a reason it does not know', () => {
    const state = play([
      initEvent('claude-fable-5'),
      signedTextEvent('claude-fable-5', 'Looking at the relay.'),
      signedTextEvent('claude-opus-4-8', 'Carrying on.'),
    ])

    expect(state.model).toBe('claude-opus-4-8')
    expect(modelSwitches(state)).toEqual([
      { id: expect.any(String), kind: 'model', from: 'claude-fable-5', to: 'claude-opus-4-8', reason: '' },
    ])
  })

  it('says nothing about the model a conversation simply starts on', () => {
    const state = play([initEvent('claude-fable-5'), signedTextEvent('claude-fable-5', 'Hello.')])

    expect(modelSwitches(state)).toEqual([])
  })

  it('keeps quiet about a change the person asked for themselves', () => {
    let state = play([initEvent('claude-fable-5'), signedTextEvent('claude-fable-5', 'Hello.')])
    state = reducePanel(state, { kind: 'modelRequested', model: 'opus' })
    state = reducePanel(state, { kind: 'modelApplied', model: 'opus' })
    state = play([signedTextEvent('claude-opus-5', 'On Opus now.')], state)

    expect(state.model).toBe('claude-opus-5')
    expect(modelSwitches(state)).toEqual([])
  })

  /**
   * The accent on the MODEL button is drawn by this and by nothing else - see PanelState.switchedFrom.
   * It used to be worked out by comparing the running model against the setting, which is one for every
   * tab: a tab left on the model chosen in it earlier wore the accent for no reason at all.
   */
  it('remembers whose doing the swap was, so the bottom line can say it', () => {
    const state = play([
      initEvent('claude-fable-5'),
      signedTextEvent('claude-fable-5', 'Looking at the relay.'),
      modelFallbackEvent('claude-fable-5', 'claude-opus-4-8', reason),
    ])

    expect(state.switchedFrom).toBe('claude-fable-5')
  })

  it('remembers it just the same when the swap was noticed by the signature alone', () => {
    const state = play([
      initEvent('claude-fable-5'),
      signedTextEvent('claude-fable-5', 'Looking at the relay.'),
      signedTextEvent('claude-opus-4-8', 'Carrying on.'),
    ])

    expect(state.switchedFrom).toBe('claude-fable-5')
  })

  it('remembers nothing about a conversation that simply starts on a model', () => {
    const state = play([initEvent('claude-fable-5'), signedTextEvent('claude-fable-5', 'Hello.')])

    expect(state.switchedFrom).toBeUndefined()
  })

  // A swap inside a chat opened from the history is a page of its past, not news about today: the tab
  // works on the model that conversation ended on, and nobody has moved anything behind one's back.
  it('does not light the accent for a swap replayed out of a past conversation', () => {
    const events = [
      initEvent('claude-fable-5'),
      signedTextEvent('claude-fable-5', 'Looking at the relay.'),
      modelFallbackEvent('claude-fable-5', 'claude-opus-4-8', reason),
      signedTextEvent('claude-opus-4-8', 'Carrying on.'),
    ]
    const state = events.reduce(
      (acc, event) => reducePanel(acc, { kind: 'agent', event, replay: true }, 1_700_000_000_000),
      initialPanelState,
    )

    expect(state.model).toBe('claude-opus-4-8')
    expect(state.switchedFrom).toBeUndefined()
  })

  it('forgets the swap once the person chooses a model for this tab themselves', () => {
    let state = play([
      initEvent('claude-fable-5'),
      modelFallbackEvent('claude-fable-5', 'claude-opus-4-8', reason),
    ])
    expect(state.switchedFrom).toBe('claude-fable-5')

    state = reducePanel(state, { kind: 'modelApplied', model: 'opus' })

    expect(state.switchedFrom).toBeUndefined()
  })

  it("leaves the conversation's model alone when it is a subagent that is being started", () => {
    const state = play([
      initEvent('claude-fable-5'),
      { type: 'system', subtype: 'init', model: 'claude-haiku-4-5-20251001', task_id: 'task-1' },
      subagentMessageEvent('toolu-1', 'Read three files.'),
    ])

    expect(state.model).toBe('claude-fable-5')
    expect(modelSwitches(state)).toEqual([])
  })
})

describe('building the feed out of the agent stream', () => {
  it('brings the conversation to rest and remembers the session', () => {
    const state = play(streamEvents())

    expect(state.sessionId).toBeTruthy()
    expect(state.model).toBeTruthy()
    expect(state.status).toBe('idle')
    // The live text has to be extinguished by the finished message, otherwise the answer doubles.
    expect(state.streamingText).toBe('')
    expect(errorTexts(state)).toEqual([])
  })

  it('remembers the model the agent switched to itself mid-conversation', () => {
    // This is what a fallback that fired looks like: the turn moves to another model, and only the caption
    // under the answer can say so.
    let state = play([{ type: 'system', subtype: 'init', model: 'claude-opus-5[1m]' } as AgentEvent])
    expect(state.model).toBe('claude-opus-5[1m]')

    state = play(
      [{ type: 'assistant', message: { content: [], model: 'claude-opus-4-8' } } as AgentEvent],
      state,
    )
    expect(state.model).toBe('claude-opus-4-8')
  })

  it('does not take a service marker for a model', () => {
    // That is how the CLI signs the stub it closes a broken turn with: no model of that name exists, and
    // there is nowhere for it to come from in the model list.
    let state = play([{ type: 'system', subtype: 'init', model: 'claude-opus-5[1m]' } as AgentEvent])
    state = play(
      [{ type: 'assistant', message: { content: [], model: '<synthetic>' } } as AgentEvent],
      state,
    )

    expect(state.model).toBe('claude-opus-5[1m]')
  })

  it('does not take a subagent model for the conversation model', () => {
    let state = play([{ type: 'system', subtype: 'init', model: 'claude-opus-5[1m]' } as AgentEvent])
    state = play(
      [
        {
          type: 'assistant',
          message: { content: [], model: 'claude-haiku-4-5' },
          parent_tool_use_id: 'tool-1',
        } as AgentEvent,
      ],
      state,
    )

    expect(state.model).toBe('claude-opus-5[1m]')
  })

  it('turns a tool call into a card with its result', () => {
    const state = play(streamEvents())
    const tools = state.items
      .filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      .flatMap((group) => group.tools)

    expect(tools.length).toBeGreaterThan(0)

    const read = tools.find((tool) => tool.chip === 'READ')
    expect(read).toBeDefined()
    expect(read?.pending).toBe(false)
    expect(read?.isError).toBe(false)
    expect(read?.target).toBe('package.json')
    expect(read?.meta).toContain('lines')
    expect(read?.detail.length).toBeGreaterThan(0)
    expect(read?.duration).toMatch(/s$/)
  })

  it('parses an answer into paragraphs with code fragments', () => {
    const state = play(streamEvents())
    const texts = state.items.filter((item): item is TextItem => item.kind === 'text')
    const parts = texts.flatMap((item) => item.paragraphs.flatMap((paragraph) => paragraph.parts))

    expect(texts.length).toBeGreaterThan(0)
    expect(parts.some((part) => part.code === true)).toBe(true)
    expect(parts.map((part) => part.text).join(' ')).toContain('acc-test')
  })

  it('closes a turn with a summary line', () => {
    const state = play(streamEvents())
    const meta = state.items.filter((item) => item.kind === 'meta')

    expect(meta.length).toBe(1)
    expect(state.cost).toBeGreaterThan(0)
    expect(contextUsage(state.usage)).toBeGreaterThan(0)
  })

  it('marks an interruption when the turn closed with a result event after Stop/Escape', () => {
    let state = reducePanel(initialPanelState, { kind: 'stopRequested' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(400) }, 1_700_000_000_400)

    const meta = state.items.filter((item) => item.kind === 'meta')
    expect(meta).toHaveLength(1)
    expect(meta[0]?.stats).toEqual(['Stopped by you · 0.4s'])
    // The stop request is extinguished - otherwise the next, ordinary turn would wrongly call itself
    // interrupted too.
    expect(state.stopRequestedAt).toBeUndefined()
  })

  it('marks an interruption when the turn broke off silently too, with no result event', () => {
    let state = reducePanel(initialPanelState, { kind: 'stopRequested' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'status', status: 'idle' }, 1_700_000_000_400)

    const meta = state.items.filter((item) => item.kind === 'meta')
    expect(meta).toHaveLength(1)
    expect(meta[0]?.stats).toEqual(['Stopped by you'])
    expect(state.stopRequestedAt).toBeUndefined()
  })

  it('does not zero the context gauge on a service turn: it never went to the model at all', () => {
    // That is how a /model closes, for instance: the CLI runs the command itself, without a request to the
    // model, and sends zeroes in the result - taken for a snapshot of the window, the gauge fell to zero
    // right in the middle of a conversation.
    const filled = play(streamEvents())
    const before = contextUsage(filled.usage)

    const empty: AgentEvent = {
      type: 'result',
      subtype: 'success',
      duration_ms: 40,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }
    const after = reducePanel(filled, { kind: 'agent', event: empty }, 1_700_000_000_500)

    expect(before).toBeGreaterThan(0)
    expect(contextUsage(after.usage)).toBe(before)
  })

  it('grows the context gauge during a turn without waiting for its end', () => {
    // The number from the CLI arrives only with the turn's end, and over the longest request - the first -
    // the bar did not move at all. We count from the usage of the agent's answer.
    const answering: AgentEvent = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'thinking' }],
        usage: { input_tokens: 10_000, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 10_000 },
      },
    }
    const state = reducePanel(initialPanelState, { kind: 'agent', event: answering }, 1_700_000_000_000)

    expect(contextOf(state, 200_000)).toEqual({ used: 50_000, limit: 200_000, percent: 25 })
  })

  it('does not move the context gauge for a past conversation replay', () => {
    // A conversation opened from the history is played back through the same events, but the usage in them
    // is about a long-past step, while the window's size cannot be learned from a replay at all: a
    // conversation on a "1M" model was divided by the fallback two hundred thousand and looked overflowing.
    // The exact number the IDE asks the CLI for in a separate message.
    const answered: AgentEvent = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'answered an hour ago' }],
        usage: { input_tokens: 236_000 },
      },
    }
    let state = reducePanel(initialPanelState, { kind: 'agent', event: answered, replay: true }, 1_700_000_000_000)

    expect(state.liveContextUsed).toBeUndefined()
    expect(contextOf(state, 200_000).percent).toBe(0)

    state = reducePanel(state, { kind: 'context', used: 236_192, max: 1_000_000 }, 1_700_000_000_100)

    expect(contextOf(state, 200_000)).toEqual({ used: 236_192, limit: 1_000_000, percent: 24 })
  })

  it('lets the exact number from the CLI crowd out the estimate made during the turn', () => {
    const answering: AgentEvent = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'thinking' }],
        usage: { input_tokens: 50_000 },
      },
    }
    let state = reducePanel(initialPanelState, { kind: 'agent', event: answering }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'context', used: 82_000, max: 1_000_000 }, 1_700_000_000_100)

    expect(state.liveContextUsed).toBeUndefined()
    expect(contextOf(state, 200_000)).toEqual({ used: 82_000, limit: 1_000_000, percent: 8 })
  })

  it('counts the estimate from the genuine window size rather than from the fallback', () => {
    // Only the CLI knows the window's size - on "1M" models it is five times the ordinary one, and an
    // estimate during a turn has to be divided by that same one, otherwise it is four times too high.
    let state = reducePanel(initialPanelState, { kind: 'context', used: 100_000, max: 1_000_000 }, 1_700_000_000_000)
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: { type: 'assistant', message: { content: [{ type: 'text', text: '…' }], usage: { input_tokens: 200_000 } } },
      },
      1_700_000_000_100,
    )

    expect(contextOf(state, 200_000)).toEqual({ used: 200_000, limit: 1_000_000, percent: 20 })
  })

  it('does not zero the gauge on a service answer that never reached the model', () => {
    let state = reducePanel(initialPanelState, { kind: 'context', used: 90_000, max: 200_000 }, 1_700_000_000_000)
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: '(no content)' }],
            usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        },
      },
      1_700_000_000_100,
    )

    expect(contextOf(state, 200_000).used).toBe(90_000)
  })

  it('leaves the feed alone when the agent simply comes free: there was nothing to stop', () => {
    const state = reducePanel(initialPanelState, { kind: 'status', status: 'idle' }, 1_700_000_000_400)

    expect(state.items.filter((item) => item.kind === 'meta')).toHaveLength(0)
  })

  it('does not mark an interruption twice: after a result the status adds nothing', () => {
    let state = reducePanel(initialPanelState, { kind: 'stopRequested' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(400) }, 1_700_000_000_400)
    state = reducePanel(state, { kind: 'status', status: 'idle' }, 1_700_000_000_500)

    expect(state.items.filter((item) => item.kind === 'meta')).toHaveLength(1)
  })

  it('leaves an ordinary end of a turn as a plain Worked, without Stop/Escape', () => {
    const state = reducePanel(initialPanelState, { kind: 'agent', event: resultEvent(400) }, 1_700_000_000_400)

    const meta = state.items.filter((item) => item.kind === 'meta')
    expect(meta[0]?.stats).toEqual(['Worked 0.4s'])
  })

  // A fork brings the process up together with the first message, and the CLI closes the "zero" turn at
  // once: the agent has not started on the message yet. Taking it for the end of a turn, the panel
  // extinguished the spinner and wrote a "Worked 0.1s" - it looked as though the send had not caught.

  it('does not extinguish the spinner or write Worked for the empty turn of a conversation coming up', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )
    // A fork's process comes up with the message already sent: first the init...
    state = reducePanel(
      state,
      { kind: 'agent', event: { type: 'system', subtype: 'init' } as AgentEvent },
      1_700_000_000_050,
    )
    // ...and right behind it the very same "zero" turn.
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: { type: 'result', subtype: 'success', duration_ms: 73, num_turns: 0, session_id: 'new-conversation' },
      },
      1_700_000_000_100,
    )

    expect(state.items.filter((item) => item.kind === 'meta')).toHaveLength(0)
    expect(state.status).toBe('running')
    expect(state.turnStartedAt).toBe(1_700_000_000_000)
    // The fork's identifier is a new one, and it arrives through precisely this event.
    expect(state.sessionId).toBe('new-conversation')
  })

  // We do not swallow an error in silence: a zero turn happens with a refusal too, and the person has to
  // see it.
  it('leaves a zero turn with an error as an ordinary end of a turn', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'agent', event: { type: 'system', subtype: 'init' } as AgentEvent },
      1_700_000_000_050,
    )
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: {
          type: 'result',
          subtype: 'error_during_execution',
          duration_ms: 90,
          num_turns: 0,
          is_error: true,
          result: 'Credit balance is too low',
        },
      },
      1_700_000_000_100,
    )

    expect(state.items.some((item) => item.kind === 'error')).toBe(true)
    expect(state.status).toBe('idle')
  })

  // An unknown slash command the CLI closes instantly and without going to the model: the answer arrives as
  // a stub from <synthetic>, the number of turns is zero and it is not marked as an error. Taking such an
  // outcome for a "zero" turn of a start-up, the panel did not close the turn at all - the "Claude is
  // thinking" with its counter hung there until the tab's end of life.
  it('closes the turn for an unknown command right after the start-up', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: '/mcp__snakein__analyze' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(
      state,
      { kind: 'agent', event: { type: 'system', subtype: 'init' } as AgentEvent },
      1_700_000_000_050,
    )
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: {
          type: 'assistant',
          message: {
            model: '<synthetic>',
            content: [{ type: 'text', text: 'Unknown command: /mcp__snakein__analyze' }],
          },
        } as AgentEvent,
      },
      1_700_000_000_080,
    )
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: {
          type: 'result',
          subtype: 'success',
          duration_ms: 45,
          num_turns: 0,
          is_error: false,
          result: 'Unknown command: /mcp__snakein__analyze',
        },
      },
      1_700_000_000_100,
    )

    expect(state.status).toBe('idle')
    expect(state.turnStartedAt).toBeUndefined()
    expect(state.starting).toBe(false)
    // A stub does not replace the conversation's model - see realModel.
    expect(state.model).toBe(initialPanelState.model)
  })

  // The same refusal, but the outcome arrived without any text: the turn still has to be closed - the
  // agent's answer has already been there, so the start-up ended earlier.
  it('closes the turn for a stub without text in the outcome too', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: '/something' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(
      state,
      { kind: 'agent', event: { type: 'system', subtype: 'init' } as AgentEvent },
      1_700_000_000_050,
    )
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: {
          type: 'assistant',
          message: { model: '<synthetic>', content: [{ type: 'text', text: 'Not running that.' }] },
        } as AgentEvent,
      },
      1_700_000_000_080,
    )
    state = reducePanel(
      state,
      { kind: 'agent', event: { type: 'result', subtype: 'success', duration_ms: 45, num_turns: 0 } },
      1_700_000_000_100,
    )

    expect(state.status).toBe('idle')
    expect(state.turnStartedAt).toBeUndefined()
  })

  // A turn that genuinely ended in nothing does have to extinguish the spinner: there was no start-up
  // before it, so this is a real outcome.
  it('leaves a zero turn mid-conversation as an end of a turn', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(
      state,
      { kind: 'agent', event: { type: 'result', subtype: 'success', duration_ms: 120, num_turns: 0 } },
      1_700_000_000_120,
    )

    expect(state.status).toBe('idle')
    expect(state.items.filter((item) => item.kind === 'meta')).toHaveLength(1)
  })

  it('lets a /clear during a running turn extinguish the spinner rather than leave it hanging forever', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )
    expect(state.status).toBe('running')

    // A /clear sent while the previous turn is still thinking goes down the steering route - the very same
    // one as in 'a follow-up into a running turn does not wipe the agent unfinished answer' - and by itself
    // touches neither status nor turnStartedAt.
    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: '/clear' }], quotes: [], steering: true },
      1_700_000_000_500,
    )
    expect(state.status).toBe('running')

    state = reducePanel(
      state,
      { kind: 'agent', event: { type: 'conversation_reset' } },
      1_700_000_001_000,
    )

    expect(state.status).toBe('idle')
    expect(state.turnStartedAt).toBeUndefined()
    expect(state.pausedMs).toBe(0)
    expect(state.waitStartedAt).toBeUndefined()
    expect(state.stopRequestedAt).toBeUndefined()
    expect(state.starting).toBe(false)
  })

  it('lets a /clear during a context compaction drop the flag rather than kill the status line forever', () => {
    let state = play([compactingStatusEvent()])
    expect(state.compacting).toBe(true)

    state = reducePanel(state, { kind: 'agent', event: { type: 'conversation_reset' } })

    expect(state.compacting).toBe(false)
  })

  it('shows your own turn at once, without waiting for the agent', () => {
    const state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )

    expect(state.status).toBe('running')
    expect(state.items).toHaveLength(1)
    expect(state.items[0]?.kind).toBe('user')
  })

  it('a follow-up into a running turn does not wipe the agent unfinished answer', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Reading the file' } },
      },
    })

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'wait, not that one' }], quotes: [], steering: true },
      1_700_000_000_000,
    )

    expect(state.streamingText).toBe('Reading the file')
    expect(state.items.at(-1)?.kind).toBe('user')
  })

  it('starts an ordinary turn from a clean sheet rather than continuing the previous stream', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'a fragment' } },
      },
    })

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'a new task' }], quotes: [] },
      1_700_000_000_000,
    )

    expect(state.streamingText).toBe('')
  })

  it('assembles a thought from its pieces live and extinguishes the buffer with the finished block', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'I should ' } },
      },
    })
    state = reducePanel(state, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'look at the file.' } },
      },
    })

    expect(state.streamingThinking).toBe('I should look at the file.')
    expect(state.items.filter((item) => item.kind === 'think')).toHaveLength(0)

    state = reducePanel(state, {
      kind: 'agent',
      event: { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'I should look at the file.' }] } },
    })

    // The finished block extinguishes the live buffer - otherwise its own duplicated draft would hang under
    // the finished card for another second.
    expect(state.streamingThinking).toBe('')
    const thinks = state.items.filter((item): item is ThinkItem => item.kind === 'think')
    expect(thinks).toHaveLength(1)
    expect(thinks[0]?.pending).toBe(false)
  })

  it('does not let a subagent thought leak into the main buffer', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'someone else thought' } },
        parent_tool_use_id: 'toolu_task1',
      },
    })

    expect(state.streamingThinking).toBe('')
  })

  it('survives a message whose content is a string rather than a list of blocks', () => {
    // That is how the summary after a /compact arrives. The whole panel used to crash on it: the parsing
    // called array methods on the content straight away.
    const summary = 'There was a long conversation here, and this is its short retelling.'

    const state = play([
      { type: 'user', message: { content: summary } } as AgentEvent,
      { type: 'assistant', message: { content: summary } } as AgentEvent,
    ])

    const texts = state.items.filter((item): item is TextItem => item.kind === 'text')
    expect(texts).toHaveLength(1)
    expect(texts[0]?.paragraphs[0]?.parts[0]?.text).toBe(summary)
  })

  it('does not break on an unfamiliar event', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: { type: 'rate_limit_event' } as unknown as AgentEvent,
    })

    expect(state).toEqual(initialPanelState)
  })

  describe('the subscription limit', () => {
    /** An hour past the moment `play` calls "now" - a window that has not reset yet. */
    const AHEAD = 1_700_003_600
    /** An hour before it: the same event, arriving about a window that has already gone. */
    const BEHIND = 1_699_996_400

    const limitEvent = (
      info: Partial<NonNullable<AgentRateLimitEvent['rate_limit_info']>>,
    ): AgentEvent => ({
      type: 'rate_limit_event',
      rate_limit_info: { rateLimitType: 'five_hour', resetsAt: AHEAD, ...info },
    })

    const limits = (state: PanelState): LimitItem[] =>
      state.items.filter((item): item is LimitItem => item.kind === 'limit')

    it('stays silent about a request that got through: the feed is not a summary of the subscription state', () => {
      expect(play([limitEvent({ status: 'allowed' })]).items).toEqual([])
    })

    it('says the work has stopped, and until when - as a limit rather than as a breakage', () => {
      const [row] = limits(play([limitEvent({ status: 'rejected' })]))

      expect(row?.state).toBe('waiting')
      expect(row?.window).toBe('5-hour')
      expect(row?.resetsAt).toBe(AHEAD * 1000)
      // Not an error: nothing is broken, there is nothing to fix and nothing to close with a cross.
      expect(play([limitEvent({ status: 'rejected' })]).items.some((item) => item.kind === 'error')).toBe(false)
    })

    it('calls a used-up limit that is being paid for extra usage rather than a stop', () => {
      const [row] = limits(play([limitEvent({ status: 'rejected', isUsingOverage: true })]))

      expect(row?.state).toBe('extra')
    })

    it('takes the older flag for the same thing: which of the two arrives depends on the CLI', () => {
      const [row] = limits(play([limitEvent({ status: 'rejected', overageInUse: true })]))

      expect(row?.state).toBe('extra')
    })

    it('stays silent during the grace period: the limit is over but the step is allowed to finish', () => {
      expect(play([limitEvent({ status: 'rejected', rateLimitGraceActive: true })]).items).toEqual([])
    })

    it('throws away a signal about a window that has already reset', () => {
      expect(play([limitEvent({ status: 'rejected', resetsAt: BEHIND })]).items).toEqual([])
    })

    it('does not lay a repeated event down as a second row', () => {
      const state = play([limitEvent({ status: 'rejected' }), limitEvent({ status: 'rejected' })])

      expect(limits(state)).toHaveLength(1)
    })

    it('says a limit used up in the next window again: the first row has gone by then', () => {
      const state = play([
        limitEvent({ status: 'rejected' }),
        limitEvent({ status: 'rejected', resetsAt: AHEAD + 18_000 }),
      ])

      expect(limits(state).map((row) => row.resetsAt)).toEqual([AHEAD * 1000, (AHEAD + 18_000) * 1000])
    })

    it('says it when the state changes: a wait that turned into paid work is news', () => {
      const state = play([
        limitEvent({ status: 'rejected' }),
        limitEvent({ status: 'rejected', isUsingOverage: true }),
      ])

      expect(limits(state).map((row) => row.state)).toEqual(['waiting', 'extra'])
    })

    it('names the weekly windows the way the CLI does, and stays quiet about ones it does not know', () => {
      const named = (rateLimitType: string): string | undefined =>
        limits(play([limitEvent({ status: 'rejected', rateLimitType })]))[0]?.window

      expect(named('seven_day')).toBe('weekly')
      expect(named('seven_day_opus')).toBe('weekly Opus')
      // A bucket that appears in a later CLI must not turn into "your seven_day_whatever limit".
      expect(named('seven_day_whatever')).toBe('')
    })
  })

  describe('grouping tool calls', () => {
    it('collects consecutive calls into one group, even across a pause between a turn inner steps', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      // t1 has already resolved - for an instant the group became pending:false, but the next call comes
      // without a single text block between them and has to land in the same group.
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)
      state = play([toolResultEvent('t2', 'ok')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.toolName)).toEqual(['Read', 'Bash'])
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.duration).toMatch(/s$/)
    })

    it('opens a new group when text stands between the calls', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      state = play([textEvent('Found the file.')], state)
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)
      state = play([toolResultEvent('t2', 'ok')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(2)
      expect(groups[0]?.tools).toHaveLength(1)
      expect(groups[1]?.tools).toHaveLength(1)
    })

    it('keeps a model thought out of the group of calls beside it and makes it a card of its own', () => {
      let state = play([
        { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'I should look at the file.' }] } },
      ])
      state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })], state)
      state = play([toolResultEvent('t1', 'line 1')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.chip)).toEqual(['READ'])

      const thinks = state.items.filter((item): item is ThinkItem => item.kind === 'think')
      expect(thinks).toHaveLength(1)
      expect(thinks[0]?.thoughts).toEqual(['I should look at the file.'])
      expect(thinks[0]?.pending).toBe(false)
    })

    /**
     * The model thinks between calls almost always, and every thought as a card of its own sliced the feed
     * into strips - a call, a thought, a call, a thought.
     */
    it('piles the thoughts between calls into one card while the calls stay one group', () => {
      const think = (thought: string) =>
        ({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: thought }] } }) as AgentEvent

      let state = play([think('First I will look at the file.')])
      state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })], state)
      state = play([toolResultEvent('t1', 'line 1')], state)
      state = play([think('Now I will search the project.')], state)
      state = play([toolUseEvent('t2', 'Grep', { pattern: 'Session' })], state)
      state = play([toolResultEvent('t2', 'a.ts:1')], state)
      state = play([think('Done, I can answer.')], state)

      const thinks = state.items.filter((item): item is ThinkItem => item.kind === 'think')
      expect(thinks).toHaveLength(1)
      expect(thinks[0]?.thoughts).toEqual(['First I will look at the file.', 'Now I will search the project.', 'Done, I can answer.'])

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.chip)).toEqual(['READ', 'GREP'])
    })

    // Something said aloud ends a piece of a turn: after it the model thinks about something else.
    it('starts a new card for a thought after the agent answer', () => {
      let state = play([
        { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'First I will look at the file.' }] } },
      ])
      state = play([{ type: 'assistant', message: { content: [{ type: 'text', text: 'Looked, it is empty.' }] } }], state)
      state = play([{ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'What next?' }] } }], state)

      const thinks = state.items.filter((item): item is ThinkItem => item.kind === 'think')
      expect(thinks).toHaveLength(2)
      expect(thinks[0]?.thoughts).toEqual(['First I will look at the file.'])
      expect(thinks[1]?.thoughts).toEqual(['What next?'])
    })

    it('closes the unfinished calls inside a group when the session breaks off', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)

      state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_005_000)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.isError).toBe(true)
      expect(groups[0]?.tools.at(-1)?.meta).toBe('· interrupted')
      expect(state.crashed).toBe(true)
    })

    it('lets an interrupted turn close the call that was running at that moment', () => {
      let state = reducePanel(
        initialPanelState,
        { kind: 'prompt', tokens: [{ kind: 'text', value: 'do it' }], quotes: [] },
        1_700_000_000_000,
      )
      state = play([toolUseEvent('t1', 'Bash', { command: 'sleep 300' })], state)
      state = reducePanel(state, { kind: 'stopRequested' }, 1_700_000_002_000)
      state = reducePanel(state, { kind: 'agent', event: resultEvent(2_500) }, 1_700_000_002_500)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.meta).toBe('· interrupted')
      // A card's counter lives in startedAt - leaving the record means going on recomputing the duration on
      // every tick.
      expect(state.startedAt.t1).toBeUndefined()
    })

    it('lets the end of a turn close a call whose result never reached the panel', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = reducePanel(state, { kind: 'agent', event: resultEvent(1_000) }, 1_700_000_001_000)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups[0]?.tools.at(-1)?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.meta).toBe('· unfinished')
    })

    it('lets a background subagent outlive the end of a turn: its end brings a notification', () => {
      let state = play([
        toolUseEvent('a1', 'Task', { description: 'review', prompt: 'look at the diff' }),
        toolResultEvent('a1', 'Async agent launched successfully. Agent id: a1'),
      ])
      state = reducePanel(state, { kind: 'agent', event: resultEvent(800) }, 1_700_000_000_800)

      const tasks = state.items.filter((item): item is TaskItem => item.kind === 'task')
      expect(tasks).toHaveLength(1)
      expect(tasks[0]?.pending).toBe(true)
      expect(tasks[0]?.outcome).toBeUndefined()
    })

    it('computes the group full span on a re-append after a resolve (regression)', () => {
      const T0 = 1_700_000_000_000
      // T0: tool1 called
      let state = reducePanel(
        initialPanelState,
        { kind: 'agent', event: toolUseEvent('t1', 'Read', { file_path: 'a.ts' }) },
        T0,
      )
      // T0 + 2s: tool1 resolves
      state = reducePanel(
        state,
        { kind: 'agent', event: toolResultEvent('t1', 'ok') },
        T0 + 2_000,
      )

      let groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.duration).toMatch(/2\.0+s/)

      // T0 + 2.5s: tool2 called (no text between, same group)
      state = reducePanel(
        state,
        { kind: 'agent', event: toolUseEvent('t2', 'Bash', { command: 'ls' }) },
        T0 + 2_500,
      )

      groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools).toHaveLength(2)
      expect(groups[0]?.pending).toBe(true)

      // T0 + 5.5s: tool2 resolves (group should now show full 5.5s span, not just 2s)
      state = reducePanel(
        state,
        { kind: 'agent', event: toolResultEvent('t2', 'ok') },
        T0 + 5_500,
      )

      groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      // Duration should reflect full span from T0 to T0+5.5s, not just the first 2s
      expect(groups[0]?.duration).toMatch(/5\.5+s/)
    })

    it('does not touch or reopen a closed group when a model thought follows (regression)', () => {
      const T0 = 1_700_000_000_000
      // T0: tool1 called
      let state = reducePanel(
        initialPanelState,
        { kind: 'agent', event: toolUseEvent('t1', 'Read', { file_path: 'a.ts' }) },
        T0,
      )
      // T0 + 1s: tool1 resolves - the group closes, pending: false, the duration is fixed.
      state = reducePanel(state, { kind: 'agent', event: toolResultEvent('t1', 'ok') }, T0 + 1_000)

      let groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      const closedDuration = groups[0]?.duration
      expect(closedDuration).toMatch(/1\.0+s/)

      // T0 + 1.2s: the model's thought arrives right after, with no text between them. That used to land in
      // the same group (by the group-continuity rule) and threatened to make it pending again without a
      // result of its own - now a thought does not go through the grouping at all, so it never gets as far
      // as that branch any more.
      state = reducePanel(
        state,
        {
          kind: 'agent',
          event: {
            type: 'assistant',
            message: { content: [{ type: 'thinking', thinking: 'Done, I can answer.' }] },
          },
        },
        T0 + 1_200,
      )

      groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.duration).toBe(closedDuration)

      const thinks = state.items.filter((item): item is ThinkItem => item.kind === 'think')
      expect(thinks).toHaveLength(1)
      expect(thinks[0]?.thoughts).toEqual(['Done, I can answer.'])
    })

    it('empties startedAt once every call of the turn has resolved', () => {
      const T0 = 1_700_000_000_000
      let state = reducePanel(
        initialPanelState,
        { kind: 'agent', event: toolUseEvent('t1', 'Read', { file_path: 'a.ts' }) },
        T0,
      )
      expect(Object.keys(state.startedAt)).not.toHaveLength(0)

      state = reducePanel(state, { kind: 'agent', event: toolResultEvent('t1', 'ok') }, T0 + 1_000)

      expect(Object.keys(state.startedAt)).toHaveLength(0)
    })
  })
})

describe('a background subagent log', () => {
  it('piles the steps into TaskItem.log through the task_id-to-tool_use_id map rather than losing them', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentMessageEvent('toolu-parent', 'Reading the configs')], state)
    state = play([subagentMessageEvent('toolu-parent', 'Reading the server')], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task).toBeDefined()
    expect(task?.log.map((line) => line.text)).toEqual(['Reading the configs', 'Reading the server'])
  })

  it('shows the target of a subagent tool call rather than a bare name', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play(
      [subagentToolUseEvent('toolu-parent', 'sub-t1', 'Bash', { command: 'grep -rn "context" webview/src' })],
      state,
    )

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.log.map((line) => line.text)).toEqual(['Bash: grep -rn "context" webview/src'])
  })

  it('leaves a call without a more precise target as a bare name - without a "Bash: Bash"', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentToolUseEvent('toolu-parent', 'sub-t1', 'TodoWrite', {})], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.log.map((line) => line.text)).toEqual(['TodoWrite…'])
  })

  it('does not let task_progress duplicate a tool already noted by the subagent main stream', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentToolUseEvent('toolu-parent', 'sub-t1', 'Bash', { command: 'grep -rn "context" src' })], state)
    state = play([taskProgressEvent('task-1', 'Bash')], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.log.map((line) => line.text)).toEqual(['Bash: grep -rn "context" src'])
  })

  it('adds a task_progress with a different tool anyway', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentToolUseEvent('toolu-parent', 'sub-t1', 'Bash', { command: 'grep -rn "context" src' })], state)
    state = play([taskProgressEvent('task-1', 'Read')], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.log.map((line) => line.text)).toEqual(['Bash: grep -rn "context" src', '→ Read'])
  })

  it('lets a subagent AskUserQuestion create an AskItem with a taskId rather than lose it in the log', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentAskEvent('toolu-parent')], state)

    const ask = state.items.find((item) => item.kind === 'ask')
    expect(ask).toBeDefined()
    expect(ask?.kind === 'ask' && ask.taskId).toBe('task-1')
    expect(ask?.kind === 'ask' && ask.questions[0]?.title).toBe('Carry on?')
  })

  it('creates no card for an AskUserQuestion without a single question - there would be nothing to close it with', () => {
    const state = play([
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'ask-empty', name: 'AskUserQuestion', input: { questions: [] } }] },
      },
    ])

    expect(state.items.some((item) => item.kind === 'ask')).toBe(false)
  })

  it('creates no card for a subagent AskUserQuestion without questions either', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play(
      [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'ask-empty', name: 'AskUserQuestion', input: { questions: [] } }],
          },
          parent_tool_use_id: 'toolu-parent',
        },
      ],
      state,
    )

    expect(state.items.some((item) => item.kind === 'ask')).toBe(false)
  })

  it('trims the agent log after AGENT_LOG_LIMIT lines rather than growing it forever', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    for (let i = 0; i < 310; i += 1) {
      state = play([subagentMessageEvent('toolu-parent', `step ${i}`)], state)
    }

    const task = state.items.find((item) => item.kind === 'task')
    expect(task?.kind === 'task' && task.log.length).toBe(300)
    expect(task?.kind === 'task' && task.log[0]?.text).toMatch(/^…\d+ earlier steps trimmed$/)
    expect(task?.kind === 'task' && task.log.at(-1)?.text).toBe('step 309')
  })

  it('lets a permission action with a taskId create a PermItem tied to the agent', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'permission',
      id: 'perm-1',
      target: 'wants to run a command',
      command: 'npm test',
      mode: 'default',
      taskId: 'task-1',
    })

    const perm = state.items.find((item) => item.kind === 'perm')
    expect(perm?.kind === 'perm' && perm.taskId).toBe('task-1')
  })

  // The person chose the mode by its caption in the menu - they never saw it under its protocol name.
  it('signs a permission card with the mode the same way the menu signs it', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'permission',
      id: 'perm-2',
      target: 'wants to run a command',
      command: 'rm -rf build/*',
      mode: 'bypassPermissions',
    })

    const perm = state.items.find((item) => item.kind === 'perm')
    expect(perm?.kind === 'perm' && perm.meta).toBe('Bypass mode')
  })

  // The reason and the ban on "Always allow" arrive from the IDE - the panel only shows them.
  it('lets the question reason and the ban on remembering reach the card', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'permission',
      id: 'perm-3',
      target: 'wants to run a command',
      command: 'rm -rf build/*',
      mode: 'bypassPermissions',
      reason: 'Dangerous rm operation detected',
      rememberable: false,
    })

    const perm = state.items.find((item) => item.kind === 'perm')
    expect(perm?.kind === 'perm' && perm.reason).toBe('Dangerous rm operation detected')
    expect(perm?.kind === 'perm' && perm.rememberable).toBe(false)
  })

  // Silence means an ordinary question: the rule will fire and the button is in place.
  it('leaves a decision rememberable without a ban', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'permission',
      id: 'perm-4',
      target: 'wants to run a command',
      command: 'npm test',
      mode: 'manual',
    })

    const perm = state.items.find((item) => item.kind === 'perm')
    expect(perm?.kind === 'perm' && perm.rememberable).toBe(true)
    expect(perm?.kind === 'perm' && perm.reason).toBeUndefined()
  })

  it('ignores a subagent message with no task in the feed rather than crashing or making rubbish', () => {
    const before = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    const after = play([subagentMessageEvent('toolu-unknown', 'Hello from nowhere')], before)

    expect(after).toEqual(before)
  })
})

describe('one subagent - one card', () => {
  const tasks = (state: PanelState) => state.items.filter((item): item is TaskItem => item.kind === 'task')

  it('does not let an Agent call and the system event about it double the card', () => {
    const state = play([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
    ])

    expect(tasks(state)).toHaveLength(1)
    expect(tasks(state)[0]?.target).toBe('Explore')
  })

  it('lets the card remember the task name at the CLI - it is killed by that name', () => {
    // The card was started by the tool call, and it knows only its own identifier: the task's genuine name
    // arrives next, through a system event. Without it the cross on the chip would have nothing to send.

    const state = play([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
    ])

    expect(tasks(state)[0]?.id).toBe('toolu-1')
    expect(tasks(state)[0]?.taskId).toBe('a90aa')
  })

  it('gives one card for the reverse order too - the event before the call', () => {
    const state = play([
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
    ])

    expect(tasks(state)).toHaveLength(1)
  })

  it('lets the steps and the outcome by task_id reach the card started by the call', () => {
    let state = play([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
    ])
    state = play([taskProgressEvent('a90aa', 'Read')], state)
    state = reducePanel(
      state,
      { kind: 'agent', event: taskNotificationEvent('a90aa', 'completed', 'Found six places') },
      1_700_000_005_000,
    )

    const task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.duration).toBe('5.0s')
    expect(task?.outcome).toBe('ok')
    expect(task?.log.map((line) => line.text)).toEqual(['→ Read', 'Found six places'])
  })

  it('does not let the background launch confirmation close the card - we wait for task_notification', () => {
    let state = play([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
      toolResultEvent('toolu-1', 'Async agent launched successfully. Agent ID: a90aa'),
    ])

    let task = tasks(state)[0]
    expect(task?.pending).toBe(true)
    expect(task?.outcome).toBeUndefined()

    state = reducePanel(
      state,
      { kind: 'agent', event: taskNotificationEvent('a90aa', 'completed', 'Found six places') },
      1_700_000_005_000,
    )

    task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.outcome).toBe('ok')
  })

  it('lets a call result close the card started by a system event', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([toolResultEvent('toolu-parent', 'Done')], state)

    const task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.outcome).toBe('ok')
  })

  it('marks an agent that was cut short as stopped rather than as finished', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([taskNotificationEvent('task-1', 'stopped')], state)

    const task = tasks(state)[0]
    expect(task?.outcome).toBe('stopped')
    expect(task?.log.map((line) => line.text)).toEqual(['Stopped before it finished.'])
  })

  /**
   * That is how the subagents raised by a skill arrive (/code-review and the like): they have no call of
   * their own in the main stream at all - only a system event about the launch - which means there is no
   * "Async agent launched" answer to recognise a background agent by either. The turn meanwhile reports the
   * launch and ends by itself while they work: closing them by its outcome, the panel extinguished the chips
   * of a dozen working agents at exactly the moment they had to be watched.
   */

  it('lets an agent raised by a skill outlive the natural end of a turn', () => {
    let state = play([agentTaskStartedEvent('a90aa', 'toolu-inner', 'general-purpose')])
    state = reducePanel(state, { kind: 'agent', event: resultEvent(5_000) }, 1_700_000_005_000)

    const task = tasks(state)[0]
    expect(task?.pending).toBe(true)
    expect(task?.outcome).toBeUndefined()
    // The card's counter goes on running from the launch: the work has not ended.
    expect(state.startedAt['a90aa']).toBe(1_700_000_000_000)

    state = reducePanel(
      state,
      { kind: 'agent', event: taskNotificationEvent('a90aa', 'completed', 'Found six places') },
      1_700_000_010_000,
    )

    expect(tasks(state)[0]?.pending).toBe(false)
    expect(tasks(state)[0]?.outcome).toBe('ok')
  })

  it('does close such an agent on an interrupted turn: it was cut short along with the turn', () => {
    let state = play([agentTaskStartedEvent('a90aa', 'toolu-inner', 'general-purpose')])
    state = reducePanel(state, { kind: 'stopRequested' }, 1_700_000_004_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(5_000) }, 1_700_000_005_000)

    const task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.outcome).toBe('stopped')
    expect(task?.log.at(-1)?.text).toBe('Stopped before it returned.')
  })

  it('lets a background agent outlive an interrupted turn too: stopping the turn does not concern it', () => {
    let state = play([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
      toolResultEvent('toolu-1', 'Async agent launched successfully. Agent ID: a90aa'),
    ])
    state = reducePanel(state, { kind: 'stopRequested' }, 1_700_000_004_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(5_000) }, 1_700_000_005_000)

    expect(tasks(state)[0]?.pending).toBe(true)
  })

  it('closes working agents too when the process dies: they have nobody to report to', () => {
    let state = play([agentTaskStartedEvent('a90aa', 'toolu-inner', 'general-purpose')])
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_005_000)

    const task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.log.at(-1)?.text).toBe('Session ended before this returned.')
  })
})

describe('background commands in the task channel', () => {
  const bashEvent = (id: string, command: string, background = false): AgentEvent =>
    toolUseEvent(id, 'Bash', { command, description: 'Start the dev server', ...(background ? { run_in_background: true } : {}) })

  /** A command's card lies inside a group of calls rather than in the feed directly. */
  const tool = (state: PanelState, id: string) =>
    state.items
      .filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      .flatMap((group) => group.tools)
      .find((item) => item.id === id)

  it('does not turn an ordinary long command into an agent', () => {
    const state = play([
      bashEvent('toolu-1', 'yarn typecheck'),
      bashTaskStartedEvent('b0eb4', 'toolu-1', 'Update the metrics test and typecheck'),
    ])

    expect(state.items.some((item) => item.kind === 'task')).toBe(false)
    expect(state.background).toHaveLength(0)
  })

  it('gives a background command a chip but no agent card', () => {
    const state = play([
      bashEvent('toolu-1', 'yarn dev', true),
      bashTaskStartedEvent('bv7hh', 'toolu-1', 'Start the dev server'),
    ])

    expect(state.items.some((item) => item.kind === 'task')).toBe(false)
    expect(state.background).toEqual([
      {
        id: 'bv7hh',
        toolUseId: 'toolu-1',
        label: 'yarn dev',
        description: 'Start the dev server',
        // The whole command, which is what the chip's tooltip shows - the caption alone cannot say what
        // a long-running loop is waiting for.
        command: 'yarn dev',
        duration: '0.0s',
      },
    ])
  })

  it('ticks a background command time and counts it in hours past an hour', () => {
    let state = play([
      bashEvent('toolu-1', 'yarn dev', true),
      bashTaskStartedEvent('bv7hh', 'toolu-1', 'Start the dev server'),
    ])
    state = reducePanel(state, { kind: 'tick' }, 1_700_000_000_000 + 60_608_000)

    expect(state.background[0]?.duration).toBe('16h 50m 08s')
  })

  it('lets the end of a background command take the chip off and sign its card', () => {
    let state = play([
      bashEvent('toolu-1', 'yarn dev', true),
      bashTaskStartedEvent('bv7hh', 'toolu-1', 'Start the dev server'),
    ])
    state = reducePanel(
      state,
      { kind: 'agent', event: taskNotificationEvent('bv7hh', 'stopped') },
      1_700_000_030_000,
    )

    expect(state.background).toHaveLength(0)
    expect(tool(state, 'toolu-1')?.duration).toBe('30s')
    expect(tool(state, 'toolu-1')?.detail.map((line) => line.text)).toContain(
      'Background command was stopped after 30s.',
    )
    expect(tool(state, 'toolu-1')?.isError).toBe(false)
  })

  it('reddens a background command that failed and explains the reason', () => {
    let state = play([
      bashEvent('toolu-1', 'yarn dev', true),
      bashTaskStartedEvent('bv7hh', 'toolu-1', 'Start the dev server'),
    ])
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: taskNotificationEvent('bv7hh', 'failed', 'Background command "Start the dev server" failed with exit code 3'),
      },
      1_700_000_002_000,
    )

    const command = tool(state, 'toolu-1')
    expect(command?.isError).toBe(true)
    expect(command?.detail.map((line) => line.text)).toEqual([
      'Background command failed after 2.0s.',
      'Background command "Start the dev server" failed with exit code 3',
    ])
  })

  it('takes the chips off when the process dies: there is nobody left to watch the command', () => {
    let state = play([
      bashEvent('toolu-1', 'yarn dev', true),
      bashTaskStartedEvent('bv7hh', 'toolu-1', 'Start the dev server'),
    ])
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_060_000)

    expect(state.background).toHaveLength(0)
    expect(tool(state, 'toolu-1')?.detail.map((line) => line.text)).toContain(
      'Ran 1m 00s in the background - no longer tracked.',
    )
  })
})

describe('the task list through TodoWrite', () => {
  // activeForm is the same item named as the business happening right now. It arrives from the model along
  // with the item's other fields and is kept beside it.
  it('remembers an item activeForm beside the item itself', () => {
    const state = play([
      toolUseEvent('t1', 'TodoWrite', {
        todos: [
          { content: 'Build the project', activeForm: 'Building the project', status: 'in_progress' },
          { content: 'Run the tests', status: 'pending' },
        ],
      }),
    ])

    const todo = [...state.items].reverse().find((item): item is TodoItem => item.kind === 'todo')
    expect(todo?.todos).toEqual([
      { id: 'todo-0', text: 'Build the project', state: 'active', activeForm: 'Building the project' },
      { id: 'todo-1', text: 'Run the tests', state: 'todo' },
    ])
  })
})

describe('the task list through TaskCreate/TaskUpdate', () => {
  const taskCreatedResult = (id: string, n: number, subject: string): AgentEvent =>
    toolResultEvent(id, `Task #${n} created successfully: ${subject}`)

  const latestTodo = (state: PanelState) =>
    [...state.items].reverse().find((item): item is TodoItem => item.kind === 'todo')

  it('lets a task appear in the list only after the answer with its assigned number', () => {
    const mid = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Build the project', description: '...' })])
    expect(latestTodo(mid)).toBeUndefined()

    const after = play([taskCreatedResult('t1', 1, 'Build the project')], mid)
    expect(latestTodo(after)?.todos).toEqual([{ id: 'task-1', text: 'Build the project', state: 'todo' }])
  })

  /**
   * activeForm is the same item named as the business happening right now. It arrives only when the task is
   * created but is needed later - when its turn comes - and a status edit does not carry it.
   */

  it('lets a task activeForm outlive status edits', () => {
    let state = play([
      toolUseEvent('t1', 'TaskCreate', { subject: 'Build the project', activeForm: 'Building the project' }),
    ])
    state = play([taskCreatedResult('t1', 1, 'Build the project')], state)
    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'Build the project', state: 'todo', activeForm: 'Building the project' },
    ])

    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'in_progress' })], state)
    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'Build the project', state: 'active', activeForm: 'Building the project' },
    ])
  })

  it('lets a TaskUpdate with its own activeForm override the previous one', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Build', activeForm: 'Building' })])
    state = play([taskCreatedResult('t1', 1, 'Build')], state)

    state = play(
      [toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'in_progress', activeForm: 'Rebuilding' })],
      state,
    )
    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'Build', state: 'active', activeForm: 'Rebuilding' },
    ])
  })

  it('lets a TaskUpdate move the status of the same task by its number', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Build the project' })])
    state = play([taskCreatedResult('t1', 1, 'Build the project')], state)

    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'in_progress' })], state)
    expect(latestTodo(state)?.todos).toEqual([{ id: 'task-1', text: 'Build the project', state: 'active' }])

    state = play([toolUseEvent('t3', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)
    expect(latestTodo(state)?.todos).toEqual([{ id: 'task-1', text: 'Build the project', state: 'done' }])
  })

  it('lets several tasks keep their number and order regardless of the order of the edits', () => {
    let state = play([
      toolUseEvent('t1', 'TaskCreate', { subject: 'First' }),
      toolUseEvent('t2', 'TaskCreate', { subject: 'Second' }),
    ])
    state = play([taskCreatedResult('t1', 1, 'First'), taskCreatedResult('t2', 2, 'Second')], state)

    // The second is marked before the first - the order in the panel stays by task number.
    state = play([toolUseEvent('t3', 'TaskUpdate', { taskId: '2', status: 'completed' })], state)

    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'First', state: 'todo' },
      { id: 'task-2', text: 'Second', state: 'done' },
    ])
  })

  it('lets status: deleted take a task out of the list entirely', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Not needed' })])
    state = play([taskCreatedResult('t1', 1, 'Not needed')], state)

    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'deleted' })], state)
    expect(latestTodo(state)?.todos).toEqual([])
  })

  // A TaskUpdate for a number the panel has not seen (a task of a background agent unconnected to this
  // panel's list, say) must neither bring the feed down nor create a task out of nowhere.

  it('does nothing for a TaskUpdate on an unknown task number', () => {
    const before = play([toolUseEvent('t1', 'TaskCreate', { subject: 'A task' })])
    const after = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '99', status: 'completed' })], before)
    expect(after).toEqual(before)
  })

  // The tool's answer is the only place a task's number is learned from; if the wording ever changes, the
  // task simply must not appear in the list - neither with a muddled number nor breaking the other tasks in
  // it. The panel draws nothing for an empty list anyway (see TaskListPanel).

  it('quietly skips a task whose TaskCreate answer text was not recognised', () => {
    const state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'A task' })])
    const after = play([toolResultEvent('t1', 'Done, the task was added')], state)
    expect(latestTodo(after)?.todos).toEqual([])
  })

  const newPrompt = (state: PanelState, text: string): PanelState =>
    reducePanel(state, { kind: 'prompt', tokens: [{ kind: 'text', value: text }], quotes: [] }, 1_700_000_000_000)

  // The new tracker's task list does not itself tell one request of a conversation from another - from its
  // point of view this is one list for the whole session. The boundary is drawn by the panel at a new
  // message from the person rather than by whether the list is closed at the moment: if the boundary were
  // "the list is empty right now", the tasks the agent leads one at a time (created - did it - closed -
  // created the next) would wipe one another at every step, exactly as the user complained on a live run.


  it('lets a new message from the user start the task list afresh', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'An old task' })])
    state = play([taskCreatedResult('t1', 1, 'An old task')], state)
    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)

    state = newPrompt(state, 'another, unrelated request')
    state = play([toolUseEvent('t3', 'TaskCreate', { subject: 'A new task' })], state)
    state = play([taskCreatedResult('t3', 2, 'A new task')], state)

    expect(latestTodo(state)?.todos).toEqual([{ id: 'task-2', text: 'A new task', state: 'todo' }])
  })

  it('lets a new message hide an unclosed list - otherwise the panel holds the previous request', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'An old task' })])
    state = play([taskCreatedResult('t1', 1, 'An old task')], state)

    state = newPrompt(state, 'carry on after the limit')
    expect(latestTodo(state)?.todos).toEqual([])

    // The agent tries to close the old numbers - they are gone, and the panel must not come back to life.
    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)
    expect(latestTodo(state)?.todos).toEqual([])
  })

  it('does not duplicate a fully closed list with an empty snapshot on a new message', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'An old task' })])
    state = play([taskCreatedResult('t1', 1, 'An old task')], state)
    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)

    const before = latestTodo(state)
    state = newPrompt(state, 'another, unrelated request')
    expect(latestTodo(state)).toEqual(before)
  })

  it('piles the tasks of one and the same request together, even if they are led one at a time', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'First' })])
    state = play([taskCreatedResult('t1', 1, 'First')], state)
    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)

    // The first is closed already, but there was no new message - this is the same list, the agent simply
    // moved on to the next item of the same request.
    state = play([toolUseEvent('t3', 'TaskCreate', { subject: 'Second' })], state)
    state = play([taskCreatedResult('t3', 2, 'Second')], state)

    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'First', state: 'done' },
      { id: 'task-2', text: 'Second', state: 'todo' },
    ])
  })

  // A follow-up into a running turn is not a new request but an addition to the same one (see the comment
  // at case 'prompt'): it does not touch the task list.
  it('does not reset the task list on a follow-up into a running turn', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'First' })])
    state = play([taskCreatedResult('t1', 1, 'First')], state)

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'yes, and this too' }], quotes: [], steering: true },
      1_700_000_000_000,
    )

    expect(latestTodo(state)?.todos).toEqual([{ id: 'task-1', text: 'First', state: 'todo' }])
  })
})

describe('compacting the context', () => {
  it('lets a "compacting" status start a pending CONTEXT card at once, without waiting for the outcome', () => {
    const state = play([compactingStatusEvent()])
    const compact = state.items.find((item): item is CompactItem => item.kind === 'compact')

    expect(state.compacting).toBe(true)
    expect(compact?.pending).toBe(true)
    expect(compact?.target).toBe('Compacting conversation…')
  })

  it('lets a compact_boundary update that same card with real numbers rather than create a second one', () => {
    let state = play([compactingStatusEvent()])
    state = play(
      [compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 168000, post_tokens: 41000, duration_ms: 3200 })],
      state,
    )

    const compactItems = state.items.filter((item) => item.kind === 'compact')
    expect(compactItems).toHaveLength(1)
    expect(compactItems[0]?.kind === 'compact' && compactItems[0].pending).toBe(false)
    expect(compactItems[0]?.kind === 'compact' && compactItems[0].target).toBe(
      'automatically compacted 168.0k of context into a 41.0k summary in 3.2s',
    )
  })

  it('falls back to the previous wording without post_tokens/duration_ms', () => {
    const state = play([compactBoundaryEvent({ trigger: 'manual', pre_tokens: 5000 })])
    const compact = state.items.find((item): item is CompactItem => item.kind === 'compact')

    expect(compact?.pending).toBe(false)
    expect(compact?.target).toBe('manually compacted 5.0k of context into a summary')
  })

  it('creates a finished card for a compact_boundary without a preceding ping too', () => {
    const state = play([compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 90000, post_tokens: 30000 })])
    const compact = state.items.find((item): item is CompactItem => item.kind === 'compact')

    expect(compact?.pending).toBe(false)
    expect(compact?.target).toBe('automatically compacted 90.0k of context into a 30.0k summary')
  })

  it('lets the closing status extinguish the compacting flag without touching an already finished card', () => {
    let state = play([compactingStatusEvent()])
    state = play([compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 168000 })], state)
    const before = state.items.find((item) => item.kind === 'compact')

    state = play([compactResultEvent('completed')], state)

    expect(state.compacting).toBe(false)
    expect(state.items.find((item) => item.kind === 'compact')).toEqual(before)
  })

  it('quietly removes a pending card with no compact_boundary rather than leave it hanging forever', () => {
    let state = play([compactingStatusEvent()])
    expect(state.items.some((item) => item.kind === 'compact')).toBe(true)

    state = play([compactResultEvent('completed')], state)

    expect(state.items.some((item) => item.kind === 'compact')).toBe(false)
    expect(state.compacting).toBe(false)
  })

  it('puts an error in the feed for a failed compaction attempt', () => {
    let state = play([compactingStatusEvent()])
    state = play([compactResultEvent('failed', 'Compaction failed · conversation could not be reduced')], state)

    expect(errorTexts(state)).toContain('Compaction failed · conversation could not be reduced')
  })

  it('lets the compaction boundary extinguish the flag itself: the outcome may never come as a status', () => {
    let state = play([compactingStatusEvent()])
    state = play([compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 168000 })], state)

    expect(state.compacting).toBe(false)
  })

  it('drops the flag and removes the half-drawn card when the process breaks off mid-compaction', () => {
    let state = play([compactingStatusEvent()])
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_000_000)

    expect(state.compacting).toBe(false)
    expect(state.items.some((item) => item.kind === 'compact')).toBe(false)
  })

  it('drops the flag for a turn that closed mid-compaction too: the closing status will not come now', () => {
    let state = play([compactingStatusEvent()])
    state = play([resultEvent(1200)], state)

    expect(state.compacting).toBe(false)
    expect(state.items.some((item) => item.kind === 'compact')).toBe(false)
  })

  it('drops the flag for a killed conversation: otherwise the status line vanishes for the tab rest of life', () => {
    let state = play([compactingStatusEvent()])
    state = reducePanel(state, { kind: 'status', status: 'idle' }, 1_700_000_000_000)

    expect(state.compacting).toBe(false)
  })

  it('does not let a parallel subagent compaction kill the main stream status line or start a CONTEXT card', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'code-review')])
    state = play([compactingStatusEvent('task-1')], state)

    expect(state.compacting).toBe(false)
    expect(state.items.some((item) => item.kind === 'compact')).toBe(false)
  })

  it('does not let a subagent own compact_boundary close or muddle the main stream pending CONTEXT card', () => {
    let state = play([compactingStatusEvent()])
    state = play([taskStartedEvent('task-1', 'toolu-parent', 'code-review')], state)
    state = play([compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 5000 }, 'task-1')], state)

    expect(state.compacting).toBe(true)
    const compact = state.items.find((item): item is CompactItem => item.kind === 'compact')
    expect(compact?.pending).toBe(true)
  })
})

describe('the branch and the PR from the background polling', () => {
  it('lets the branch arrive in its own message, apart from the PR - without wiping a known PR', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'project',
      pullRequest: '42',
      pullRequestUrl: 'https://github.com/x/y/pull/42',
    })
    state = reducePanel(state, { kind: 'project', gitBranch: 'feature/foo' })

    expect(state.project?.gitBranch).toBe('feature/foo')
    expect(state.project?.pullRequest).toBe('42')
    expect(state.project?.pullRequestUrl).toBe('https://github.com/x/y/pull/42')
  })

  it('lets the PR arrive in its own message, apart from the branch - without wiping a known branch', () => {
    let state = reducePanel(initialPanelState, { kind: 'project', gitBranch: 'main' })
    state = reducePanel(state, { kind: 'project', pullRequest: '7', pullRequestUrl: 'https://github.com/x/y/pull/7' })

    expect(state.project?.gitBranch).toBe('main')
    expect(state.project?.pullRequest).toBe('7')
  })

  it('lets an empty string from a fresh PR check explicitly clear the old number rather than keep it', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'project',
      pullRequest: '42',
      pullRequestUrl: 'https://github.com/x/y/pull/42',
    })
    state = reducePanel(state, { kind: 'project', pullRequest: '', pullRequestUrl: '' })

    expect(state.project?.pullRequest).toBe('')
    expect(state.project?.pullRequestUrl).toBe('')
  })
})

describe('the context indicator', () => {
  it('does not let contextUsage divide by zero on a zero or negative limit', () => {
    const usage = { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    expect(contextUsage(usage, 0)).toBe(0)
    expect(contextUsage(usage, -50)).toBe(0)
  })

  it('takes the top-level usage as a snapshot for a single-step turn', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'result',
        subtype: 'success',
        num_turns: 1,
        usage: { input_tokens: 1_200, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    })

    expect(state.usage.input_tokens).toBe(1_200)
  })

  it('takes the last one rather than the sum for a multi-step turn with snapshots in iterations', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'result',
        subtype: 'success',
        num_turns: 2,
        usage: {
          input_tokens: 50_000, // the sum over every inner step
          output_tokens: 200,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          iterations: [
            { input_tokens: 20_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            { input_tokens: 1_200, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          ],
        },
      },
    })

    expect(state.usage.input_tokens).toBe(1_200)
  })

  it('does not overstate usage with the sum for a multi-step turn WITHOUT snapshots in iterations (regression)', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'result',
        subtype: 'success',
        num_turns: 1,
        usage: { input_tokens: 500, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    })
    expect(state.usage.input_tokens).toBe(500)

    // The turn called several steps inside itself (num_turns > 1), but no per-step snapshots arrived - the
    // top-level fields here are certainly a sum rather than a snapshot of "now". Trusting them silently is
    // not an option: the usage has to stay as it was rather than jump to the sum.

    state = reducePanel(state, {
      kind: 'agent',
      event: {
        type: 'result',
        subtype: 'success',
        num_turns: 3,
        usage: { input_tokens: 50_000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    })
    expect(state.usage.input_tokens).toBe(500)
  })
})

describe('a typing answer', () => {
  const deltaEvent = (text: string): AgentEvent => ({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  })

  it('piles up the pieces and takes a place in the feed on the very first of them', () => {
    const state = play([deltaEvent('Looking at '), deltaEvent('how the panel is built.')])

    expect(state.streamingText).toBe('Looking at how the panel is built.')
    expect(state.streamingId).toBeTruthy()
    // While the card is typing, there is no finished one in the feed yet.
    expect(state.items).toHaveLength(0)
  })

  it('gives the taken place to the same answer when it arrives as a finished block', () => {
    const printing = play([deltaEvent('Looking at '), deltaEvent('how the panel is built.')])
    const settled = play([textEvent('Looking at how the panel is built.')], printing)

    // The same id - which means that to React this is the same node: the card is not recreated but finishes
    // its tail, and the wave of the reveal does not break on the last words.
    expect(settled.items.map((item) => item.id)).toEqual([printing.streamingId])
    expect(settled.streamingText).toBe('')
    expect(settled.streamingId).toBeUndefined()
  })

  it('does not give the taken place to a second text block of the same message', () => {
    const printing = play([deltaEvent('The first answer.')])
    const settled = play(
      [
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'The first answer.' }, { type: 'text', text: 'The second answer.' }] },
        },
      ],
      printing,
    )

    const ids = settled.items.map((item) => item.id)
    expect(ids[0]).toBe(printing.streamingId)
    expect(ids[1]).not.toBe(printing.streamingId)
  })

  it('frees the taken place when the turn ended without any finished text', () => {
    const printing = play([deltaEvent('An answer cut short')])
    const stopped = play([resultEvent(1_000)], printing)

    expect(stopped.streamingText).toBe('')
    expect(stopped.streamingId).toBeUndefined()
  })
})

/**
 * A service block the model prints back at itself instead of merely reading it. Three such answers came out
 * of one real conversation, and each of them began with a reminder about a background agent that had just
 * finished (see spokenAnswer).
 */
describe('a service block at the front of an answer', () => {
  const answers = (state: PanelState) => state.items.filter((item): item is TextItem => item.kind === 'text')

  /** The shape it really arrives in: the tag is never closed, and the invented wrapper ends the block. */
  const echo = [
    '<system-reminder>',
    'Background agent afd28080854009bcc completed. Do NOT read the output file directly - the result is included below.',
    '',
    'Result:',
    '',
    'The plan holds: the early return on a composing key is the only guard there is.',
    '</parameter>',
    '</invoke>',
    '</function_results>',
  ].join('\n')

  it('shows only what the agent said after the block', () => {
    const state = play([textEvent(`${echo}A good review. Taken into account.`)])

    expect(answers(state)).toHaveLength(1)
    expect(answers(state)[0]?.source).toBe('A good review. Taken into account.')
  })

  it('leaves no card at all when the whole answer was the block', () => {
    expect(play([textEvent(echo)]).items).toHaveLength(0)
  })

  it('cuts a closed block off the front of an answer', () => {
    const state = play([
      textEvent('<system-reminder>Do not read the file itself.</system-reminder>\n\nReading the tests instead.'),
    ])

    expect(answers(state)[0]?.source).toBe('Reading the tests instead.')
  })

  it('does not touch the same tag inside an answer', () => {
    const said = 'The panel drops it: a `<system-reminder>` in the middle is the agent talking about the tag.'

    expect(answers(play([textEvent(said)]))[0]?.source).toBe(said)
  })

  it('holds back a tag that has only half arrived', () => {
    // The answer is printed as it streams: without this the wall shows itself for a frame, and then the
    // printing card is handed a text that has grown shorter.
    expect(spokenAnswer('<system-remin')).toBe('')
    expect(spokenAnswer('<')).toBe('')
    // While an answer that merely begins with a bracket is not held back at all.
    expect(spokenAnswer('<b>bold</b> and nothing service about it')).toBe('<b>bold</b> and nothing service about it')
  })
})

describe('the plan card', () => {
  const plan = [
    '## What we are doing',
    '',
    '1. Move the variables into `config/env.ts`, **necessarily** before editing the call sites',
    '   - read the current usages first',
    '2. Replace the uses of process.env',
    '',
    'After that it can ship.',
  ].join('\n')

  const state = () => play([toolUseEvent('plan-1', 'ExitPlanMode', { plan })])
  const card = () => state().items.find((item) => item.kind === 'plan')

  it('shows the whole plan rather than the list items alone', () => {
    const paragraphs = card()?.paragraphs ?? []

    // The section's heading and the explanatory paragraph used to get lost: the parsing kept only the lines
    // that began with a list marker.
    expect(paragraphs.some((paragraph) => paragraph.heading)).toBe(true)
    expect(paragraphs.some((paragraph) => !paragraph.bullet && !paragraph.heading)).toBe(true)
  })

  it('parses the markup inside an item rather than showing it as asterisks', () => {
    const step = card()?.paragraphs.find((paragraph) => paragraph.marker === '1.')

    expect(step?.parts.some((part) => part.strong)).toBe(true)
    expect(step?.parts.some((part) => part.code)).toBe(true)
    // The path stays in the sentence itself: it used to be cut out into a separate note, and the line began
    // with a comma.
    expect(step?.parts.map((part) => part.text).join('')).toContain('Move the variables into')
  })

  it('does not count a nested clarification as a separate step', () => {
    expect(card()?.meta).toBe('· 2 steps')
  })
})

describe('the live counter of the current turn (turnStartedAt)', () => {
  it('lets an ordinary prompt mark the turn start - the counter beside "Claude is thinking" grows from it', () => {
    const state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )

    expect(state.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('does not move the start on a follow-up: a follow-up message is not a new turn but the same one', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'the first one' }], quotes: [] },
      1_700_000_000_000,
    )

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'wait, not that one' }], quotes: [], steering: true },
      1_700_000_005_000,
    )

    expect(state.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('lets a status idle extinguish the counter - the turn has ended, there is nothing left to count', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )

    state = reducePanel(state, { kind: 'status', status: 'idle' }, 1_700_000_005_000)

    expect(state.turnStartedAt).toBeUndefined()
  })

  it('starts the counter for a status running without a prompt of its own (reattaching to a background turn)', () => {
    const state = reducePanel(initialPanelState, { kind: 'status', status: 'running' }, 1_700_000_000_000)
    expect(state.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('does not roll a running counter back on a repeated status running', () => {
    let state = reducePanel(initialPanelState, { kind: 'status', status: 'running' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'status', status: 'running' }, 1_700_000_005_000)

    expect(state.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('lets a tick move the render on even without a single tool call - otherwise the counter would stand at zero', () => {
    const running = reducePanel(initialPanelState, { kind: 'status', status: 'running' }, 1_700_000_000_000)
    const ticked = reducePanel(running, { kind: 'tick' }, 1_700_000_001_000)

    // startedAt (by tool calls) is empty - we compare the state objects themselves: a tick has to return a
    // new one rather than the very same one, otherwise useReducer decides there is nothing to render and
    // the counter beside "Claude is thinking" does not move.
    expect(ticked).not.toBe(running)
    expect(ticked.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('lets a result end the turn and extinguish the counter at once, without waiting for a separate status idle', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'agent', event: resultEvent(3_000) }, 1_700_000_003_000)

    expect(state.turnStartedAt).toBeUndefined()
  })

  it('lets a broken process extinguish the counter - otherwise setInterval would tick idly until the next message', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_005_000)

    expect(state.turnStartedAt).toBeUndefined()
  })
})

describe('pausing the counter on a decision by the person (pausedMs)', () => {
  it('piles the waiting time into pausedMs between attentionStarted and attentionEnded', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_010_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_015_000)

    expect(state.pausedMs).toBe(5_000)
    expect(state.waitStartedAt).toBeUndefined()
  })

  it('does not move the pause start back on a repeated attentionStarted', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_010_000)
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_012_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_015_000)

    expect(state.pausedMs).toBe(5_000)
  })

  it('treats an attentionEnded without an active pause as a no-op', () => {
    const state = reducePanel(initialPanelState, { kind: 'attentionEnded' }, 1_700_000_000_000)
    expect(state.pausedMs).toBe(0)
  })

  it('sums several pauses within one turn', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'hello' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_010_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_013_000)
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_020_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_030_000)

    expect(state.pausedMs).toBe(3_000 + 10_000)
  })

  it('lets a new turn zero the pause piled up by the previous one', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'the first one' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_010_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_020_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(20_000) }, 1_700_000_020_000)

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'the second one' }], quotes: [] },
      1_700_001_000_000,
    )

    expect(state.pausedMs).toBe(0)
    expect(state.waitStartedAt).toBeUndefined()
  })
})

/**
 * A tab opened from the history is a replay of a past conversation: there is not a single live turn in it,
 * and there is nothing in it to work. Everything the replay left unfinished the panel closes itself - see
 * applyReplayFinished.
 */
describe('the end of a past conversation replay', () => {
  const tasks = (state: PanelState) => state.items.filter((item): item is TaskItem => item.kind === 'task')

  const replay = (events: AgentEvent[], state = initialPanelState): PanelState =>
    events.reduce((acc, event) => reducePanel(acc, { kind: 'agent', event, replay: true }, 1_700_000_000_000), state)

  it('stops a background agent from a replay looking as though it were working', () => {
    // A background agent's outcome arrives through a system event, while the conversation holds only the
    // lines - which means for this card it will never come.
    let state = replay([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Review plan: UI consistency' }),
      toolResultEvent('toolu-1', 'Async agent launched successfully. Agent ID: a90aa'),
    ])

    expect(tasks(state)[0]?.pending).toBe(true)

    state = reducePanel(state, { kind: 'replayFinished' }, 1_700_000_060_000)

    const task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.outcome).toBe('stopped')
    expect(task?.log.at(-1)?.text).toBe('How this one ended is not part of the saved conversation.')
    // The card's counter no longer ticks: without this it would run from the moment the tab was opened and
    // grow for as long as it stays open.
    expect(state.startedAt).toEqual({})
  })

  it('closes an unfinished tool call but does not count it as an error', () => {
    let state = replay([toolUseEvent('toolu-1', 'Bash', { command: 'pnpm test' })])
    state = reducePanel(state, { kind: 'replayFinished' }, 1_700_000_060_000)

    const group = state.items.find((item): item is ToolGroupItem => item.kind === 'toolGroup')
    const tool = group?.tools[0]
    expect(group?.pending).toBe(false)
    expect(tool?.pending).toBe(false)
    expect(tool?.isError).toBe(false)
    expect(tool?.detail.at(-1)).toEqual({
      text: 'The saved conversation keeps no result for this call.',
      tone: 'dim',
    })
  })

  it('does not close a live turn started while the replay was playing along with it', () => {
    // A long conversation is not replayed instantly, and the person manages to write before the replay is
    // finished. Anything "running" at that moment is already their turn, and declaring it finished would be
    // worse than a hanging card.
    let state = replay([toolUseEvent('r-1', 'Agent', { subagent_type: 'Explore' })])
    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'let us carry on' }], quotes: [] },
      1_700_000_030_000,
    )
    state = reducePanel(state, { kind: 'agent', event: toolUseEvent('live-1', 'Bash', { command: 'pnpm test' }) }, 1_700_000_031_000)
    const after = reducePanel(state, { kind: 'replayFinished' }, 1_700_000_060_000)

    expect(after).toEqual(state)
  })

  /**
   * A question with options and a plan are the only cards that arrive with a replay and still ask the person
   * to press something: the question popped up over the input field, the plan held a "Waiting for you" under
   * the feed. There is nobody left to answer them - the turn that asked ended in the past.
   */

  it('marks a question from a replay as historic - it does not pop up as a card', () => {
    const state = replay([
      toolUseEvent('ask-1', 'AskUserQuestion', {
        questions: [{ question: 'Which option shall I make?', header: 'Option', options: [{ label: 'The first' }] }],
      }),
    ])

    const ask = state.items.find((item): item is AskItem => item.kind === 'ask')
    expect(ask?.historic).toBe(true)
  })

  it('does not mark a live turn question as historic - that is precisely the one awaiting an answer', () => {
    const state = play([
      toolUseEvent('ask-1', 'AskUserQuestion', {
        questions: [{ question: 'Which option shall I make?', header: 'Option', options: [{ label: 'The first' }] }],
      }),
    ])

    const ask = state.items.find((item): item is AskItem => item.kind === 'ask')
    expect(ask?.historic).toBeFalsy()
  })

  it('marks a subagent question from a replay as historic too', () => {
    const state = replay([
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
      subagentAskEvent('toolu-1'),
    ])

    const ask = state.items.find((item): item is AskItem => item.kind === 'ask')
    expect(ask?.historic).toBe(true)
  })

  it('marks a plan from a replay as historic - the decision on it was taken in the past', () => {
    const state = replay([toolUseEvent('plan-1', 'ExitPlanMode', { plan: '- The first step\n- The second step' })])

    const plan = state.items.find((item): item is PlanItem => item.kind === 'plan')
    expect(plan?.historic).toBe(true)
    expect(play([toolUseEvent('plan-1', 'ExitPlanMode', { plan: '- A step' })])
      .items.find((item): item is PlanItem => item.kind === 'plan')?.historic).toBeFalsy()
  })

  it('does not rewrite the already closed cards of a replay', () => {
    const state = replay([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      toolResultEvent('toolu-1', 'Found six places'),
    ])
    const after = reducePanel(state, { kind: 'replayFinished' }, 1_700_000_060_000)

    expect(tasks(after)[0]).toEqual(tasks(state)[0])
  })
})

/**
 * A task reports its end over a channel of its own, and none of that channel is saved: a transcript holds
 * messages alone. The notification survives in it all the same - the CLI writes it into the talk as a
 * message in the person's own name - and a replay reads it for what it is instead of showing the markup.
 */
describe('a task notification out of a transcript', () => {
  const replay = (events: AgentEvent[]): PanelState =>
    events.reduce((acc, event) => reducePanel(acc, { kind: 'agent', event, replay: true }, 1_700_000_000_000), initialPanelState)

  const notificationEvent = (body: string): AgentEvent =>
    ({ type: 'user', message: { content: [{ type: 'text', text: body }] } }) as AgentEvent

  const notification = (toolUseId: string | undefined, status: string, summary: string): string =>
    [
      '<task-notification>',
      '<task-id>bo54td1ol</task-id>',
      ...(toolUseId ? [`<tool-use-id>${toolUseId}</tool-use-id>`] : []),
      '<output-file>/tmp/claude/tasks/bo54td1ol.output</output-file>',
      `<status>${status}</status>`,
      `<summary>${summary}</summary>`,
      '</task-notification>',
    ].join('\n')

  const firstTool = (state: PanelState) =>
    state.items.find((item): item is ToolGroupItem => item.kind === 'toolGroup')?.tools[0]

  const backgroundCommand = (): AgentEvent[] => [
    toolUseEvent('toolu-1', 'Bash', { command: 'pnpm build', run_in_background: true }),
    toolResultEvent('toolu-1', 'Command running in background with ID: bash_1'),
  ]

  it('does not show the notification as something the person said', () => {
    const state = replay([
      ...backgroundCommand(),
      notificationEvent(notification('toolu-1', 'completed', 'Background command "pnpm build" completed (exit code 0)')),
    ])

    expect(state.items.filter((item) => item.kind === 'user')).toHaveLength(0)
  })

  it('writes the end of a background command into the card that launched it', () => {
    const state = replay([
      ...backgroundCommand(),
      notificationEvent(notification('toolu-1', 'completed', 'Background command "pnpm build" completed (exit code 0)')),
    ])

    // Without the duration: the command ran in another process, and the counter in this tab starts when
    // the tab is opened - any figure here would be made up.
    expect(firstTool(state)?.detail.at(-1)).toEqual({ text: 'Background command finished.', tone: 'dim' })
    expect(firstTool(state)?.isError).toBe(false)
  })

  it('marks a background command that failed and keeps the CLI account of it', () => {
    const state = replay([
      ...backgroundCommand(),
      notificationEvent(notification('toolu-1', 'failed', 'Background command "pnpm build" failed (exit code 1)')),
    ])

    expect(firstTool(state)?.isError).toBe(true)
    expect(firstTool(state)?.detail.map((line) => line.text)).toContain('Background command failed.')
    expect(firstTool(state)?.detail.at(-1)?.text).toContain('exit code 1')
  })

  it('closes a subagent card with what the transcript knows about its end', () => {
    const state = replay([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Review plan', run_in_background: true }),
      toolResultEvent('toolu-1', 'Async agent launched successfully. Agent ID: a90aa'),
      notificationEvent(notification('toolu-1', 'completed', 'Agent "Review plan" finished')),
    ])

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.pending).toBe(false)
    expect(task?.outcome).toBe('ok')
    expect(task?.log.at(-1)?.text).toContain('Agent "Review plan" finished')
    // The card no longer counts: the tab was opened long after this agent finished.
    expect(state.startedAt['toolu-1']).toBeUndefined()
  })

  it('leaves an ordinary command alone - it travels the same channel and its card is closed already', () => {
    const before = replay([
      toolUseEvent('toolu-1', 'Bash', { command: 'pnpm build' }),
      toolResultEvent('toolu-1', 'built in 12s'),
    ])
    const after = replay([
      toolUseEvent('toolu-1', 'Bash', { command: 'pnpm build' }),
      toolResultEvent('toolu-1', 'built in 12s'),
      notificationEvent(notification('toolu-1', 'completed', 'Command "pnpm build" completed (exit code 0)')),
    ])

    expect(after.items).toEqual(before.items)
  })

  it('skips a notification that names no call at all', () => {
    const state = replay([
      ...backgroundCommand(),
      notificationEvent(notification(undefined, 'stopped', '3 background shell command task(s) have no completion record')),
    ])

    expect(firstTool(state)?.detail.some((line) => line.text.startsWith('Background command'))).toBe(false)
    expect(state.items.filter((item) => item.kind === 'user')).toHaveLength(0)
  })

  it('does not read the notification twice in a live run - there it arrives over its own channel', () => {
    const state = play([
      toolUseEvent('toolu-1', 'Bash', { command: 'pnpm build', run_in_background: true }),
      bashTaskStartedEvent('bash-1', 'toolu-1', 'Build the app'),
      toolResultEvent('toolu-1', 'Command running in background with ID: bash_1'),
      taskNotificationEvent('bash-1', 'completed', 'Background command "pnpm build" completed (exit code 0)'),
      notificationEvent(notification('toolu-1', 'completed', 'Background command "pnpm build" completed (exit code 0)')),
    ])

    const ends = firstTool(state)?.detail.filter((line) => line.text.startsWith('Background command')) ?? []
    expect(ends).toHaveLength(1)
  })
})

/**
 * A past conversation opened from the history has to read as a conversation: the person's lines arrive in it
 * by a single route - the record from the conversation - because there was nobody to put them into the feed
 * when they were sent.
 */
describe('the person lines in a replay', () => {
  const users = (state: PanelState) => state.items.filter((item): item is UserItem => item.kind === 'user')

  const userEvent = (text: string, extra: Record<string, unknown> = {}): AgentEvent =>
    ({ type: 'user', message: { content: [{ type: 'text', text }] }, ...extra }) as AgentEvent

  const replayUser = (text: string, extra: Record<string, unknown> = {}): PanelState =>
    reducePanel(initialPanelState, { kind: 'agent', event: userEvent(text, extra), replay: true }, 1_700_000_000_000)

  it('lets a person line reach the feed with its own time', () => {
    const state = replayUser('Look into why the build is failing', { timestamp: '2026-08-17T09:41:07.000Z' })

    expect(users(state)).toHaveLength(1)
    expect(users(state)[0]?.tokens).toEqual([{ kind: 'text', value: 'Look into why the build is failing' }])
    // The time comes from the record itself rather than from "when the tab was opened".
    expect(users(state)[0]?.time).not.toBe('')
  })

  it('does not let a live conversation duplicate a line from the stream', () => {
    const live = reducePanel(
      initialPanelState,
      { kind: 'agent', event: userEvent('Look into why the build is failing') },
      1_700_000_000_000,
    )

    expect(users(live)).toHaveLength(0)
  })

  it('reads a slash command as a command rather than as markup', () => {
    const state = replayUser(
      '<command-message>deploy</command-message>\n<command-name>/deploy</command-name>\n<command-args>0.7.11</command-args>',
    )

    expect(users(state)[0]?.tokens).toEqual([{ kind: 'text', value: '/deploy 0.7.11' }])
  })

  it('keeps the service records out of the feed', () => {
    const skill = replayUser('Base directory for this skill: /Users/you/.claude/skills/task', { isMeta: true })
    const caveat = replayUser(
      '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>',
    )
    const stopped = replayUser('[Request interrupted by user]')
    const subagent = replayUser('Read these files', { parent_tool_use_id: 'toolu-1' })
    const task = replayUser(
      '<task-notification>\n<task-id>bo54td1ol</task-id>\n<status>completed</status>\n</task-notification>',
    )

    expect(users(skill)).toHaveLength(0)
    expect(users(caveat)).toHaveLength(0)
    expect(users(stopped)).toHaveLength(0)
    expect(users(subagent)).toHaveLength(0)
    expect(users(task)).toHaveLength(0)
  })

  it('still parses the call results', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'agent', event: toolUseEvent('toolu-1', 'Bash', { command: 'pnpm test' }), replay: true },
      1_700_000_000_000,
    )
    state = reducePanel(
      state,
      { kind: 'agent', event: toolResultEvent('toolu-1', '12 passed'), replay: true },
      1_700_000_000_100,
    )

    const group = state.items.find((item): item is ToolGroupItem => item.kind === 'toolGroup')
    expect(group?.tools[0]?.pending).toBe(false)
    expect(users(state)).toHaveLength(0)
  })
})

/**
 * A refusal from the server that the CLI waits out itself: while the retries run nothing happens in the
 * stream - no text, no calls - and only a card with a countdown can tell about it (see applyApiRetry).
 */

describe('repeated requests to the API', () => {
  const START = 1_700_000_000_000

  const retryEvent = (attempt: number, delayMs: number, status: number | null = 529): AgentEvent => ({
    type: 'system',
    subtype: 'api_retry',
    attempt,
    max_retries: 10,
    retry_delay_ms: delayMs,
    error_status: status,
    error: 'overloaded',
  })

  const syntheticEvent = (text: string): AgentEvent => ({
    type: 'assistant',
    message: { model: '<synthetic>', content: [{ type: 'text', text }] },
  })

  const cards = (state: PanelState) => state.items.filter((item): item is RetryItem => item.kind === 'retry')

  const failedResultEvent = (): AgentEvent => ({
    type: 'result',
    subtype: 'success',
    is_error: true,
    result: 'API Error: 529 Overloaded.',
    duration_ms: 9200,
  })

  it('lets the first refusal start a card and tell about it in the terminal words', () => {
    const state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600) }, START)

    expect(cards(state)).toHaveLength(1)
    expect(cards(state)[0]).toMatchObject({ label: 'API overloaded', attempt: 1, maxRetries: 10, pending: true })
    expect(cards(state)[0]?.retryAt).toBe(START + 600)
    expect(state.retry?.attempt).toBe(1)
  })

  it('lets the next attempts go into the same card rather than breed new ones', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600) }, START)
    state = reducePanel(state, { kind: 'agent', event: retryEvent(2, 1200) }, START + 600)
    state = reducePanel(state, { kind: 'agent', event: retryEvent(3, 2400) }, START + 1_800)

    expect(cards(state)).toHaveLength(1)
    expect(cards(state)[0]).toMatchObject({ attempt: 3, pending: true })
    expect(cards(state)[0]?.retryAt).toBe(START + 1_800 + 2_400)
  })

  it('names a refusal the way the terminal names it', () => {
    const limited = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600, 429) }, START)
    const auth = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600, 401) }, START)
    // A dropped connection arrives with no response code at all - the terminal calls it by a general word too.
    const offline = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600, null) }, START)

    expect(cards(limited)[0]?.label).toBe('Rate limited')
    expect(cards(auth)[0]?.label).toBe('Authentication failed')
    expect(cards(offline)[0]?.label).toBe('API error')
  })

  it('leaves a drawn-out run in the feed as a trace when the request finally gets through', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600) }, START)
    state = reducePanel(state, { kind: 'agent', event: retryEvent(2, 30_000) }, START + 600)
    state = reducePanel(state, { kind: 'agent', event: textEvent('Done') }, START + 41_000)

    expect(state.retry).toBeUndefined()
    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'recovered', attempt: 2 })
    expect(cards(state)[0]?.duration).toBe('41s')
  })

  it('leaves no trace for a run that only flickered', () => {
    // One attempt half a second later is the network's ordinary life: live it is visible, but in the
    // conversation's history such a card would be noise between the genuine steps.
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 500) }, START)
    state = reducePanel(state, { kind: 'agent', event: textEvent('Done') }, START + 900)

    expect(state.retry).toBeUndefined()
    expect(cards(state)).toHaveLength(0)
  })

  it('reads exhausted attempts as a surrender rather than as a success', () => {
    // A turn that ran out of attempts the CLI closes not with the model's answer but with a stub of its own
    // from <synthetic> holding the error's text.
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600) }, START)
    state = reducePanel(state, { kind: 'agent', event: retryEvent(10, 30_000) }, START + 600)
    state = reducePanel(state, { kind: 'agent', event: syntheticEvent('API Error: 529 Overloaded.') }, START + 61_000)

    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'failed', attempt: 10 })
  })

  it('lets a turn that ended in an error close the run as a surrender', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 20_000) }, START)
    state = reducePanel(state, { kind: 'agent', event: failedResultEvent() }, START + 21_000)

    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'failed' })
  })

  it('does not leave the card waiting for a turn interrupted mid-pause', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(3, 30_000) }, START)
    state = reducePanel(state, { kind: 'status', status: 'idle' }, START + 12_000)

    expect(state.retry).toBeUndefined()
    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'stopped', attempt: 3 })
  })

  it('lets a dead process close the run too', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(2, 30_000) }, START)
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, START + 15_000)

    expect(state.retry).toBeUndefined()
    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'stopped' })
  })

  it('does not let the service events break the pause off', () => {
    // Between the attempts system markers travel down the same channel - taking them for an answer means
    // declaring the run finished while it is still going.
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 30_000) }, START)
    state = reducePanel(
      state,
      { kind: 'agent', event: { type: 'system', subtype: 'status', status: 'requesting' } as AgentEvent },
      START + 1_000,
    )

    expect(state.retry?.attempt).toBe(1)
    expect(cards(state)[0]?.pending).toBe(true)
  })
})

/**
 * `/code-review` is run by the CLI itself, and its whole outcome comes back as one ordinary answer with
 * the findings as raw JSON inside it. Shown as text, that was a screen and a half of braces in the middle
 * of the conversation - see readReview.
 */
describe('a code review', () => {
  const finding = {
    file: 'lib/sync/metrics.ts',
    line: 66,
    summary: 'The metric is not selectable on this report.',
    failure_scenario: 'Every account-level request is rejected and the container lands unread.',
  }

  const answer = (findings: unknown): string =>
    `I've completed the review. Here are the findings.\n\n\`\`\`json\n${JSON.stringify(findings)}\n\`\`\``

  it('becomes a card of findings with the preamble above it', () => {
    const state = play([textEvent(answer([finding, { ...finding, file: 'lib/sync/other.ts' }]))])

    const text = state.items.find((item): item is TextItem => item.kind === 'text')
    const findings = state.items.find((item): item is FindingsItem => item.kind === 'findings')

    expect(text?.source).toBe("I've completed the review. Here are the findings.")
    expect(findings?.findings).toHaveLength(2)
    expect(findings?.findings[0]?.failureScenario).toBe(finding.failure_scenario)
    // The raw block itself is nowhere in the feed any more.
    expect(state.items.some((item) => item.kind === 'text' && item.source.includes('```'))).toBe(false)
  })

  it('leaves an answer that merely holds a json block alone', () => {
    const state = play([textEvent('Here is the config:\n\n```json\n[{"port": 8080}]\n```')])

    expect(state.items.some((item) => item.kind === 'findings')).toBe(false)
    expect(state.items.some((item) => item.kind === 'text')).toBe(true)
  })
})
