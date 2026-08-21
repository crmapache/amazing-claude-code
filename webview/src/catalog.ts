import type { MenuOption } from './components/Menu'
import type { ModelInfo } from './protocol'

/**
 * The values are checked against the CLI's documentation: the panel sends them as a slash command into
 * a live session, so inventing names is out of the question - the command would silently do nothing.
 * The captions and the explanations come from the design.
 */

/** The value the CLI calls "the default model" by - the same one arrives in the catalogue. */
export const DEFAULT_MODEL = 'default'

/**
 * The model catalogue until the real one arrives from the CLI (see ModelInfo and the `models` message).
 * This is exactly the list `/model` shows in a terminal on an ordinary subscription - but the live
 * catalogue always outweighs it: it knows about an organization's bans and about models that did not
 * exist yet when the panel was built.
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
 * The CLI's catalogue in the shape the menu understands. An unavailable line is shown - exactly as the
 * terminal does - but marked: seeing that a model exists and why it cannot be chosen is more useful
 * than not seeing it at all.
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
 * A model's identifier without the context window mark: "opus[1m]" and "opus" are one and the same
 * model, merely loaded differently. Comparing the chosen one with the one in force has to work exactly
 * this way: the catalogue and the event stream write that mark inconsistently, and without dropping it a
 * conversation on its own model would look as though it had run off to someone else's.
 */
const modelFamily = (model: string): string => model.toLowerCase().replace(/\[.*\]$/, '')

/**
 * Which model a given tab is genuinely working on - the same formula as the `model` variable in App:
 * until the agent has confirmed a change we show what was chosen; after that, what it named itself; and
 * if it has not said a word yet, we expand the choice through the catalogue.
 *
 * A function of its own rather than only inline in App: the subscription to the shell's messages is set
 * up once at mount (see App, the useEffect with subscribe) and has no render of its own - models and
 * prefs.model reach it through a ref rather than a closure, and the formula has to be exactly the one
 * used in the render, with no right to drift.
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
 * The model a conversation moved to not by our doing.
 *
 * The agent can change it itself, mid-turn: that is how the guard that moves a turn to another model
 * fires ("Switched to Opus 4.8"). From then on it works on that one, and the panel is obliged to say so
 * - otherwise it insists the conversation runs on one model while it runs on another.
 *
 * Empty when the model in force matches the chosen one or there is nothing to compare against: without
 * the catalogue it is unknown what the choice itself expands into ("default" - which one is that?), and
 * any discrepancy would be an invention.
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
 * The list of models and the one ticked in it.
 *
 * While a conversation runs on the chosen model, what is ticked is the choice - "default" included,
 * which is a choice too. As soon as the agent moves to another model, the tick moves with it: the list
 * is obliged to show what the conversation is genuinely busy with. A model absent from the catalogue
 * (the CLI calls it something else, or does not show it at all) gets a line of its own - otherwise there
 * would be nothing to tick.
 *
 * That line does not settle into the catalogue: the catalogue is shared across tabs, while the switch
 * belongs to one conversation. A neighbouring tab should know nothing about it - neither by an extra
 * menu entry nor by a tick that has moved.
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
    // The name from the CLI's own flag. The panel called this mode `default` until the flag got a name
    // of its own; the old value arrives from saved settings and from the agent's events - normalizeMode
    // brings it to the current one.
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
    // The refusal comes from the agent and is visible in the feed, but warning in advance is better: on
    // Haiku this mode is simply unavailable.
    sub: 'No prompts - a classifier vets each risky action. Not on every model.',
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
    // Not "skips every check": even in this mode the CLI asks about dangerous deletions and about what
    // is forbidden or marked "ask" in the settings. Promising complete silence would be a lie (see
    // PermissionReason on the IDE side).
    sub: 'Skips almost every check. Dangerous deletions still ask. Containers and throwaway VMs only.',
  },
]

/**
 * A command from the hint. Some the panel runs itself, some travel to the agent.
 *
 * The built-in list was checked against a live agent: not all of them are available in streaming mode -
 * `/clear`, `/compact`, `/resume`, `/export`, `/permissions`, `/status` are interactive there and answer
 * with a refusal, so they are not here.
 */
export interface CommandOption {
  id: string
  hint: string
  /** The panel runs it itself and does not send it to the agent. */
  local?: boolean
  /**
   * The argument's syntax, as in the native terminal ("[low|medium|...] [--fix] [<target>]") - shown as
   * grey text right after the command's name, until the argument itself is being typed. Most commands
   * have none: it comes from the frontmatter of a command's or skill's file (see ClaudeCommandHints.kt)
   * rather than being invented by us.
   */
  argumentHint?: string
}

export const PANEL_COMMANDS: CommandOption[] = [
  { id: 'resume', hint: 'open a past conversation of this project', local: true },
  { id: 'fork', hint: 'continue this conversation in a new tab', local: true },
  { id: 'login', hint: 'sign in to Claude Code in the IDE terminal', local: true },
  { id: 'logout', hint: 'sign out - opens the IDE terminal', local: true },
]

