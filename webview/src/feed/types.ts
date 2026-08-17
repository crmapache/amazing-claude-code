/**
 * Виды элементов ленты из макета. Каждый рисуется своей карточкой и приходит из
 * своего места потока: часть — из блоков ответа, часть — из вызовов конкретных
 * инструментов (список задач, план, вопросы), часть — из служебных событий.
 */

/**
 * Приложение к сообщению пользователя: файл, картинка, папка, команда или кусок
 * файла, присланный из редактора.
 */
export type ChipKind = 'file' | 'img' | 'dir' | 'cmd' | 'ref' | 'quote' | 'paste'

export interface Chip {
  kind: ChipKind
  value: string
  /** Диапазон внутри файла у ссылки из редактора, например `L12:5-L18:30`. */
  range?: string
  /** Картинка, вставленная из буфера обмена: data URL с байтами, а не путь на диске. */
  data?: string
  /**
   * Полный текст того, у чего нет пути на диске, откуда его можно перечитать:
   * цитата из вывода агента и свёрнутая вставка из буфера. Сам текст и есть
   * содержимое такой плашки — именно он уходит агенту, а в подписи видно только
   * его начало.
   */
  text?: string
}

export type UserToken =
  /**
   * echo — кусок текста, который панель подставила за человека, а не он сам:
   * так рядом с выбранным ответом в ленту попадает и сам вопрос агента (см.
   * App.sendAnswers). В карточке такой кусок приглушён — вопрос уже прочитан
   * выше, и внимание должно доставаться ответу на него.
   */
  | { kind: 'text'; value: string; echo?: boolean }
  | { kind: 'chip'; chip: Chip }

/** Кусок текста внутри абзаца: обычный, кодовый, выделенный или жирный. */
export interface TextPart {
  text: string
  code?: boolean
  mark?: boolean
  strong?: boolean
  /** URL, если кусок — ссылка (markdown-ссылка или голый http/https-адрес в тексте). */
  href?: string
}

/** Как выровнен столбец таблицы — из строки-разделителя (`:---`, `---:`, `:---:`). */
export type TableAlign = 'left' | 'center' | 'right' | undefined

export interface TableData {
  align: TableAlign[]
  header: TextPart[][]
  rows: TextPart[][][]
}

export interface Paragraph {
  bullet?: boolean
  /**
   * Чем помечен пункт списка: «1.» у нумерованного, пусто у обычного (тогда
   * рисуется тире). Нумерация — часть смысла: «сделай шаг 3» без номеров не
   * прочитать.
   */
  marker?: string
  /** Уровень вложенности пункта, от нуля. Считается по отступу исходной строки. */
  depth?: number
  /** Заголовок (`#`..`######`) — рисуется жирным, как и раньше, но с зазором перед собой, чтобы читаться началом раздела, а не сливаться с абзацем над ним. */
  heading?: boolean
  /** Цитата (строка начинается с `>`) — полоска слева и приглушённый текст, как переписка внутри переписки. */
  quote?: boolean
  /** Блок кода рисуется моноширинной плашкой целиком, без разбора на части. */
  codeBlock?: boolean
  language?: string
  /** Таблица — строка `| a | b |` и разделитель `|---|---|` следом. parts тогда пуст. */
  table?: TableData
  parts: TextPart[]
}

/** Категория плашки у вызова инструмента. Задаёт и подпись, и цвет. */
export type ToolChip = 'READ' | 'GREP' | 'EDIT' | 'WRITE' | 'BASH' | 'WEB' | 'MCP' | 'TOOL'

export interface DiffLine {
  n: number | null
  sign: ' ' | '+' | '-'
  kind: 'ctx' | 'add' | 'del'
  text: string
}

export interface Hunk {
  id: string
  range: string
  note: string
  lines: DiffLine[]
}

export interface DetailLine {
  text: string
  tone?: 'ok' | 'bad' | 'dim'
}

