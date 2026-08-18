import type {
  AgentEvent,
  AgentStatus,
  AgentSystemEvent,
  AgentRateLimitEvent,
  AgentUsage,
  ContentBlock,
  MessageContent,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from '../protocol'
import { modeShortLabel, normalizeMode } from '../catalog'
import { parseParagraphs } from './markdown'
import { chipFor, detailFor, formatDuration, hunksFor, metaFor, resultToText, targetFor } from './tools'
import type {
  AskQuestion,
  BackgroundTask,
  DetailLine,
  FeedItem,
  Paragraph,
  RetryItem,
  RetryOutcome,
  TaskItem,
  TaskOutcome,
  TodoEntry,
  TodoItem,
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

/**
 * Череда повторных запросов к API, которая идёт прямо сейчас.
 *
 * Живёт рядом с карточкой в ленте, а не только в ней: по этому полю строка
 * состояния под лентой заменяет «Claude is thinking» на правду о происходящем
 * (см. streamStatus в App.tsx), и по нему же следующая попытка находит уже
 * заведённую карточку вместо того, чтобы класть в ленту вторую такую же.
 */
export interface ApiRetry {
  /** Карточка этой череды в ленте. */
  itemId: string
  label: string
  attempt: number
  maxRetries: number
  retryAt: number
  /** Когда сорвался первый запрос — из него считается длительность всей череды. */
  startedAt: number
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
  sessionId?: string
  model?: string
  permissionMode?: string
  /**
   * Выбранный, но ещё не подтверждённый режим. Кнопка и меню показывают его, пока
   * агент не ответит: иначе выбор выглядит потерянным, а после отказа — принятым.
   */
  pendingMode?: string
  /**
   * Выбранная, но ещё не подтверждённая модель — по той же причине, что и режим:
   * ответ от агента приходит не мгновенно, а отказать он может по-настоящему.
   */
  pendingModel?: string
  project?: PanelProject
  usage: Required<AgentUsage>
  /**
   * Занятое окно контекста — цифрой от самого CLI (см. protocol, сообщение
   * context). Своя арифметика по usage остаётся запасным вариантом: она не знает
   * ни настоящего размера окна (у «1M»-моделей он впятеро больше обычного), ни
   * того, что лежит в контексте помимо переписки — системного промпта, описаний
   * инструментов, памяти проекта.
   */
  context?: { used: number; max: number }
  /**
   * Сколько занято окна прямо сейчас, по последнему ответу самого агента.
   *
   * Цифра от CLI приезжает только концом хода: пока идёт первый — и самый
   * длинный — запрос, показывать было бы попросту нечего, и полоска стояла бы
   * на нуле ровно там, где за контекстом и следят. А каждый ответ агента несёт
   * свой usage, и входная его часть — это буквально то, что ушло модели, то
   * есть занятое окно на этот шаг. Считаем по нему, пока не приедет точная
   * цифра, и обнуляем, когда она приедет: она знает и про системный промпт, и
   * про описания инструментов, которых в usage хода не видно.
   */
  liveContextUsed?: number
  cost: number
  /** Список слэш-команд приходит от самого агента при старте сессии. */
  slashCommands: string[]
  /** Время начала каждого незавершённого вызова — из него считается длительность. */
  startedAt: Record<string, number>
  /**
   * Когда начался текущий ход — undefined, если сейчас никакой не идёт. Из
   * него растёт живой счётчик рядом с «Claude is thinking» (см. streamStatus в
   * App.tsx): «Worked Ns» под самим ответом приезжает только его концом, а до
   * этого сколько уже прошло — не видно совсем.
   */
  turnStartedAt?: number
  /**
   * Сколько всего за текущий ход набежало на ожидании решения человека —
   * permission, ExitPlanMode, AskUserQuestion. Вычитается из elapsed в
   * streamStatus (App.tsx): пока висит такая карточка, ход не думает, а стоит,
   * и после решения секунды ожидания не должны задним числом стать «Claude is
   * thinking». Копится через attentionStarted/attentionEnded — их шлёт App.tsx,
   * заметив по awaitsYou смену состояния карточек главного потока.
   */
  pausedMs: number
  /** Когда началось текущее ожидание решения человека — undefined, если сейчас не ждём. */
  waitStartedAt?: number
  /**
   * Карточка субагента по tool_use_id вызова Task/Agent, который его породил —
   * из системного события task_started. Сообщения самого субагента несут только
   * tool_use_id в parent_tool_use_id, а карточка может жить под task_id: без
   * этой карты их нечем связать.
   */
  taskByToolUseId: Record<string, string>
  /**
   * Карточка субагента по task_id — обратная сторона той же связи. Один и тот
   * же субагент приходит двумя дорогами: блоком tool_use в ответе агента (свой
   * идентификатор вызова) и системными событиями task_* (свой task_id). Карточка
   * заводится по той, что пришла первой, а вторая через эту карту находит уже
   * заведённую — иначе на одного субагента их было бы две, и в шапке он занимал
   * бы два чипа сразу.
   */
  taskCards: Record<string, string>
  /**
   * Команды, запущенные в фоне и работающие прямо сейчас. Дальше живут чипом в
   * шапке: пока dev-сервер поднят, это единственное место, где это видно.
   */
  background: BackgroundTask[]
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
   * Запрос к модели сорвался, и CLI пережидает отказ перед повтором. Пока это
   * поле стоит, в разговоре не происходит вообще ничего (см. RetryItem), и
   * говорить «Claude is thinking» — неправда.
   */
  retry?: ApiRetry
  /**
   * Локальные команды вроде /clear не зовут модель, но CLI всё равно закрывает
   * ход служебной репликой "(no content)" и итоговым result — в терминале их не
   * видно, а капсула с копированием и строчка длительности хода тут были бы
   * пустым шумом. Ставим при этой заглушке, снимаем на ближайшем result.
   */
  suppressNextMeta: boolean
  /**
   * Процесс разговора только что поднялся и ещё не брался за дело.
   *
   * Ставится на system/init и снимается первым же итогом хода. Нужно, чтобы
   * отличить служебный «нулевой» ход, которым CLI закрывает сам подъём, от
   * настоящего хода, который и правда кончился ничем, — см. case 'result'.
   */
  starting: boolean
  /**
   * Список задач нового трекера (TaskCreate/TaskUpdate), по его номеру — тому
   * же, которым его называет и TaskUpdate. В отличие от прежнего TodoWrite,
   * здесь нет одного вызова с целым списком: список приходится собирать самим
   * из отдельных вызовов создания и правки (см. applyToolUse/applyTaskCreated).
   *
   * Сам инструмент не разделяет разные просьбы одного разговора — с его точки
   * зрения это один список на весь сеанс. Панели это не подходит: список над
   * полем ввода должен отвечать на «как дела с тем, что я только что попросил»,
   * а не расти вечно пунктами позапрошлой просьбы. Поэтому список сбрасывается
   * не по состоянию задач (обманчивый сигнал — тот же список мог на миг
   * оказаться полностью закрытым и посреди одной работы, если агент ведёт
   * задачи по одной, а не пачкой), а по новому сообщению человека — см. case
   * 'prompt' — оно и есть настоящая граница между «прежней» и «новой» просьбой.
   * Вместе со словарём в ленту кладётся пустой снимок: панель над полем зеркалит
   * последний todo-элемент, и без него продолжала бы показывать прежнюю просьбу,
   * а TaskUpdate по старым номерам уже не находил бы их и молча ничего не делал.
   */
  tasks: Record<string, TodoEntry>
  /**
   * Название задачи по id её вызова TaskCreate — до тех пор, пока не станет
   * известен присвоенный ей номер. Номера в структурированном виде инструмент
   * не отдаёт вовсе, только словами в тексте ответа («Task #3 created…»), и
   * узнать его получится не раньше, чем придёт этот ответ.
   */
  pendingTasks: Record<string, { subject: string; activeForm?: string }>
}

export type PanelAction =
  /**
   * steering — сообщение, досланное в уже идущий ход: агент подхватит его между
   * шагами, а не начнёт с него новый. Такое сообщение только добавляется в
   * ленту и ничего в ней не обрывает.
   */
  | { kind: 'prompt'; tokens: UserToken[]; quotes: string[]; steering?: boolean }
  /**
   * replay — событие не живого хода, а переписи прошлого разговора: в ленту оно
   * ложится так же, но сиюминутного о разговоре не рассказывает (см. 'assistant').
   */
  | { kind: 'agent'; event: AgentEvent; replay?: boolean }
  /**
   * Перепись доиграна — дальше в этой вкладке только живой разговор. Всё, что
   * осталось в переписи незаконченным, закрываем здесь: ждать его результата
   * больше не от кого (см. applyReplayFinished).
   */
  | { kind: 'replayFinished' }
  | { kind: 'status'; status: AgentStatus }
  | { kind: 'error'; message: string }
  | { kind: 'init'; project: PanelProject }
  /** Ветка и её pull request приходят позже: за номером ходят в GitHub. */
  | { kind: 'project'; gitBranch?: string; pullRequest?: string; pullRequestUrl?: string }
  /** Занятое окно контекста этого разговора — цифра от самого CLI. */
  | { kind: 'context'; used: number; max: number }
  /** Команда bash-режима: сперва карточка с ней, потом её вывод. */
  | { kind: 'bashStarted'; id: string; command: string }
  | { kind: 'bashFinished'; id: string; output: string; exitCode: number }
  | {
      kind: 'permission'
      id: string
      target: string
      command: string
      mode: string
      reason?: string
      rememberable?: boolean
      taskId?: string
    }
  | { kind: 'permissionResolved'; id: string; decision: 'once' | 'always' | 'deny' }
  | { kind: 'modeRequested'; mode: string }
  | { kind: 'modeApplied'; mode: string; applied: boolean; error?: string }
  | { kind: 'modelRequested'; model: string }
  /** Модель, которая теперь в силе: при отказе агента — прежняя, а не выбранная. */
  | { kind: 'modelApplied'; model: string; error?: string }
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
  /** Ошибку убрали из ленты вручную — она прочитана, и держать её незачем. */
  | { kind: 'dismissError'; id: string }
  /**
   * Ход встал на решение человека (permission/ask/plan главного потока) — с
   * этого момента время идёт в pausedMs, а не в счётчик «Claude is thinking».
   */
  | { kind: 'attentionStarted' }
  /** Решение принято — время ожидания уходит в pausedMs текущего хода. */
  | { kind: 'attentionEnded' }

export const initialPanelState: PanelState = {
  items: [],
  streamingText: '',
  streamingThinking: '',
  status: 'idle',
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  cost: 0,
  startedAt: {},
  taskByToolUseId: {},
  taskCards: {},
  background: [],
  slashCommands: [],
  seq: 1,
  crashed: false,
  compacting: false,
  suppressNextMeta: false,
  starting: false,
  tasks: {},
  pendingTasks: {},
  pausedMs: 0,
}

/**
 * Ошибка встаёт в ленту на своё место — там же, где случилась (см. ErrorItem).
 *
 * Один и тот же отказ приходит двумя дорогами: текстом в поток ошибок процесса
 * и разобранным ответом на управляющий запрос. Две одинаковые красные плашки
 * подряд читаются как две разные поломки, хотя случилась одна, — поэтому в
 * пределах текущего хода один и тот же текст показываем однажды. Границей хода
 * служит последнее сообщение человека: тот же отказ час спустя — это уже новая
 * неприятность, и промолчать о ней было бы хуже, чем повториться.
 */
const addError = (state: PanelState, message: string, limit = false): PanelState => {
  const turnStart = state.items.map((item) => item.kind).lastIndexOf('user') + 1
  const alreadyShown = state.items
    .slice(turnStart)
    .some((item) => item.kind === 'error' && item.message === message)

  if (alreadyShown) return state

  /**
   * Ту же беду CLI умеет сказать дважды: репликой агента в потоке и строкой в
   * stderr, слово в слово, — так приходит, например, «API Error: 500 …». Первой
   * успевает реплика, и в ленте оставалась пара одинаковых абзацев подряд:
   * обычный ответ и красная плашка под ним.
   *
   * Из двух видов оставляем плашку: она называет случившееся ошибкой, её можно
   * закрыть крестиком, и в ней же ждут ссылку вроде status.claude.com. Обратный
   * порядок (ошибка пришла первой) разбирается там, где рождается реплика, —
   * см. alreadyShownAsError.
   */
  const said = message.trim()
  const withoutEcho = state.items.filter(
    (item, index) => !(index >= turnStart && item.kind === 'text' && item.source.trim() === said),
  )

  return push({ ...state, items: withoutEcho }, (id) => ({
    id,
    kind: 'error',
    message,
    ...(limit ? { limit: true } : {}),
  }))
}

export const reducePanel = (state: PanelState, action: PanelAction, now = Date.now()): PanelState => {
  switch (action.kind) {
    case 'init':
      return { ...state, project: action.project }

    case 'project':
      // Ветка и PR теперь приходят раздельными сообщениями со своей частотой
      // (см. ClaudePanel.refreshBranch/refreshPullRequest) — каждое поле падает
      // назад к прежнему значению, если в этот раз пришло не про него, а не
      // затирается пустотой.
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
      // Обычно прерванный ход закрывает себя сам — обычным result чуть раньше
      // срока, и подпись о прерывании ставится там (см. ниже). Но ход может
      // оборваться и молча: агент успевает освободиться, не прислав итога вовсе.
      // Тогда единственный след остановки — этот статус, и без своей строки
      // лента не сказала бы о ней ничего: работа просто замирала на полуслове.
      const stoppedSilently = action.status === 'idle' && state.stopRequestedAt !== undefined
      // Переподключение к фоновому ходу (см. ниже) считаем новым ходом и для
      // паузы — иначе она тащила бы с собой ожидание из совсем другого хода,
      // о котором эта вкладка ещё не знала.
      const turnReconnected = action.status === 'running' && state.turnStartedAt === undefined

      const next: PanelState = {
        ...state,
        status: action.status,
        // Раз статус реально пришёл, ждать больше нечего — оптимистичный Stop
        // и старая пометка о крахе (если процесс снова заработал) теряют смысл.
        stopRequestedAt: undefined,
        crashed: action.status === 'running' ? false : state.crashed,
        // Обычно ход уже отмечен через 'prompt' — тут только запасной путь:
        // статус 'running' догнал панель сам, без локального prompt (например,
        // после переподключения к уже идущему фоновому ходу). Не трогаем то,
        // что уже тикает — иначе повторный тот же статус двигал бы отсчёт назад.
        turnStartedAt: action.status === 'running' ? (state.turnStartedAt ?? now) : undefined,
        // Ход кончился (или это на самом деле новый) — счётчик паузы обнуляем
        // вместе с turnStartedAt, иначе setInterval в App.tsx тикал бы вхолостую
        // до следующего сообщения, а следующий ход стартовал бы с чужой паузой.
        pausedMs: action.status === 'idle' || turnReconnected ? 0 : state.pausedMs,
        waitStartedAt: action.status === 'idle' ? undefined : state.waitStartedAt,
        seq: stoppedSilently ? state.seq + 1 : state.seq,
        items: stoppedSilently
          ? [...state.items, { id: `meta-${state.seq}`, kind: 'meta', stats: [STOPPED_BY_YOU] }]
          : state.items,
      }

      // Ход кончился, а череда повторов всё ещё открыта — значит его оборвали
      // прямо посреди паузы: своего события об этом у неё нет, закрывать некому
      // (см. closeRetryFor), и без этого её карточка осталась бы ждать попытки,
      // которой уже не будет.
      return action.status === 'idle' ? closeRetry(finishCompacting(next), 'stopped', now) : next
    }

    case 'context':
      // Точная цифра вытесняет прикидку по ходу: своя арифметика знает только
      // про переписку, а эта — про всё содержимое окна.
      return action.max > 0
        ? { ...state, context: { used: action.used, max: action.max }, liveContextUsed: undefined }
        : state

    case 'tick':
      return tickDurations(state, now)

    case 'error':
      return addError(state, action.message)

    case 'dismissError':
      return { ...state, items: state.items.filter((item) => item.id !== action.id) }

    // Идемпотентны нарочно: App.tsx шлёт их на каждую смену awaitsYou, не
    // отслеживая сама, был ли уже отправлен такой же — проще положиться на
    // редьюсер, чем городить для этого отдельный ref.
    case 'attentionStarted':
      return state.waitStartedAt === undefined ? { ...state, waitStartedAt: now } : state

    case 'attentionEnded':
      return state.waitStartedAt === undefined
        ? state
        : { ...state, pausedMs: state.pausedMs + (now - state.waitStartedAt), waitStartedAt: undefined }

    case 'stopRequested':
      return { ...state, stopRequestedAt: now }

    case 'processExited':
      // Процесса не стало прямо посреди паузы перед повтором — повторять больше
      // некому, и карточка обязана перестать ждать вместе с ним.
      return applyProcessExited(closeRetry(finishCompacting(state), 'stopped', now), action.exitCode, now)

    case 'replayFinished':
      return applyReplayFinished(finishCompacting(state), now)

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
        // Новая просьба — граница списка задач нового трекера: см. комментарий
        // у tasks в PanelState. Начатую задачу без ответа TaskCreate обрывать
        // здесь нечем страшным — pendingTasks просто больше никогда не
        // разрешится, что и правильно: её TaskUpdate относился бы к прежней
        // просьбе, а искать её было уже негде.
        tasks: {},
        pendingTasks: {},
      }

      // Пустой снимок, чтобы панель не держала прежний незакрытый список:
      // словарь tasks уже сброшен, а latestTodo смотрит в ленту.
      return hideOpenList ? push(next, (id) => ({ id, kind: 'todo', todos: [] })) : next
    }

    /**
     * Команда bash-режима. Ход агента она не начинает и не трогает: он мог идти
     * прямо сейчас, а мог и не идти вовсе — карточка просто встаёт в ленту
     * своим чередом.
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
            // Подписью из меню, а не именем из протокола: «bypassPermissions mode»
            // человек нигде больше не видит, он выбирал «Bypass».
            meta: `${modeShortLabel(action.mode)} mode`,
            command: action.command,
            decision: null,
            reason: action.reason,
            // Не сказано — значит сработает: молчание CLI и панели тут означает
            // обычный вопрос, а не запрет (см. protocol.ts).
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
          { id: `cp-${state.seq}`, kind: 'checkpoint', chip: action.chip, target: action.target },
        ],
      }

    // Отказ агента возвращает панель к прежнему режиму: показывать применённым то,
    // что не применилось, — худшее из возможного. Причину отказа показываем прямо
    // в ленте, иначе кнопка просто «не нажимается» без объяснений.
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

    // То же самое для модели: оболочка присылает действующую, и она же
    // становится моделью разговора — отвергнутая не оставляет следа. Запоминаем
    // именно здесь, а не полагаемся на каталог: на сборке CLI без списка моделей
    // (или если запрос за ним не дошёл) разворачивать выбранное было бы нечем, и
    // подпись под панелью так и осталась бы называть прежнюю модель.
    case 'modelApplied': {
      const applied: PanelState = { ...state, pendingModel: undefined, model: action.model }
      return action.error ? addError(applied, action.error) : applied
    }

    case 'agent':
      return applyAgentEvent(state, action.event, now, action.replay === true)
  }
}

/**
 * Пока инструмент или подзадача выполняются, их длительность иначе появляется
 * только вместе с результатом — счётчик стоит на месте, и работа выглядит
 * зависшей. Тик пересчитывает её от startedAt на каждую секунду.
 *
 * turnStartedAt в этот пересчёт сам не входит (его читают прямо при рендере,
 * см. streamStatus в App.tsx) — но пока он есть, а startedAt ещё пуст (ход
 * только начался, до первого вызова инструмента), ранний выход ниже вернул бы
 * тот же объект состояния, и React решил бы, что рендерить нечего: живой
 * счётчик рядом с «Claude is thinking» так и стоял бы на нуле.
 */
const tickDurations = (state: PanelState, now: number): PanelState => {
  if (Object.keys(state.startedAt).length === 0 && !state.turnStartedAt && !state.retry) return state

  // Череда повторов сама по себе ничего в ленте не двигает, но обратный отсчёт
  // в строке состояния считается от текущего времени — без нового состояния он
  // замер бы на секунде, когда попытка сорвалась (см. streamStatus в App.tsx).
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
 * Сжатие кончилось — удачно или нет.
 *
 * Об удачном конце говорит своё событие с итогом, но ход может оборваться и
 * раньше: процесс упал, человек нажал Stop, разговор прибили. Закрывающего
 * события тогда не будет вовсе, а поднятый флаг стоит дорого: пока он поднят,
 * строка статуса не показывается вообще (см. streamStatus), то есть и этот ход,
 * и все следующие в этой вкладке идут без единой подписи о том, что происходит.
 * Заодно убираем недорисованную карточку CONTEXT — её процент иначе упрётся в
 * потолок и останется так стоять.
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
 * Отказ сервера словами самого терминала: там эта же пауза подписана ровно так.
 *
 * Панель обязана звать происходящее тем же, чем зовёт CLI, — иначе про одну и ту
 * же перегрузку в терминале и в панели рассказывают разное. Обрыв связи попадает
 * в общее «API error» по той же причине: кода ответа у него нет (см. protocol),
 * и терминал тоже не отличает его от прочих отказов.
 */
const retryLabel = (status: number | null | undefined): string => {
  switch (status) {
    case 429:
      return 'Rate limited'
    case 529:
      return 'API overloaded'
    case 401:
    case 403:
      return 'Authentication failed'
    default:
      return 'API error'
  }
}

/**
 * Насколько короткой должна быть удачная череда, чтобы не оставлять следа.
 *
 * Одна попытка через полсекунды — обычная жизнь сети: работа от неё не встала,
 * человек её даже не заметил, и карточка о ней в ленте была бы шумом между
 * настоящими шагами. Живьём такую всё равно видно — карточка появляется на
 * первом же отказе, — а вот в истории разговора ей делать нечего. Всё, что
 * заметно задержало ход, в ленте остаётся: иначе потом не понять, почему ход
 * длился пять минут. Граница — примерно там, где пауза перестаёт быть заминкой
 * и становится ожиданием.
 */
const RETRY_TRACE_MS = 5_000

/**
 * Очередная попытка: карточка одна на всю череду, меняются только цифры.
 *
 * Событие не говорит, чей запрос сорвался — главного разговора или субагента, —
 * и знать этого неоткуда: у отказа нет ни task_id, ни родительского вызова.
 * Показываем в общей ленте: перегрузка сервера всё равно касается всего
 * разговора целиком, а не отдельной его ветки.
 */
const applyApiRetry = (state: PanelState, event: AgentSystemEvent, now: number): PanelState => {
  const label = retryLabel(event.error_status)
  const attempt = event.attempt ?? (state.retry ? state.retry.attempt + 1 : 1)
  const maxRetries = event.max_retries ?? state.retry?.maxRetries ?? 0
  const retryAt = now + Math.max(0, event.retry_delay_ms ?? 0)

  if (state.retry) {
    const retry = { ...state.retry, label, attempt, maxRetries, retryAt }

    return {
      ...state,
      retry,
      items: state.items.map((item) =>
        item.kind === 'retry' && item.id === retry.itemId ? { ...item, label, attempt, maxRetries, retryAt } : item,
      ),
    }
  }

  const itemId = `retry-${state.seq}`
  const card: RetryItem = { id: itemId, kind: 'retry', label, attempt, maxRetries, retryAt, duration: '', pending: true }

  return {
    ...state,
    seq: state.seq + 1,
    items: [...state.items, card],
    retry: { itemId, label, attempt, maxRetries, retryAt, startedAt: now },
  }
}

/**
 * Череда повторов кончилась.
 *
 * Отдельного события об этом нет ни у удачного конца, ни у неудачного: CLI
 * просто перестаёт повторять — либо потому, что запрос наконец прошёл, либо
 * потому, что попытки исчерпаны, — поэтому закрывает череду тот, кто заметил
 * первое событие после неё (см. closeRetryFor), и он же говорит, чем она
 * кончилась.
 */
const closeRetry = (state: PanelState, outcome: RetryOutcome, now: number): PanelState => {
  const retry = state.retry
  if (!retry) return state

  const elapsed = now - retry.startedAt
  const forget = outcome === 'recovered' && elapsed < RETRY_TRACE_MS

  return {
    ...state,
    retry: undefined,
    items: forget
      ? state.items.filter((item) => item.id !== retry.itemId)
      : state.items.map((item) =>
          item.kind === 'retry' && item.id === retry.itemId
            ? { ...item, pending: false, outcome, duration: formatDuration(elapsed) }
            : item,
        ),
  }
}

/**
 * Чем череда повторов кончилась — по первому же событию, пришедшему после неё.
 *
 * Системные события её не рвут: сама попытка приходит ими же, и между попытками
 * тем же каналом идут служебные пометки вроде смены статуса. Всё остальное
 * означает, что запрос куда-то дошёл, — и остаётся только понять, ответила ли
 * модель. Исчерпав попытки, CLI закрывает ход не её ответом, а своей заглушкой
 * от `<synthetic>` с текстом ошибки — по ней и отличаем сдачу от удачи.
 */
const closeRetryFor = (state: PanelState, event: AgentEvent, now: number): PanelState => {
  if (!state.retry) return state

  switch (event.type) {
    case 'system':
      return state

    // Отказ по лимиту подписки сам по себе ничего не решает: ход в этот момент
    // может и продолжаться, и встать насовсем — об этом скажет то, что придёт
    // следом (см. rate_limit_event).
    case 'rate_limit_event':
      return state

    // Заглушку узнаём по служебному имени модели, а не по отсутствию настоящей:
    // молчание о модели — всего лишь молчание, и объявлять по нему ход сдавшимся
    // значит записывать в поломки обычные ответы.
    case 'assistant':
      return closeRetry(state, syntheticReply(event.message.model) ? 'failed' : 'recovered', now)

    case 'result':
      return closeRetry(state, event.is_error ? 'failed' : 'recovered', now)

    default:
      return closeRetry(state, 'recovered', now)
  }
}

/**
 * Карточки, которые остались «выполняется», когда ждать их результата больше
 * нечего: вызовы инструментов и субагенты.
 *
 * Оставить их как есть — значит показывать работу, которой давно нет: у каждой
 * такой карточки свой счётчик, и он тикает и тикает, пока открыта вкладка.
 * Поводов остаться без результата три — процесс разговора умер, ход кончился
 * раньше, чем вернулся вызов (обычно потому, что его прервали), и перепись
 * прошлого разговора кончилась на незакрытой работе, — поэтому пометка приходит
 * текстом от того, кто закрывает.
 *
 * [notes.tone] — красным помечаем только то, что действительно не доработало:
 * у переписи вызов вполне мог закончиться удачно, просто его результат в ней не
 * сохранился, и красная строка приписывала бы разговору несуществующую ошибку.
 *
 * [keepBackgroundTasks] — про фоновых субагентов: они переживают ход по
 * определению, их итог приносит отдельное уведомление уже после него (см.
 * ASYNC_AGENT_LAUNCHED), и закрывать такую карточку по итогу хода нельзя. А вот
 * смерть процесса — конец и для них: сообщать о себе им больше некому.
 */
const closeUnfinished = (
  state: PanelState,
  now: number,
  notes: { tool: string; task: string; meta: string; tone: 'bad' | 'dim' },
  keepBackgroundTasks: boolean,
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
      meta: notes.meta,
      detail: [...tool.detail, { text: notes.tool, tone: notes.tone }],
    }
  }

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      if (!item.pending) return item
      if (keepBackgroundTasks && item.background) return item

      const started = startedAt[item.id]
      delete startedAt[item.id]
      const duration = started ? formatDuration(now - started) : item.duration

      return {
        ...item,
        pending: false,
        duration,
        outcome: 'stopped' as const,
        log: appendAgentLog(item.log, [{ text: notes.task, tone: notes.tone }]),
      }
    }

    if (item.kind !== 'toolGroup' || !item.pending) return item

    const tools = item.tools.map(closeTool)
    return { ...item, tools, pending: false, duration: formatDuration(now - item.startedAt) }
  })

  return { items, startedAt }
}

