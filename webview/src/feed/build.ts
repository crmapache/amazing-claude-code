import type {
  AgentEvent,
  AgentStatus,
  AgentUsage,
  ContentBlock,
  ToolResultBlock,
  ToolUseBlock,
} from '../protocol'
import { parseParagraphs } from './markdown'
import { chipFor, detailFor, formatDuration, hunksFor, metaFor, resultToText, targetFor } from './tools'
import type {
  AskQuestion,
  FeedItem,
  PlanStep,
  TaskItem,
  TodoEntry,
  ToolGroupItem,
  ToolItem,
  UserToken,
} from './types'

export interface PanelProject {
  name: string
  workingDirectory: string
  gitBranch?: string
  /** Номер pull request текущей ветки, если он есть. */
  pullRequest?: string
  /** Адрес того же PR — по нему открывается страница в браузере. */
  pullRequestUrl?: string
}

export interface PanelState {
  items: FeedItem[]
  /** Текст ответа, который печатается прямо сейчас. Живёт до готового сообщения. */
  streamingText: string
  status: AgentStatus
  errors: string[]
  sessionId?: string
  model?: string
  permissionMode?: string
  /**
   * Выбранный, но ещё не подтверждённый режим. Кнопка и меню показывают его, пока
   * агент не ответит: иначе выбор выглядит потерянным, а после отказа — принятым.
   */
  pendingMode?: string
  /**
   * Выбранная модель, пока system-событие её не подтвердит. У модели, в отличие
   * от режима, подтверждение всегда отстаёт на один ход: событие текущего хода
   * называет модель, с которой ход НАЧАЛСЯ, то есть результат предыдущей команды,
   * а не этой. Поэтому здесь держим выбор сами, пока не увидим его в событии.
   */
  pendingModel?: string
  project?: PanelProject
  usage: Required<AgentUsage>
  cost: number
  /** Список слэш-команд приходит от самого агента при старте сессии. */
  slashCommands: string[]
  /** Время начала каждого незавершённого вызова — из него считается длительность. */
  startedAt: Record<string, number>
  seq: number
  /**
   * Когда нажали Stop — до этого момента статус меняем только по-настоящему
   * пришедшему событию, а не оптимистично: соврать «свободен» дешевле, чем потом
   * объяснять, почему агент всё равно не отвечает.
   */
  stopRequestedAt?: number
  /** Процесс разговора умер сам с прошлого хода — вкладке есть на что указать. */
  crashed: boolean
  /** Идёт сжатие контекста прямо сейчас — статус-строка должна называть это, а не «работает». */
  compacting: boolean
  /**
   * Локальные команды вроде /clear не зовут модель, но CLI всё равно закрывает
   * ход служебной репликой "(no content)" и итоговым result — в терминале их не
   * видно, а капсула с копированием и строчка длительности хода тут были бы
   * пустым шумом. Ставим при этой заглушке, снимаем на ближайшем result.
   */
  suppressNextMeta: boolean
}

export type PanelAction =
  | { kind: 'prompt'; tokens: UserToken[]; quotes: string[] }
  | { kind: 'agent'; event: AgentEvent }
  | { kind: 'status'; status: AgentStatus }
  | { kind: 'error'; message: string }
  | { kind: 'init'; project: PanelProject }
  /** Ветка и её pull request приходят позже: за номером ходят в GitHub. */
  | { kind: 'project'; gitBranch?: string; pullRequest?: string; pullRequestUrl?: string }
  | { kind: 'permission'; id: string; target: string; command: string; mode: string }
  | { kind: 'permissionResolved'; id: string; decision: 'once' | 'always' | 'deny' }
  | { kind: 'modeRequested'; mode: string }
  | { kind: 'modeApplied'; mode: string; applied: boolean; error?: string }
  | { kind: 'modelRequested'; model: string }
  /** Отметка панели в ленте: например, что этот разговор ответвлён от другого. */
  | { kind: 'checkpoint'; chip: string; target: string }
  /** Раз в секунду подтягивает длительность ещё не завершённых вызовов. */
  | { kind: 'tick' }
  /** Нажали Stop — статус ждём по-настоящему, не подставляем сами. */
  | { kind: 'stopRequested' }
  /**
   * Процесс умер сам. Всё, что было «выполняется», зависло бы так навсегда,
   * если не закрыть явно и не сказать пользователю, что случилось.
   */
  | { kind: 'processExited'; exitCode: number }
  /** Ошибка прочитана — незачем ей висеть в ленте до конца разговора. */
  | { kind: 'dismissError'; index: number }

