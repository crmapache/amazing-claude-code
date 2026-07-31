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

export const think = (thought: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'thinking', thinking: thought }] },
  })

/** Печатающийся ответ: несколько дельт кусками с паузами, затем готовый текстовый блок — как настоящий поток. */
export const textReply = (text: string, chunkSize = 28): ScenarioStep[] => {
  const steps: ScenarioStep[] = []

  for (let i = 0; i < text.length; i += chunkSize) {
    steps.push(
      agent({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i, i + chunkSize) } },
      }),
    )
    steps.push(wait(60))
  }

  steps.push(agent({ type: 'assistant', message: { content: [{ type: 'text', text }] } }))
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