/**
 * Перепись прошлого разговора доиграна: всё, что осталось в ней «выполняется»,
 * закрываем — в этой вкладке не работает ничего, а результата этой работы ждать
 * больше не от кого.
 *
 * Отвечать за такие карточки было бы кому только в том разговоре, где их
 * запустили, — а его процесса давно нет. Особенно это про фоновых субагентов:
 * их итог приносит отдельное системное событие, в переписке же хранятся одни
 * реплики, так что для карточки он не приедет никогда. Вкладка, открытая из
 * истории, показывала прошлых агентов работающими прямо сейчас: с бегущим
 * счётчиком (он шёл от момента открытия вкладки, а не от их запуска), с чипом в
 * шапке, с крестиком «прибить» — прибивать в этом процессе было нечего, — и со
 * строкой «Waiting for N subagents» под лентой.
 *
 * Карточки при этом остаются: разговор их правда запускал, и это часть его
 * истории. Меняется только пометка — вместо «выполняется» на них то, что о них
 * действительно известно.
 */
const applyReplayFinished = (state: PanelState, now: number): PanelState => {
  /**
   * Пока перепись играла, человек мог уже написать в эту вкладку — длинный
   * разговор проигрывается не мгновенно. Тогда всё «выполняется» в ленте
   * принадлежит уже живому ходу, и закрывать его нельзя: панель объявила бы
   * законченной работу, которая идёт прямо сейчас. Из двух бед выбираем
   * меньшую и не трогаем ничего: карточка из переписи в этом редком случае
   * останется висеть — ровно как раньше, — зато живой ход цел.
   */
  if (state.turnStartedAt !== undefined) return state

  const { items, startedAt } = closeUnfinished(
    state,
    now,
    {
      tool: 'The saved conversation keeps no result for this call.',
      task: 'How this one ended is not part of the saved conversation.',
      meta: '· not in the transcript',
      tone: 'dim',
    },
    false,
  )

  return { ...state, items, startedAt }
}

