import { BUILTIN_COMMANDS, EFFORT_OPTIONS, modelOptions, PANEL_COMMANDS, type CommandOption } from '../catalog'
import type { ModelInfo } from '../protocol'
import type { Chip, UserToken } from './types'

/** Только напечатанный текст, без вложений — вложение слэш-командой быть не может. */
export const plainText = (tokens: UserToken[]): string =>
  tokens.map((token) => (token.kind === 'text' ? token.value : '')).join('')

/**
 * Добавляет вложение в конец последовательности токенов с пробелом по обе
 * стороны — той же логикой, что курсорная вставка в поле: без пробела оно
 * слипается с уже напечатанным текстом в одно нечитаемое слово.
 */
export const appendChip = (tokens: UserToken[], chip: Chip): UserToken[] => {
  const next = [...tokens]
  const last = next.at(-1)

  if (last?.kind === 'text' && last.value.length > 0 && !/\s$/.test(last.value)) {
    next.push({ kind: 'text', value: ' ' })
  }

  next.push({ kind: 'chip', chip })
  next.push({ kind: 'text', value: ' ' })
  return next
}

/**
 * То же самое, что [appendChip], но обычным текстом — для случаев, где нужен
 * виден и копируем буквально сам текст (например, абсолютный путь), а не
 * плашка с укороченной подписью.
 */
export const appendText = (tokens: UserToken[], text: string): UserToken[] => {
  const next = [...tokens]
  const last = next.at(-1)

  if (last?.kind === 'text' && last.value.length > 0 && !/\s$/.test(last.value)) {
    next.push({ kind: 'text', value: ' ' })
  }

  next.push({ kind: 'text', value: text })
  next.push({ kind: 'text', value: ' ' })
  return next
}

/**
 * Подсказка слэш-команд прямо в поле ввода — как в терминале.
 *
 * Отдельного окна со списком быть не должно: команду набирают, а не выбирают из
 * каталога, поэтому список сужается по мере набора и исчезает, как только строка
 * перестаёт быть командой.
 */

export type CommandGroup = 'panel' | 'built-in' | 'project'

export interface CommandEntry extends CommandOption {
  group: CommandGroup
}

/**
 * Эти команды сам CLI в потоковом режиме не выполняет, а честно отвечает
 * отказом (проверено на живом агенте) — показывать их подсказкой незачем,
 * выбор всё равно кончится бесполезным ответом вместо действия.
 */
const UNAVAILABLE_IN_STREAM_MODE = new Set(['export', 'permissions', 'status'])

/** Описание и синтаксис аргумента, прочитанные из фронтматтера файла команды/скила. */
export interface CommandHint {
  description: string
  argumentHint: string
}

/**
 * Список слэш-команд агента приходит с сессией целиком — это тот же каталог,
 * что видит терминал, включая команды всех подключённых MCP-серверов. Свои
 * панельные и заранее описанные встроенные команды идут первыми и всегда
 * доступны, даже до первого события сессии; всё остальное из реального списка
 * добавляется следом без дублей.
 *
 * `hints` — то, что панель нашла на диске (проектные/личные команды и скиллы,
 * команды и скиллы установленных плагинов): реальный файл всегда перевешивает
 * наш собственный жёстко забитый список — если у пользователя стоит плагин,
 * который сам определяет команду с тем же именем, что и один из наших
 * BUILTIN_COMMANDS, это его определение, а не наша догадка.
 */
