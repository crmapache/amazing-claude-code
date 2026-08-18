import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../protocol'
import { contextOf, contextUsage, initialPanelState, reducePanel, type PanelState } from './build'
import type {
  CompactItem,
  ErrorItem,
  RetryItem,
  TaskItem,
  TextItem,
  ThinkItem,
  TodoItem,
  ToolGroupItem,
  UserItem,
} from './types'

/**
 * Поток записан живым прогоном агента, а не придуман: только так видно и порядок
 * событий, и типы, которых мы не ждали.
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
  description: 'Демо-задача',
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

/** Как это приходит с живого CLI: у субагента свой task_id, отдельный от id вызова. */
const agentTaskStartedEvent = (taskId: string, toolUseId: string, subagentType: string): AgentEvent => ({
  type: 'system',
  subtype: 'task_started',
  task_id: taskId,
  tool_use_id: toolUseId,
  subagent_type: subagentType,
  description: 'Discover files',
  task_type: 'local_agent',
})

/** Тем же каналом CLI ведёт команды терминала — субагента в них нет вовсе. */
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
        input: { questions: [{ question: 'Продолжать?', header: 'Ветка', options: [{ label: 'Да' }, { label: 'Нет' }] }] },
      },
    ],
  },
  parent_tool_use_id: parentToolUseId,
})

/** Тексты ошибок, стоящих в ленте — в том же порядке, в каком они там стоят. */
const errorTexts = (state: PanelState): string[] =>
  state.items.filter((item) => item.kind === 'error').map((item) => item.message)

describe('ошибки в ленте', () => {
  const refusal = 'Cannot set permission mode to bypassPermissions'

  it('один отказ не рисует две одинаковые плашки, придя двумя дорогами', () => {
    // Отказ CLI приходит и текстом в поток ошибок процесса, и разобранным
    // ответом на управляющий запрос смены режима.
    const state = [
      { kind: 'error', message: refusal } as const,
      { kind: 'modeApplied', mode: 'bypassPermissions', applied: false, error: refusal } as const,
    ].reduce(reducePanel, initialPanelState)

    expect(errorTexts(state)).toEqual([refusal])
  })

  it('разные ошибки по-прежнему показывает обе', () => {
    const state = [
      { kind: 'error', message: refusal } as const,
      { kind: 'error', message: 'claude exited with code 1' } as const,
    ].reduce(reducePanel, initialPanelState)

    expect(errorTexts(state)).toHaveLength(2)
  })

  it('тот же отказ в новом ходе показывается снова — это уже новая неприятность', () => {
    let state = reducePanel(initialPanelState, { kind: 'error', message: refusal })
    state = reducePanel(state, { kind: 'prompt', tokens: [{ kind: 'text', value: 'ещё раз' }], quotes: [] })
    state = reducePanel(state, { kind: 'error', message: refusal })

    expect(errorTexts(state)).toEqual([refusal, refusal])
  })

  it('ошибка живёт в ленте, а не отдельной плашкой — и убирается по своему номеру', () => {
    const state = reducePanel(initialPanelState, { kind: 'error', message: refusal })
    const error = state.items.find((item) => item.kind === 'error')
    expect(error).toBeDefined()

    const dismissed = reducePanel(state, { kind: 'dismissError', id: error!.id })
    expect(errorTexts(dismissed)).toEqual([])
  })

  /**
   * Сорвавшийся запрос CLI говорит дважды: сперва репликой агента в потоке,
   * следом той же строкой в stderr. В ленте от этого стояли два одинаковых
   * абзаца подряд — обычный ответ и красная плашка под ним.
   */
  it('ошибка вытесняет свой же дубль, пришедший ответом агента', () => {
    const apiError = 'API Error: 500 Internal server error. Check https://status.claude.com.'
    let state = reducePanel(initialPanelState, { kind: 'agent', event: textEvent(apiError) })
    expect(state.items.filter((item) => item.kind === 'text')).toHaveLength(1)

    state = reducePanel(state, { kind: 'error', message: apiError })

    expect(state.items.filter((item) => item.kind === 'text')).toHaveLength(0)
    expect(errorTexts(state)).toEqual([apiError])
  })

  it('обычный ответ рядом с ошибкой остаётся на месте', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: textEvent('Правлю сборку.') })
    state = reducePanel(state, { kind: 'error', message: 'claude exited with code 1' })

    expect(state.items.filter((item) => item.kind === 'text')).toHaveLength(1)
    expect(errorTexts(state)).toEqual(['claude exited with code 1'])
  })
})


