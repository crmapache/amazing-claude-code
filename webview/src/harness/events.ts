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

/** Один пункт в карточке чекпоинтов: подпись + что реально произойдёт при переходе на него. */
export const checkpoint = (label: string, steps: ScenarioStep[]): Checkpoint => ({
  id: `cp-${(checkpointCounter += 1)}`,
  label,
  steps,
})

export const shell = (message: ShellMessage): ScenarioStep => ({ kind: 'shell', message })
export const agent = (event: AgentEvent): ScenarioStep => ({ kind: 'agent', event })
export const user = (text: string): ScenarioStep => ({ kind: 'user', text })
export const wait = (ms: number): ScenarioStep => ({ kind: 'wait', ms })

/** Имитирует настоящий клик по кнопке карточки плана — см. __accHarnessResolvePlan. */
export const resolvePlan = (itemId: string, decision: 'approve' | 'keepPlanning'): ScenarioStep => ({
  kind: 'resolvePlan',
  itemId,
  decision,
})

/** Вход и открытие проекта — общий старт для всех сценариев. */
export const bootstrap: ScenarioStep[] = [
  shell({ type: 'auth', installed: true, loggedIn: true, email: 'you@example.com', plan: 'Max' }),
  shell({
    type: 'init',
    projectName: 'demo-project',
    workingDirectory: '/Users/you/demo-project',
    gitBranch: 'main',
    canAskPermissions: true,
  }),
]

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

/** Вложенный вызов/реплика субагента — та же форма, что и обычная, но с parent_tool_use_id родительского Task. */
export const subagentText = (parentId: string, text: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
    parent_tool_use_id: parentId,
  })

/** Мысль, которая приходит сразу готовым блоком — как из проигранной истории, без стрима. */
export const think = (thought: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'thinking', thinking: thought }] },
  })

/**
 * Живой поток приходит рвано: то одно слово, то полстроки разом, то пауза, пока
 * модель думает. Ровная нарезка одинаковыми кусками через равные промежутки
 * выглядит приятнее реальности и прячет ровно ту рваность, ради которой поток и
 * сглаживается. Поэтому и размер куска, и пауза гуляют — но по заранее
 * записанным кругам, а не случайно: прогон сценария обязан быть повторимым.
 */
const CHUNK_SIZES = [7, 34, 13, 58, 4, 21, 42, 9, 26, 3]
const CHUNK_PAUSES = [40, 180, 30, 55, 300, 45, 25, 120, 35, 70]

/** Печатающийся ответ: несколько дельт кусками с паузами, затем готовый текстовый блок — как настоящий поток. */
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

/** То же самое, что textReply, но для мысли — живой стрим кусочками, потом готовый блок thinking. */
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

export const turnResult = (durationMs: number): ScenarioStep =>
  agent({
    type: 'result',
    subtype: 'success',
    duration_ms: durationMs,
    total_cost_usd: 0.01,
    session_id: 'demo-session',
    usage: { input_tokens: 1200, output_tokens: 260, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
