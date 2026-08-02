import type {
  AgentEvent,
  AgentStatus,
  AgentSystemEvent,
  AgentUsage,
  ContentBlock,
  ToolResultBlock,
  ToolUseBlock,
} from '../protocol'
import { normalizeMode } from '../catalog'
import { parseParagraphs } from './markdown'
import { chipFor, detailFor, formatDuration, hunksFor, metaFor, resultToText, targetFor } from './tools'
import type {
  AskQuestion,
  DetailLine,
  FeedItem,
  PlanStep,
  TaskItem,
  TodoEntry,
  ToolGroupItem,
  ToolItem,
  UserItem,
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
  /**
   * Номер, под которым печатающийся ответ ляжет в ленту, когда придёт готовым
   * блоком. Выдаётся заранее, на первой же дельте, чтобы печатающаяся карточка и
   * готовая оказались для React одним и тем же узлом: иначе на стыке он выкинул
   * бы одну карточку и создал вторую, а вместе с ней оборвалась бы и волна
   * проявления — ровно на последних словах ответа.
   */
  streamingId?: string
  /** То же самое, но для мысли — пока не пришёл готовый блок thinking. */
  streamingThinking: string
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
  /**
   * task_id субагента по tool_use_id вызова Task, который его породил — из
   * системного события task_started. Сообщения самого субагента несут только
   * tool_use_id в parent_tool_use_id, а карточка живёт под task_id: без этой
   * карты их нечем связать.
   */
  taskByToolUseId: Record<string, string>
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
  /**
   * steering — сообщение, досланное в уже идущий ход: агент подхватит его между
   * шагами, а не начнёт с него новый. Такое сообщение только добавляется в
   * ленту и ничего в ней не обрывает.
   */
  | { kind: 'prompt'; tokens: UserToken[]; quotes: string[]; steering?: boolean }
  | { kind: 'agent'; event: AgentEvent }
  | { kind: 'status'; status: AgentStatus }
  | { kind: 'error'; message: string }
  | { kind: 'init'; project: PanelProject }
  /** Ветка и её pull request приходят позже: за номером ходят в GitHub. */
  | { kind: 'project'; gitBranch?: string; pullRequest?: string; pullRequestUrl?: string }
  | { kind: 'permission'; id: string; target: string; command: string; mode: string; taskId?: string }
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
  streamingThinking: '',
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
  taskByToolUseId: {},
  slashCommands: [],
  seq: 1,
  crashed: false,
  compacting: false,
  suppressNextMeta: false,
}

/**
 * Один и тот же отказ приходит в ленту двумя дорогами: текстом в поток ошибок
 * процесса и разобранным ответом на управляющий запрос. Показывать его двумя
 * одинаковыми красными плашками подряд — выглядит как две разные поломки, хотя
 * случилась одна.
 */