describe('смена модели', () => {
  it('до ответа агента показывает выбранную, а не прежнюю', () => {
    const state = reducePanel(initialPanelState, { kind: 'modelRequested', model: 'sonnet' })

    expect(state.pendingModel).toBe('sonnet')
  })

  it('согласие агента делает выбранную моделью разговора — без всякого каталога', () => {
    let state = reducePanel(initialPanelState, { kind: 'modelRequested', model: 'sonnet' })
    state = reducePanel(state, { kind: 'modelApplied', model: 'sonnet' })

    expect(state.pendingModel).toBeUndefined()
    expect(state.model).toBe('sonnet')
  })

  it('отказ возвращает прежнюю модель и объясняет причину в ленте', () => {
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

describe('сборка ленты из потока агента', () => {
  it('доводит разговор до покоя и запоминает сессию', () => {
    const state = play(streamEvents())

    expect(state.sessionId).toBeTruthy()
    expect(state.model).toBeTruthy()
    expect(state.status).toBe('idle')
    // Живой текст должен быть погашен готовым сообщением, иначе ответ удвоится.
    expect(state.streamingText).toBe('')
    expect(errorTexts(state)).toEqual([])
  })

  it('запоминает модель, на которую агент переключился сам посреди разговора', () => {
    // Так выглядит сработавшая защита: ход уходит на другую модель, и сказать
    // об этом может только подпись под ответом.
    let state = play([{ type: 'system', subtype: 'init', model: 'claude-opus-5[1m]' } as AgentEvent])
    expect(state.model).toBe('claude-opus-5[1m]')

    state = play(
      [{ type: 'assistant', message: { content: [], model: 'claude-opus-4-8' } } as AgentEvent],
      state,
    )
    expect(state.model).toBe('claude-opus-4-8')
  })

  it('не принимает служебную пометку за модель', () => {
    // Так CLI подписывает заглушку, которой закрывает оборванный ход: модели с
    // таким именем не существует, и в выборе моделей ей взяться неоткуда.
    let state = play([{ type: 'system', subtype: 'init', model: 'claude-opus-5[1m]' } as AgentEvent])
    state = play(
      [{ type: 'assistant', message: { content: [], model: '<synthetic>' } } as AgentEvent],
      state,
    )

    expect(state.model).toBe('claude-opus-5[1m]')
  })

  it('не принимает модель подагента за модель разговора', () => {
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

  it('превращает вызов инструмента в карточку с результатом', () => {
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

  it('разбирает ответ в абзацы с кодовыми вставками', () => {
    const state = play(streamEvents())
    const texts = state.items.filter((item): item is TextItem => item.kind === 'text')
    const parts = texts.flatMap((item) => item.paragraphs.flatMap((paragraph) => paragraph.parts))

    expect(texts.length).toBeGreaterThan(0)
    expect(parts.some((part) => part.code === true)).toBe(true)
    expect(parts.map((part) => part.text).join(' ')).toContain('acc-test')
  })

  it('закрывает ход строкой итогов', () => {
    const state = play(streamEvents())
    const meta = state.items.filter((item) => item.kind === 'meta')

    expect(meta.length).toBe(1)
    expect(state.cost).toBeGreaterThan(0)
    expect(contextUsage(state.usage)).toBeGreaterThan(0)
  })

  it('подписывает прерывание, если ход закрылся result-событием после Stop/Escape', () => {
    let state = reducePanel(initialPanelState, { kind: 'stopRequested' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(400) }, 1_700_000_000_400)

    const meta = state.items.filter((item) => item.kind === 'meta')
    expect(meta).toHaveLength(1)
    expect(meta[0]?.stats).toEqual(['Stopped by you · 0.4s'])
    // Запрос на остановку погашен — иначе следующий, уже обычный ход тоже
    // ошибочно назвался бы прерванным.
    expect(state.stopRequestedAt).toBeUndefined()
  })

  it('подписывает прерывание и когда ход оборвался молча, без result-события', () => {
    let state = reducePanel(initialPanelState, { kind: 'stopRequested' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'status', status: 'idle' }, 1_700_000_000_400)

    const meta = state.items.filter((item) => item.kind === 'meta')
    expect(meta).toHaveLength(1)
    expect(meta[0]?.stats).toEqual(['Stopped by you'])
    expect(state.stopRequestedAt).toBeUndefined()
  })

  it('служебный ход не обнуляет датчик контекста: он к модели не ходил вовсе', () => {
    // Так закрывается, например, /model: CLI выполняет команду сам, без запроса
    // к модели, и в result присылает нули — приняв их за снимок окна, датчик
    // падал до нуля прямо посреди разговора.
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

  it('датчик контекста растёт по ходу, не дожидаясь его конца', () => {
    // Цифра от CLI приезжает только концом хода, и за самый долгий запрос —
    // первый — полоска не двигалась вовсе. Считаем по usage ответа агента.
    const answering: AgentEvent = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'думаю' }],
        usage: { input_tokens: 10_000, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 10_000 },
      },
    }
    const state = reducePanel(initialPanelState, { kind: 'agent', event: answering }, 1_700_000_000_000)

    expect(contextOf(state, 200_000)).toEqual({ used: 50_000, limit: 200_000, percent: 25 })
  })

  it('перепись прошлого разговора датчик контекста не двигает', () => {
    // Открытый из истории разговор проигрывается теми же событиями, но usage в
    // них — про давно прошедший шаг, а размер окна из переписи не узнать вовсе:
    // разговор на «1M»-модели делился на запасные двести тысяч и выглядел
    // переполненным. Точную цифру IDE спрашивает у CLI отдельным сообщением.
    const answered: AgentEvent = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'отвечал час назад' }],
        usage: { input_tokens: 236_000 },
      },
    }
    let state = reducePanel(initialPanelState, { kind: 'agent', event: answered, replay: true }, 1_700_000_000_000)

    expect(state.liveContextUsed).toBeUndefined()
    expect(contextOf(state, 200_000).percent).toBe(0)

    state = reducePanel(state, { kind: 'context', used: 236_192, max: 1_000_000 }, 1_700_000_000_100)

    expect(contextOf(state, 200_000)).toEqual({ used: 236_192, limit: 1_000_000, percent: 24 })
  })

  it('точная цифра от CLI вытесняет прикидку по ходу', () => {
    const answering: AgentEvent = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'думаю' }],
        usage: { input_tokens: 50_000 },
      },
    }
    let state = reducePanel(initialPanelState, { kind: 'agent', event: answering }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'context', used: 82_000, max: 1_000_000 }, 1_700_000_000_100)

    expect(state.liveContextUsed).toBeUndefined()
    expect(contextOf(state, 200_000)).toEqual({ used: 82_000, limit: 1_000_000, percent: 8 })
  })

  it('прикидка считается от настоящего размера окна, а не от запасного', () => {
    // Размер окна знает только CLI — у «1M»-моделей он впятеро больше обычного,
    // и прикидка по ходу обязана делиться на него же, иначе она вчетверо завышена.
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

  it('служебный ответ без обращения к модели датчик не обнуляет', () => {
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

  it('обычное освобождение агента ленту не трогает: останавливать было нечего', () => {
    const state = reducePanel(initialPanelState, { kind: 'status', status: 'idle' }, 1_700_000_000_400)

    expect(state.items.filter((item) => item.kind === 'meta')).toHaveLength(0)
  })

  it('не подписывает прерывание дважды: после result статус уже ничего не добавляет', () => {
    let state = reducePanel(initialPanelState, { kind: 'stopRequested' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(400) }, 1_700_000_000_400)
    state = reducePanel(state, { kind: 'status', status: 'idle' }, 1_700_000_000_500)

    expect(state.items.filter((item) => item.kind === 'meta')).toHaveLength(1)
  })

  it('обычный конец хода остаётся просто Worked, без Stop/Escape', () => {
    const state = reducePanel(initialPanelState, { kind: 'agent', event: resultEvent(400) }, 1_700_000_000_400)

    const meta = state.items.filter((item) => item.kind === 'meta')
    expect(meta[0]?.stats).toEqual(['Worked 0.4s'])
  })

  // Форк поднимает процесс вместе с первым сообщением, и CLI сразу закрывает
  // «нулевой» ход: агент к сообщению ещё не приступал. Приняв его за конец хода,
  // панель гасила спиннер и подписывала «Worked 0.1s» — выглядело так, будто
  // отправка не завелась.
  it('пустой ход поднявшегося разговора не гасит спиннер и не пишет Worked', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )
    // Процесс форка поднимается уже с отправленным сообщением: сначала init…
    state = reducePanel(
      state,
      { kind: 'agent', event: { type: 'system', subtype: 'init' } as AgentEvent },
      1_700_000_000_050,
    )
    // …а сразу за ним — тот самый «нулевой» ход.
    state = reducePanel(
      state,
      {
        kind: 'agent',
        event: { type: 'result', subtype: 'success', duration_ms: 73, num_turns: 0, session_id: 'новый-разговор' },
      },
      1_700_000_000_100,
    )

    expect(state.items.filter((item) => item.kind === 'meta')).toHaveLength(0)
    expect(state.status).toBe('running')
    expect(state.turnStartedAt).toBe(1_700_000_000_000)
    // Идентификатор форка новый, и он приезжает именно этим событием.
    expect(state.sessionId).toBe('новый-разговор')
  })

  // Ошибку молчанием не проглатываем: нулевой ход бывает и с отказом, и его
  // человек обязан увидеть.
  it('нулевой ход с ошибкой остаётся обычным концом хода', () => {
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

  // Неизвестную слэш-команду CLI закрывает мгновенно и без обращения к модели:
  // ответ приезжает заглушкой от <synthetic>, ходов в итоге ноль, ошибкой это не
  // помечено. Приняв такой итог за «нулевой» ход подъёма, панель не закрывала ход
  // вовсе — «Claude is thinking» со счётчиком висел до конца жизни вкладки.
  it('неизвестная команда сразу после подъёма закрывает ход', () => {
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
    // Модель разговора заглушка не подменяет — см. realModel.
    expect(state.model).toBe(initialPanelState.model)
  })

  // Тот же отказ, но итог приехал без текста: закрыть ход всё равно обязан —
  // ответ агента уже был, значит подъём кончился раньше.
  it('заглушка без текста в итоге тоже закрывает ход', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: '/что-то' }], quotes: [] },
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
          message: { model: '<synthetic>', content: [{ type: 'text', text: 'Не выполняю.' }] },
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

  // Ход, который и правда кончился ничем, гасить спиннер обязан: подъёма перед
  // ним не было, значит это настоящий итог.
  it('нулевой ход посреди разговора остаётся концом хода', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
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

  it('/clear во время идущего хода гасит спиннер, а не оставляет его висеть навсегда', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )
    expect(state.status).toBe('running')

    // /clear, отправленный, пока предыдущий ход ещё думает, идёт steering-путём —
    // тем же самым, что и в 'досылка в идущий ход не стирает недописанный ответ
    // агента' — и сам по себе не трогает status/turnStartedAt.
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

  it('/clear во время сжатия контекста снимает флаг, а не гасит строку статуса навсегда', () => {
    let state = play([compactingStatusEvent()])
    expect(state.compacting).toBe(true)

    state = reducePanel(state, { kind: 'agent', event: { type: 'conversation_reset' } })

    expect(state.compacting).toBe(false)
  })

  it('показывает свой ход сразу, не дожидаясь агента', () => {
    const state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )

    expect(state.status).toBe('running')
    expect(state.items).toHaveLength(1)
    expect(state.items[0]?.kind).toBe('user')
  })

  it('досылка в идущий ход не стирает недописанный ответ агента', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Смотрю файл' } },
      },
    })

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'стой, не этот' }], quotes: [], steering: true },
      1_700_000_000_000,
    )

    expect(state.streamingText).toBe('Смотрю файл')
    expect(state.items.at(-1)?.kind).toBe('user')
  })

  it('обычный ход начинает с чистого листа, а не продолжает прошлый поток', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'обрывок' } },
      },
    })

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'новая задача' }], quotes: [] },
      1_700_000_000_000,
    )

    expect(state.streamingText).toBe('')
  })

  it('собирает мысль по кусочкам вживую и гасит буфер готовым блоком', () => {
    let state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Надо ' } },
      },
    })
    state = reducePanel(state, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'посмотреть файл.' } },
      },
    })

    expect(state.streamingThinking).toBe('Надо посмотреть файл.')
    expect(state.items.filter((item) => item.kind === 'think')).toHaveLength(0)

    state = reducePanel(state, {
      kind: 'agent',
      event: { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'Надо посмотреть файл.' }] } },
    })

    // Готовый блок гасит живой буфер — иначе под завершённой карточкой ещё
    // секунду висел бы её же дублирующийся черновик.
    expect(state.streamingThinking).toBe('')
    const thinks = state.items.filter((item): item is ThinkItem => item.kind === 'think')
    expect(thinks).toHaveLength(1)
    expect(thinks[0]?.pending).toBe(false)
  })

  it('мысль подагента в главный буфер не течёт', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'чужая мысль' } },
        parent_tool_use_id: 'toolu_task1',
      },
    })

    expect(state.streamingThinking).toBe('')
  })

  it('переживает сообщение, где содержимое строкой, а не списком блоков', () => {
    // Так приходит сводка после /compact. Раньше на ней падала вся панель:
    // разбор сразу звал на содержимом методы массива.
    const summary = 'Здесь была длинная переписка, вот её краткий пересказ.'

    const state = play([
      { type: 'user', message: { content: summary } } as AgentEvent,
      { type: 'assistant', message: { content: summary } } as AgentEvent,
    ])

    const texts = state.items.filter((item): item is TextItem => item.kind === 'text')
    expect(texts).toHaveLength(1)
    expect(texts[0]?.paragraphs[0]?.parts[0]?.text).toBe(summary)
  })

  it('не рушится на незнакомом событии', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: { type: 'rate_limit_event' } as unknown as AgentEvent,
    })

    expect(state).toEqual(initialPanelState)
  })

  describe('лимит подписки', () => {
    const limitEvent = (status: string, resetsAt?: number): AgentEvent => ({
      type: 'rate_limit_event',
      rate_limit_info: { status, resetsAt, rateLimitType: 'five_hour' },
    })

    it('про пропущенный запрос молчит: лента не сводка о состоянии подписки', () => {
      expect(play([limitEvent('allowed')]).items).toEqual([])
    })

    it('отказ показывает в ленте и помечает как лимит, а не поломку', () => {
      const items = play([limitEvent('rejected')]).items
      const error = items.find((item): item is ErrorItem => item.kind === 'error')

      expect(error?.limit).toBe(true)
      expect(error?.message).toContain('5-hour')
    })

    it('повторное событие того же хода второй строкой не ложится', () => {
      const state = play([limitEvent('rejected'), limitEvent('rejected')])

      expect(state.items.filter((item) => item.kind === 'error')).toHaveLength(1)
    })
  })

  describe('группировка вызовов инструментов', () => {
    it('собирает подряд идущие вызовы в одну группу, даже через паузу между внутренними шагами хода', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      // t1 уже разрешился — группа на мгновение стала pending:false, но следующий
      // вызов идёт без единого текстового блока между ними и должен лечь в ту же группу.
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)
      state = play([toolResultEvent('t2', 'ok')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.toolName)).toEqual(['Read', 'Bash'])
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.duration).toMatch(/s$/)
    })

    it('текст между вызовами открывает новую группу', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      state = play([textEvent('Нашёл файл.')], state)
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)
      state = play([toolResultEvent('t2', 'ok')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(2)
      expect(groups[0]?.tools).toHaveLength(1)
      expect(groups[1]?.tools).toHaveLength(1)
    })

    it('мысль модели не попадает в группу вызовов рядом, а становится своей карточкой', () => {
      let state = play([
        { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'Надо посмотреть файл.' }] } },
      ])
      state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })], state)
      state = play([toolResultEvent('t1', 'line 1')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.chip)).toEqual(['READ'])

      const thinks = state.items.filter((item): item is ThinkItem => item.kind === 'think')
      expect(thinks).toHaveLength(1)
      expect(thinks[0]?.text).toBe('Надо посмотреть файл.')
      expect(thinks[0]?.pending).toBe(false)
    })

    it('закрывает незавершённые вызовы внутри группы при обрыве сессии', () => {
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

    it('прерванный ход закрывает вызов, который в этот момент выполнялся', () => {
      let state = reducePanel(
        initialPanelState,
        { kind: 'prompt', tokens: [{ kind: 'text', value: 'сделай' }], quotes: [] },
        1_700_000_000_000,
      )
      state = play([toolUseEvent('t1', 'Bash', { command: 'sleep 300' })], state)
      state = reducePanel(state, { kind: 'stopRequested' }, 1_700_000_002_000)
      state = reducePanel(state, { kind: 'agent', event: resultEvent(2_500) }, 1_700_000_002_500)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.meta).toBe('· interrupted')
      // Счётчик карточки живёт в startedAt — оставить запись значит и дальше
      // пересчитывать длительность на каждый тик.
      expect(state.startedAt.t1).toBeUndefined()
    })

    it('итог хода закрывает вызов, чей результат до панели не дошёл', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = reducePanel(state, { kind: 'agent', event: resultEvent(1_000) }, 1_700_000_001_000)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups[0]?.tools.at(-1)?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.meta).toBe('· unfinished')
    })

    it('фоновый субагент переживает итог хода: его конец приносит уведомление', () => {
      let state = play([
        toolUseEvent('a1', 'Task', { description: 'ревью', prompt: 'посмотри диф' }),
        toolResultEvent('a1', 'Async agent launched successfully. Agent id: a1'),
      ])
      state = reducePanel(state, { kind: 'agent', event: resultEvent(800) }, 1_700_000_000_800)

      const tasks = state.items.filter((item): item is TaskItem => item.kind === 'task')
      expect(tasks).toHaveLength(1)
      expect(tasks[0]?.pending).toBe(true)
      expect(tasks[0]?.outcome).toBeUndefined()
    })

    it('вычисляет полный span группы при re-append после resolve (regression)', () => {
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

    it('мысль модели после закрытой группы не трогает её и не переоткрывает (regression)', () => {
      const T0 = 1_700_000_000_000
      // T0: tool1 called
      let state = reducePanel(
        initialPanelState,
        { kind: 'agent', event: toolUseEvent('t1', 'Read', { file_path: 'a.ts' }) },
        T0,
      )
      // T0 + 1s: tool1 resolves — группа закрывается, pending: false, duration зафиксирована.
      state = reducePanel(state, { kind: 'agent', event: toolResultEvent('t1', 'ok') }, T0 + 1_000)

      let groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      const closedDuration = groups[0]?.duration
      expect(closedDuration).toMatch(/1\.0+s/)

      // T0 + 1.2s: мысль модели приходит сразу после, без текста между ними. Раньше
      // это (по правилу непрерывности групп) ложилось в ту же группу и грозило
      // сделать её снова pending без своего результата — теперь мысль вообще не
      // проходит через группировку, так что до этой ветки дело больше не доходит.
      state = reducePanel(
        state,
        {
          kind: 'agent',
          event: {
            type: 'assistant',
            message: { content: [{ type: 'thinking', thinking: 'Готово, можно отвечать.' }] },
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
      expect(thinks[0]?.text).toBe('Готово, можно отвечать.')
    })

    it('startedAt пустеет, когда все вызовы хода разрешились', () => {
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

describe('лог фонового субагента', () => {
  it('копит шаги в TaskItem.log через карту task_id↔tool_use_id, а не теряет их', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentMessageEvent('toolu-parent', 'Смотрю конфиги')], state)
    state = play([subagentMessageEvent('toolu-parent', 'Смотрю сервер')], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task).toBeDefined()
    expect(task?.log.map((line) => line.text)).toEqual(['Смотрю конфиги', 'Смотрю сервер'])
  })

  it('вызов инструмента субагента показывает цель, а не голое имя', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play(
      [subagentToolUseEvent('toolu-parent', 'sub-t1', 'Bash', { command: 'grep -rn "context" webview/src' })],
      state,
    )

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.log.map((line) => line.text)).toEqual(['Bash: grep -rn "context" webview/src'])
  })

  it('вызов без более точной цели остаётся голым именем — без "Bash: Bash"', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentToolUseEvent('toolu-parent', 'sub-t1', 'TodoWrite', {})], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.log.map((line) => line.text)).toEqual(['TodoWrite…'])
  })

  it('task_progress не дублирует инструмент, уже отмеченный основным потоком субагента', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentToolUseEvent('toolu-parent', 'sub-t1', 'Bash', { command: 'grep -rn "context" src' })], state)
    state = play([taskProgressEvent('task-1', 'Bash')], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.log.map((line) => line.text)).toEqual(['Bash: grep -rn "context" src'])
  })

  it('task_progress с другим инструментом всё равно добавляется', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentToolUseEvent('toolu-parent', 'sub-t1', 'Bash', { command: 'grep -rn "context" src' })], state)
    state = play([taskProgressEvent('task-1', 'Read')], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task?.log.map((line) => line.text)).toEqual(['Bash: grep -rn "context" src', '→ Read'])
  })

  it('AskUserQuestion от субагента создаёт AskItem с taskId, а не теряется в логе', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentAskEvent('toolu-parent')], state)

    const ask = state.items.find((item) => item.kind === 'ask')
    expect(ask).toBeDefined()
    expect(ask?.kind === 'ask' && ask.taskId).toBe('task-1')
    expect(ask?.kind === 'ask' && ask.questions[0]?.title).toBe('Продолжать?')
  })

  it('AskUserQuestion без единого вопроса не создаёт карточку — закрыть её было бы нечем', () => {
    const state = play([
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'ask-empty', name: 'AskUserQuestion', input: { questions: [] } }] },
      },
    ])

    expect(state.items.some((item) => item.kind === 'ask')).toBe(false)
  })

  it('AskUserQuestion от субагента без вопросов тоже не создаёт карточку', () => {
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

  it('обрезает лог агента после AGENT_LOG_LIMIT строк, а не растит его бесконечно', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    for (let i = 0; i < 310; i += 1) {
      state = play([subagentMessageEvent('toolu-parent', `шаг ${i}`)], state)
    }

    const task = state.items.find((item) => item.kind === 'task')
    expect(task?.kind === 'task' && task.log.length).toBe(300)
    expect(task?.kind === 'task' && task.log[0]?.text).toMatch(/^…\d+ earlier steps trimmed$/)
    expect(task?.kind === 'task' && task.log.at(-1)?.text).toBe('шаг 309')
  })

  it('permission-действие с taskId создаёт PermItem, привязанный к агенту', () => {
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

  // Режим человек выбирал подписью из меню — именем из протокола он его нигде не видел.
  it('карточка разрешения подписана режимом так же, как он подписан в меню', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'permission',
      id: 'perm-2',
      target: 'wants to run a command',
      command: 'rm -rf сборка/*',
      mode: 'bypassPermissions',
    })

    const perm = state.items.find((item) => item.kind === 'perm')
    expect(perm?.kind === 'perm' && perm.meta).toBe('Bypass mode')
  })

  // Причина и запрет на «Always allow» приезжают от IDE — панель их только показывает.
  it('причина вопроса и запрет запоминать доходят до карточки', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'permission',
      id: 'perm-3',
      target: 'wants to run a command',
      command: 'rm -rf сборка/*',
      mode: 'bypassPermissions',
      reason: 'Dangerous rm operation detected',
      rememberable: false,
    })

    const perm = state.items.find((item) => item.kind === 'perm')
    expect(perm?.kind === 'perm' && perm.reason).toBe('Dangerous rm operation detected')
    expect(perm?.kind === 'perm' && perm.rememberable).toBe(false)
  })

  // Молчание — обычный вопрос: правило сработает, и кнопка на месте.
  it('без запрета решение остаётся запоминаемым', () => {
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

  it('игнорирует сообщение субагента без задачи в ленте, а не падает и не создаёт мусор', () => {
    const before = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    const after = play([subagentMessageEvent('toolu-unknown', 'Привет из ниоткуда')], before)

    expect(after).toEqual(before)
  })
})