export const initialPanelState: PanelState = {
  items: [],
  streamingText: '',
  status: 'idle',
  errors: [],
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  cost: 0,
  startedAt: {},
  slashCommands: [],
  seq: 1,
  crashed: false,
  compacting: false,
  suppressNextMeta: false,
}

export const reducePanel = (state: PanelState, action: PanelAction, now = Date.now()): PanelState => {
  switch (action.kind) {
    case 'init':
      return { ...state, project: action.project }

    case 'project':
      return {
        ...state,
        project: {
          name: state.project?.name ?? '',
          workingDirectory: state.project?.workingDirectory ?? '',
          ...state.project,
          gitBranch: action.gitBranch ?? state.project?.gitBranch,
          pullRequest: action.pullRequest,
          pullRequestUrl: action.pullRequestUrl,
        },
      }

    case 'status':
      return {
        ...state,
        status: action.status,
        // Раз статус реально пришёл, ждать больше нечего — оптимистичный Stop
        // и старая пометка о крахе (если процесс снова заработал) теряют смысл.
        stopRequestedAt: undefined,
        crashed: action.status === 'running' ? false : state.crashed,
      }

    case 'tick':
      return tickDurations(state, now)

    case 'error':
      return { ...state, errors: [...state.errors, action.message] }

    case 'dismissError':
      return { ...state, errors: state.errors.filter((_, index) => index !== action.index) }

    case 'stopRequested':
      return { ...state, stopRequestedAt: now }

    case 'processExited':
      return applyProcessExited(state, action.exitCode, now)

    case 'prompt':
      return {
        ...state,
        status: 'running',
        streamingText: '',
        stopRequestedAt: undefined,
        crashed: false,
        seq: state.seq + 1,
        items: [
          ...state.items,
          {
            id: `user-${state.seq}`,
            kind: 'user',
            time: formatClock(now),
            tokens: action.tokens,
            quotes: action.quotes,
          },
        ],
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
            meta: `${action.mode} mode`,
            command: action.command,
            decision: null,
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

    case 'modelRequested':
      return { ...state, pendingModel: action.model }

    case 'checkpoint':
      return {
        ...state,
        seq: state.seq + 1,
        items: [
          ...state.items,
          { id: `cp-${state.seq}`, kind: 'checkpoint', chip: action.chip, target: action.target },
        ],
      }

    // Отказ агента возвращает панель к прежнему режиму: показывать применённым то,
    // что не применилось, — худшее из возможного. Причину отказа показываем прямо
    // в ленте, иначе кнопка просто «не нажимается» без объяснений.
    case 'modeApplied':
      return {
        ...state,
        pendingMode: undefined,
        permissionMode: action.applied ? action.mode : state.permissionMode,
        errors: action.error ? [...state.errors, action.error] : state.errors,
      }

    case 'agent':
      return applyAgentEvent(state, action.event, now)
  }
}

/**
 * Пока инструмент или подзадача выполняются, их длительность иначе появляется
 * только вместе с результатом — счётчик стоит на месте, и работа выглядит
 * зависшей. Тик пересчитывает её от startedAt на каждую секунду.
 */
const tickDurations = (state: PanelState, now: number): PanelState => {
  if (Object.keys(state.startedAt).length === 0) return state

  let changed = false

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

  return changed ? { ...state, items } : state
}

/**
 * Процесс умер сам, не по нашей просьбе. Любая карточка, которая была
 * «выполняется» в этот момент, иначе так и останется висеть вечно — закрываем
 * их явно и оставляем в ленте недвусмысленную пометку, что случилось.
 */
const applyProcessExited = (state: PanelState, exitCode: number, now: number): PanelState => {
  const startedAt = { ...state.startedAt }

  const closeTool = (tool: ToolItem): ToolItem => {
    if (!tool.pending) return tool

    const started = startedAt[tool.id]
    delete startedAt[tool.id]
    const duration = started ? formatDuration(now - started) : tool.duration

    return {
      ...tool,
      pending: false,
      isError: true,
      duration,
      meta: '· interrupted',
      detail: [
        ...tool.detail,
        { text: 'Claude Code stopped responding before this finished.', tone: 'bad' as const },
      ],
    }
  }

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      if (!item.pending) return item

      const started = startedAt[item.id]
      delete startedAt[item.id]
      const duration = started ? formatDuration(now - started) : item.duration

      return {
        ...item,
        pending: false,
        duration,
        detail: [...item.detail, { text: 'Session ended before this returned.', tone: 'bad' as const }].slice(-6),
      }
    }

    if (item.kind !== 'toolGroup' || !item.pending) return item

    const tools = item.tools.map(closeTool)
    return { ...item, tools, pending: false, duration: formatDuration(now - item.startedAt) }
  })

  return {
    ...state,
    status: 'idle',
    streamingText: '',
    crashed: true,
    stopRequestedAt: undefined,
    startedAt,
    seq: state.seq + 1,
    items: [
      ...items,
      {
        id: `crash-${state.seq}`,
        kind: 'crash',
        message:
          exitCode === 0
            ? 'Claude Code stopped unexpectedly.'
            : `Claude Code stopped unexpectedly (exit code ${exitCode}).`,
      },
    ],
  }
}