/**
 * Процесс умер сам, не по нашей просьбе. Любая карточка, которая была
 * «выполняется» в этот момент, иначе так и останется висеть вечно — закрываем
 * их явно и оставляем в ленте недвусмысленную пометку, что случилось.
 */
const applyProcessExited = (state: PanelState, exitCode: number, now: number): PanelState => {
  const { items, startedAt } = closeUnfinished(
    state,
    now,
    {
      tool: 'Claude Code stopped responding before this finished.',
      task: 'Session ended before this returned.',
      meta: '· interrupted',
      tone: 'bad',
    },
    false,
  )

  /**
   * Фоновые команды переживают этот процесс: dev-сервер, поднятый ходом, никуда
   * не денется. Но сообщать о них больше некому — уведомления шёл тот же CLI,
   * которого не стало, — и оставить чипы с бегущим временем значит показывать
   * заведомо мёртвый счётчик. Чипы убираем, а в карточку команды ставим ровно
   * то, что правда: панель за ней больше не следит.
   */
  const withBackground = state.background.reduce((current, task) => {
    const started = startedAt[task.id]
    delete startedAt[task.id]
    const duration = started ? formatDuration(now - started) : task.duration

    return task.toolUseId
      ? mapTool(current, task.toolUseId, (tool) => ({
          ...tool,
          duration,
          detail: [
            ...tool.detail,
            { text: `Ran ${duration} in the background — no longer tracked.`, tone: 'dim' as const },
          ],
        }))
      : current
  }, items)

  return {
    ...state,
    status: 'idle',
    streamingText: '',
    streamingId: undefined,
    streamingThinking: '',
    crashed: true,
    stopRequestedAt: undefined,
    // Ход оборвался — без этого turnStartedAt повис бы до следующего сообщения,
    // и setInterval в App.tsx тикал бы вхолостую (следующий ход может начаться
    // нескоро).
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
        message:
          exitCode === 0
            ? 'Claude Code stopped unexpectedly.'
            : `Claude Code stopped unexpectedly (exit code ${exitCode}).`,
      },
    ],
  }
}