describe('один субагент — одна карточка', () => {
  const tasks = (state: PanelState) => state.items.filter((item): item is TaskItem => item.kind === 'task')

  it('вызов Agent и системное событие о нём не удваивают карточку', () => {
    const state = play([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
    ])

    expect(tasks(state)).toHaveLength(1)
    expect(tasks(state)[0]?.target).toBe('Explore')
  })

  it('карточка запоминает имя задачи у CLI — по нему её и прибивают', () => {
    // Карточку завёл вызов инструмента, и знает он только свой идентификатор:
    // настоящее имя задачи приезжает следом, системным событием. Без него
    // крестик на чипе нечего было бы отправить.
    const state = play([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
    ])

    expect(tasks(state)[0]?.id).toBe('toolu-1')
    expect(tasks(state)[0]?.taskId).toBe('a90aa')
  })

  it('порядок наоборот — событие раньше вызова — тоже даёт одну карточку', () => {
    const state = play([
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
    ])

    expect(tasks(state)).toHaveLength(1)
  })

  it('шаги и итог по task_id доходят до карточки, заведённой вызовом', () => {
    let state = play([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      agentTaskStartedEvent('a90aa', 'toolu-1', 'Explore'),
    ])
    state = play([taskProgressEvent('a90aa', 'Read')], state)
    state = reducePanel(
      state,
      { kind: 'agent', event: taskNotificationEvent('a90aa', 'completed', 'Нашёл шесть мест') },
      1_700_000_005_000,
    )

    const task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.duration).toBe('5.0s')
    expect(task?.outcome).toBe('ok')
    expect(task?.log.map((line) => line.text)).toEqual(['→ Read', 'Нашёл шесть мест'])
  })

  it('подтверждение фонового запуска не закрывает карточку — ждём task_notification', () => {
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
      { kind: 'agent', event: taskNotificationEvent('a90aa', 'completed', 'Нашёл шесть мест') },
      1_700_000_005_000,
    )

    task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.outcome).toBe('ok')
  })

  it('результат вызова закрывает карточку, заведённую системным событием', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([toolResultEvent('toolu-parent', 'Готово')], state)

    const task = tasks(state)[0]
    expect(task?.pending).toBe(false)
    expect(task?.outcome).toBe('ok')
  })

  it('оборванный агент помечается остановленным, а не отработавшим', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([taskNotificationEvent('task-1', 'stopped')], state)

    const task = tasks(state)[0]
    expect(task?.outcome).toBe('stopped')
    expect(task?.log.map((line) => line.text)).toEqual(['Stopped before it finished.'])
  })
})

