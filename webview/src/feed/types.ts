/**
 * Виды элементов ленты из макета. Каждый рисуется своей карточкой и приходит из
 * своего места потока: часть — из блоков ответа, часть — из вызовов конкретных
 * инструментов (список задач, план, вопросы), часть — из служебных событий.
 */

/**
 * Приложение к сообщению пользователя: файл, картинка, папка, команда или кусок
 * файла, присланный из редактора.
 */
export type ChipKind = 'file' | 'img' | 'dir' | 'cmd' | 'ref' | 'quote'

export interface Chip {
  kind: ChipKind
  value: string
  /** Диапазон внутри файла у ссылки из редактора, например `L12:5-L18:30`. */
  range?: string
  /** Картинка, вставленная из буфера обмена: data URL с байтами, а не путь на диске. */
  data?: string
  /**
   * Цитата, выделенная в собственном выводе агента: полный текст, который
   * реально уйдёт агенту. В отличие от file/ref у неё нет пути на диске, откуда
   * его можно перечитать — сам текст и есть содержимое, поэтому несём его в чипе.
   */
  text?: string
}

export type UserToken = { kind: 'text'; value: string } | { kind: 'chip'; chip: Chip }

/** Кусок текста внутри абзаца: обычный, кодовый, выделенный или жирный. */
export interface TextPart {
  text: string
  code?: boolean
  mark?: boolean
  strong?: boolean
  /** URL, если кусок — ссылка (markdown-ссылка или голый http/https-адрес в тексте). */
  href?: string
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
  /** Блок кода рисуется моноширинной плашкой целиком, без разбора на части. */
  codeBlock?: boolean
  language?: string
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

export interface TaskItem {
  id: string
  kind: 'task'
  target: string
  meta: string
  duration: string
  percent: number
  log: DetailLine[]
  pending: boolean
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
}

export type FeedItem =
  | UserItem
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