const addError = (errors: string[], message: string): string[] =>
  errors.includes(message) ? errors : [...errors, message]

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
      return { ...state, errors: addError(state.errors, action.message) }

    case 'dismissError':
      return { ...state, errors: state.errors.filter((_, index) => index !== action.index) }

    case 'stopRequested':
      return { ...state, stopRequestedAt: now }

    case 'processExited':
      return applyProcessExited(state, action.exitCode, now)

    case 'prompt': {
      const message: UserItem = {
        id: `user-${state.seq}`,
        kind: 'user',
        time: formatClock(now),
        tokens: action.tokens,
        quotes: action.quotes,
      }

      // Досылка в идущий ход ничего не начинает заново: агент продолжает своё,
      // и недописанный ответ, который он печатает прямо сейчас, обрывать нельзя —
      // сброс потоковых полей стёр бы его с экрана на полуслове.
      if (action.steering) {
        return { ...state, seq: state.seq + 1, items: [...state.items, message] }
      }

      return {
        ...state,
        status: 'running',
        streamingText: '',
        streamingId: undefined,
        streamingThinking: '',
        stopRequestedAt: undefined,
        crashed: false,
        seq: state.seq + 1,
        items: [...state.items, message],
      }
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
        errors: action.error ? addError(state.errors, action.error) : state.errors,
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
        log: appendAgentLog(item.log, [{ text: 'Session ended before this returned.', tone: 'bad' as const }]),
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
    streamingId: undefined,
    streamingThinking: '',
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
      if (event.event.type !== 'content_block_delta') return state
      // Текст и мысль подагента в основную ленту не текут: у него своя карточка.
      if (event.parent_tool_use_id) return state

      if (delta?.type === 'text_delta') return appendStreamingText(state, delta.text ?? '')
      if (delta?.type === 'thinking_delta') {
        return { ...state, streamingThinking: state.streamingThinking + (delta.thinking ?? '') }
      }
      return state
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
      const usage = mergeUsage(state.usage, contextSnapshot(event))
      // Прерывание не рвёт поток отдельным событием — агент просто закрывает ход
      // обычным result чуть раньше срока (см. ClaudeSession.interrupt). Единственный
      // след, что это не естественный конец хода, а Stop/Escape — то, что запрос на
      // остановку всё ещё висит непогашенным к этому моменту.
      const cancelled = state.stopRequestedAt !== undefined
      const stats = resultStats(event, cancelled)

      return {
        ...state,
        status: 'idle',
        streamingText: '',
        streamingId: undefined,
        streamingThinking: '',
        stopRequestedAt: undefined,
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
    permissionMode: event.permissionMode ? normalizeMode(event.permissionMode) : state.permissionMode,
    slashCommands: event.slash_commands ?? state.slashCommands,
    // Рабочий каталог агент сообщает сам; без него пути в карточках остаются
    // полными и не помещаются в панель.
    project: event.cwd
      ? { name: state.project?.name ?? '', ...state.project, workingDirectory: event.cwd }
      : state.project,
    compacting: event.status === 'compacting' ? true : state.compacting,
  }

  // Сама карточка CONTEXT должна быть видна ещё до готового результата — иначе
  // единственный след того, что что-то происходит, это переливающаяся строка
  // статуса, которая не остаётся в истории (см. жалобу, из-за которой это
  // вообще завели).
  if (event.status === 'compacting' && !state.compacting) {
    return {
      ...base,
      seq: base.seq + 1,
      items: [
        ...base.items,
        { id: `compact-${base.seq}`, kind: 'compact', target: 'Compacting conversation…', pending: true },
      ],
    }
  }

  // Итог попытки сжатия приходит отдельной строкой статуса, а не compact_boundary,
  // если сжимать оказалось нечего — тогда pending-карточка так и останется
  // недорисованной, если её не убрать здесь же явно.
  if (event.compact_result !== undefined) {
    return {
      ...base,
      compacting: false,
      items: base.items.some((item) => item.kind === 'compact' && item.pending)
        ? base.items.filter((item) => !(item.kind === 'compact' && item.pending))
        : base.items,
      errors:
        event.compact_result === 'failed' && event.compact_error
          ? [...base.errors, event.compact_error]
          : base.errors,
    }
  }

  if (event.subtype === 'compact_boundary') {
    const target = compactBoundaryText(event.compact_metadata)
    // Пока сжатие идёт, в ленту больше ничего не приходит (контекст в этот момент
    // как раз переписывается) — pending-карточка, если она есть, всегда последняя.
    const last = base.items.at(-1)

    if (last?.kind === 'compact' && last.pending) {
      return { ...base, items: [...base.items.slice(0, -1), { ...last, target, pending: false }] }
    }

    return {
      ...base,
      seq: base.seq + 1,
      items: [...base.items, { id: `compact-${base.seq}`, kind: 'compact', target, pending: false }],
    }
  }

  /**
   * Фоновый подагент скилла/воркфлоу (/code-review и подобные) — своей карточки
   * не было вовсе, потому что у него нет вызова инструмента Task в потоке
   * ассистента: скилл поднимает его напрямую, в обход обычного цикла хода.
   * Карточка та же самая, что и у обычного Task — потребителям ниже (дропдаун
   * стримов, экран агента) всё равно, откуда взялся kind:'task'.
   */
  if (event.subtype === 'task_started' && event.task_id) {
    return {
      ...base,
      startedAt: { ...base.startedAt, [event.task_id]: now },
      taskByToolUseId: event.tool_use_id
        ? { ...base.taskByToolUseId, [event.tool_use_id]: event.task_id }
        : base.taskByToolUseId,
      items: [
        ...base.items,
        {
          id: event.task_id,
          kind: 'task',
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

  if (event.subtype === 'task_progress' && event.task_id) {
    return {
      ...base,
      items: base.items.map((item) => {
        if (item.kind !== 'task' || item.id !== event.task_id) return item

        // Тот же самый вызов уже мог прийти через основной поток субагента
        // (noteSubagent, строка вида "Bash…"/"Bash: команда") — этот канал
        // сообщает то же самое имя следом, без него лог превращался в пары
        // повторяющихся строк на каждый вызов.
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
              log: event.summary ? appendAgentLog(item.log, detailFor(event.summary)) : item.log,
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
  if (isNoContentPlaceholder(blocks)) {
    return { ...state, streamingText: '', streamingId: undefined, suppressNextMeta: true }
  }

  let next: PanelState = { ...state, streamingText: '', streamingThinking: '' }
  // Номер, занятый печатающейся карточкой, достаётся первому текстовому блоку —
  // это тот же самый ответ, только целиком. Остальные блоки берут номера как
  // обычно, а если текста в сообщении не оказалось вовсе, занятый номер просто
  // пропадает: дырка в нумерации никого не беспокоит, а вот повтор — сломал бы
  // ключи в ленте.
  let reserved = state.streamingId
  next = { ...next, streamingId: undefined }

  for (const block of blocks) {
    if (block.type === 'text') {
      if (!block.text.trim()) continue
      const paragraphs = parseParagraphs(block.text)
      const id = reserved
      reserved = undefined

      next = id
        ? { ...next, items: [...next.items, { id, kind: 'text', paragraphs }] }
        : push(next, (itemId) => ({ id: itemId, kind: 'text', paragraphs }))
      continue
    }

    // Своей карточкой, а не строкой в группе вызовов рядом: там она тонет в
    // первой же свёрнутой «N tools», и её не видно, пока группу не раскрыть.
    if (block.type === 'thinking') {
      if (!block.thinking.trim()) continue
      next = push(next, (id) => ({ id, kind: 'think', text: block.thinking.trim(), pending: false }))
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
        },
      ],
    }
  }

  if (block.name === 'AskUserQuestion') {
    const questions = readQuestions(input)
    // Без единого вопроса блокировать нечем и нечего показывать — а карточку
    // без вопросов и закрыть-то нечем (отвечать не на что), она бы зависла.
    if (questions.length === 0) return state

    return {
      ...state,
      items: [
        ...state.items,
        {
          id: block.id,
          kind: 'ask',
          meta: `${questions.length} ${questions.length === 1 ? 'question' : 'questions'} · blocks the run`,
          questions,
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
      const isError = result.is_error === true
      const tone = isError ? ('bad' as const) : ('ok' as const)
      const task: TaskItem = {
        ...item,
        pending: false,
        percent: 100,
        duration,
        log: appendAgentLog(item.log, detailFor(text).map((line) => ({ ...line, tone }))),
      }
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

/**
 * Кап на лог агента — иначе очень длинный субагент рос бы в памяти неограниченно.
 * 300 строк — с большим запасом на реальный ход субагента; при переполнении
 * старейшие строки уходят под одну сводную пометку вместо того, чтобы пропадать
 * молча.
 */
const AGENT_LOG_LIMIT = 300
const TRIM_MARK = /^…(\d+) earlier steps trimmed$/

const appendAgentLog = (log: DetailLine[], lines: DetailLine[]): DetailLine[] => {
  if (lines.length === 0) return log

  const merged = [...log, ...lines]
  if (merged.length <= AGENT_LOG_LIMIT) return merged

  const already = TRIM_MARK.exec(merged[0]?.text ?? '')
  const priorTrimmed = already ? Number(already[1]) : 0
  const withoutMark = already ? merged.slice(1) : merged
  const keep = withoutMark.slice(withoutMark.length - (AGENT_LOG_LIMIT - 1))
  const trimmedNow = withoutMark.length - keep.length

  return [{ text: `…${priorTrimmed + trimmedNow} earlier steps trimmed`, tone: 'dim' as const }, ...keep]
}

/**
 * Резолвит id вызова, который породил субагента, в реальный task_id его
 * карточки. У фонового канала (task_started/...) это два разных значения —
 * карта строится в applySystem. У прямого вызова Task/Agent tool_use они
 * совпадают напрямую (сама карточка создана с id, равным этому же вызову),
 * поэтому карта для него не нужна — резолвится в самого себя через ?? .
 */
const resolveTaskId = (state: PanelState, parentToolUseId: string): string =>
  state.taskByToolUseId[parentToolUseId] ?? parentToolUseId

/**
 * Сообщения субагента идут в лог его же карточки, а не в общую ленту — у него
 * своя вкладка (см. AgentStreamView).
 *
 * Ветка AskUserQuestion ниже — на будущее, а не для сегодняшнего Claude Code:
 * по официальной документации Agent SDK (user-input.md, раздел Limitations;
 * sub-agents.md, "Control subagent capabilities") AskUserQuestion сейчас
 * вообще недоступен субагентам, запущенным через Task/Agent — SDK вырезает
 * его из набора инструментов до того, как субагент успеет его вызвать. Раз
 * инструмент недостижим, до этой ветки в реальности дело не доходит: она не
 * лечит какую-то поломку доставки ответа, а просто готова к моменту, если
 * Anthropic такое ограничение снимет — тогда вопрос от субагента не потеряется
 * одной строкой без вариантов ответа, как было раньше.
 */
const noteSubagent = (state: PanelState, parentToolUseId: string, blocks: ContentBlock[]): PanelState => {
  const taskId = resolveTaskId(state, parentToolUseId)
  if (!state.items.some((item) => item.kind === 'task' && item.id === taskId)) return state

  const askBlock = blocks.find(
    (block): block is ToolUseBlock => block.type === 'tool_use' && block.name === 'AskUserQuestion',
  )

  let next = state
  const questions = askBlock ? readQuestions((askBlock.input ?? {}) as Record<string, unknown>) : []
  // См. applyToolUse: без вопросов карточку нечем закрыть, она бы зависла.
  if (askBlock && questions.length > 0) {
    next = {
      ...next,
      items: [
        ...next.items,
        {
          id: askBlock.id,
          kind: 'ask',
          meta: `${questions.length} ${questions.length === 1 ? 'question' : 'questions'} · blocks the run`,
          questions,
          taskId,
        },
      ],
    }
  }

  const workingDirectory = state.project?.workingDirectory ?? ''

  const lines = blocks.flatMap((block): DetailLine[] => {
    if (block.type === 'text' && block.text.trim()) return [{ text: block.text.trim().split('\n')[0] ?? '' }]

    if (block.type === 'tool_use') {
      // targetFor всегда что-то отдаёт — при отсутствии более точной цели
      // просто возвращает само имя инструмента; такой случай не дублируем.
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

/**
 * Кусочек печатающегося ответа. Вместе с первым кусочком занимаем и номер в
 * ленте — под ним же ответ потом ляжет готовым блоком (см. streamingId).
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
 * «Сейчас занято окна контекста» — снимок ПОСЛЕДНЕГО внутреннего шага, а не
 * сумма по всем (см. комментарий у места вызова). При однoшаговом ходе
 * верхнеуровневые поля usage и так совпадают со снимком, можно смело взять их.
 * А вот при многошаговом (num_turns > 1) без единого снимка в iterations —
 * верхнеуровневые поля это точно сумма, а не снимок; доверять ей молча
 * нельзя, поэтому оставляем state.usage нетронутым, а не завышенным.
 */
const contextSnapshot = (event: Extract<AgentEvent, { type: 'result' }>): AgentUsage | undefined => {
  const last = event.usage?.iterations?.at(-1)
  if (last) return last
  if ((event.num_turns ?? 1) > 1) return undefined
  return event.usage
}

/** Токены, цена и модель — шум под каждым ходом; из всего этого нужна только длительность. */
const resultStats = (event: Extract<AgentEvent, { type: 'result' }>, cancelled: boolean): string[] => {
  const worked = typeof event.duration_ms === 'number' ? `Worked ${formatDuration(event.duration_ms)}` : ''

  if (!cancelled) return worked ? [worked] : []
  return [worked ? `Cancelled · ${worked}` : 'Cancelled']
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const formatTokens = (value: number): string => {
  // Миллион пишем миллионом: у больших моделей окно контекста именно такое, и
  // «1000.0k» в датчике читается хуже, чем «1.0M».
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

/** Текст готовой карточки CONTEXT — с реальными до/после и временем, если IDE их прислала. */
const compactBoundaryText = (meta: AgentSystemEvent['compact_metadata']): string => {
  const before = meta?.pre_tokens
  const trigger = meta?.trigger === 'manual' ? 'manually' : 'automatically'
  if (before === undefined) return `context ${trigger} compacted`

  const into = meta?.post_tokens !== undefined ? `a ${formatTokens(meta.post_tokens)} summary` : 'a summary'
  const duration = meta?.duration_ms !== undefined ? ` in ${formatDuration(meta.duration_ms)}` : ''
  return `${trigger} compacted ${formatTokens(before)} of context into ${into}${duration}`
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
  // Дефолт параметра срабатывает только на literally undefined — явный 0 (или
  // отрицательное значение) прошёл бы мимо него прямиком в used / 0 = Infinity,
  // а дальше Math.min(Infinity, 100) даёт ровно 100 — ложное «контекст полон».
  const safeLimit = limit > 0 ? limit : 200_000
  return Math.min(Math.round((used / safeLimit) * 100), 100)
}