describe('фоновые команды в канале задач', () => {
  const bashEvent = (id: string, command: string, background = false): AgentEvent =>
    toolUseEvent(id, 'Bash', { command, description: 'Start the dev server', ...(background ? { run_in_background: true } : {}) })

  /** Карточка команды — она лежит внутри группы вызовов, а не в ленте напрямую. */
  const tool = (state: PanelState, id: string) =>
    state.items
      .filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      .flatMap((group) => group.tools)
      .find((item) => item.id === id)

  it('обычная долгая команда не становится агентом', () => {
    const state = play([
      bashEvent('toolu-1', 'yarn typecheck'),
      bashTaskStartedEvent('b0eb4', 'toolu-1', 'Update the metrics test and typecheck'),
    ])

    expect(state.items.some((item) => item.kind === 'task')).toBe(false)
    expect(state.background).toHaveLength(0)
  })

  it('фоновая команда получает чип, но не карточку агента', () => {
    const state = play([
      bashEvent('toolu-1', 'yarn dev', true),
      bashTaskStartedEvent('bv7hh', 'toolu-1', 'Start the dev server'),
    ])

    expect(state.items.some((item) => item.kind === 'task')).toBe(false)
    expect(state.background).toEqual([
      { id: 'bv7hh', toolUseId: 'toolu-1', label: 'Start the dev server', duration: '0.0s' },
    ])
  })

  it('время фоновой команды тикает и после часа считается в часах', () => {
    let state = play([
      bashEvent('toolu-1', 'yarn dev', true),
      bashTaskStartedEvent('bv7hh', 'toolu-1', 'Start the dev server'),
    ])
    state = reducePanel(state, { kind: 'tick' }, 1_700_000_000_000 + 60_608_000)

    expect(state.background[0]?.duration).toBe('16h 50m')
  })

  it('конец фоновой команды снимает чип и подписывает её карточку', () => {
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

  it('упавшая фоновая команда краснеет и объясняет причину', () => {
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

  it('смерть процесса снимает чипы: следить за командой больше некому', () => {
    let state = play([
      bashEvent('toolu-1', 'yarn dev', true),
      bashTaskStartedEvent('bv7hh', 'toolu-1', 'Start the dev server'),
    ])
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_060_000)

    expect(state.background).toHaveLength(0)
    expect(tool(state, 'toolu-1')?.detail.map((line) => line.text)).toContain(
      'Ran 1m 00s in the background — no longer tracked.',
    )
  })
})

describe('список задач через TodoWrite', () => {
  // activeForm — тот же пункт, названный происходящим сейчас делом. Строка
  // состояния под лентой берёт его, пока пункт в работе (см. feed/activity.ts).
  it('запоминает activeForm пункта рядом с ним самим', () => {
    const state = play([
      toolUseEvent('t1', 'TodoWrite', {
        todos: [
          { content: 'Собрать проект', activeForm: 'Building the project', status: 'in_progress' },
          { content: 'Прогнать тесты', status: 'pending' },
        ],
      }),
    ])

    const todo = [...state.items].reverse().find((item): item is TodoItem => item.kind === 'todo')
    expect(todo?.todos).toEqual([
      { id: 'todo-0', text: 'Собрать проект', state: 'active', activeForm: 'Building the project' },
      { id: 'todo-1', text: 'Прогнать тесты', state: 'todo' },
    ])
  })
})

describe('список задач через TaskCreate/TaskUpdate', () => {
  const taskCreatedResult = (id: string, n: number, subject: string): AgentEvent =>
    toolResultEvent(id, `Task #${n} created successfully: ${subject}`)

  const latestTodo = (state: PanelState) =>
    [...state.items].reverse().find((item): item is TodoItem => item.kind === 'todo')

  it('задача появляется в списке только после ответа с присвоенным номером', () => {
    const mid = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Собрать проект', description: '…' })])
    expect(latestTodo(mid)).toBeUndefined()

    const after = play([taskCreatedResult('t1', 1, 'Собрать проект')], mid)
    expect(latestTodo(after)?.todos).toEqual([{ id: 'task-1', text: 'Собрать проект', state: 'todo' }])
  })

  /**
   * activeForm — тот же пункт, названный происходящим сейчас делом; из него
   * строится строка состояния под лентой, пока пункт в работе (см. activityFor
   * в feed/activity.ts). Приходит он только при создании задачи, а нужен
   * позже — когда до неё дойдёт очередь, и правка статуса его не несёт.
   */
  it('activeForm задачи переживает правки статуса', () => {
    let state = play([
      toolUseEvent('t1', 'TaskCreate', { subject: 'Собрать проект', activeForm: 'Building the project' }),
    ])
    state = play([taskCreatedResult('t1', 1, 'Собрать проект')], state)
    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'Собрать проект', state: 'todo', activeForm: 'Building the project' },
    ])

    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'in_progress' })], state)
    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'Собрать проект', state: 'active', activeForm: 'Building the project' },
    ])
  })

  it('TaskUpdate со своим activeForm перебивает прежний', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Собрать', activeForm: 'Building' })])
    state = play([taskCreatedResult('t1', 1, 'Собрать')], state)

    state = play(
      [toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'in_progress', activeForm: 'Rebuilding' })],
      state,
    )
    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'Собрать', state: 'active', activeForm: 'Rebuilding' },
    ])
  })

  it('TaskUpdate двигает статус той же задачи по её номеру', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Собрать проект' })])
    state = play([taskCreatedResult('t1', 1, 'Собрать проект')], state)

    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'in_progress' })], state)
    expect(latestTodo(state)?.todos).toEqual([{ id: 'task-1', text: 'Собрать проект', state: 'active' }])

    state = play([toolUseEvent('t3', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)
    expect(latestTodo(state)?.todos).toEqual([{ id: 'task-1', text: 'Собрать проект', state: 'done' }])
  })

  it('несколько задач держат свой номер и порядок независимо от порядка правок', () => {
    let state = play([
      toolUseEvent('t1', 'TaskCreate', { subject: 'Первая' }),
      toolUseEvent('t2', 'TaskCreate', { subject: 'Вторая' }),
    ])
    state = play([taskCreatedResult('t1', 1, 'Первая'), taskCreatedResult('t2', 2, 'Вторая')], state)

    // Вторую отмечают раньше первой — порядок в панели остаётся по номеру задачи.
    state = play([toolUseEvent('t3', 'TaskUpdate', { taskId: '2', status: 'completed' })], state)

    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'Первая', state: 'todo' },
      { id: 'task-2', text: 'Вторая', state: 'done' },
    ])
  })

  it('status: deleted убирает задачу из списка совсем', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Ненужная' })])
    state = play([taskCreatedResult('t1', 1, 'Ненужная')], state)

    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'deleted' })], state)
    expect(latestTodo(state)?.todos).toEqual([])
  })

  // TaskUpdate по номеру, который панель ещё не видела (например, задача
  // фонового агента, не связанного со списком в этой панели) — не должен
  // ронять ленту и не должен создавать задачу из ниоткуда.
  it('TaskUpdate на неизвестный номер задачи ничего не делает', () => {
    const before = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Задача' })])
    const after = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '99', status: 'completed' })], before)
    expect(after).toEqual(before)
  })

  // Ответ инструмента — единственное место, где узнаётся номер задачи; если
  // однажды формат слов изменится, задача просто не должна появиться в
  // списке — не с перепутанным номером и не ломая остальные задачи в нём.
  // Панель на пустой список и так ничего не рисует (см. TaskListPanel).
  it('нераспознанный текст ответа TaskCreate тихо пропускает задачу', () => {
    const state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Задача' })])
    const after = play([toolResultEvent('t1', 'Готово, задача добавлена')], state)
    expect(latestTodo(after)?.todos).toEqual([])
  })

  const newPrompt = (state: PanelState, text: string): PanelState =>
    reducePanel(state, { kind: 'prompt', tokens: [{ kind: 'text', value: text }], quotes: [] }, 1_700_000_000_000)

  // Список задач нового трекера сам не различает разные просьбы одного
  // разговора — с его точки зрения это один список на весь сеанс. Границу
  // проводит панель по новому сообщению человека, а не по тому, закрыт ли
  // список в моменте: если бы граница была «список сейчас пуст», задачи,
  // которые агент ведёт по одной (создал — сделал — закрыл — создал
  // следующую), стирали бы друг друга на каждом шаге, ровно как пожаловался
  // пользователь на живом прогоне.
  it('новое сообщение пользователя начинает список задач заново', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Старая задача' })])
    state = play([taskCreatedResult('t1', 1, 'Старая задача')], state)
    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)

    state = newPrompt(state, 'другая, не связанная просьба')
    state = play([toolUseEvent('t3', 'TaskCreate', { subject: 'Новая задача' })], state)
    state = play([taskCreatedResult('t3', 2, 'Новая задача')], state)

    expect(latestTodo(state)?.todos).toEqual([{ id: 'task-2', text: 'Новая задача', state: 'todo' }])
  })

  it('новое сообщение прячет незакрытый список — иначе панель держит прежнюю просьбу', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Старая задача' })])
    state = play([taskCreatedResult('t1', 1, 'Старая задача')], state)

    state = newPrompt(state, 'продолжи после лимита')
    expect(latestTodo(state)?.todos).toEqual([])

    // Агент пытается закрыть старые номера — их уже нет, панель не должна ожить.
    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)
    expect(latestTodo(state)?.todos).toEqual([])
  })

  it('полностью закрытый список новым сообщением не дублирует пустым снимком', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Старая задача' })])
    state = play([taskCreatedResult('t1', 1, 'Старая задача')], state)
    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)

    const before = latestTodo(state)
    state = newPrompt(state, 'другая, не связанная просьба')
    expect(latestTodo(state)).toEqual(before)
  })

  it('задачи одной и той же просьбы копятся вместе, даже если ведутся по одной', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Первая' })])
    state = play([taskCreatedResult('t1', 1, 'Первая')], state)
    state = play([toolUseEvent('t2', 'TaskUpdate', { taskId: '1', status: 'completed' })], state)

    // Первая уже закрыта, но нового сообщения не было — это тот же список,
    // agент просто перешёл к следующему пункту той же просьбы.
    state = play([toolUseEvent('t3', 'TaskCreate', { subject: 'Вторая' })], state)
    state = play([taskCreatedResult('t3', 2, 'Вторая')], state)

    expect(latestTodo(state)?.todos).toEqual([
      { id: 'task-1', text: 'Первая', state: 'done' },
      { id: 'task-2', text: 'Вторая', state: 'todo' },
    ])
  })

  // Досылка в идущий ход — не новая просьба, а добавка к той же (см.
  // комментарий у case 'prompt'): список задач она не трогает.
  it('досылка в идущий ход список задач не сбрасывает', () => {
    let state = play([toolUseEvent('t1', 'TaskCreate', { subject: 'Первая' })])
    state = play([taskCreatedResult('t1', 1, 'Первая')], state)

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'да, и ещё вот это' }], quotes: [], steering: true },
      1_700_000_000_000,
    )

    expect(latestTodo(state)?.todos).toEqual([{ id: 'task-1', text: 'Первая', state: 'todo' }])
  })
})

