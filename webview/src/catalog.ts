import type { MenuOption } from './components/Menu'

/**
 * Значения сверены с документацией CLI: панель отправляет их слэш-командой в живую
 * сессию, поэтому выдумывать названия нельзя — команда молча не сработает.
 * Подписи и пояснения взяты из макета.
 */

export const MODEL_OPTIONS: MenuOption[] = [
  { id: 'fable', label: 'Fable', sub: 'Alternative flagship — try it when Opus stalls on a problem.' },
  { id: 'opus', label: 'Opus', tag: 'best', sub: 'Deepest reasoning, slowest. Default for plan mode.' },
  { id: 'sonnet', label: 'Sonnet', tag: 'balanced', sub: 'Fast enough for tight loops, strong at edits.' },
  { id: 'haiku', label: 'Haiku', tag: 'cheap', sub: 'Search, greps, mechanical refactors, subagents.' },
]

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

/** Модель приходит полным идентификатором — в строке показываем понятное имя. */
export const modelLabel = (model?: string): string => {
  if (!model) return 'default'

  const known = MODEL_OPTIONS.find((option) => model.toLowerCase().includes(option.id))
  return known?.label ?? model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
}