/**
 * Содержимое сообщения списком блоков — каким бы оно ни пришло.
 *
 * Голая строка вместо списка приходит, например, со сводкой после `/compact`, и
 * раньше на ней падала вся панель: разбор сразу же звал на содержимом методы
 * массива. Строку показываем текстом, как она и есть, а всё остальное
 * неожиданное молча считаем пустотой — незнакомая форма события не повод
 * потерять разговор.
 */
const blocksOf = (content: MessageContent | undefined): ContentBlock[] => {
  if (Array.isArray(content)) return content
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : []
  return []
}

/**
 * Статусы лимита, при которых всё в порядке: запрос прошёл. Про них молчим —
 * событие приходит и в обычной жизни, а лента не сводка о состоянии подписки.
 */
const ALLOWED_RATE_LIMIT = new Set(['allowed', 'allowed_warning', 'ok'])

/** Отказ по лимиту словами: главное здесь — когда снова можно работать. */
const rateLimitMessage = (info: NonNullable<AgentRateLimitEvent['rate_limit_info']>): string => {
  const window = info.rateLimitType === 'five_hour' ? '5-hour' : info.rateLimitType === 'weekly' ? 'weekly' : ''
  const limit = window ? `Your ${window} limit is used up.` : 'Your usage limit is used up.'
  // resetsAt приходит секундами, как это принято в самом CLI.
  const resets = info.resetsAt ? ` Resets at ${new Date(info.resetsAt * 1000).toLocaleString()}.` : ''

  return `${limit}${resets}`
}