describe('сжатие контекста', () => {
  it('статус "compacting" сразу заводит pending-карточку CONTEXT, не дожидаясь итога', () => {
    const state = play([compactingStatusEvent()])
    const compact = state.items.find((item): item is CompactItem => item.kind === 'compact')

    expect(state.compacting).toBe(true)
    expect(compact?.pending).toBe(true)
    expect(compact?.target).toBe('Compacting conversation…')
  })

  it('compact_boundary обновляет ту же карточку реальными цифрами, а не создаёт вторую', () => {
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

  it('без post_tokens/duration_ms откатывается на прежнюю формулировку', () => {
    const state = play([compactBoundaryEvent({ trigger: 'manual', pre_tokens: 5000 })])
    const compact = state.items.find((item): item is CompactItem => item.kind === 'compact')

    expect(compact?.pending).toBe(false)
    expect(compact?.target).toBe('manually compacted 5.0k of context into a summary')
  })

  it('compact_boundary без предварительного пинга всё равно создаёт готовую карточку', () => {
    const state = play([compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 90000, post_tokens: 30000 })])
    const compact = state.items.find((item): item is CompactItem => item.kind === 'compact')

    expect(compact?.pending).toBe(false)
    expect(compact?.target).toBe('automatically compacted 90.0k of context into a 30.0k summary')
  })

  it('закрывающий статус гасит флаг compacting, не трогая уже готовую карточку', () => {
    let state = play([compactingStatusEvent()])
    state = play([compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 168000 })], state)
    const before = state.items.find((item) => item.kind === 'compact')

    state = play([compactResultEvent('completed')], state)

    expect(state.compacting).toBe(false)
    expect(state.items.find((item) => item.kind === 'compact')).toEqual(before)
  })

  it('нечего сжимать: pending-карточка без compact_boundary тихо убирается, а не висит вечно', () => {
    let state = play([compactingStatusEvent()])
    expect(state.items.some((item) => item.kind === 'compact')).toBe(true)

    state = play([compactResultEvent('completed')], state)

    expect(state.items.some((item) => item.kind === 'compact')).toBe(false)
    expect(state.compacting).toBe(false)
  })

  it('проваленная попытка сжатия ставит ошибку в ленту', () => {
    let state = play([compactingStatusEvent()])
    state = play([compactResultEvent('failed', 'Compaction failed · conversation could not be reduced')], state)

    expect(errorTexts(state)).toContain('Compaction failed · conversation could not be reduced')
  })

  it('граница сжатия гасит флаг сама: итог отдельным статусом может и не прийти', () => {
    let state = play([compactingStatusEvent()])
    state = play([compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 168000 })], state)

    expect(state.compacting).toBe(false)
  })

  it('обрыв процесса посреди сжатия снимает флаг и убирает недорисованную карточку', () => {
    let state = play([compactingStatusEvent()])
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_000_000)

    expect(state.compacting).toBe(false)
    expect(state.items.some((item) => item.kind === 'compact')).toBe(false)
  })

  it('ход, закрывшийся посреди сжатия, тоже снимает флаг: закрывающий статус уже не придёт', () => {
    let state = play([compactingStatusEvent()])
    state = play([resultEvent(1200)], state)

    expect(state.compacting).toBe(false)
    expect(state.items.some((item) => item.kind === 'compact')).toBe(false)
  })

  it('прибитый разговор снимает флаг: иначе строка статуса пропадает до конца жизни вкладки', () => {
    let state = play([compactingStatusEvent()])
    state = reducePanel(state, { kind: 'status', status: 'idle' }, 1_700_000_000_000)

    expect(state.compacting).toBe(false)
  })

  it('сжатие у параллельного субагента не гасит статус-строку главного потока и не заводит карточку CONTEXT в общей ленте', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'code-review')])
    state = play([compactingStatusEvent('task-1')], state)

    expect(state.compacting).toBe(false)
    expect(state.items.some((item) => item.kind === 'compact')).toBe(false)
  })

  it('свой compact_boundary у субагента не закрывает и не путает с чужой pending-карточкой CONTEXT главного потока', () => {
    let state = play([compactingStatusEvent()])
    state = play([taskStartedEvent('task-1', 'toolu-parent', 'code-review')], state)
    state = play([compactBoundaryEvent({ trigger: 'automatic', pre_tokens: 5000 }, 'task-1')], state)

    expect(state.compacting).toBe(true)
    const compact = state.items.find((item): item is CompactItem => item.kind === 'compact')
    expect(compact?.pending).toBe(true)
  })
})