export interface UserItem {
  id: string
  kind: 'user'
  time: string
  tokens: UserToken[]
  /** Куски вывода, на которые ссылается сообщение. Показываются им же в ленте. */
  quotes: string[]
}

export interface TextItem {
  id: string
  kind: 'text'
  paragraphs: Paragraph[]
}

/**
 * Мысль модели — своя карточка, а не строка внутри группы вызовов: иначе она
 * терялась среди тулзов первой же сворачиваемой группой. Всегда в одну строку
 * (обрезается многоточием, если не влезает) — это ход мысли между делом, а не
 * повод разворачивать блок на полэкрана.
 */
export interface ThinkItem {
  id: string
  kind: 'think'
  text: string
  /** Ещё стримится — карточка обновляется по мере поступления текста. */
  pending: boolean
}

export interface ToolItem {
  id: string
  kind: 'tool'
  chip: ToolChip
  /** Имя и вход инструмента нужны позже: результат приходит отдельным событием,
   *  а дифф и подпись строятся из того, что было на входе. */
  toolName: string
  input: unknown
  target: string
  meta: string
  duration: string
  detail: DetailLine[]
  hunks: Hunk[]
  isError: boolean
  /** Пока результата нет, строка показывает, что инструмент ещё работает. */
  pending: boolean
}

export interface ToolGroupItem {
  id: string
  kind: 'toolGroup'
  /** Подряд идущие вызовы обычных инструментов, без разрывов текстом или другой карточкой. */
  tools: ToolItem[]
  /** Есть ли внутри хотя бы один ещё не завершившийся вызов. */
  pending: boolean
  /** Точное время от создания группы до последнего результата; пока pending — тикает. */
  duration: string
  /** Момент создания группы — неизменный, не зависит от того, что происходит с state.startedAt. */
  startedAt: number
}

/**
 * Чем кончилась задача: своим ходом, остановкой снаружи или ошибкой. Приходит
 * статусом в task_notification — до этого любой конец рисовался одинаково
 * зелёным, и прибитый агент выглядел как успешно отработавший.
 */
export type TaskOutcome = 'ok' | 'stopped' | 'failed'

export interface TaskItem {
  id: string
  kind: 'task'
  /**
   * Как эту задачу зовёт сам CLI. Не всегда совпадает с id карточки: агента,
   * запущенного вызовом Task, карточка знает по идентификатору вызова, а
   * настоящее имя задачи приезжает следом, системным событием о её запуске.
   * Без него задачу не остановить — по нему её и просят прибить.
   */
  taskId?: string
  target: string
  meta: string
  duration: string
  percent: number
  log: DetailLine[]
  pending: boolean
  /** Пусто, пока задача идёт; после конца — чем именно она кончилась. */
  outcome?: TaskOutcome
}

/**
 * Команда, запущенная в фоне (`run_in_background`). Своей карточкой она уже
 * есть в ленте — здесь живёт только то, что нужно чипу в шапке: пока процесс
 * работает, это единственное место во всей панели, где видно, что он вообще
 * жив. Агентом такую задачу звать нельзя, хотя CLI и сообщает о ней теми же
 * событиями (см. task_type в build.ts).
 */
export interface BackgroundTask {
  id: string
  /** Вызов Bash, который её запустил — по нему в ленте лежит карточка команды. */
  toolUseId?: string
  label: string
  duration: string
}

export type TodoState = 'todo' | 'active' | 'done'

export interface TodoEntry {
  id: string
  text: string
  state: TodoState
}

export interface TodoItem {
  id: string
  kind: 'todo'
  todos: TodoEntry[]
}