const applyAgentEvent = (state: PanelState, event: AgentEvent, now: number): PanelState => {
  switch (event.type) {
    case 'system':
      return applySystem(state, event, now)

    // /clear стирает историю по-настоящему — лента остаётся показывать её, если
    // не очистить: агент выше уже ничего не помнит, а карточки выглядят так,
    // будто помнит.
    case 'conversation_reset':
      return {
        ...state,
        seq: state.seq + 1,
        sessionId: event.new_conversation_id ?? state.sessionId,
        items: [
          { id: `cleared-${state.seq}`, kind: 'checkpoint', chip: 'CLEAR', target: 'conversation cleared — nothing above this is remembered anymore' },
        ],
      }

    case 'stream_event': {
      const delta = event.event.delta
      if (event.event.type !== 'content_block_delta' || delta?.type !== 'text_delta') return state
      // Текст подагента в основную ленту не течёт: у него своя карточка.
      if (event.parent_tool_use_id) return state
      return { ...state, streamingText: state.streamingText + (delta.text ?? '') }
    }

    case 'assistant':
      return event.parent_tool_use_id
        ? noteSubagent(state, event.parent_tool_use_id, event.message.content ?? [])
        : applyAssistant(state, event.message.content ?? [], now)

    case 'user':
      return applyToolResults(state, event.message.content ?? [], now)

    case 'result': {
      // Когда ход внутри себя вызвал несколько инструментов подряд (num_turns > 1),
      // верхнеуровневые поля usage — это СУММА по всем внутренним шагам: годится для
      // счётчика общего расхода снизу, но как «сколько сейчас занято окно контекста»
      // даёт кратно завышенное число. Настоящий снимок текущего состояния — у
      // последнего шага в iterations; при одном шаге он и так совпадает с usage.
      const usage = mergeUsage(state.usage, event.usage?.iterations?.at(-1) ?? event.usage)
      const stats = resultStats(event)

      return {
        ...state,
        status: 'idle',
        streamingText: '',
        usage,
        cost: event.total_cost_usd ?? state.cost,
        sessionId: event.session_id ?? state.sessionId,
        seq: state.seq + 1,
        errors: event.is_error && event.result ? [...state.errors, event.result] : state.errors,
        suppressNextMeta: false,
        items: state.suppressNextMeta
          ? state.items
          : [...state.items, { id: `meta-${state.seq}`, kind: 'meta', stats }],
      }
    }

    default:
      return state
  }
}