describe('ветка и PR из фонового опроса', () => {
  it('ветка приходит своим сообщением, отдельно от PR — и не стирает уже известный PR', () => {
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

  it('PR приходит своим сообщением, отдельно от ветки — и не стирает уже известную ветку', () => {
    let state = reducePanel(initialPanelState, { kind: 'project', gitBranch: 'main' })
    state = reducePanel(state, { kind: 'project', pullRequest: '7', pullRequestUrl: 'https://github.com/x/y/pull/7' })

    expect(state.project?.gitBranch).toBe('main')
    expect(state.project?.pullRequest).toBe('7')
  })

  it('пустая строка от свежей проверки PR явно гасит старый номер, а не сохраняет его', () => {
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

describe('индикатор контекста', () => {
  it('contextUsage не делится на ноль при нулевом или отрицательном лимите', () => {
    const usage = { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    expect(contextUsage(usage, 0)).toBe(0)
    expect(contextUsage(usage, -50)).toBe(0)
  })

  it('одношаговый ход берёт верхнеуровневый usage как снимок', () => {
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

  it('многошаговый ход с снимками в iterations берёт последний, а не сумму', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: {
        type: 'result',
        subtype: 'success',
        num_turns: 2,
        usage: {
          input_tokens: 50_000, // сумма по всем внутренним шагам
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

  it('многошаговый ход БЕЗ снимков в iterations не завышает usage суммой (regression)', () => {
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

    // Ход внутри себя вызвал несколько шагов (num_turns > 1), но снимков по
    // шагам не пришло — верхнеуровневые поля тут точно сумма, а не снимок
    // «сейчас». Доверять ей молча нельзя: usage должен остаться прежним, а не
    // подскочить до суммы.
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

describe('печатающийся ответ', () => {
  const deltaEvent = (text: string): AgentEvent => ({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  })

  it('копит кусочки и занимает номер в ленте на первом же из них', () => {
    const state = play([deltaEvent('Смотрю, '), deltaEvent('как устроена панель.')])

    expect(state.streamingText).toBe('Смотрю, как устроена панель.')
    expect(state.streamingId).toBeTruthy()
    // Пока карточка печатается, готовой в ленте ещё нет.
    expect(state.items).toHaveLength(0)
  })

  it('отдаёт занятый номер тому же ответу, когда он приходит готовым блоком', () => {
    const printing = play([deltaEvent('Смотрю, '), deltaEvent('как устроена панель.')])
    const settled = play([textEvent('Смотрю, как устроена панель.')], printing)

    // Тот же id — значит для React это тот же узел: карточка не пересоздаётся, а
    // дорисовывает хвост, и волна проявления не рвётся на последних словах.
    expect(settled.items.map((item) => item.id)).toEqual([printing.streamingId])
    expect(settled.streamingText).toBe('')
    expect(settled.streamingId).toBeUndefined()
  })

  it('не отдаёт занятый номер второму текстовому блоку того же сообщения', () => {
    const printing = play([deltaEvent('Первый ответ.')])
    const settled = play(
      [
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Первый ответ.' }, { type: 'text', text: 'Второй ответ.' }] },
        },
      ],
      printing,
    )

    const ids = settled.items.map((item) => item.id)
    expect(ids[0]).toBe(printing.streamingId)
    expect(ids[1]).not.toBe(printing.streamingId)
  })

  it('освобождает занятый номер, когда ход закончился без готового текста', () => {
    const printing = play([deltaEvent('Оборванный ответ')])
    const stopped = play([resultEvent(1_000)], printing)

    expect(stopped.streamingText).toBe('')
    expect(stopped.streamingId).toBeUndefined()
  })
})

describe('карточка плана', () => {
  const plan = [
    '## Что делаем',
    '',
    '1. Вынести переменные в `config/env.ts`, **обязательно** до правки вызовов',
    '   - сначала прочитать текущие обращения',
    '2. Заменить обращения к process.env',
    '',
    'Дальше можно катить.',
  ].join('\n')

  const state = () => play([toolUseEvent('plan-1', 'ExitPlanMode', { plan })])
  const card = () => state().items.find((item) => item.kind === 'plan')

  it('показывает план целиком, а не одни лишь пункты списка', () => {
    const paragraphs = card()?.paragraphs ?? []

    // Заголовок раздела и абзац-пояснение раньше терялись: разбор оставлял
    // только строки, начинавшиеся с маркера списка.
    expect(paragraphs.some((paragraph) => paragraph.heading)).toBe(true)
    expect(paragraphs.some((paragraph) => !paragraph.bullet && !paragraph.heading)).toBe(true)
  })

  it('разметка внутри пункта разбирается, а не показывается звёздочками', () => {
    const step = card()?.paragraphs.find((paragraph) => paragraph.marker === '1.')

    expect(step?.parts.some((part) => part.strong)).toBe(true)
    expect(step?.parts.some((part) => part.code)).toBe(true)
    // Путь остаётся в самом предложении: раньше его вырезали в отдельную
    // приписку, и строка начиналась с запятой.
    expect(step?.parts.map((part) => part.text).join('')).toContain('Вынести переменные в')
  })

  it('вложенное уточнение не считается отдельным шагом', () => {
    expect(card()?.meta).toBe('· 2 steps')
  })
})

describe('живой счётчик текущего хода (turnStartedAt)', () => {
  it('обычный prompt отмечает начало хода — из него растёт счётчик рядом с «Claude is thinking»', () => {
    const state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )

    expect(state.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('досылка в идущий ход не двигает начало — досланное сообщение не новый ход, а продолжение прежнего', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'первое' }], quotes: [] },
      1_700_000_000_000,
    )

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'стой, не этот' }], quotes: [], steering: true },
      1_700_000_005_000,
    )

    expect(state.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('status idle гасит счётчик — ход кончился, считать больше нечего', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )

    state = reducePanel(state, { kind: 'status', status: 'idle' }, 1_700_000_005_000)

    expect(state.turnStartedAt).toBeUndefined()
  })

  it('status running без своего prompt (переподключение к фоновому ходу) тоже заводит счётчик', () => {
    const state = reducePanel(initialPanelState, { kind: 'status', status: 'running' }, 1_700_000_000_000)
    expect(state.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('повторный status running не откатывает уже идущий счётчик назад', () => {
    let state = reducePanel(initialPanelState, { kind: 'status', status: 'running' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'status', status: 'running' }, 1_700_000_005_000)

    expect(state.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('тик двигает рендер дальше даже без единого вызова инструмента — иначе счётчик стоял бы на нуле до первого вызова', () => {
    const running = reducePanel(initialPanelState, { kind: 'status', status: 'running' }, 1_700_000_000_000)
    const ticked = reducePanel(running, { kind: 'tick' }, 1_700_000_001_000)

    // startedAt (по вызовам инструментов) пуст — сравниваем сами объекты
    // состояния: тик обязан вернуть новый, а не тот же самый, иначе useReducer
    // решит, что рендерить нечего, и счётчик рядом с «Claude is thinking» не сдвинется.
    expect(ticked).not.toBe(running)
    expect(ticked.turnStartedAt).toBe(1_700_000_000_000)
  })

  it('result кончает ход и гасит счётчик сразу же, не дожидаясь отдельного status idle', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'agent', event: resultEvent(3_000) }, 1_700_000_003_000)

    expect(state.turnStartedAt).toBeUndefined()
  })

  it('обрыв процесса гасит счётчик — иначе setInterval тикал бы вхолостую до следующего сообщения', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_005_000)

    expect(state.turnStartedAt).toBeUndefined()
  })
})

describe('пауза счётчика на решении человека (pausedMs)', () => {
  it('attentionStarted → attentionEnded копит время ожидания в pausedMs', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_010_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_015_000)

    expect(state.pausedMs).toBe(5_000)
    expect(state.waitStartedAt).toBeUndefined()
  })

  it('повторный attentionStarted не двигает начало паузы назад', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_010_000)
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_012_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_015_000)

    expect(state.pausedMs).toBe(5_000)
  })

  it('attentionEnded без активной паузы — no-op', () => {
    const state = reducePanel(initialPanelState, { kind: 'attentionEnded' }, 1_700_000_000_000)
    expect(state.pausedMs).toBe(0)
  })

  it('несколько пауз за один ход суммируются', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_010_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_013_000)
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_020_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_030_000)

    expect(state.pausedMs).toBe(3_000 + 10_000)
  })

  it('новый ход обнуляет накопленную паузу прежнего', () => {
    let state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'первое' }], quotes: [] },
      1_700_000_000_000,
    )
    state = reducePanel(state, { kind: 'attentionStarted' }, 1_700_000_010_000)
    state = reducePanel(state, { kind: 'attentionEnded' }, 1_700_000_020_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(20_000) }, 1_700_000_020_000)

    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'второе' }], quotes: [] },
      1_700_001_000_000,
    )

    expect(state.pausedMs).toBe(0)
    expect(state.waitStartedAt).toBeUndefined()
  })
})

