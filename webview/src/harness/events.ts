import type { AgentEvent, ShellMessage } from '../protocol'
import type { Checkpoint, Scenario, ScenarioStep } from './types'

export const SESSION = 'main'

export const scenario = (
  id: string,
  title: string,
  category: Scenario['category'],
  checkpoints: Checkpoint[],
): Scenario => ({ id, title, category, checkpoints })

let checkpointCounter = 0

/** One item in the checkpoints card: a caption plus what genuinely happens on a move to it. */
export const checkpoint = (label: string, steps: ScenarioStep[]): Checkpoint => ({
  id: `cp-${(checkpointCounter += 1)}`,
  label,
  steps,
})

export const shell = (message: ShellMessage): ScenarioStep => ({ kind: 'shell', message })

/** A bash-mode command together with its output - see ScenarioStep. */
export const bash = (
  command: string,
  stdout: string,
  options: { stderr?: string; exitCode?: number; runMs?: number } = {},
): ScenarioStep => ({ kind: 'bash', command, stdout, ...options })
export const agent = (event: AgentEvent): ScenarioStep => ({ kind: 'agent', event })
export const user = (text: string): ScenarioStep => ({ kind: 'user', text })
export const wait = (ms: number): ScenarioStep => ({ kind: 'wait', ms })

/** Imitates a genuine click on a plan card's button - see __accHarnessResolvePlan. */
export const resolvePlan = (itemId: string, decision: 'approve' | 'keepPlanning'): ScenarioStep => ({
  kind: 'resolvePlan',
  itemId,
  decision,
})

/** A moment in the future - the reset time of a usage window. Counted from "now": with a fixed date the
    windows would look long expired. */
export const inHours = (count: number): string => new Date(Date.now() + count * 60 * 60 * 1000).toISOString()

/** The language asked for in the address bar, if any - see the note in `bootstrap` below. */
const harnessLanguage = (): string => new URLSearchParams(window.location.search).get('lang') ?? ''

/** Signing in and opening the project - the shared start for every scenario. */
export const bootstrap: ScenarioStep[] = [
  shell({ type: 'auth', installed: true, loggedIn: true, email: 'you@example.com', plan: 'Max' }),
  shell({
    type: 'init',
    projectName: 'demo-project',
    workingDirectory: '/Users/you/demo-project',
    gitBranch: 'main',
    // The version stands at the foot of the menu and under a shared picture of the statistics - without
    // one here both would be looked at empty.
    pluginVersion: '0.8.0',
    /*
     * The language every scenario is played in, taken from `?lang=` in the address.
     *
     * The panel decides its language from what the shell says, and the harness is the shell here - so
     * this is the whole of the switch: `?lang=zh-Hans` and every scenario is Chinese, including the parts
     * the player invents. Without it there would be no way to look at any language but English outside
     * a running IDE.
     */
    preferences: { model: '', effort: '', mode: '', language: harnessLanguage(), ideLanguage: 'en' },
    // The improve screen shows the built-in text as the field's placeholder, so without one here the
    // screen would be looked at empty and the only thing on it could not be judged.
    improve: {
      instructions: '',
      builtIn: [
        'Rewrite the draft below into a clear, precise prompt for a coding agent working in this repository.',
        '',
        '- Answer with the rewritten prompt only. No preamble, no explanation, no quotation marks or code fences around it.',
        '- Write it in the language the draft is written in.',
        '- Keep the intent exactly, and keep the kind of message: a question stays a question.',
        '- Match the size of the task. A one-line request stays one or two lines.',
        '- Keep every [[n]] marker exactly once and unchanged.',
      ].join('\n'),
    },
  }),
  // Without any usage the input field's bottom row is empty and the rings in it cannot be looked at. The
  // week stands on the window's third day: the pale pace arc then runs ahead of the bright one, that is,
  // exactly the case it is drawn for is visible.
  shell({
    type: 'usage',
    session: { percent: 22, resets: inHours(2 + 41 / 60) },
    week: { percent: 31, resets: inHours(4.5 * 24) },
    todayTokens: '445.5M',
  }),
]

/**
 * A limit event, the way the CLI sends them: the reset time in seconds and counted from "now", or a
 * window fixed in the past would look like a signal about a window that has long since gone - which the
 * feed throws away, exactly as the CLI does.
 */