const applySystem = (
  state: PanelState,
  event: Extract<AgentEvent, { type: 'system' }>,
  now: number,
): PanelState => {
  // Событие текущего хода называет модель, с которой ход начался — это результат
  // предыдущей команды, а не той, что только что попросили применить. Пока
  // названная модель не совпадёт с тем, что мы сами просили, продолжаем
  // показывать именно наш выбор, а не то, что пришло с отставанием на ход.
  const modelConfirmed =
    state.pendingModel !== undefined &&
    Boolean(event.model?.toLowerCase().includes(state.pendingModel.toLowerCase()))

  const base: PanelState = {
    ...state,
    sessionId: event.session_id ?? state.sessionId,
    model: event.model ?? state.model,
    pendingModel: modelConfirmed ? undefined : state.pendingModel,
    permissionMode: event.permissionMode ?? state.permissionMode,
    slashCommands: event.slash_commands ?? state.slashCommands,
    // Рабочий каталог агент сообщает сам; без него пути в карточках остаются
    // полными и не помещаются в панель.
    project: event.cwd
      ? { name: state.project?.name ?? '', ...state.project, workingDirectory: event.cwd }
      : state.project,
    compacting: event.status === 'compacting' ? true : state.compacting,
  }

  // Итог попытки сжатия приходит отдельной строкой статуса, а не compact_boundary,
  // если сжимать оказалось нечего — тогда пометки об успехе вообще не будет,
  // а «работает» так и останется висеть немым, если не снять флаг здесь же.
  if (event.compact_result !== undefined) {
    return {
      ...base,
      compacting: false,
      errors:
        event.compact_result === 'failed' && event.compact_error
          ? [...base.errors, event.compact_error]
          : base.errors,
    }
  }

  if (event.subtype === 'compact_boundary') {
    const before = event.compact_metadata?.pre_tokens
    const trigger = event.compact_metadata?.trigger === 'manual' ? 'manually' : 'automatically'

    return {
      ...base,
      seq: base.seq + 1,
      items: [
        ...base.items,
        {
          id: `compact-${base.seq}`,
          kind: 'compact',
          target: before
            ? `${trigger} compacted ${formatTokens(before)} of context into a summary`
            : `context ${trigger} compacted`,
        },
      ],
    }
  }

  /**
   * Фоновый подагент скилла/воркфлоу (/code-review и подобные) — своей карточки
   * не было вовсе, потому что у него нет вызова инструмента Task в потоке
   * ассистента: скилл поднимает его напрямую, в обход обычного цикла хода.
   * Карточка та же самая, что и у обычного Task — агентам-потребителям ниже
   * (StreamsBar, AgentsDrawer) всё равно, откуда взялся kind:'task'.
   */
  if (event.subtype === 'task_started' && event.task_id) {
    return {
      ...base,
      startedAt: { ...base.startedAt, [event.task_id]: now },
      items: [
        ...base.items,
        {
          id: event.task_id,
          kind: 'task',
          target: event.subagent_type ?? 'agent',
          meta: event.description ?? '',
          duration: '',
          percent: 0,
          detail: [],
          pending: true,
        },
      ],
    }
  }

  if (event.subtype === 'task_progress' && event.task_id) {
    return {
      ...base,
      items: base.items.map((item) =>
        item.kind === 'task' && item.id === event.task_id
          ? {
              ...item,
              meta: event.description ?? item.meta,
              detail: event.last_tool_name ? [{ text: `→ ${event.last_tool_name}` }] : item.detail,
            }
          : item,
      ),
    }
  }

  if (event.subtype === 'task_notification' && event.task_id) {
    const startedTime = base.startedAt[event.task_id]
    const duration = startedTime ? formatDuration(now - startedTime) : ''
    const startedAt = { ...base.startedAt }
    delete startedAt[event.task_id]

    return {
      ...base,
      startedAt,
      items: base.items.map((item) =>
        item.kind === 'task' && item.id === event.task_id
          ? {
              ...item,
              pending: false,
              percent: 100,
              duration,
              detail: event.summary ? detailFor(event.summary) : item.detail,
            }
          : item,
      ),
    }
  }

  return base
}

/**
 * Заглушка, которой CLI закрывает ход без настоящего ответа (например, после
 * локальной команды вроде /clear — она не зовёт модель). Единственный признак
 * отличить её от настоящего ответа — она приходит одна, без единого другого блока.
 */
const isNoContentPlaceholder = (blocks: ContentBlock[]): boolean => {
  if (blocks.length !== 1) return false
  const block = blocks[0]!
  return block.type === 'text' && block.text.trim() === '(no content)'
}

const applyAssistant = (state: PanelState, blocks: ContentBlock[], now: number): PanelState => {
  if (isNoContentPlaceholder(blocks)) return { ...state, streamingText: '', suppressNextMeta: true }

  let next: PanelState = { ...state, streamingText: '' }

  for (const block of blocks) {
    if (block.type === 'text') {
      if (!block.text.trim()) continue
      next = push(next, (id) => ({ id, kind: 'text', paragraphs: parseParagraphs(block.text) }))
      continue
    }

    if (block.type === 'thinking') {
      if (!block.thinking.trim()) continue
      next = pushTool(next, (id) => ({
        id,
        kind: 'tool',
        chip: 'THINK',
        toolName: 'Thinking',
        input: undefined,
        target: 'Thought',
        meta: '',
        duration: '',
        detail: block.thinking.split('\n').map((text) => ({ text, tone: 'dim' as const })),
        hunks: [],
        isError: false,
        pending: false,
      }), now)
      continue
    }

    if (block.type === 'tool_use') {
      next = applyToolUse(next, block, now)
    }
  }

  return next
}

