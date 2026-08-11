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

/**
 * Одна строка каталога моделей — ровно то, что показывает `/model` в терминале.
 *
 * Список приходит от самого CLI (управляющий запрос list_models): какие модели
 * доступны, решают учётная запись, провайдер и политика организации, а имена и
 * подписи меняются с версиями — держать свою копию значит рано или поздно
 * показывать не то, что есть на самом деле.
 */
export interface ModelInfo {
  /** Что уходит обратно в CLI: "default", "opus[1m]", "claude-fable-5[1m]" и т.п. */
  value: string
  label: string
  description: string
  /**
   * Во что CLI разворачивает это значение ("claude-opus-5[1m]"). По нему нижняя
   * строка называет модель, которая правда работает: за «Default» может стоять
   * что угодно, и одного слова «default» на кнопке недостаточно.
   */
  resolved: string
  /** Видна в списке, но выбрать нельзя — так их показывает и терминал. */
  disabled?: boolean
}

/**
 * Повод позвать человека звуком. Ровно эти имена знает и оболочка: у каждого
 * там свой файл (см. AlertSounds.kt).
 */
export type SoundId = 'turnFinished' | 'permission' | 'plan' | 'question' | 'rateLimit' | 'trouble'

export interface SoundSettings {
  /**
   * Звуки, отключённые вручную. Хранится именно выключенное: по умолчанию
   * звучит всё, и пустой список означает «как задумано» — иначе звук,
   * добавленный в следующей версии, оказался бы выключенным у всех, кто
   * когда-либо открывал этот список.
   */
  muted: string[]
  /**
   * Громкость в процентах, если она не полная. Держится отдельно от muted
   * намеренно: снятая галочка не стирает настроенные проценты — вернув звук,
   * человек ждёт свои прежние семьдесят, а не сотню.
   */
  volumes: Record<string, number>
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
      /** Настройка звуковых оповещений — переживает перезапуск IDE. */
      sounds?: SoundSettings
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
  /** Каталог моделей от самого CLI — см. ModelInfo. */
  | { type: 'models'; models: ModelInfo[] }
  /**
   * Занятое окно контекста этого разговора — цифра от самого CLI (та же, что
   * печатает `/context`). Считать её на своей стороне нельзя: размер окна
   * зависит от модели, а в занятое входит и то, чего в usage хода не видно.
   */
  | { type: 'context'; sessionId: string; used: number; max: number }
  /**
   * Чем кончилась команда из bash-режима. Отдельно stdout и stderr: агенту они
   * уходят разными полями, как это делает и сам Claude Code, — по ним видно, что
   * команда ругалась, даже когда код возврата нулевой.
   */
  | { type: 'bashResult'; sessionId: string; id: string; exitCode: number; stdout: string; stderr: string }
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
      /** Путь к CLI, указанный руками, если он задан. */
      executablePath?: string
      /** Где искали исполняемый файл — приходит, только когда не нашли. */
      searched?: string[]
    }
  /**
   * Применённый режим разрешений: агент мог и отказать, тогда applied ложь, а в
   * error лежит причина — например, «auto» доступен не всякой модели.
   */
  | { type: 'mode'; sessionId: string; mode: string; applied: boolean; error?: string }
  /**
   * Модель, которая теперь в силе — ответ на setModel. Отказать агент может
   * по-настоящему: модель бывает запрещена организацией или недоступна тарифу.
   * Поэтому здесь всегда действующая модель, а не та, что просили: при отказе
   * это прежняя, и панель возвращается к ней, а причина едет в error.
   */
  | { type: 'model'; sessionId: string; model: string; applied: boolean; error?: string }
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
  /**
   * Команда, набранная в поле через «!»: выполняет её сама оболочка в рабочей
   * директории проекта, а не агент. Ответ приходит одним bashResult с тем же id.
   */
  | { type: 'bash'; sessionId: string; id: string; command: string }
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
  /**
   * Файлы и папки, брошенные в поле ввода. Пути идут в оболочку, а не превращаются
   * в плашки на месте: файл это или папка и как его путь выглядит относительно
   * проекта, знает только она — в самом браузере от брошенного остаётся лишь имя.
   * Ответ приходит обычным picked, тем же, что и у диалога выбора.
   */
  | { type: 'dropped'; paths: string[] }
  | { type: 'permissionDecision'; id: string; decision: 'once' | 'always' | 'deny' }
  /**
   * Кнопки под планом. Это тоже разрешение, просто спрошенное не карточкой
   * разрешения, а самим планом: агент ждёт ответа на свой вызов ExitPlanMode и до
   * него ничего не делает. «Одобряю» возвращает ему «план принят», и он продолжает
   * тем же ходом; «ещё планируем» — отказ с объяснением, после которого он
   * дорабатывает план и показывает снова. Идентификатор — тот же, что у карточки
   * плана в ленте: под ним оболочка и запомнила ожидающий вопрос.
   */
  | {
      type: 'planDecision'
      sessionId: string
      id: string
      decision: 'approve' | 'keepPlanning'
      /**
       * Замечание к плану: то, что человек написал в поле ввода, пока карточка
       * плана ждала решения. Уходит агенту вместо общего «доработай план» — он
       * ведь и спрашивал, что в плане не так.
       */
      message?: string
    }
  /**
   * Ответ на вопрос с вариантами (AskUserQuestion). Уходит тем же запросом,
   * которым вопрос пришёл: ключ в `answers` — текст вопроса, значение — подпись
   * выбранного варианта или напечатанный свой ответ. `id` — идентификатор
   * вызова инструмента, он же идентификатор карточки вопроса в ленте.
   *
   * `text` — тот же ответ обычным текстом, на случай если ждать его уже некому
   * (разговор с тех пор перезапускали): тогда он уходит следующим сообщением.
   */
  | { type: 'askAnswer'; sessionId: string; id: string; answers: Record<string, string>; text: string }
  /**
   * Проиграть звук оповещения.
   *
   * Решает панель, а звучит оболочка: страница живёт во встроенном браузере,
   * который рисуется офскрин и подчиняется политике автовоспроизведения — без
   * клика мышью первый же звук там просто не прозвучал бы. Зато только здесь
   * известно, чем именно занят ход: ждёт ли он решения по плану или дошёл до
   * конца сам.
   */
  | {
      type: 'sound'
      sound: SoundId
      volume: number
      /**
       * Повод происходит в той самой вкладке, на которую человек сейчас смотрит.
       * Тогда звук нужен, только если смотреть на неё не выходит: панель убрана
       * с глаз или окно IDE не в фокусе — а это известно лишь оболочке. Из
       * фоновой вкладки и по кнопке «послушать» приходит без него: там звучать
       * надо в любом случае.
       */
      onlyIfAway?: boolean
    }
  /** Галочки и громкость звуков: их хранит оболочка вместе с моделью и режимом. */
  | { type: 'soundSettings'; muted: SoundId[]; volumes: Record<string, number> }
  /** Режим разрешений задаётся при запуске процесса, поэтому меняет его оболочка. */
  | { type: 'setMode'; sessionId: string; mode: string }
  /** Модель и усилие тоже держит оболочка: их наследуют новые разговоры. */
  | { type: 'setModel'; sessionId: string; model: string }
  | { type: 'setEffort'; sessionId: string; effort: string }
  | { type: 'refreshUsage' }
  | { type: 'openDevTools' }
  /**
   * Какой курсор просит CSS под мышью.
   *
   * Нужно потому, что встроенный браузер рисуется офскрин (платформа включает
   * это сама, игнорируя просьбу об окне): страница живёт в отдельном процессе, и
   * её курсор до окна IDE не доходит — там всегда стрелка, сколько ни ставь
   * cursor в стилях. Поэтому курсор ставит оболочка, а страница только говорит,
   * какой именно.
   */
  | { type: 'cursor'; cursor: string }
  /** Ссылка (например, номер PR) — открываем в системном браузере, не в JCEF. */
  | { type: 'openExternal'; url: string }
  | { type: 'history' }
  /** Продолжить прошлый разговор в новой вкладке. */
  | { type: 'resumeSession'; sessionId: string; conversationId: string }
  /** Открыть терминал IDE с входом в Claude Code или выходом из него. */
  | { type: 'login' }
  | { type: 'logout' }
  | { type: 'checkAuth' }
  /**
   * Строка в лог IDE. Панель живёт во встроенном браузере, который рисуется
   * офскрин: что там происходит на самом деле, снаружи не видно, а открывать
   * инструменты разработчика ради одной строки — целая история. Постоянных
   * потребителей нет: это канал для разбирательств вроде «доходят ли до вкладок
   * события мыши», который включают точечно и на время.
   */
  | { type: 'trace'; message: string }
  /** Путь к CLI, указанный руками, — когда автоматический поиск промахнулся. */
  | { type: 'setExecutablePath'; path: string }
  /** Список, добавление и удаление MCP-серверов — правки конфига, не часть разговора. */
  | { type: 'mcpList' }
  /**
   * Переподключить MCP-серверы. Своей команды у CLI для этого нет ни в
   * подкомандах, ни в управляющем канале, поэтому оболочка перезапускает процесс
   * разговора — он подключается к серверам заново при старте, а переписка
   * продолжается с того же места.
   */
  | { type: 'mcpReconnect'; sessionId: string }
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

/**
 * Содержимое сообщения — обычно список блоков, но не всегда: часть сообщений
 * приходит с голой строкой вместо него. Так, например, устроена сводка после
 * `/compact`. Разбор обязан принимать оба вида (см. blocksOf в build.ts):
 * встретив строку там, где ждали список, панель падала целиком.
 */
export type MessageContent = ContentBlock[] | string

export interface AgentAssistantEvent {
  type: 'assistant'
  /**
   * usage тут — снимок ЭТОГО запроса к модели, а не сумма по ходу: его входная
   * часть и есть занятое окно контекста на этот шаг. По нему датчик живёт, пока
   * идёт ход и точной цифры от CLI ещё нет (см. liveContextUsed в build).
   */
  message: { id?: string; content: MessageContent; model?: string; usage?: AgentUsage }
  /** Не пусто у сообщений подагента: это идентификатор вызова, который его породил. */
  parent_tool_use_id?: string | null
}

export interface AgentUserEvent {
  type: 'user'
  message: { content: MessageContent }
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