/**
 * Вкладка, открытая из истории, — это перепись прошлого разговора: живого хода в
 * ней нет ни одного, и работать в ней нечему. Всё, что осталось в переписи
 * незаконченным, панель закрывает сама — см. applyReplayFinished.
 */
describe('конец переписи прошлого разговора', () => {
  const tasks = (state: PanelState) => state.items.filter((item): item is TaskItem => item.kind === 'task')

  const replay = (events: AgentEvent[], state = initialPanelState): PanelState =>
    events.reduce((acc, event) => reducePanel(acc, { kind: 'agent', event, replay: true }, 1_700_000_000_000), state)

  it('фоновый агент из переписи перестаёт выглядеть работающим', () => {
    // Итог фонового агента приезжает системным событием, а в переписке лежат
    // только реплики — значит для этой карточки он не придёт никогда.
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
    // Счётчик карточки больше не тикает: без этого он шёл бы от момента, когда
    // вкладку открыли, и рос, пока она открыта.
    expect(state.startedAt).toEqual({})
  })

  it('незакрытый вызов инструмента закрывается, но ошибкой не считается', () => {
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

  it('живой ход, начатый пока перепись играла, не закрывается вместе с ней', () => {
    // Длинный разговор проигрывается не мгновенно, и человек успевает написать
    // раньше, чем перепись доиграет. Всё «выполняется» в этот момент — уже его
    // ход, и объявить его законченным было бы хуже висящей карточки.
    let state = replay([toolUseEvent('r-1', 'Agent', { subagent_type: 'Explore' })])
    state = reducePanel(
      state,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'продолжим' }], quotes: [] },
      1_700_000_030_000,
    )
    state = reducePanel(state, { kind: 'agent', event: toolUseEvent('live-1', 'Bash', { command: 'pnpm test' }) }, 1_700_000_031_000)
    const after = reducePanel(state, { kind: 'replayFinished' }, 1_700_000_060_000)

    expect(after).toEqual(state)
  })

  it('уже закрытые карточки переписи не переписываются заново', () => {
    const state = replay([
      toolUseEvent('toolu-1', 'Agent', { subagent_type: 'Explore', description: 'Discover files' }),
      toolResultEvent('toolu-1', 'Нашёл шесть мест'),
    ])
    const after = reducePanel(state, { kind: 'replayFinished' }, 1_700_000_060_000)

    expect(tasks(after)[0]).toEqual(tasks(state)[0])
  })
})