/**
 * Настоящая модель — или ничего.
 *
 * Часть сообщений подписана не моделью, а служебной пометкой в угловых скобках:
 * так, например, помечен «<synthetic>» — заглушка, которой CLI закрывает ход,
 * оборванный человеком. Модели с таким именем не существует, и пустить её
 * дальше значит объявить, что разговор на неё перешёл: панель назвала бы её в
 * нижней строке и предложила отдельной строкой в выборе моделей.
 */
const realModel = (model: string | undefined): string | undefined =>
  model && !model.startsWith('<') ? model : undefined

/**
 * Ответил не агент, а сам CLI: та же пометка в угловых скобках, что и в
 * [realModel], но вопрос здесь обратный — не «на чём мы работаем», а «дошло ли
 * вообще до модели». Неподписанное сообщение считаем обычным ответом: молчание
 * о модели — не признак поломки.
 */
const syntheticReply = (model: string | undefined): boolean => model !== undefined && model.startsWith('<')

const applyAgentEvent = (
  incoming: PanelState,
  event: AgentEvent,
  now: number,
  /** Перепись прошлого разговора, а не живой ход — см. PanelAction. */
  replay = false,
): PanelState => {
  // Первое же событие после череды повторов и есть весь рассказ о том, чем она
  // кончилась: своего события у её конца нет (см. closeRetryFor).
  const state = closeRetryFor(incoming, event, now)

  switch (event.type) {
    case 'system':
      return applySystem(state, event, now)

    // /clear стирает историю по-настоящему — лента остаётся показывать её, если
    // не очистить: агент выше уже ничего не помнит, а карточки выглядят так,
    // будто помнит.
    //
    /**
     * Лимит подписки. Событие приходит и в обычной жизни — со статусом
     * «пропускаем», — поэтому в ленту попадает только отказ: ход остановлен, и
     * до сброса окна ничего не поедет. Раньше об этом можно было узнать разве
     * что из текста отказа, если CLI его пришлёт; сам сигнал разбор пропускал.
     */
    case 'rate_limit_event': {
      const info = event.rate_limit_info
      if (!info?.status || ALLOWED_RATE_LIMIT.has(info.status.toLowerCase())) return state

      return addError(state, rateLimitMessage(info), true)
    }

    // Вместе с лентой обнуляется и всё, что описывало ушедший разговор: занятое
    // окно контекста, расход, недочитанные ошибки, список задач. Иначе датчик
    // контекста показывал прежние проценты на пустом чате — то есть врал ровно
    // про то единственное, ради чего /clear обычно и зовут.
    case 'conversation_reset': {
      // Сжатие могло идти прямо в момент clear — своего закрывающего события
      // (compact_result/compact_boundary) оно тогда уже не дождётся, раз разговор,
      // который сжимался, стёрт. Тот же самый случай, для которого finishCompacting
      // и заведён (см. её комментарий про «разговор прибили»): не снять флаг здесь —
      // и строка статуса будет пустой у всех последующих ходов в этой вкладке.
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
        // Тот же сброс состояния хода, что и в case 'result': /clear закрывает
        // разговор безусловно, даже тот ход, что ещё не успел дойти до своего
        // result (например, если clear пришёл, пока агент ещё думал). Без этого
        // «Claude is thinking» вешалось навсегда — ждать за него было уже некому,
        // раз вся история, которую тот ход отвечал, только что стёрлась.
        status: 'idle',
        turnStartedAt: undefined,
        pausedMs: 0,
        waitStartedAt: undefined,
        stopRequestedAt: undefined,
        starting: false,
        items: [
          { id: `cleared-${state.seq}`, kind: 'checkpoint', chip: 'CLEAR', target: 'conversation cleared — nothing above this is remembered anymore' },
        ],
      }
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

    case 'assistant': {
      // Подагент отвечает своей моделью — это не та, на которой идёт разговор.
      if (event.parent_tool_use_id) {
        return noteSubagent(state, event.parent_tool_use_id, blocksOf(event.message.content))
      }

      /**
       * Модель берём с каждого ответа, а не только из системного события в
       * начале сессии: агент умеет сменить её посреди разговора и сам — так,
       * например, срабатывает защита, отправляющая ход на другую модель. О таком
       * переключении в потоке не сообщает ничего, кроме подписи под ответом:
       * помимо неё это единственный след того, что работает уже не то, что
       * выбрали.
       */
      const model = realModel(event.message.model) ?? state.model
      // Занятое окно на этот шаг — пока не приехала точная цифра от CLI (см.
      // liveContextUsed). Только у главного разговора: подагент выше уже ушёл
      // своей веткой, и его контекст к этому окну отношения не имеет.
      //
      // И только у живого хода: в переписи прошлого разговора те же числа
      // говорят о давно прошедшем шаге, а размер окна из неё не узнать вовсе —
      // на «1M»-модели прикидка делилась на обычные двести тысяч, и открытый из
      // истории разговор выглядел переполненным. Точную цифру IDE спрашивает у
      // CLI отдельно (см. ClaudePanel.refreshResumedContext).
      const liveContextUsed = replay
        ? state.liveContextUsed
        : contextUsedOf(event.message.usage) ?? state.liveContextUsed
      // Разговору ответили — подъём кончился, и следующий result закрывает
      // именно ход, чем бы тот ни оказался (см. starting и «нулевой» ход выше).
      // Число ходов тут не показатель: заглушки от <synthetic> — отказ по
      // неизвестной команде, ответ вместо запрещённого хуком хода — приезжают
      // репликой в ленту, а ходов в итоге по-прежнему ноль.
      return applyAssistant(
        { ...state, model, liveContextUsed, starting: false },
        blocksOf(event.message.content),
        now,
      )
    }

    case 'user': {
      // В живом разговоре реплика человека ложится в ленту сразу при отправке
      // (см. 'prompt'), и то же самое из потока удвоило бы её. В переписи класть
      // её было некому: там эта запись — единственный след того, что человек
      // вообще что-то говорил, и без неё лента прошлого разговора состояла из
      // одних ответов.
      const withPrompt = replay ? addReplayedPrompt(state, event, now) : state
      return applyToolResults(withPrompt, blocksOf(event.message.content), now)
    }

    case 'result': {
      // Поднявшийся разговор CLI закрывает «нулевым» ходом: сразу за system/init
      // приезжает result, в котором ходов ноль и ответа нет. Ходом это не было —
      // агент к сообщению человека ещё даже не приступал.
      //
      // Заметнее всего это на форке: там процесс поднимается вместе с первым
      // сообщением, и панель гасила по этому result спиннер и подписывала ход
      // «Worked 0.1s», хотя агент только начинал думать. Со стороны выглядело так,
      // будто отправка не завелась, — и человек отправлял следующее сообщение,
      // которое CLI честно ставил в очередь за первым.
      //
      // Только сразу после подъёма (см. starting): ход, который и правда кончился
      // ничем, обязан гасить спиннер, как любой другой.
      //
      // И только пока итог пуст. Ходов ноль CLI ставит и там, где ход состоялся,
      // но выполнять его он не стал: неизвестная слэш-команда (в том числе
      // команда MCP-сервера, который в этот раз не поднялся) закрывается ответом
      // «Unknown command: …» — заглушкой от <synthetic>, без обращения к модели,
      // а значит и без ходов. Раз такой result глотать, ход не закроет уже
      // никто: «Claude is thinking» с бегущим счётчиком висит до конца жизни
      // вкладки. Текст в итоге — верный признак того, что этому ходу ответили.
      //
      // Идентификатор разговора отсюда всё же берём: у форка он новый, и без него
      // разговор потом не продолжить.
      if (
        state.starting &&
        event.num_turns === 0 &&
        !event.is_error &&
        !event.result &&
        state.stopRequestedAt === undefined
      ) {
        return { ...state, starting: false, sessionId: event.session_id ?? state.sessionId }
      }

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

      // Отказ ставим в ленту ПЕРЕД итогом хода: он и случился раньше, а
      // «Worked 3s» под ним читается концом этого же хода, а не следующего.
      const withError = finishCompacting(
        event.is_error && event.result ? addError(state, event.result) : state,
      )

      /**
       * Ход кончился — значит и всё, что он начал, кончилось вместе с ним.
       * Прерванный ход бросает вызов инструмента прямо посреди работы (Stop
       * приходит, когда что-то выполняется, — иначе прерывать было бы нечего), и
       * без этого его карточка навсегда оставалась «выполняется» с бегущим
       * счётчиком: ход внизу давно подписан «Stopped by you», а работа по виду
       * всё ещё идёт. Тем же закрываются и вызовы, чей результат до панели не
       * дошёл.
       */
      const { items: settled, startedAt } = closeUnfinished(
        withError,
        now,
        cancelled
          ? {
              tool: 'Stopped before it finished.',
              task: 'Stopped before it returned.',
              meta: '· interrupted',
              tone: 'bad',
            }
          : {
              tool: 'The turn ended before this finished.',
              task: 'The turn ended before this returned.',
              meta: '· unfinished',
              tone: 'bad',
            },
        true,
      )

      return {
        ...withError,
        startedAt,
        status: 'idle',
        streamingText: '',
        streamingId: undefined,
        streamingThinking: '',
        stopRequestedAt: undefined,
        // Ход настоящим итогом кончился здесь и сейчас — не ждём отдельного
        // status:'idle' от бэкенда, чтобы погасить turnStartedAt: до его
        // прихода setInterval в App.tsx тикал бы впустую ещё какое-то время.
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
          : [...settled, { id: `meta-${withError.seq}`, kind: 'meta', stats }],
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
  const base: PanelState = {
    ...state,
    sessionId: event.session_id ?? state.sessionId,
    model: realModel(event.model) ?? state.model,
    permissionMode: event.permissionMode ? normalizeMode(event.permissionMode) : state.permissionMode,
    slashCommands: event.slash_commands ?? state.slashCommands,
    // Рабочий каталог агент сообщает сам; без него пути в карточках остаются
    // полными и не помещаются в панель.
    project: event.cwd
      ? { name: state.project?.name ?? '', ...state.project, workingDirectory: event.cwd }
      : state.project,
    // task_id есть — сжимает конкретный субагент, а не главный поток; его
    // собственный таймер во вкладке агента (см. AgentStreamView) честно тикает
    // через всё сжатие и без этого флага, а вот главная строка статуса не
    // должна гаснуть из-за того, что происходит в чужом, параллельном потоке.
    compacting: event.status === 'compacting' && event.task_id === undefined ? true : state.compacting,
    // Процесс поднялся: следующий за этим «нулевой» итог хода — про сам подъём,
    // а не про работу агента (см. case 'result').
    starting: event.subtype === 'init' ? true : state.starting,
  }

  // Запрос сорвался и пойдёт заново после паузы — единственное, что вообще
  // происходит в разговоре, пока эта пауза идёт (см. applyApiRetry).
  if (event.subtype === 'api_retry') return applyApiRetry(base, event, now)

  const isMainStreamEvent = event.task_id === undefined

  // Сама карточка CONTEXT должна быть видна ещё до готового результата — иначе
  // единственный след того, что что-то происходит, это переливающаяся строка
  // статуса, которая не остаётся в истории (см. жалобу, из-за которой это
  // вообще завели). Только для главного потока: у карточки нет своего owner-а
  // по task_id, а субагенту она вообще не нужна — его сжатие и так видно по
  // тикающему таймеру в его собственной вкладке.
  if (isMainStreamEvent && event.status === 'compacting' && !state.compacting) {
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
  if (isMainStreamEvent && event.compact_result !== undefined) {
    const finished = finishCompacting(base)

    return event.compact_result === 'failed' && event.compact_error
      ? addError(finished, event.compact_error)
      : finished
  }

  if (isMainStreamEvent && event.subtype === 'compact_boundary') {
    const target = compactBoundaryText(event.compact_metadata)
    // Граница и есть конец сжатия: дальше карточка стоит в ленте с цифрами, а
    // строка статуса снова говорит про сам ход.
    const done = { ...base, compacting: false }
    // Пока сжатие идёт, в ленту больше ничего не приходит (контекст в этот момент
    // как раз переписывается) — pending-карточка, если она есть, всегда последняя.
    const last = done.items.at(-1)

    if (last?.kind === 'compact' && last.pending) {
      return { ...done, items: [...done.items.slice(0, -1), { ...last, target, pending: false }] }
    }

    return {
      ...done,
      seq: done.seq + 1,
      items: [...done.items, { id: `compact-${done.seq}`, kind: 'compact', target, pending: false }],
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
    // Команда терминала — не агент, хотя приходит тем же каналом.
    if (isBashTask(event)) return startBackgroundCommand(base, event, now)

    /**
     * Тот же субагент, но пришедший вторым путём: карточку на него уже завёл
     * блок tool_use в ответе агента. Здесь только связываем task_id с ней и
     * уточняем подпись — заводить вторую значит показать одного агента двумя
     * чипами в шапке.
     */
    const linked = event.tool_use_id
    if (linked && base.items.some((item) => item.kind === 'task' && item.id === linked)) {
      return {
        ...base,
        taskCards: { ...base.taskCards, [event.task_id]: linked },
        items: base.items.map((item) =>
          item.kind === 'task' && item.id === linked
            ? {
                ...item,
                // Настоящее имя задачи приезжает только здесь — карточку завёл
                // вызов инструмента, а он знает лишь свой идентификатор.
                taskId: event.task_id,
                target: event.subagent_type ?? item.target,
                meta: item.meta || (event.description ?? ''),
              }
            : item,
        ),
      }
    }

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
          taskId: event.task_id,
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
    const card = cardFor(base, event.task_id)

    return {
      ...base,
      items: base.items.map((item) => {
        if (item.kind !== 'task' || item.id !== card) return item

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
    const running = base.background.find((task) => task.id === event.task_id)
    if (running) return finishBackgroundCommand(base, running, event, now)

    const card = cardFor(base, event.task_id)
    const startedTime = base.startedAt[card]
    const duration = startedTime ? formatDuration(now - startedTime) : ''
    const startedAt = { ...base.startedAt }
    delete startedAt[card]
    const outcome = outcomeOf(event.status)
    const summary = event.summary ? detailFor(event.summary) : []
    // Прибитый или упавший агент раньше выглядел ровно как отработавший: и
    // кружок зелёный, и сводка на месте. Пометку ставим первой строкой — она и
    // объясняет, почему сводка обрывается на середине.
    const lines = outcome === 'ok' ? summary : [{ text: endedText(outcome), tone: 'bad' as const }, ...summary]

    return {
      ...base,
      startedAt,
      items: base.items.map((item) =>
        item.kind === 'task' && item.id === card
          ? {
              ...item,
              pending: false,
              percent: 100,
              duration,
              outcome,
              log: lines.length > 0 ? appendAgentLog(item.log, lines) : item.log,
            }
          : item,
      ),
    }
  }

  return base
}

/**
 * Задача из системных событий task_* — это не обязательно субагент.
 *
 * Тем же каналом CLI ведёт и команды терминала: любую фоновую и любую обычную,
 * которая идёт дольше нескольких секунд. Отличает их только task_type
 * ('local_bash' против 'local_agent'). Пока панель его не смотрела, на каждую
 * такую команду заводилась карточка субагента — отсюда брались чипы «agent:agent»
 * (имени субагента у команды нет) и dev-сервер, «работающий агентом» вторые
 * сутки. Событие вовсе без типа — это старый CLI, где так ходили только
 * субагенты, поэтому неизвестный тип считаем агентом, а не командой.
 */
const isBashTask = (event: Extract<AgentEvent, { type: 'system' }>): boolean => event.task_type === 'local_bash'

/** Карточка, на которой живёт эта задача: см. taskCards. */
const cardFor = (state: PanelState, taskId: string): string => state.taskCards[taskId] ?? taskId

const outcomeOf = (status: string | undefined): TaskOutcome =>
  status === 'failed' ? 'failed' : status === 'stopped' ? 'stopped' : 'ok'

const endedText = (outcome: TaskOutcome): string =>
  outcome === 'failed' ? 'Failed before it finished.' : 'Stopped before it finished.'

/** Вызов инструмента по его id — карточки живут внутри групп, а не в ленте напрямую. */
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

/**
 * Фоновая команда получает чип в шапке: карточка в ленте говорит только о том,
 * что её запустили, и уезжает вверх вместе с разговором, а процесс живёт и
 * дальше — иногда сутками (dev-сервер). Обычная команда этим же событием
 * сообщает о себе тоже, но её чип был бы миганием на пару секунд: она вся
 * целиком видна карточкой, ради которой ход и стоит.
 */
const startBackgroundCommand = (
  state: PanelState,
  event: Extract<AgentEvent, { type: 'system' }>,
  now: number,
): PanelState => {
  const taskId = event.task_id
  if (!taskId) return state
  if (!isBackgroundCommand(event.tool_use_id ? findTool(state.items, event.tool_use_id) : undefined)) return state

  return {
    ...state,
    startedAt: { ...state.startedAt, [taskId]: now },
    background: [
      ...state.background,
      {
        id: taskId,
        toolUseId: event.tool_use_id,
        label: event.description ?? 'background command',
        duration: formatDuration(0),
      },
    ],
  }
}

/**
 * Фоновая команда кончилась. Чип уходит из шапки, а итог дописываем прямо в её
 * карточку в ленте: своей карточки у неё нет и не нужно — в ленте уже стоит та,
 * которой её запускали, и правильное место для «сколько проработала и чем
 * кончилась» именно там.
 */
const finishBackgroundCommand = (
  state: PanelState,
  task: BackgroundTask,
  event: Extract<AgentEvent, { type: 'system' }>,
  now: number,
): PanelState => {
  const started = state.startedAt[task.id]
  const duration = started ? formatDuration(now - started) : task.duration
  const startedAt = { ...state.startedAt }
  delete startedAt[task.id]

  const outcome = outcomeOf(event.status)
  const tone = outcome === 'failed' ? ('bad' as const) : ('dim' as const)
  const ended = outcome === 'failed' ? 'failed' : outcome === 'stopped' ? 'was stopped' : 'finished'
  // Текст CLI объясняет провал по делу («exit code 3»), а при обычном конце
  // повторяет описание команды, которое и так стоит в карточке.
  const detail = outcome === 'failed' && event.summary ? detailFor(event.summary) : []

  const items = task.toolUseId
    ? mapTool(state.items, task.toolUseId, (tool) => ({
        ...tool,
        duration,
        isError: tool.isError || outcome === 'failed',
        detail: [...tool.detail, { text: `Background command ${ended} after ${duration}.`, tone }, ...detail],
      }))
    : state.items

  return { ...state, startedAt, background: state.background.filter((item) => item.id !== task.id), items }
}

/** Правка одного вызова инструмента на месте — он лежит внутри своей группы. */
const mapTool = (items: FeedItem[], id: string, change: (tool: ToolItem) => ToolItem): FeedItem[] =>
  items.map((item) => {
    if (item.kind !== 'toolGroup' || !item.tools.some((tool) => tool.id === id)) return item
    return { ...item, tools: item.tools.map((tool) => (tool.id === id ? change(tool) : tool)) }
  })

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

/** Показывали ли этот же текст ошибкой в текущем ходе — тогда повторять его нечем. */
const alreadyShownAsError = (state: PanelState, text: string): boolean => {
  const turnStart = state.items.map((item) => item.kind).lastIndexOf('user') + 1
  const message = text.trim()

  return state.items
    .slice(turnStart)
    .some((item) => item.kind === 'error' && item.message.trim() === message)
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
      // Тот же текст уже стоит в ленте красной плашкой — второй раз, обычным
      // ответом, он ничего не добавляет. Так приходит неудачное сжатие: CLI
      // сообщает о нём и отдельным событием, и репликой агента слово в слово.
      if (alreadyShownAsError(next, block.text)) continue

      const paragraphs = parseParagraphs(block.text)
      const id = reserved
      reserved = undefined

      next = id
        ? { ...next, items: [...next.items, { id, kind: 'text', paragraphs, source: block.text }] }
        : push(next, (itemId) => ({ id: itemId, kind: 'text', paragraphs, source: block.text }))
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

  // Эта версия CLI ведёт список задач уже не через TodoWrite (одним вызовом со
  // всем списком целиком), а через отдельные TaskCreate/TaskUpdate — см. тип
  // pendingTasks. Само появление задачи в панели откладывается до ответа
  // TaskCreate (см. applyTaskCreated): раньше просто нечего показывать —
  // номер, под которым TaskUpdate будет её узнавать, известен только оттуда.
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
    // Задача не из нашего списка (например, принадлежит фоновому агенту) —
    // и трогать нечего.
    if (!existing) return state

    if (input.status === 'deleted') {
      const { [taskId]: _removed, ...tasks } = state.tasks
      return push(
        { ...state, tasks },
        (id) => ({ id, kind: 'todo', todos: orderedTasks(tasks) }),
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
    return push({ ...state, tasks }, (id) => ({ id, kind: 'todo', todos: orderedTasks(tasks) }))
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
          // Шагами считаем пункты верхнего уровня — то же, что человек посчитает
          // глазами; вложенные уточнения отдельными шагами не звучат.
          meta: steps > 0 ? `· ${steps} ${steps === 1 ? 'step' : 'steps'}` : '',
          duration: '',
          paragraphs,
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
    /**
     * Карточку на этого субагента уже завело системное событие task_started —
     * оно приходит раньше блока tool_use, когда субагента поднимает не ход, а
     * скилл. Второй карточки быть не должно (см. taskCards): уточняем ту, что
     * есть, — во входе вызова описание подробнее, чем в событии.
     */
    const known = state.taskByToolUseId[block.id]
    if (known) {
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind === 'task' && item.id === known
            ? { ...item, target: subagent, meta: targetFor(block.name, input, workingDirectory) }
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

/**
 * Вызов Task/Agent в фоновом режиме (по умолчанию) отвечает этим текстом сразу,
 * не дожидаясь субагента, — это подтверждение запуска, а не итог его работы.
 * Настоящий конец потом приносит отдельное событие task_notification (см. ниже).
 * Приняв это подтверждение за результат, карточка закрывалась бы мгновенно —
 * агент ещё и начать не успел, а чип в шапке уже гас как отработавший.
 */
/**
 * Служебное, что CLI кладёт в реплику человека его же словами: напоминание
 * самому себе, преамбула про локальные команды и их вывод. В ленте прошлого
 * разговора это выглядело бы сказанным человеком.
 */
const SERVICE_BLOCK = /<(system-reminder|local-command-caveat|local-command-stdout|command-message)>[\s\S]*?<\/\1>/g

/** Слэш-команда лежит в переписке разметкой, а не строкой «/deploy 0.7.11». */
const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/

/** Отметка CLI об остановке — не реплика: про неё говорит сам оборванный ход. */
const INTERRUPTED = '[Request interrupted by user]'

/**
 * Что из записи прошлого разговора было настоящей репликой человека. Пусто —
 * значит показывать нечего: вся запись служебная.
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
 * Реплика человека из переписи прошлого разговора.
 *
 * Живой разговор кладёт её в ленту сам, когда человек нажимает Send, — в
 * переписи же это единственный её след, и без него открытый из истории разговор
 * состоял из одних ответов, как будто их никто ни о чём не просил.
 */
const addReplayedPrompt = (
  state: PanelState,
  event: Extract<AgentEvent, { type: 'user' }>,
  now: number,
): PanelState => {
  // Запись самого CLI, а не человека, и реплика вложенного потока: субагенту
  // пишет ход, а не человек, и его переписка к ленте отношения не имеет.
  if (event.isMeta || event.parent_tool_use_id) return state

  const text = replayedPromptText(blocksOf(event.message.content))
  if (!text) return state

  // Время берём то, когда это было сказано: у переписи «сейчас» — это момент,
  // когда открыли вкладку, и весь прошлый разговор выглядел бы сегодняшним.
  const said = Date.parse(event.timestamp ?? '')

  return push(state, (id) => ({
    id,
    kind: 'user',
    time: formatClock(Number.isNaN(said) ? now : said),
    tokens: [{ kind: 'text', value: text }],
    quotes: [],
  }))
}

const ASYNC_AGENT_LAUNCHED = /^Async agent launched successfully/

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
      // Карточка субагента живёт либо под id вызова, либо под task_id системного
      // события — смотря что пришло первым (см. taskByToolUseId).
      const result = results.find(
        (candidate) => (state.taskByToolUseId[candidate.tool_use_id] ?? candidate.tool_use_id) === item.id,
      )
      if (!result) return item

      const text = resultToText(result.content)
      // Ещё не итог — просто подтверждение, что фоновый субагент стартовал.
      // Ждём его настоящий конец через task_notification, а не гасим карточку
      // на первом же слове от CLI. Заодно помечаем её фоновой: конец хода такую
      // карточку не закрывает (см. closeUnfinished), уведомление о её итоге
      // приходит уже после него.
      if (ASYNC_AGENT_LAUNCHED.test(text)) return item.background ? item : { ...item, background: true }

      const started = state.startedAt[item.id]
      const duration = started ? formatDuration(now - started) : ''
      delete startedAt[item.id]

      const isError = result.is_error === true
      const tone = isError ? ('bad' as const) : ('ok' as const)
      const task: TaskItem = {
        ...item,
        pending: false,
        percent: 100,
        duration,
        outcome: isError ? 'failed' : 'ok',
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

  return applyTaskCreated({ ...state, items, startedAt }, results)
}

/** "Task #3 created successfully: …" — единственное место, где TaskCreate называет присвоенный номер. */
const TASK_CREATED = /^Task #(\d+) created successfully/

/**
 * Довешивает задачи, чей TaskCreate только что подтвердился, к списку — с тем
 * самым номером, каким их будет называть TaskUpdate. Не сумели распознать номер
 * (текст ответа однажды изменится — мы не властны над словами инструмента) —
 * оставляем как есть, не показывая и не ломая остальной список: лучше
 * недостающая строка, чем весь список с перепутанными номерами.
 */
const applyTaskCreated = (state: PanelState, results: ToolResultBlock[]): PanelState => {
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

    tasks[match[1]] = {
      id: `task-${match[1]}`,
      text: created?.subject ?? '',
      state: 'todo',
      activeForm: created?.activeForm,
    }
  }

  return push({ ...state, tasks, pendingTasks }, (id) => ({ id, kind: 'todo', todos: orderedTasks(tasks) }))
}

/** pending/in_progress/completed — тот же словарь состояний, что и у TodoWrite. */
const taskState = (status: unknown, fallback: TodoEntry['state']): TodoEntry['state'] => {
  if (status === 'completed') return 'done'
  if (status === 'in_progress') return 'active'
  if (status === 'pending') return 'todo'
  return fallback
}

/** По номеру задачи, как их присваивает TaskCreate — не по порядку последней правки. */
const orderedTasks = (tasks: Record<string, TodoEntry>): TodoEntry[] =>
  Object.keys(tasks)
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => tasks[id])

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
      activeForm: (typeof item.activeForm === 'string' ? item.activeForm : '') || undefined,
    }
  })
}

/**
 * План приходит одним текстом markdown — и показываем мы его тем же разбором,
 * что и обычный ответ агента (см. PlanItem.paragraphs).
 */
const readPlan = (input: Record<string, unknown>): Paragraph[] =>
  parseParagraphs(typeof input.plan === 'string' ? input.plan : '')

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
  if (last) return withoutEmpty(last)
  if ((event.num_turns ?? 1) > 1) return undefined
  return withoutEmpty(event.usage)
}

/**
 * Сколько занимал контекст в момент этого запроса к модели: вся входная часть
 * usage — и свежие токены, и то, что модель прочитала из кеша.
 *
 * Пустой usage (служебный ход, который к модели не ходил вовсе) отдаёт ничего,
 * а не ноль: иначе датчик падал бы в ноль посреди разговора — та же ловушка,
 * что и у снимка из result, см. withoutEmpty.
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
 * Пустой снимок — не «контекст обнулился», а «этот ход к модели не ходил вовсе».
 *
 * Так закрывается ход служебной команды: `/model`, например, CLI выполняет сам,
 * без единого запроса к модели, и в result присылает нули. Приняв их за снимок
 * окна, датчик контекста падал до нуля прямо посреди разговора, хотя вся
 * переписка никуда не делась.
 */
const withoutEmpty = (usage?: AgentUsage): AgentUsage | undefined => {
  if (!usage) return undefined

  const total =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)

  return total > 0 ? usage : undefined
}

/** Подпись прерванного хода — одна на все пути, которыми он мог оборваться. */
export const STOPPED_BY_YOU = 'Stopped by you'

/** Токены, цена и модель — шум под каждым ходом; из всего этого нужна только длительность. */
const resultStats = (event: Extract<AgentEvent, { type: 'result' }>, cancelled: boolean): string[] => {
  const duration = typeof event.duration_ms === 'number' ? formatDuration(event.duration_ms) : ''

  if (!cancelled) return duration ? [`Worked ${duration}`] : []
  // Не «Worked»: ход не отработал, а был оборван на полпути, и подпись обязана
  // говорить именно это — иначе прерванный ход не отличить от законченного.
  return [duration ? `${STOPPED_BY_YOU} · ${duration}` : STOPPED_BY_YOU]
}

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
 * Что показывает датчик контекста: занято, всего и доля.
 *
 * Размер окна — от самого CLI (см. PanelState.context): он зависит от модели, у
 * «1M»-моделей впятеро больше обычного, и своей арифметикой его не угадать.
 *
 * А вот занятое берём по свежести. Точная цифра от CLI приезжает только концом
 * хода, поэтому пока идёт ход, показываем прикидку по последнему ответу агента
 * (liveContextUsed): без неё за самый долгий запрос — первый — полоска не
 * двигалась вовсе, хотя окно за это время и заполняется. Как только ход
 * закончится, точная цифра эту прикидку вытеснит (см. case 'context').
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
