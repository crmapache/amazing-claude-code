import type { MenuOption } from './components/Menu'
import type { ModelInfo } from './protocol'

/**
 * Значения сверены с документацией CLI: панель отправляет их слэш-командой в живую
 * сессию, поэтому выдумывать названия нельзя — команда молча не сработает.
 * Подписи и пояснения взяты из макета.
 */

/** Значение, которым CLI зовёт «модель по умолчанию» — оно же приходит в каталоге. */
export const DEFAULT_MODEL = 'default'

/**
 * Каталог моделей, пока настоящий не приехал от CLI (см. ModelInfo и сообщение
 * `models`). Это ровно тот список, что показывает `/model` в терминале обычной
 * подписке — но живой каталог всегда важнее: он знает и про запреты организации,
 * и про модели, которых на момент сборки панели ещё не существовало.
 */
export const MODEL_OPTIONS: MenuOption[] = [
  { id: DEFAULT_MODEL, label: 'Default (recommended)', sub: 'Use the model this session starts with.' },
  { id: 'opus', label: 'Opus', sub: 'Opus 5 · Best for everyday, complex tasks' },
  { id: 'opus[1m]', label: 'Opus (1M context)', sub: 'Opus 5 with 1M context · For long sessions with large codebases' },
  { id: 'sonnet', label: 'Sonnet', sub: 'Sonnet 5 · Efficient for routine tasks' },
  {
    id: 'sonnet[1m]',
    label: 'Sonnet (1M context)',
    sub: 'Sonnet 5 with 1M context · For long sessions with large codebases',
  },
  { id: 'haiku', label: 'Haiku', sub: 'Haiku 4.5 · Fastest for quick answers' },
  { id: 'opusplan', label: 'Opus Plan Mode', sub: 'Use Opus in plan mode, Sonnet otherwise' },
]

/**
 * Каталог от CLI в вид, который понимает меню. Недоступную строку показываем —
 * ровно как терминал, — но помечаем: видеть, что модель существует и почему её
 * нельзя выбрать, полезнее, чем не видеть её вовсе.
 */
export const modelOptions = (models: ModelInfo[] | null): MenuOption[] =>
  models === null || models.length === 0
    ? MODEL_OPTIONS
    : models.map((model) => ({
        id: model.value,
        label: model.label || model.value,
        sub: model.description,
        ...(model.disabled ? { tag: 'unavailable' } : {}),
      }))

export const EFFORT_OPTIONS: MenuOption[] = [
  { id: 'low', label: 'low', sub: 'Minimal thinking. Mechanical edits and quick answers.' },
  { id: 'medium', label: 'medium', sub: 'Balanced. Good default for feature work.' },
  { id: 'high', label: 'high', tag: 'default', sub: 'Long reasoning before acting. Multi-file changes.' },
  { id: 'xhigh', label: 'xhigh', sub: 'More of the same, for changes that span many files.' },
  { id: 'max', label: 'max', tag: 'slow', sub: 'Everything it has. Architecture and gnarly bugs.' },
  {
    id: 'ultracode',
    label: 'ultracode',
    tag: 'ultra',
    sub: 'xhigh reasoning plus automatic multi-agent workflows when a task calls for one.',
  },
  { id: 'auto', label: 'auto', sub: "Resets to the model's default effort for this session." },
]

export const MODE_OPTIONS: MenuOption[] = [
  {
    // Имя из флага самого CLI. Панель звала этот режим `default`, пока у флага
    // не появилось отдельное имя; старое значение приезжает из сохранённых
    // настроек и из событий агента — его приводит к нынешнему normalizeMode.
    id: 'manual',
    label: 'Ask permissions',
    tag: 'default',
    key: '⇧⇥',
    sub: 'Reads freely, asks before every write and every command.',
  },
  {
    id: 'acceptEdits',
    label: 'Accept edits',
    key: '⇧⇥',
    sub: 'Auto-approves file edits in the working dir. Still asks for shell.',
  },
  {
    id: 'plan',
    label: 'Plan',
    tag: 'read-only',
    key: '⇧⇥',
    sub: 'Researches and proposes a plan. Touches nothing until you approve.',
  },
  {
    id: 'auto',
    label: 'Auto',
    tag: 'preview',
    // Отказ приходит от агента и виден в ленте, но лучше предупредить заранее:
    // на Haiku этот режим просто недоступен.
    sub: 'No prompts — a classifier vets each risky action. Not on every model.',
  },
  {
    id: 'dontAsk',
    label: "Don't ask",
    tag: 'settings',
    sub: 'Never prompts; denies anything not pre-approved. For unattended runs.',
  },
  {
    id: 'bypassPermissions',
    label: 'Bypass permissions',
    tag: 'danger',
    danger: true,
    sub: 'Skips every check. Containers and throwaway VMs only.',
  },
]

/**
 * Команда из подсказки. Часть выполняет сама панель, часть уходит агенту.
 *
 * Список встроенных проверен на живом агенте: в потоковом режиме доступны не все —
 * `/clear`, `/compact`, `/resume`, `/export`, `/permissions`, `/status` там
 * интерактивные и отвечают отказом, поэтому их здесь нет.
 */
