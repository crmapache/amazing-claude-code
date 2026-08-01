/**
 * Формат общения интерфейса с оболочкой плагина.
 *
 * События агента оболочка не разбирает, а пробрасывает как есть, поэтому их форма
 * описана здесь же: это единственное место, где живут знания о потоке Claude Code.
 */

export type SessionKind = 'main' | 'branch'

export interface SessionInfo {
  id: string
  title: string
  kind: SessionKind
  /** Цитата, из которой выросла боковая ветка. У основной сессии пусто. */
  quote?: string
}

/** Одно окно расхода подписки: доля и когда обнулится. */
export interface UsageWindow {
  percent: number
  resets: string
}

/** Прошлый разговор: заголовком служит первая реплика человека. */
export interface HistoryEntry {
  id: string
  title: string
  updatedAt: number
  messages: number
}

/** Один MCP-сервер — тем же текстом, что печатает `claude mcp list` в терминале. */
export interface McpServerInfo {
  name: string
  command: string
  connected: boolean
  status: string
}

/** Установленный плагин: id уже содержит маркетплейс — "name@marketplace". */
export interface InstalledPluginInfo {
  id: string
  version: string
  scope: string
  enabled: boolean
}

/** Плагин из каталога маркетплейса, ещё не установленный — то, по чему ищем. */
export interface AvailablePluginInfo {
  id: string
  name: string
  description: string
  marketplace: string
  installCount: number
}

/** Подключённый маркетплейс — источник каталога доступных плагинов. */
export interface PluginMarketplaceInfo {
  name: string
  source: string
}

export type ShellMessage =
  | {
      type: 'init'
      projectName: string
      workingDirectory: string
      gitBranch?: string
      /** Ложь, если оболочка не может перехватывать вызовы инструментов. */
      canAskPermissions?: boolean
      /** Выбор модели, усилия и режима: он переживает и вкладки, и перезапуск IDE. */
      preferences?: { model: string; effort: string; mode: string }
    }
  | {
      type: 'usage'
      session?: UsageWindow
      week?: UsageWindow
      /** Размер окна контекста текущей модели: у больших он миллион, а не двести тысяч. */
      contextWindow?: number
      /**
       * Токены за сегодня по всем проектам — та же цифра, что "tok" в личном
       * statusline.sh. Считается отдельным сканом транскриптов, поэтому приходит
       * отдельным сообщением от session/week/contextWindow, не одновременно с ними.
       */
      todayTokens?: string
    }
  | {
      type: 'permission'
      id: string
      sessionId: string
      toolName: string
      target: string
      command: string
      mode: string
      /** Заполнено, только если запрос породил вызов инструмента внутри субагента. */
      agentId?: string
    }
  | { type: 'sessions'; sessions: SessionInfo[]; active: string }
  | { type: 'status'; sessionId: string; state: AgentStatus }
  | { type: 'error'; sessionId: string; message: string }
  | { type: 'agent'; sessionId: string; event: AgentEvent }
  /** Ответ на просьбу выбрать файл, папку или картинку через диалог IDE. */
  | { type: 'picked'; kind: 'file' | 'dir' | 'img'; value: string }
  /**
   * Ветка и её pull request. Отдельно от init: номер PR спрашивают у GitHub, и
   * ответа приходится ждать дольше, чем открывается панель.
   */
  | { type: 'project'; gitBranch?: string; pullRequest?: string; pullRequestUrl?: string }
  /** Прошлые разговоры этого проекта: их хранит сам Claude Code. */
  | { type: 'history'; conversations: HistoryEntry[] }
  /**
   * Вход в Claude Code. Без него агент отвечает на любой вопрос строкой про
   * /login, поэтому панель показывает не поле ввода, а кнопку входа.
   */
  | {
      type: 'auth'
      /** Ложь, если исполняемого файла нет вовсе: тогда входить некуда. */
      installed: boolean
      loggedIn: boolean
      email?: string
      plan?: string
    }
  /**
   * Применённый режим разрешений: агент мог и отказать, тогда applied ложь, а в
   * error лежит причина — например, «auto» доступен не всякой модели.
   */
  | { type: 'mode'; sessionId: string; mode: string; applied: boolean; error?: string }
  /**
   * Разрешён ли на этом компьютере режим «без вопросов»: его умеет запретить
   * политика организации, да и старый CLI не даёт переключиться в него на лету.
   * От этого зависит круг Shift+Tab — запрещённый режим он перешагивает.
   */
  | { type: 'modeAvailability'; bypassPermissions: boolean }
  /** Кусок файла, отправленный из редактора через контекстное меню. */
  | {
      type: 'selection'
      path: string
      startLine: number
      startColumn: number
      endLine: number
      endColumn: number
      /** Выделены строки целиком — тогда колонки в ссылке лишние. */
      wholeLines: boolean
      /** Абсолютный путь — обычным текстом в поле, а не чипом: его просят затем, чтобы видеть и копировать буквально. */
      asPlainText: boolean
    }
  /**
   * Процесс разговора умер сам, не по нашей просьбе. Панель обязана закрыть
   * всё, что было «выполняется» в этот момент — иначе оно зависнет так навсегда.
   */
  | { type: 'processExited'; sessionId: string; exitCode: number }
  /** Ответ на mcpList — а также на mcpAdd/mcpRemove, чтобы список сразу обновился. */
  | { type: 'mcpServers'; servers: McpServerInfo[] }
  /** Итог mcpAdd/mcpRemove — их не с чем спутать со «своим» /mcp в разговоре. */
  | { type: 'mcpActionResult'; ok: boolean; message: string }
  /** Ответ на pluginList: установленные плюс каталог доступных из маркетплейсов. */
  | { type: 'plugins'; installed: InstalledPluginInfo[]; available: AvailablePluginInfo[] }
  /** Итог install/uninstall/enable/disable — все они прямые подкоманды CLI. */
  | { type: 'pluginActionResult'; ok: boolean; message: string }
  /** Ответ на marketplaceList — а также на marketplaceAdd/marketplaceRemove. */
  | { type: 'marketplaces'; marketplaces: PluginMarketplaceInfo[] }
  /**
   * Список файлов проекта для подсказки "@" в поле ввода — приходит сам, без
   * запроса, при готовности панели и потом периодически: агент мог создать
   * новые файлы, а ждать явного обновления от человека незачем.
   */
  | { type: 'files'; files: string[] }
  /**
   * Описание и синтаксис аргумента слэш-команд — из фронтматтера файлов на диске
   * (проектные и личные команды/скиллы, команды/скиллы установленных плагинов).
   * Тем же путём, что и files: приходит сама при готовности панели и периодически.
   */
  | { type: 'commandHints'; hints: Record<string, { description: string; argumentHint: string }> }
  /**
   * К какому краю экрана прижата панель. Только та сторона, что граничит с
   * редактором, рисует разделительную рамку — как у нативных тулвиндоу
   * (терминал, проект и т.д.). Меняется на лету: пользователь может
   * перетащить панель на другую сторону, пока она открыта.
   */
  | { type: 'dockAnchor'; anchor: 'left' | 'right' | 'top' | 'bottom' }
  /**
   * Шрифты из настроек IDE. Содержимое панели рисуется консольным шрифтом — тем
   * же, что и встроенный терминал, — а обвязка вокруг него интерфейсным.
   * Приходит при старте и заново на каждую смену схемы цветов или оформления.
   *
   * Размера здесь нет намеренно: страницу целиком масштабирует зум встроенного
   * браузера (см. IdeTypography.kt на стороне плагина), поэтому вёрстка о нём
   * ничего не знает.
   */
  | { type: 'typography'; monoFamily: string; uiFamily: string; lineHeight: number }