export const buildCommands = (cliCommands: string[], hints: Record<string, CommandHint> = {}): CommandEntry[] => {
  const entries: CommandEntry[] = []
  const seen = new Set<string>()

  for (const command of PANEL_COMMANDS) {
    seen.add(command.id)
    entries.push({ ...command, group: 'panel' })
  }

  for (const command of BUILTIN_COMMANDS) {
    seen.add(command.id)
    const hint = hints[command.id]
    entries.push({
      ...command,
      hint: hint?.description || command.hint,
      argumentHint: hint?.argumentHint || command.argumentHint,
      group: 'built-in',
    })
  }

  for (const id of cliCommands) {
    if (seen.has(id) || UNAVAILABLE_IN_STREAM_MODE.has(id)) continue
    seen.add(id)
    const hint = hints[id]
    entries.push({ id, hint: hint?.description ?? '', argumentHint: hint?.argumentHint, group: 'project' })
  }

  // Команды и скиллы, найденные на диске, но ещё не названные агентом.
  //
  // Свой список он присылает вместе с началом разговора (system:init), то есть
  // только после первого отправленного сообщения — до тех пор подсказка знала
  // одни лишь встроенные команды, и собственный скилл пользователя в ней просто
  // не находился. Файлы на диске лежат независимо от того, начат разговор или
  // нет, поэтому берём имена и оттуда: к моменту, когда агент назовёт свои,
  // список уже совпадёт.
  for (const [id, hint] of Object.entries(hints)) {
    if (seen.has(id) || UNAVAILABLE_IN_STREAM_MODE.has(id)) continue
    seen.add(id)
    entries.push({ id, hint: hint.description, argumentHint: hint.argumentHint, group: 'project' })
  }

  return entries
}

/** Что набрано после слэша, или null, если поле уже не про команду. */
export const slashQuery = (draft: string): string | null => {
  if (!draft.startsWith('/')) return null

  const rest = draft.slice(1)
  // Пробел означает, что команда уже названа и пошли её аргументы.
  return /\s/.test(rest) ? null : rest
}

/**
 * Название уже набранной целиком команды, если сразу за ней идёт пробел, а
 * дальше — ничего: слот аргумента ещё пуст, ровно как placeholder у обычного
 * инпута. $ в конце обязателен — без него хинт-подсказка формата держалась бы
 * до конца всего сообщения, а не гасла, стоило набрать первый символ аргумента.
 * В отличие от [argumentQuery] не привязана к конкретному набору команд с
 * перечислимыми значениями: годится для любого имени, включая дефисы и
 * "плагин:команда".
 */
const COMMAND_NAME_BEFORE_ARGUMENT = /^\/(\S+)\s+$/

export const commandNameBeforeArgument = (draft: string): string | null =>
  COMMAND_NAME_BEFORE_ARGUMENT.exec(draft)?.[1] ?? null

/** Подсказка сама прокручивается — ограничение только против бесконечного списка, не против полного. */
const MAX_SUGGESTIONS = 50

/** Совпадения по началу идут первыми: их и ищут, набирая первые буквы. */
export const matchCommands = (
  commands: CommandEntry[],
  query: string,
  limit = MAX_SUGGESTIONS,
): CommandEntry[] => {
  const needle = query.toLowerCase()
  if (!needle) return commands.slice(0, limit)

  const starts: CommandEntry[] = []
  const contains: CommandEntry[] = []

  for (const command of commands) {
    const name = command.id.toLowerCase()
    if (name.startsWith(needle)) starts.push(command)
    else if (name.includes(needle)) contains.push(command)
  }

  return [...starts, ...contains].slice(0, limit)
}

/** Команда панели вместе со значением, если оно у неё есть. */
export interface LocalCommand {
  name: string
  /** Что набрано за именем: выбор модели или усилия. У остальных пусто. */
  argument: string
}

/**
 * Команда, которую выполняет сама панель.
 *
 * Вход, выход и ветвление агенту слать бессмысленно: первые две в потоковом
 * режиме недоступны ему в принципе, а третья вообще про устройство панели.
 *
 * `/model` и `/effort` со знакомым значением — тоже наши: выбор живёт в панели,
 * достаётся новым вкладкам и переживает перезапуск IDE. Отправленные ходом, они
 * стоили бы отдельного обмена с агентом, ответ которого («только для этой
 * сессии») вдобавок неправда. Незнакомое значение остаётся агенту: вдруг он
 * знает модель, о которой не знаем мы.
 */