export interface CommandOption {
  id: string
  hint: string
  /** Панель выполняет сама, агенту не отправляет. */
  local?: boolean
  /**
   * Синтаксис аргумента, как в нативном терминале ("[low|medium|...] [--fix] [<target>]") —
   * показывается серым текстом сразу после названия команды, пока не начали печатать
   * сам аргумент. У большинства команд его нет: он приходит из фронтматтера файла
   * команды/скила (см. ClaudeCommandHints.kt), а не выдумывается нами.
   */
  argumentHint?: string
}

export const PANEL_COMMANDS: CommandOption[] = [
  { id: 'resume', hint: 'open a past conversation of this project', local: true },
  { id: 'fork', hint: 'continue this conversation in a new tab', local: true },
  { id: 'login', hint: 'sign in to Claude Code in the IDE terminal', local: true },
  { id: 'logout', hint: 'sign out — opens the IDE terminal', local: true },
]

export const BUILTIN_COMMANDS: CommandOption[] = [
  { id: 'model', hint: 'switch the model for this session' },
  { id: 'effort', hint: 'set how long Claude thinks before acting' },
  { id: 'context', hint: 'what fills the context window right now' },
  { id: 'cost', hint: 'spend and usage windows of this session' },
  { id: 'usage', hint: 'subscription windows and when they reset' },
  /**
   * У code-review нет файла с фронтматтером — это встроенная в сам CLI команда,
   * не плагин и не скилл. Синтаксис аргумента сверен напрямую с бинарником
   * (strings по claude 2.1.220): `] [--fix] [--comment] [<target>]` собирается
   * там с перечнем уровней глубины через "|" — здесь просто переписан 1:1.
   */
  {
    id: 'code-review',
    hint: 'review a pull request',
    argumentHint: '[low|medium|high|xhigh|max|ultra] [--fix] [--comment] [<target>]',
  },
]

/**
 * Приводит название режима к тому, которым пользуемся мы. `default` — как этот
 * режим звался раньше: он лежит в сохранённых настройках и может прийти от
 * агента, а показывать из-за этого незнакомый режим панель не должна.
 */
export const normalizeMode = (mode: string): string => (mode === 'default' ? 'manual' : mode)

export const modeLabel = (mode: string): string =>
  MODE_OPTIONS.find((option) => option.id === normalizeMode(mode))?.label ?? mode

/**
 * Что из необязательного доступно этому разговору. Оба режима включает не панель:
 * bypass разрешает запуск сессии (и запрещает политика организации), auto —
 * доступность у самого агента, поэтому спрашивать надо каждый раз заново.
 */
export interface ModeAvailability {
  bypass: boolean
  auto: boolean
}

/**
 * Помнит режим, в котором агент отказал. Доступность режима — свойство машины и
 * учётной записи, а не отдельной вкладки, поэтому список общий на всю панель:
 * услышав отказ один раз, водить в этот режим не должна ни одна вкладка.
 */
export const withRefusedMode = (refused: string[], mode: string): string[] => {
  const known = normalizeMode(mode)
  return refused.includes(known) ? refused : [...refused, known]
}

/**
 * Следующий режим по Shift+Tab. Порядок и все развилки повторяют терминальный
 * Claude Code один в один: Ask → Accept edits → Plan → Bypass → Auto → Ask, причём
 * недоступный режим круг просто перешагивает. Всё, что в круг не входит (Don't ask
 * и незнакомое имя из старой переписки), возвращает к началу — там же он это и делает.
 */
export const nextMode = (mode: string, available: ModeAvailability): string => {
  switch (normalizeMode(mode)) {
    case 'manual':
      return 'acceptEdits'
    case 'acceptEdits':
      return 'plan'
    case 'plan':
      if (available.bypass) return 'bypassPermissions'
      if (available.auto) return 'auto'
      return 'manual'
    case 'bypassPermissions':
      return available.auto ? 'auto' : 'manual'
    default:
      return 'manual'
  }
}

/**
 * Подпись режима для кнопки в нижней строке. Она фиксированной ширины, а полное
 * «Bypass permissions» туда не влезает — и не должно: кнопка от смены режима
 * прыгать в ширине не может, это дёргает весь ряд.
 */
const MODE_SHORT: Record<string, string> = {
  manual: 'Ask',
  acceptEdits: 'Accept',
  plan: 'Plan',
  auto: 'Auto',
  dontAsk: "Don't ask",
  bypassPermissions: 'Bypass',
}

export const modeShortLabel = (mode: string): string => MODE_SHORT[normalizeMode(mode)] ?? modeLabel(mode)

/**
 * Семейства моделей для короткой подписи в нижней строке. Отдельно от каталога:
 * там подписи полные («Opus (1M context)»), а кнопке нужно одно слово — она
 * фиксированной ширины и от смены модели прыгать не может.
 */
const MODEL_FAMILIES: { id: string; label: string }[] = [
  { id: 'fable', label: 'Fable' },
  { id: 'opusplan', label: 'Opusplan' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
]

/**
 * Модель приходит полным идентификатором — в строке показываем понятное имя.
 * Про «1M» говорим отдельной пометкой: у такой модели окно контекста впятеро
 * больше, и по одному имени семейства этого не понять.
 */
export const modelLabel = (model?: string): string => {
  if (!model) return 'default'

  const known = MODEL_FAMILIES.find((family) => model.toLowerCase().includes(family.id))
  const base = known?.label ?? model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
  return /\[1m\]/i.test(model) ? `${base} 1M` : base
}