export type WebviewMessage =
  /** Интерфейс смонтирован и готов принимать сообщения. */
  | { type: 'ready' }
  | {
      type: 'prompt'
      sessionId: string
      text: string
      /** Картинки из буфера обмена: байты, а не путь для чтения инструментом. */
      images?: { mediaType: string; data: string }[]
    }
  | { type: 'stop'; sessionId: string }
  /** Обычный Stop не подтвердился — пользователь явно попросил прибить процесс. */
  | { type: 'kill'; sessionId: string }
  | {
      type: 'newSession'
      kind: SessionKind
      /** Идентификатор новой сессии задаёт интерфейс: он же ей и пользуется. */
      sessionId: string
      title: string
      /** Разговор, от которого ответвляемся. Ветка получает всю его переписку. */
      parentId?: string
      quote?: string
    }
  | { type: 'closeSession'; sessionId: string }
  /** Один диалог на все вложения: делить их по трём кнопкам незачем. */
  | { type: 'pick' }
  | { type: 'permissionDecision'; id: string; decision: 'once' | 'always' | 'deny' }
  /** Режим разрешений задаётся при запуске процесса, поэтому меняет его оболочка. */
  | { type: 'setMode'; sessionId: string; mode: string }
  /** Модель и усилие тоже держит оболочка: их наследуют новые разговоры. */
  | { type: 'setModel'; sessionId: string; model: string }
  | { type: 'setEffort'; sessionId: string; effort: string }
  | { type: 'refreshUsage' }
  | { type: 'openDevTools' }
  /** Ссылка (например, номер PR) — открываем в системном браузере, не в JCEF. */
  | { type: 'openExternal'; url: string }
  | { type: 'history' }
  /** Продолжить прошлый разговор в новой вкладке. */
  | { type: 'resumeSession'; sessionId: string; conversationId: string }
  /** Открыть терминал IDE с входом в Claude Code или выходом из него. */
  | { type: 'login' }
  | { type: 'logout' }
  | { type: 'checkAuth' }
  /** Список, добавление и удаление MCP-серверов — правки конфига, не часть разговора. */
  | { type: 'mcpList' }
  | { type: 'mcpAdd'; name: string; command: string; transport?: string }
  | { type: 'mcpRemove'; name: string }
  /**
   * Плагины и маркетплейсы — тоже правки конфига. В отличие от MCP, у
   * install/uninstall/enable/disable есть собственные подкоманды CLI, поэтому
   * все они идут отдельными сообщениями, а не промптом внутрь разговора.
   */
  | { type: 'pluginList' }
  | { type: 'pluginInstall'; plugin: string }
  | { type: 'pluginUninstall'; plugin: string }
  | { type: 'pluginEnable'; plugin: string }
  | { type: 'pluginDisable'; plugin: string }
  | { type: 'marketplaceList' }
  | { type: 'marketplaceAdd'; source: string }
  | { type: 'marketplaceRemove'; name: string }