/**
 * Подряд идущие вызовы обычных инструментов складываются в одну группу, пока их
 * не прервёт что-то другое (текст, todo, план, вопрос, задача субагента). Между
 * внутренними шагами одного агентского хода группа может на мгновение полностью
 * разрешиться и тут же продолжиться следующим вызовом без единого текстового
 * блока между ними — это тот самый непрерывный «взрыв» вызовов, который и должен
 * остаться одной группой. Поэтому смотрим только на то, чем был последний
 * элемент ленты, а не на его pending. Сам pending группы при этом честно
 * выводится из детей, а не проставляется вслепую: мысль модели (thinking),
 * например, добавляется уже разрешённой — если бы группа снова становилась
 * pending от одного факта добавления, её было бы уже некому разрешить обратно.
 */
const appendToolCall = (state: PanelState, tool: ToolItem, now: number): PanelState => {
  const last = state.items.at(-1)

  if (last?.kind === 'toolGroup') {
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

/** То же самое, что push, но для вызова инструмента — уходит в группу, а не прямо в items. */
const pushTool = (state: PanelState, make: (id: string) => ToolItem, now: number): PanelState => {
  const tool = make(`i-${state.seq}`)
  return { ...appendToolCall(state, tool, now), seq: state.seq + 1 }
}

const applyToolUse = (state: PanelState, block: ToolUseBlock, now: number): PanelState => {
  const input = (block.input ?? {}) as Record<string, unknown>
  const workingDirectory = state.project?.workingDirectory ?? ''

  if (block.name === 'TodoWrite') {
    return {
      ...state,
      items: [...state.items, { id: block.id, kind: 'todo', todos: readTodos(input) }],
    }
  }

  if (block.name === 'ExitPlanMode') {
    const steps = readPlanSteps(input)
    return {
      ...state,
      items: [
        ...state.items,
        {
          id: block.id,
          kind: 'plan',
          meta: `· ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
          duration: '',
          steps,
          approved: false,
        },
      ],
    }
  }

  if (block.name === 'AskUserQuestion') {
    const questions = readQuestions(input)
    return {
      ...state,
      items: [
        ...state.items,
        {
          id: block.id,
          kind: 'ask',
          meta: `${questions.length} ${questions.length === 1 ? 'question' : 'questions'} · blocks the run`,
          questions,
          sent: false,
        },
      ],
    }
  }

  if (block.name === 'Task' || block.name === 'Agent') {
    const subagent = typeof input.subagent_type === 'string' ? input.subagent_type : 'general'
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
          duration: '',
          percent: 0,
          detail: [],
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
    meta: '',
    duration: '',
    detail: [],
    hunks: [],
    isError: false,
    pending: true,
  }

  return appendToolCall(state, tool, now)
}

const applyToolResults = (state: PanelState, blocks: ContentBlock[], now: number): PanelState => {
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
    const hunks = hunksFor(item.id, item.toolName, item.input, text)

    return {
      ...item,
      pending: false,
      isError,
      duration,
      meta: metaFor(item.toolName, item.input, text, isError),
      // При диффе сырой ответ инструмента не показываем: он повторяет то же самое
      // строками вида «файл обновлён» и куском кода вокруг правки.
      detail: hunks.length > 0 ? [] : detailFor(text),
      hunks,
    }
  }

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      const result = results.find((candidate) => candidate.tool_use_id === item.id)
      if (!result) return item

      const started = state.startedAt[item.id]
      const duration = started ? formatDuration(now - started) : ''
      delete startedAt[item.id]

      const text = resultToText(result.content)
      const task: TaskItem = { ...item, pending: false, percent: 100, duration, detail: detailFor(text) }
      return task
    }

    if (item.kind !== 'toolGroup') return item

    const tools = item.tools.map(resolveTool)
    const pending = tools.some((tool) => tool.pending)

    if (item.pending && !pending) {
      return { ...item, tools, pending, duration: formatDuration(now - item.startedAt) }
    }

    return { ...item, tools, pending }
  })

  return { ...state, items, startedAt }
}

/** Сообщения подагента показываем последней строкой его карточки, а не в общей ленте. */
const noteSubagent = (state: PanelState, parentId: string, blocks: ContentBlock[]): PanelState => {
  const line = blocks
    .map((block) => {
      if (block.type === 'text') return block.text.trim().split('\n')[0] ?? ''
      if (block.type === 'tool_use') return `${block.name}…`
      return ''
    })
    .filter(Boolean)
    .join(' · ')

  if (!line) return state

  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== parentId || item.kind !== 'task') return item
      const detail = [...item.detail, { text: line, tone: 'dim' as const }].slice(-6)
      return { ...item, detail, percent: Math.min(item.percent + 12, 92) }
    }),
  }
}

// --- Чтение входных данных инструментов -------------------------------------

const readTodos = (input: Record<string, unknown>): TodoEntry[] => {
  const raw = Array.isArray(input.todos) ? input.todos : []

  return raw.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const status = typeof item.status === 'string' ? item.status : 'pending'

    return {
      id: `todo-${index}`,
      text: typeof item.content === 'string' ? item.content : '',
      state: status === 'completed' ? 'done' : status === 'in_progress' ? 'active' : 'todo',
    }
  })
}

/** План приходит одним текстом markdown — раскладываем его в нумерованные шаги. */
const readPlanSteps = (input: Record<string, unknown>): PlanStep[] => {
  const plan = typeof input.plan === 'string' ? input.plan : ''
  const steps: PlanStep[] = []

  for (const line of plan.split('\n')) {
    const match = /^\s*(?:\d+[.)]|[-*])\s+(.*)$/.exec(line)
    if (!match) continue

    const text = (match[1] ?? '').trim()
    if (!text) continue

    // Файл выносим отдельной припиской, поэтому из текста шага его убираем —
    // иначе имя стоит в строке дважды.
    const files = /`([^`]+\.[a-z0-9]+)`/i.exec(text)
    const withoutFile = files
      ? text.replace(new RegExp(`\\s*(?:in|to|into|at)?\\s*\`${escapeRegExp(files[1] ?? '')}\``, 'i'), '')
      : text

    steps.push({
      n: String(steps.length + 1),
      text: withoutFile.replace(/`/g, '').trim(),
      files: files?.[1] ?? '',
    })
  }

  if (steps.length === 0 && plan.trim()) {
    steps.push({ n: '1', text: plan.trim().split('\n')[0] ?? '', files: '' })
  }

  return steps
}

const readQuestions = (input: Record<string, unknown>): AskQuestion[] => {
  const raw = Array.isArray(input.questions) ? input.questions : []

  return raw.map((entry, index) => {
    const question = (entry ?? {}) as Record<string, unknown>
    const options = Array.isArray(question.options) ? question.options : []

    return {
      id: `q-${index}`,
      title: typeof question.question === 'string' ? question.question : '',
      hint: typeof question.header === 'string' ? question.header : '',
      multiSelect: question.multiSelect === true,
      options: options.map((optionRaw, optionIndex) => {
        const option = (optionRaw ?? {}) as Record<string, unknown>
        return {
          id: `o-${optionIndex}`,
          label: typeof option.label === 'string' ? option.label : '',
          sub: typeof option.description === 'string' ? option.description : '',
        }
      }),
    }
  })
}

// --- Мелочи -----------------------------------------------------------------

const push = (state: PanelState, make: (id: string) => FeedItem): PanelState => ({
  ...state,
  seq: state.seq + 1,
  items: [...state.items, make(`i-${state.seq}`)],
})

const mergeUsage = (current: Required<AgentUsage>, incoming?: AgentUsage): Required<AgentUsage> => ({
  input_tokens: incoming?.input_tokens ?? current.input_tokens,
  output_tokens: incoming?.output_tokens ?? current.output_tokens,
  cache_read_input_tokens: incoming?.cache_read_input_tokens ?? current.cache_read_input_tokens,
  cache_creation_input_tokens:
    incoming?.cache_creation_input_tokens ?? current.cache_creation_input_tokens,
})

/** Токены, цена и модель — шум под каждым ходом; из всего этого нужна только длительность. */
const resultStats = (event: Extract<AgentEvent, { type: 'result' }>): string[] =>
  typeof event.duration_ms === 'number' ? [formatDuration(event.duration_ms)] : []

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const formatTokens = (value: number): string => {
  // Миллион пишем миллионом: у больших моделей окно контекста именно такое, и
  // «1000.0k» в датчике читается хуже, чем «1.0M».
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

const formatClock = (ms: number): string => {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * Доля занятого окна контекста для датчика в нижней строке. Размер окна зависит от
 * модели, поэтому приходит извне; двести тысяч — только запасное значение.
 */
export const contextUsage = (usage: Required<AgentUsage>, limit = 200_000): number => {
  const used = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return Math.min(Math.round((used / limit) * 100), 100)
}
