import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../protocol'
import { contextUsage, initialPanelState, reducePanel, type PanelState } from './build'
import type { CompactItem, TaskItem, TextItem, ThinkItem, ToolGroupItem } from './types'

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

const compactingStatusEvent = (): AgentEvent => ({ type: 'system', subtype: 'status', status: 'compacting' })

const compactBoundaryEvent = (metadata: {
  trigger?: string
  pre_tokens?: number
  post_tokens?: number
  duration_ms?: number
}): AgentEvent => ({ type: 'system', subtype: 'compact_boundary', compact_metadata: metadata })

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

describe('ошибки в ленте', () => {
  const refusal = 'Cannot set permission mode to bypassPermissions'

  it('один отказ не рисует две одинаковые плашки, придя двумя дорогами', () => {
    // Отказ CLI приходит и текстом в поток ошибок процесса, и разобранным
    // ответом на управляющий запрос смены режима.
    const state = [
      { kind: 'error', message: refusal } as const,
      { kind: 'modeApplied', mode: 'bypassPermissions', applied: false, error: refusal } as const,
    ].reduce(reducePanel, initialPanelState)

    expect(state.errors).toEqual([refusal])
  })

  it('разные ошибки по-прежнему показывает обе', () => {
    const state = [
      { kind: 'error', message: refusal } as const,
      { kind: 'error', message: 'claude exited with code 1' } as const,
    ].reduce(reducePanel, initialPanelState)

    expect(state.errors).toHaveLength(2)
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
    expect(state.errors).toEqual([])
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

  it('помечает Cancelled, если ход закрылся result-событием после Stop/Escape', () => {
    let state = reducePanel(initialPanelState, { kind: 'stopRequested' }, 1_700_000_000_000)
    state = reducePanel(state, { kind: 'agent', event: resultEvent(400) }, 1_700_000_000_400)

    const meta = state.items.filter((item) => item.kind === 'meta')
    expect(meta).toHaveLength(1)
    expect(meta[0]?.stats).toEqual(['Cancelled · Worked 0.4s'])
    // Запрос на остановку погашен — иначе следующий, уже обычный ход тоже
    // ошибочно окрасился бы в Cancelled.
    expect(state.stopRequestedAt).toBeUndefined()
  })

  it('обычный конец хода остаётся просто Worked, без Stop/Escape', () => {
    const state = reducePanel(initialPanelState, { kind: 'agent', event: resultEvent(400) }, 1_700_000_000_400)

    const meta = state.items.filter((item) => item.kind === 'meta')
    expect(meta[0]?.stats).toEqual(['Worked 0.4s'])
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

  it('не рушится на незнакомом событии', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: { type: 'rate_limit_event' } as unknown as AgentEvent,
    })

    expect(state).toEqual(initialPanelState)
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

  it('игнорирует сообщение субагента без задачи в ленте, а не падает и не создаёт мусор', () => {
    const before = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    const after = play([subagentMessageEvent('toolu-unknown', 'Привет из ниоткуда')], before)

    expect(after).toEqual(before)
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

  it('проваленная попытка сжатия добавляет ошибку в общий баннер', () => {
    let state = play([compactingStatusEvent()])
    state = play([compactResultEvent('failed', 'Compaction failed · conversation could not be reduced')], state)

    expect(state.errors).toContain('Compaction failed · conversation could not be reduced')
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
