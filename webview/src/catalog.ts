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

/**
 * Идентификатор модели без пометки об окне контекста: «opus[1m]» и «opus» — одна
 * и та же модель, просто заряженная по-разному. Сравнивать выбранное с
 * действующим нужно именно так: каталог и поток событий пишут эту пометку
 * вразнобой, и без её отбрасывания разговор на своей же модели выглядел бы
 * сбежавшим на чужую.
 */
const modelFamily = (model: string): string => model.toLowerCase().replace(/\[.*\]$/, '')

/**
 * Какая модель работает на самом деле у конкретной вкладки — та же формула,
 * что и у переменной `model` в App: пока агент не подтвердил смену, показываем
 * выбранное; дальше — то, что он назвал сам; а если он ещё не сказал ни
 * слова, разворачиваем выбор каталогом.
 *
 * Своей функцией, а не только инлайн в App: подписка на сообщения оболочки
 * держит её один раз при монтировании (см. App, useEffect с subscribe) и
 * своего рендера не имеет — models и prefs.model к ней приходят через ref,
 * а не через замыкание, и формула нужна ровно та же, что и в рендере,
 * без права разойтись.
 */
export const resolvePanelModel = (
  panel: { pendingModel?: string; model?: string },
  models: ModelInfo[] | null,
  prefsModel: string,
): string =>
  panel.pendingModel ??
  panel.model ??
  (models?.find((option) => option.value === (prefsModel || DEFAULT_MODEL))?.resolved || prefsModel)

/**
 * Модель, на которую разговор ушёл не по нашей воле.
 *
 * Агент умеет сменить её сам, посреди хода: так срабатывает защита, уводящая
 * ход на другую модель («Switched to Opus 4.8»). Дальше он работает уже на ней,
 * и панель обязана говорить об этом — иначе она уверяет, что разговор идёт на
 * одной модели, пока он идёт на другой.
 *
 * Пусто, если действующая модель отвечает выбранной или сверять не с чем:
 * без каталога неизвестно, во что разворачивается сам выбор («default» — это
 * какая?), и любое расхождение было бы выдумкой.
 */
export const switchedModel = (
  models: ModelInfo[] | null,
  selected: string,
  actual: string | undefined,
): string | undefined => {
  if (!actual) return undefined

  const resolved = models?.find((option) => option.value === (selected || DEFAULT_MODEL))?.resolved
  if (!resolved) return undefined

  return modelFamily(resolved) === modelFamily(actual) ? undefined : actual
}

/**
 * Список моделей и та, что отмечена в нём галочкой.
 *
 * Пока разговор идёт на выбранной модели, отмечено выбранное — включая
 * «default», который выбором и является. Стоит агенту уйти на другую модель,
 * галочка переезжает на неё: список обязан показывать, чем разговор занят на
 * самом деле. Модели, которой нет в каталоге (CLI зовёт её иначе или не
 * показывает вовсе), заводится своя строка — иначе отмечать было бы нечего.
 *
 * Строка эта не оседает в каталоге: он общий на все вкладки, а переключение
 * принадлежит одному разговору. Соседняя вкладка ничего про него знать не
 * должна — ни лишним пунктом в меню, ни съехавшей галочкой.
 */
export const modelMenu = (
  models: ModelInfo[] | null,
  selected: string,
  switched: string | undefined,
): { options: MenuOption[]; selected: string } => {
  const options = modelOptions(models)
  if (!switched) return { options, selected: selected || DEFAULT_MODEL }

  const known = models?.find((option) => option.resolved === switched || option.value === switched)
  if (known) return { options, selected: known.value }

  return {
    options: [
      ...options,
      { id: switched, label: modelLabel(switched), sub: 'Claude Code switched to this model on its own.' },
    ],
    selected: switched,
  }
}

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
 * MODE_OPTIONS с пометкой недоступных вариантов (см. ModeAvailability) — тем же
 * приёмом, каким уже размечены недоступные модели (см. modelOptions):
 * пункт виден и понятен, но не нажимается, вместо того чтобы отвечать
 * ошибкой агента уже после клика.
 */
export const modeMenuOptions = (available: ModeAvailability): MenuOption[] =>
  MODE_OPTIONS.map((option) =>
    (option.id === 'auto' && !available.auto) || (option.id === 'bypassPermissions' && !available.bypass)
      ? { ...option, disabled: true }
      : option,
  )

/**
 * Помнит режим, в котором агент отказал (сейчас — только bypass: он не
 * зависит от модели, только от политики организации, поэтому один отказ
 * действительно верен для всей панели). Про auto — своя память на модель,
 * см. autoRefusedModels в App.tsx.
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
  if (!model) return DEFAULT_MODEL_LABEL

  const known = MODEL_FAMILIES.find((family) => model.toLowerCase().includes(family.id))
  const base = known?.label ?? model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
  return /\[1m\]/i.test(model) ? `${base} 1M` : base
}

/** Подпись, пока модель не названа ни выбором, ни самим агентом. */
const DEFAULT_MODEL_LABEL = 'default'

/**
 * Самая длинная подпись из тех, что могут оказаться на кнопке.
 *
 * По ней и отмеряется ширина селектора — вместо той, что стоит там прямо сейчас.
 * Иначе каждая смена модели или режима меняла бы ширину кнопки, а вместе с ней и
 * положение соседей: весь ряд дёргался бы на ровном месте.
 *
 * Считаем по числу символов, а не по настоящей ширине: значение набрано тем же
 * моноширинным шрифтом, что и остальная лента, — там длиннее и есть шире.
 */
const widestLabel = (labels: string[]): string =>
  labels.reduce((longest, label) => (label.length > longest.length ? label : longest), '')

/**
 * Ширину держат эти три образца — их и рисует кнопка невидимой распоркой (см.
 * Selector). Собраны из тех же списков, откуда берутся настоящие подписи, чтобы
 * новый режим или семейство моделей раздвигали кнопку сами, без правки здесь.
 *
 * Модель, которой нет среди семейств (CLI зовёт её по-своему), может оказаться и
 * длиннее — такая подпись обрежется многоточием, но ряд не тронет. Полное имя
 * всегда есть в подсказке под курсором.
 */
export const MODEL_SAMPLE = widestLabel([
  DEFAULT_MODEL_LABEL,
  ...MODEL_FAMILIES.flatMap((family) => [family.label, `${family.label} 1M`]),
])

export const EFFORT_SAMPLE = widestLabel(EFFORT_OPTIONS.map((option) => option.label))

export const MODE_SAMPLE = widestLabel(Object.values(MODE_SHORT))