/**
 * Прошлый разговор, открытый из истории, должен читаться разговором: реплики
 * человека приходят в нём единственным способом — записью из переписки, потому
 * что класть их в ленту при отправке было некому.
 */
describe('реплики человека в переписи', () => {
  const users = (state: PanelState) => state.items.filter((item): item is UserItem => item.kind === 'user')

  const userEvent = (text: string, extra: Record<string, unknown> = {}): AgentEvent =>
    ({ type: 'user', message: { content: [{ type: 'text', text }] }, ...extra }) as AgentEvent

  const replayUser = (text: string, extra: Record<string, unknown> = {}): PanelState =>
    reducePanel(initialPanelState, { kind: 'agent', event: userEvent(text, extra), replay: true }, 1_700_000_000_000)

  it('реплика человека попадает в ленту со своим временем', () => {
    const state = replayUser('Посмотри, почему падает сборка', { timestamp: '2026-08-17T09:41:07.000Z' })

    expect(users(state)).toHaveLength(1)
    expect(users(state)[0]?.tokens).toEqual([{ kind: 'text', value: 'Посмотри, почему падает сборка' }])
    // Время из самой записи, а не «когда открыли вкладку».
    expect(users(state)[0]?.time).not.toBe('')
  })

  it('живой разговор реплику из потока не дублирует', () => {
    const live = reducePanel(
      initialPanelState,
      { kind: 'agent', event: userEvent('Посмотри, почему падает сборка') },
      1_700_000_000_000,
    )

    expect(users(live)).toHaveLength(0)
  })

  it('слэш-команда читается командой, а не разметкой', () => {
    const state = replayUser(
      '<command-message>deploy</command-message>\n<command-name>/deploy</command-name>\n<command-args>0.7.11</command-args>',
    )

    expect(users(state)[0]?.tokens).toEqual([{ kind: 'text', value: '/deploy 0.7.11' }])
  })

  it('служебные записи в ленту не идут', () => {
    const skill = replayUser('Base directory for this skill: /Users/you/.claude/skills/task', { isMeta: true })
    const caveat = replayUser(
      '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>',
    )
    const stopped = replayUser('[Request interrupted by user]')
    const subagent = replayUser('Прочитай эти файлы', { parent_tool_use_id: 'toolu-1' })

    expect(users(skill)).toHaveLength(0)
    expect(users(caveat)).toHaveLength(0)
    expect(users(stopped)).toHaveLength(0)
    expect(users(subagent)).toHaveLength(0)
  })

  it('результаты вызовов по-прежнему разбираются', () => {
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
 * Отказ сервера, который CLI пережидает сам: пока идут повторы, в потоке не
 * происходит ничего — ни текста, ни вызовов, — и рассказать об этом может
 * только карточка с обратным отсчётом (см. applyApiRetry).
 */
describe('повторные запросы к API', () => {
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

  it('первый отказ заводит карточку и рассказывает о нём словами терминала', () => {
    const state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600) }, START)

    expect(cards(state)).toHaveLength(1)
    expect(cards(state)[0]).toMatchObject({ label: 'API overloaded', attempt: 1, maxRetries: 10, pending: true })
    expect(cards(state)[0]?.retryAt).toBe(START + 600)
    expect(state.retry?.attempt).toBe(1)
  })

  it('следующие попытки идут в ту же карточку, а не плодят новые', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600) }, START)
    state = reducePanel(state, { kind: 'agent', event: retryEvent(2, 1200) }, START + 600)
    state = reducePanel(state, { kind: 'agent', event: retryEvent(3, 2400) }, START + 1_800)

    expect(cards(state)).toHaveLength(1)
    expect(cards(state)[0]).toMatchObject({ attempt: 3, pending: true })
    expect(cards(state)[0]?.retryAt).toBe(START + 1_800 + 2_400)
  })

  it('отказ зовётся тем же, чем зовёт его терминал', () => {
    const limited = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600, 429) }, START)
    const auth = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600, 401) }, START)
    // Обрыв связи приходит вовсе без кода ответа — терминал и его зовёт общим словом.
    const offline = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600, null) }, START)

    expect(cards(limited)[0]?.label).toBe('Rate limited')
    expect(cards(auth)[0]?.label).toBe('Authentication failed')
    expect(cards(offline)[0]?.label).toBe('API error')
  })

  it('затянувшаяся череда остаётся в ленте следом, когда запрос наконец проходит', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600) }, START)
    state = reducePanel(state, { kind: 'agent', event: retryEvent(2, 30_000) }, START + 600)
    state = reducePanel(state, { kind: 'agent', event: textEvent('Готово') }, START + 41_000)

    expect(state.retry).toBeUndefined()
    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'recovered', attempt: 2 })
    expect(cards(state)[0]?.duration).toBe('41s')
  })

  it('мелькнувшая череда следа не оставляет', () => {
    // Одна попытка через полсекунды — обычная жизнь сети: живьём её видно, а в
    // истории разговора такая карточка была бы шумом между настоящими шагами.
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 500) }, START)
    state = reducePanel(state, { kind: 'agent', event: textEvent('Готово') }, START + 900)

    expect(state.retry).toBeUndefined()
    expect(cards(state)).toHaveLength(0)
  })

  it('исчерпанные попытки читаются сдачей, а не удачей', () => {
    // Ход, у которого кончились попытки, CLI закрывает не ответом модели, а
    // своей заглушкой от <synthetic> с текстом ошибки.
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 600) }, START)
    state = reducePanel(state, { kind: 'agent', event: retryEvent(10, 30_000) }, START + 600)
    state = reducePanel(state, { kind: 'agent', event: syntheticEvent('API Error: 529 Overloaded.') }, START + 61_000)

    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'failed', attempt: 10 })
  })

  it('ход, кончившийся ошибкой, закрывает череду сдачей', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(1, 20_000) }, START)
    state = reducePanel(state, { kind: 'agent', event: failedResultEvent() }, START + 21_000)

    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'failed' })
  })

  it('прерванный посреди паузы ход не оставляет карточку ждущей', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(3, 30_000) }, START)
    state = reducePanel(state, { kind: 'status', status: 'idle' }, START + 12_000)

    expect(state.retry).toBeUndefined()
    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'stopped', attempt: 3 })
  })

  it('умерший процесс тоже закрывает череду', () => {
    let state = reducePanel(initialPanelState, { kind: 'agent', event: retryEvent(2, 30_000) }, START)
    state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, START + 15_000)

    expect(state.retry).toBeUndefined()
    expect(cards(state)[0]).toMatchObject({ pending: false, outcome: 'stopped' })
  })

  it('служебные события паузу не обрывают', () => {
    // Между попытками тем же каналом идут системные пометки — принять их за
    // ответ значит объявить череду законченной, пока она идёт.
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