export const BUILTIN_COMMANDS: CommandOption[] = [
  { id: 'model', hint: 'switch the model for this session' },
  { id: 'effort', hint: 'set how long Claude thinks before acting' },
  { id: 'context', hint: 'what fills the context window right now' },
  { id: 'cost', hint: 'spend and usage windows of this session' },
  { id: 'usage', hint: 'subscription windows and when they reset' },
  /**
   * code-review has no frontmatter file - it is a command built into the CLI itself, neither a plugin nor
   * a skill. Its argument syntax was checked against the binary directly (strings over claude 2.1.220):
   * `] [--fix] [--comment] [<target>]` is assembled there with the depth levels joined by "|" - here it
   * is simply written out one to one.
   */
  {
    id: 'code-review',
    hint: 'review a pull request',
    argumentHint: '[low|medium|high|xhigh|max|ultra] [--fix] [--comment] [<target>]',
  },
]

/**
 * Brings a mode's name to the one we use. `default` is what this mode used to be called: it sits in
 * saved settings and may arrive from the agent, and the panel must not show an unfamiliar mode because
 * of that.
 */
export const normalizeMode = (mode: string): string => (mode === 'default' ? 'manual' : mode)

export const modeLabel = (mode: string): string =>
  MODE_OPTIONS.find((option) => option.id === normalizeMode(mode))?.label ?? mode

/**
 * Which of the optional modes this conversation has available. Neither is switched on by the panel:
 * bypass is allowed by the session's launch (and forbidden by an organization's policy), auto by the
 * agent's own availability - so both have to be asked about anew every time.
 */
export interface ModeAvailability {
  bypass: boolean
  auto: boolean
}

/**
 * MODE_OPTIONS with the unavailable options marked (see ModeAvailability) - by the same trick already
 * used for unavailable models (see modelOptions): the entry is visible and understandable but not
 * clickable, instead of answering with an agent's error after the click.
 */
export const modeMenuOptions = (available: ModeAvailability): MenuOption[] =>
  MODE_OPTIONS.map((option) =>
    (option.id === 'auto' && !available.auto) || (option.id === 'bypassPermissions' && !available.bypass)
      ? { ...option, disabled: true }
      : option,
  )

/**
 * Remembers a mode the agent refused (for now only bypass: it does not depend on the model, only on an
 * organization's policy, so one refusal genuinely holds for the whole panel). For auto there is a memory
 * of its own, per model - see autoRefusedModels in App.tsx.
 */
export const withRefusedMode = (refused: string[], mode: string): string[] => {
  const known = normalizeMode(mode)
  return refused.includes(known) ? refused : [...refused, known]
}

/**
 * The next mode on Shift+Tab. The order and every branch repeat the terminal Claude Code one to one: Ask
 * → Accept edits → Plan → Bypass → Auto → Ask, with an unavailable mode simply stepped over. Everything
 * outside the cycle (Don't ask, and an unfamiliar name out of an old conversation) returns to the start -
 * which is what it does there too.
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
 * A mode's caption for the button in the bottom line. It is fixed width, and the full "Bypass
 * permissions" does not fit there - and should not: a button cannot change width when the mode changes,
 * that jerks the whole row.
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
 * Model families for the short caption in the bottom line. Apart from the catalogue: there the captions
 * are full ("Opus (1M context)"), while the button needs one word - it is fixed width and cannot jump
 * when the model changes.
 */
const MODEL_FAMILIES: { id: string; label: string }[] = [
  { id: 'fable', label: 'Fable' },
  { id: 'opusplan', label: 'Opusplan' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
]

/**
 * The model arrives as a full identifier - in the line we show an understandable name. About "1M" we say
 * so with a separate mark: such a model's context window is five times larger, and the family's name
 * alone does not tell one that.
 */
export const modelLabel = (model?: string): string => {
  if (!model) return DEFAULT_MODEL_LABEL

  const known = MODEL_FAMILIES.find((family) => model.toLowerCase().includes(family.id))
  const base = known?.label ?? model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
  return /\[1m\]/i.test(model) ? `${base} 1M` : base
}

/** The caption until the model is named either by a choice or by the agent itself. */
const DEFAULT_MODEL_LABEL = 'default'

/**
 * The longest caption that could end up on the button.
 *
 * The selector's width is measured by it rather than by whatever stands there right now. Otherwise every
 * model or mode change would change the button's width and with it the neighbours' positions: the whole
 * row would jerk over nothing.
 *
 * We count characters rather than real width: the value is set in the same monospaced font as the rest
 * of the feed - there longer is wider.
 */
const widestLabel = (labels: string[]): string =>
  labels.reduce((longest, label) => (label.length > longest.length ? label : longest), '')

/**
 * These three samples hold the width - the button draws them as an invisible spacer (see Selector). They
 * are assembled from the same lists the real captions come from, so that a new mode or model family
 * widens the button by itself, without an edit here.
 *
 * A model absent from the families (the CLI calls it its own way) may turn out longer - such a caption
 * is cut with an ellipsis but leaves the row alone. The full name is always in the hover tooltip.
 */
export const MODEL_SAMPLE = widestLabel([
  DEFAULT_MODEL_LABEL,
  ...MODEL_FAMILIES.flatMap((family) => [family.label, `${family.label} 1M`]),
])

export const EFFORT_SAMPLE = widestLabel(EFFORT_OPTIONS.map((option) => option.label))

export const MODE_SAMPLE = widestLabel(Object.values(MODE_SHORT))