export type AgentStatus = 'idle' | 'running'

// --- Поток событий агента ---------------------------------------------------

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input?: unknown
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  is_error?: boolean
  content?: unknown
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

export interface AgentSystemEvent {
  type: 'system'
  subtype: string
  session_id?: string
  model?: string
  cwd?: string
  permissionMode?: string
  slash_commands?: string[]
  /** Приходит при автоматическом сжатии контекста. */
  compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number; duration_ms?: number }
  /** Отдельное событие статуса — например "compacting", пока идёт сжатие. */
  status?: string
  /** Итог сжатия — приходит вместе с status:null, когда попытка закончилась. */
  compact_result?: string
  compact_error?: string
  /**
   * Изначально заводился только под фоновый подагент, запущенный скиллом/
   * воркфлоу (например /code-review) — в отличие от обычного вызова
   * инструмента Task, который, как тогда казалось, всегда приходит отдельным
   * tool_use-блоком в потоке ассистента. На практике (проверено напрямую на
   * CLI 2.1.220) это оказалось не так: и обычный Task тоже идёт исключительно
   * этим же каналом — tool_use-блока для него не бывает вовсе, только эти
   * system-события (task_started/task_progress/task_notification приходят
   * даже раньше system:init самого хода). task_id — общий ключ для обоих
   * случаев, что и позволяет build.ts обрабатывать их одинаково.
   */
  task_id?: string
  tool_use_id?: string
  description?: string
  subagent_type?: string
  task_type?: string
  usage?: { total_tokens?: number; tool_uses?: number; duration_ms?: number }
  last_tool_name?: string
  summary?: string
}

export interface AgentAssistantEvent {
  type: 'assistant'
  message: { id?: string; content: ContentBlock[]; model?: string }
  /** Не пусто у сообщений подагента: это идентификатор вызова, который его породил. */
  parent_tool_use_id?: string | null
}

export interface AgentUserEvent {
  type: 'user'
  message: { content: ContentBlock[] }
  parent_tool_use_id?: string | null
}

export interface AgentUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * usage самого result-события — с раскладкой по внутренним шагам, если агент
 * вызвал несколько инструментов подряд прежде чем ответить (num_turns больше 1).
 * Верхнеуровневые поля тогда — СУММА по всем шагам (годится для стоимости хода),
 * а что реально лежит в окне контекста прямо сейчас — только у последнего шага.
 */
export interface AgentResultUsage extends AgentUsage {
  iterations?: AgentUsage[]
}

export interface AgentResultEvent {
  type: 'result'
  subtype: string
  result?: string
  is_error?: boolean
  duration_ms?: number
  num_turns?: number
  total_cost_usd?: number
  session_id?: string
  usage?: AgentResultUsage
}

export interface AgentRateLimitEvent {
  type: 'rate_limit_event'
  rate_limit_info?: {
    status?: string
    resetsAt?: number
    rateLimitType?: string
  }
}

export interface AgentStreamEvent {
  type: 'stream_event'
  event: {
    type: string
    index?: number
    delta?: { type: string; text?: string; thinking?: string }
  }
  parent_tool_use_id?: string | null
}

/**
 * Описаны только события, которые панель рисует. Поток шире и со временем
 * пополняется, поэтому разбор обязан молча пропускать незнакомое.
 */
export type AgentEvent =
  | AgentSystemEvent
  | AgentAssistantEvent
  | AgentUserEvent
  | AgentResultEvent
  | AgentStreamEvent
  | AgentRateLimitEvent
  /** Приходит от /clear — разговор начался заново, без старой истории. */
  | { type: 'conversation_reset'; new_conversation_id?: string }
  | { type: 'unknown' }