export interface PlanItem {
  id: string
  kind: 'plan'
  meta: string
  duration: string
  /**
   * План целиком, разобранный как markdown — тем же разбором, что и обычный
   * ответ агента. Раньше здесь лежали «шаги»: строки, вырезанные из плана по
   * маркеру списка. Всё, что не пункт (заголовки разделов, абзацы-пояснения,
   * вложенные уточнения), при этом терялось, разметка внутри пункта показывалась
   * сырыми звёздочками, а первый попавшийся путь в бэктиках вырезался из текста
   * в отдельную приписку — предложение после этого начиналось с запятой.
   */
  paragraphs: Paragraph[]
}

export interface PermItem {
  id: string
  kind: 'perm'
  target: string
  meta: string
  command: string
  decision: 'once' | 'always' | 'deny' | null
  /**
   * Почему спросили, если спросил не режим: проверка безопасности, правило `ask`,
   * хук, классификатор. Пусто — вопрос обычный, и лишней строки в карточке быть
   * не должно.
   */
  reason?: string
  /** Сработает ли «Always allow»: нет — кнопки не будет вовсе. */
  rememberable: boolean
  /** Не задано — решение главного потока. Задано — принадлежит конкретному агенту. */
  taskId?: string
}

export interface AskOption {
  id: string
  label: string
  sub: string
}

export interface AskQuestion {
  id: string
  title: string
  hint: string
  multiSelect: boolean
  options: AskOption[]
}

export interface AskItem {
  id: string
  kind: 'ask'
  meta: string
  questions: AskQuestion[]
  /** Не задано — вопрос главного потока. Задано — вопрос конкретного агента. */
  taskId?: string
}

export interface CheckpointItem {
  id: string
  kind: 'checkpoint'
  chip: string
  target: string
}

/**
 * Команда, выполненная самой панелью через «!» — не вызов инструмента агентом, а
 * поход человека в терминал. Стоит в ленте на своём месте по времени.
 *
 * Агент видит вывод не здесь, а приложением к следующему сообщению — и только
 * тот, что успел вернуться к моменту отправки. Отправленное, пока команда ещё
 * идёт, уйдёт без него, а сам вывод достанется сообщению после: ход агента
 * панель ради этого не задерживает. Карточка в ленте всё это время честно
 * показывает «running», так что видно, чего ещё нет.
 */
export interface BashItem {
  id: string
  kind: 'bash'
  command: string
  /** stdout и stderr вместе, как их видно в терминале; пока pending — пусто. */
  output: string
  /** Не задан, пока команда идёт. */
  exitCode?: number
  pending: boolean
}

export interface CompactItem {
  id: string
  kind: 'compact'
  target: string
  /** Сжатие ещё идёт — карточка появляется сразу, до того как известен итог. */
  pending: boolean
}

export interface MetaItem {
  id: string
  kind: 'meta'
  stats: string[]
}

/** Процесс разговора умер сам — отдельная, недвусмысленная пометка в ленте. */
export interface CrashItem {
  id: string
  kind: 'crash'
  message: string
}

/**
 * Отказ агента или процесса — на своём месте в хронологии, а не закреплённой
 * плашкой над полем ввода.
 *
 * Закреплённой она висела до тех пор, пока её не закроют руками, — и через
 * полчаса работы всё ещё сообщала, например, о лимите, который давно
 * сбросился. В ленте у ошибки есть то, чего плашке не хватало: время. Она
 * уезжает вверх вместе с ходом, в котором случилась, и перестаёт выдавать себя
 * за положение дел прямо сейчас.
 */
export interface ErrorItem {
  id: string
  kind: 'error'
  message: string
  /**
   * Ход остановил исчерпанный лимит подписки, а не поломка. Отдельная пометка,
   * потому что это не то же самое: чинить нечего, нужно дождаться сброса окна —
   * и зовут об этом своим звуком.
   */
  limit?: boolean
}

export type FeedItem =
  | UserItem
  | BashItem
  | TextItem
  | ThinkItem
  | ToolGroupItem
  | TaskItem
  | TodoItem
  | PlanItem
  | PermItem
  | AskItem
  | CheckpointItem
  | CompactItem
  | MetaItem
  | CrashItem
  | ErrorItem