export const rateLimit = (info: {
  status: string
  resetsInSeconds?: number
  isUsingOverage?: boolean
  overageInUse?: boolean
  rateLimitGraceActive?: boolean
  rateLimitType?: string
}): ScenarioStep =>
  agent({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: info.status,
      rateLimitType: info.rateLimitType ?? 'five_hour',
      ...(info.resetsInSeconds === undefined
        ? {}
        : { resetsAt: Math.round(Date.now() / 1000) + info.resetsInSeconds }),
      ...(info.isUsingOverage ? { isUsingOverage: true } : {}),
      ...(info.overageInUse ? { overageInUse: true } : {}),
      ...(info.rateLimitGraceActive ? { rateLimitGraceActive: true } : {}),
    },
  })

export const toolUse = (name: string, input: unknown, id: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })

export const toolResult = (id: string, content: string, isError = false): ScenarioStep =>
  agent({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
  })

/** A nested subagent call or line - the same shape as an ordinary one but with the parent Task's parent_tool_use_id. */
export const subagentText = (parentId: string, text: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
    parent_tool_use_id: parentId,
  })

/** A thought that arrives as a finished block at once - as from a replayed history, without streaming. */
export const think = (thought: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'thinking', thinking: thought }] },
  })

/**
 * A live stream arrives raggedly: now one word, now half a line at once, now a pause while the model
 * thinks. An even slicing into identical pieces at equal intervals looks nicer than reality and hides
 * precisely the raggedness the stream is smoothed for. So both the piece's size and the pause wander - but
 * around pre-recorded circles rather than at random: a run of a scenario has to be repeatable.
 */
const CHUNK_SIZES = [7, 34, 13, 58, 4, 21, 42, 9, 26, 3]
const CHUNK_PAUSES = [40, 180, 30, 55, 300, 45, 25, 120, 35, 70]

/** A typing answer: several deltas in pieces with pauses, then a finished text block - like a genuine stream. */
export const textReply = (text: string): ScenarioStep[] => {
  const steps: ScenarioStep[] = []

  for (let i = 0, chunk = 0; i < text.length; chunk += 1) {
    const size = CHUNK_SIZES[chunk % CHUNK_SIZES.length]!
    steps.push(
      agent({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i, i + size) } },
      }),
    )
    steps.push(wait(CHUNK_PAUSES[chunk % CHUNK_PAUSES.length]!))
    i += size
  }

  steps.push(agent({ type: 'assistant', message: { content: [{ type: 'text', text }] } }))
  return steps
}

/** The same as textReply but for a thought - a live stream in pieces, then a finished thinking block. */
export const thinkReply = (thought: string): ScenarioStep[] => {
  const steps: ScenarioStep[] = []

  for (let i = 0, chunk = 0; i < thought.length; chunk += 1) {
    const size = CHUNK_SIZES[chunk % CHUNK_SIZES.length]!
    steps.push(
      agent({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: thought.slice(i, i + size) },
        },
      }),
    )
    steps.push(wait(CHUNK_PAUSES[chunk % CHUNK_PAUSES.length]!))
    i += size
  }

  steps.push(agent({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: thought }] } }))
  return steps
}

/**
 * A failed request to the model that the CLI will repeat after a pause. The shape is exactly the one that
 * arrives from the stream: one attempt, one event, while the pause until the next goes as a step of the
 * scenario of its own so that the countdown is visible live.
 */
export const apiRetry = (attempt: number, delayMs: number, status: number | null = 529): ScenarioStep =>
  agent({
    type: 'system',
    subtype: 'api_retry',
    attempt,
    max_retries: 10,
    retry_delay_ms: delayMs,
    error_status: status,
    error: status === 529 ? 'overloaded' : 'unknown',
  })

/**
 * The same steps but as a replay of a past conversation opened from the history: the events travel with a
 * replay marker, by which the panel tells what happened long ago from what is live (see protocol.ts). The
 * pauses and everything else stay as they are.
 */
export const replayed = (steps: ScenarioStep[]): ScenarioStep[] =>
  steps.map((step) =>
    step.kind === 'agent' ? shell({ type: 'agent', sessionId: SESSION, event: step.event, replay: true }) : step,
  )

export const turnResult = (durationMs: number): ScenarioStep =>
  agent({
    type: 'result',
    subtype: 'success',
    duration_ms: durationMs,
    total_cost_usd: 0.01,
    session_id: 'demo-session',
    usage: { input_tokens: 1200, output_tokens: 260, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