export const localCommand = (text: string, models: ModelInfo[] | null = null): LocalCommand | null => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  const [name = '', ...rest] = trimmed.slice(1).split(/\s+/)
  const argument = rest.join(' ')

  if (PANEL_COMMANDS.some((command) => command.id === name)) return { name, argument }

  // Значения берём из того же списка, что и подсказка с меню в нижней строке —
  // расходиться этим трём было бы не на чем.
  const known = argumentOptions(name, models)?.some((option) => option.id === argument)
  return known ? { name, argument } : null
}

/**
 * Аргументы команд, у которых значения из фиксированного набора — ровно то же,
 * что показывает нативный терминал вторым шагом подсказки. Модели идут из
 * живого каталога CLI (см. modelOptions), усилие — из своего списка: у него
 * набор значений один на все версии.
 */
const ARGUMENT_OPTIONS: Record<string, CommandOption[]> = {
  effort: EFFORT_OPTIONS.map((option) => ({ id: option.id, hint: option.sub ?? '' })),
}

/** Команда без аргумента бессмысленна — отправлять её как есть незачем и Enter'ом. */
export const requiresArgument = (id: string): boolean => id === 'model' || id in ARGUMENT_OPTIONS

/** Перечислимые значения команды, если они у неё есть — для подсказки по аргументу. */
export const argumentOptions = (command: string, models: ModelInfo[] | null = null): CommandOption[] | undefined =>
  command === 'model'
    ? modelOptions(models).map((option) => ({ id: option.id, hint: option.sub ?? '' }))
    : ARGUMENT_OPTIONS[command]

/** Имя команды, набранной целиком, и ровно один пробел за ней — больше в поле ничего нет. */
const COMPLETED_COMMAND = /^\/(\S+) $/

/**
 * Момент, когда набранная руками команда становится плашкой: имя дописано и за
 * ним поставили пробел. Дальше идёт её аргумент — обычным текстом, как в
 * терминале, поэтому плашкой становится только само имя.
 *
 * Незнакомое имя не трогаем: плашка обещает, что команда существует, и обещание
 * это должно быть правдой. Возвращаем null, если превращать нечего.
 */
export const captureCommand = (tokens: UserToken[], commands: CommandEntry[]): UserToken[] | null => {
  if (tokens.some((token) => token.kind === 'chip')) return null

  const name = COMPLETED_COMMAND.exec(plainText(tokens))?.[1]
  if (!name || !commands.some((command) => command.id === name)) return null

  // Пробел за плашкой остаётся: курсору нужно, где встать, а аргументу — от чего
  // отделиться в тексте, который уйдёт агенту.
  return [{ kind: 'chip', chip: { kind: 'cmd', value: name } }, { kind: 'text', value: ' ' }]
}

/** Команда, уже ставшая плашкой: она всегда первая — команда с чем-то перед ней не команда. */
export const commandChip = (tokens: UserToken[]): string | null => {
  const first = tokens[0]
  return first?.kind === 'chip' && first.chip.kind === 'cmd' ? first.chip.value : null
}

export interface ArgumentQuery {
  command: string
  query: string
  options: CommandOption[]
}

/**
 * Название команды уже набрано и за ним ровно один пробел — дальше идёт её
 * аргумент, и если команда его поддерживает, ему тоже нужна подсказка.
 */
export const argumentQuery = (draft: string, models: ModelInfo[] | null = null): ArgumentQuery | null => {
  const match = /^\/([a-z]+) ([^\s]*)$/.exec(draft)
  if (!match) return null

  const command = match[1] ?? ''
  const options = argumentOptions(command, models)
  if (!options) return null

  return { command, query: match[2] ?? '', options }
}

export const matchArguments = (options: CommandOption[], query: string, limit = MAX_SUGGESTIONS): CommandOption[] => {
  const needle = query.toLowerCase()
  if (!needle) return options.slice(0, limit)

  return options.filter((option) => option.id.toLowerCase().startsWith(needle)).slice(0, limit)
}
