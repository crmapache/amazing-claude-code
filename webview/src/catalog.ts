import type { MenuOption } from './components/Menu'
import type { Dict } from './i18n/en'
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
export const modelCatalogue = (t: Dict): MenuOption[] => [
  { id: DEFAULT_MODEL, label: t.models.default.label, sub: t.models.default.sub },
  { id: 'opus', label: 'Opus', sub: t.models.opus.sub },
  { id: 'opus[1m]', label: t.models.opus1m.label, sub: t.models.opus1m.sub },
  { id: 'sonnet', label: 'Sonnet', sub: t.models.sonnet.sub },
  { id: 'sonnet[1m]', label: t.models.sonnet1m.label, sub: t.models.sonnet1m.sub },
  { id: 'haiku', label: 'Haiku', sub: t.models.haiku.sub },
  { id: 'opusplan', label: t.models.opusplan.label, sub: t.models.opusplan.sub },
]

/**
 * The CLI's catalogue in the shape the menu understands. An unavailable line is shown - exactly as the
 * terminal does - but marked: seeing that a model exists and why it cannot be chosen is more useful
 * than not seeing it at all.
 *
 * The CLI's own descriptions come in English and cannot be anything else - it does not know what
 * language this panel is in. So where its list names a model we have words for, ours are used: what the
 * catalogue decides is *which* models exist, which is the part only it can know. Anything unfamiliar
 * keeps the description the CLI gave it - an English line for one model reads better than no line.
 */
export const modelOptions = (t: Dict, models: ModelInfo[] | null): MenuOption[] => {
  const ours = modelCatalogue(t)
  if (models === null || models.length === 0) return ours

  return models.map((model) => {
    const known = ours.find((option) => option.id === model.value)

    return {
      id: model.value,
      label: known?.label ?? (model.label || model.value),
      sub: known?.sub ?? model.description,
      ...(model.disabled ? { tag: t.models.unavailable } : {}),
    }
  })
}

/**
 * One and the same model, whatever it is called this time.
 *
 * The same model reaches the panel under three different names at once, and they have to be brought
 * together before anything can be compared: a choice ("opus[1m]"), what the catalogue expands it into
 * ("claude-opus-5[1m]") and the signature under an answer ("claude-opus-5", and for some families with a
 * build date on the end - "claude-haiku-4-5-20251001"). What genuinely tells models apart is the family
 * and the generation; the window mark and the date say nothing about which model this is.
 *
 * Compared as strings, those names disagree with one another constantly, and every disagreement read as
 * "the conversation has moved to another model" - which is precisely what made the selector, five seconds
 * after a choice of "Opus (1M context)", start naming a bare "Opus" that stands in no menu.
 */
const modelKey = (model: string): string => {
  const bare = model.toLowerCase().replace(/\[.*\]$/, '')
  const family = MODEL_FAMILIES.find((option) => bare.includes(option.id))?.id ?? bare.replace(/^claude-/, '')
  const version = modelVersion(bare)

  return version ? `${family}-${version}` : family
}

/** Two names for one and the same model - see modelKey. */
export const sameModel = (one: string, other: string): boolean => modelKey(one) === modelKey(other)

/** A choice turned into the identifier behind it, when the catalogue knows one; otherwise as it is. */
const expandModel = (models: ModelInfo[] | null, model: string): string =>
  models?.find((option) => option.value === model)?.resolved || model

/**
 * Which model a given tab is genuinely working on - the same formula as the `model` variable in App.
 *
 * The choice, expanded through the catalogue, is the caption while the conversation runs on it: it is the
 * fullest of the names for one model - the signature under an answer loses the window mark, and by that
 * signature alone "Opus (1M context)" turned into a plain "Opus" a few seconds after being chosen, as if
 * the panel had reset the choice by itself. The stream's own name takes over only when it means another
 * model altogether - the CLI does swap them on its own (see ModelSwitchItem), and then the caption must
 * name what is genuinely at work.
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
): string => {
  const chosen = expandModel(models, prefsModel || DEFAULT_MODEL)
  const running = panel.pendingModel ?? panel.model
  if (!running) return chosen

  const actual = expandModel(models, running)
  return sameModel(chosen, actual) ? chosen : actual
}

/**
 * The model a conversation is genuinely working on, when it is not the one the setting names.
 *
 * The setting is one for every tab and project, while a model applies to the tab it was chosen in (see
 * ClaudeSessionHub.changeModel), and the agent may move a tab to another model itself mid-turn. Either
 * way the menu is obliged to tick what this conversation is actually busy with rather than what the
 * setting says (see modelMenu).
 *
 * It answers about the model alone and says nothing about whose doing the discrepancy is: the accent on
 * the MODEL button is drawn by the tab's own memory of a swap instead (see PanelState.switchedFrom) -
 * asking this question for it named a model chosen by hand in a neighbouring tab as the agent's doing.
 *
 * Empty when the model in force matches the chosen one or there is nothing to compare against: without
 * the catalogue it is unknown what the choice itself expands into ("default" - which one is that?), and
 * any discrepancy would be an invention.
 */
export const modelInForce = (
  models: ModelInfo[] | null,
  selected: string,
  actual: string | undefined,
): string | undefined => {
  if (!actual) return undefined

  const resolved = models?.find((option) => option.value === (selected || DEFAULT_MODEL))?.resolved
  if (!resolved) return undefined

  const running = expandModel(models, actual)
  return sameModel(resolved, running) ? undefined : running
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
  t: Dict,
  models: ModelInfo[] | null,
  selected: string,
  switched: string | undefined,
): { options: MenuOption[]; selected: string } => {
  const options = modelOptions(t, models)
  if (!switched) return { options, selected: selected || DEFAULT_MODEL }

  const known = models?.find((option) => option.resolved === switched || option.value === switched)
  if (known) return { options, selected: known.value }

  return {
    options: [...options, { id: switched, label: modelLabel(switched), sub: t.models.switchedItself }],
    selected: switched,
  }
}

/**
 * Strongest first, and `auto` above them all - the way the list is read rather than the way the values
 * grow. Reaching for this menu means reaching for more thinking, and what is reached for should not sit
 * at the bottom of a list that opens at its top.
 */
export const effortOptions = (t: Dict): MenuOption[] => [
  // The captions are the CLI's own flag values and stay as they are in every language: what is being
  // chosen here is literally the word that will be passed to it.
  { id: 'auto', label: 'auto', sub: t.effort.auto.sub },
  { id: 'ultracode', label: 'ultracode', tag: t.effort.tags.ultra, sub: t.effort.ultracode.sub },
  { id: 'max', label: 'max', tag: t.effort.tags.slow, sub: t.effort.max.sub },
  { id: 'xhigh', label: 'xhigh', sub: t.effort.xhigh.sub },
  { id: 'high', label: 'high', tag: t.effort.tags.default, sub: t.effort.high.sub },
  { id: 'medium', label: 'medium', sub: t.effort.medium.sub },
  { id: 'low', label: 'low', sub: t.effort.low.sub },
]

export const modeOptions = (t: Dict): MenuOption[] => [
  {
    // The name from the CLI's own flag. The panel called this mode `default` until the flag got a name
    // of its own; the old value arrives from saved settings and from the agent's events - normalizeMode
    // brings it to the current one.
    id: 'manual',
    label: t.modes.manual.label,
    tag: t.modes.tags.default,
    key: '⇧⇥',
    sub: t.modes.manual.sub,
  },
  {
    id: 'acceptEdits',
    label: t.modes.acceptEdits.label,
    key: '⇧⇥',
    sub: t.modes.acceptEdits.sub,
  },
  {
    id: 'plan',
    label: t.modes.plan.label,
    tag: t.modes.tags.readOnly,
    key: '⇧⇥',
    sub: t.modes.plan.sub,
  },
  {
    id: 'auto',
    label: t.modes.auto.label,
    tag: t.modes.tags.preview,
    // The refusal comes from the agent and is visible in the feed, but warning in advance is better: on
    // Haiku this mode is simply unavailable.
    sub: t.modes.auto.sub,
  },
  {
    id: 'dontAsk',
    label: t.modes.dontAsk.label,
    tag: t.modes.tags.settings,
    sub: t.modes.dontAsk.sub,
  },
  {
    id: 'bypassPermissions',
    label: t.modes.bypassPermissions.label,
    tag: t.modes.tags.danger,
    danger: true,
    // Not "skips every check": even in this mode the CLI asks about dangerous deletions and about what
    // is forbidden or marked "ask" in the settings. Promising complete silence would be a lie (see
    // PermissionReason on the IDE side).
    sub: t.modes.bypassPermissions.sub,
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

export const panelCommands = (t: Dict): CommandOption[] => [
  { id: 'resume', hint: t.commands.resume, local: true },
  { id: 'fork', hint: t.commands.fork, local: true },
  { id: 'login', hint: t.commands.login, local: true },
  { id: 'logout', hint: t.commands.logout, local: true },
]

export const builtinCommands = (t: Dict): CommandOption[] => [
  { id: 'model', hint: t.commands.model },
  { id: 'effort', hint: t.commands.effort },
  { id: 'context', hint: t.commands.context },
  { id: 'cost', hint: t.commands.cost },
  { id: 'usage', hint: t.commands.usage },
  /**
   * code-review has no frontmatter file - it is a command built into the CLI itself, neither a plugin nor
   * a skill. Its argument syntax was checked against the binary directly (strings over claude 2.1.220):
   * `] [--fix] [--comment] [<target>]` is assembled there with the depth levels joined by "|" - here it
   * is simply written out one to one.
   */
  {
    id: 'code-review',
    hint: t.commands.codeReview,
    argumentHint: '[low|medium|high|xhigh|max|ultra] [--fix] [--comment] [<target>]',
  },
]

/**
 * Brings a mode's name to the one we use. `default` is what this mode used to be called: it sits in
 * saved settings and may arrive from the agent, and the panel must not show an unfamiliar mode because
 * of that.
 */
export const normalizeMode = (mode: string): string => (mode === 'default' ? 'manual' : mode)

export const modeLabel = (t: Dict, mode: string): string =>
  modeOptions(t).find((option) => option.id === normalizeMode(mode))?.label ?? mode

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
export const modeMenuOptions = (t: Dict, available: ModeAvailability): MenuOption[] =>
  modeOptions(t).map((option) =>
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
const modeShort = (t: Dict): Record<string, string> => ({
  manual: t.modes.manual.short,
  acceptEdits: t.modes.acceptEdits.short,
  plan: t.modes.plan.short,
  auto: t.modes.auto.short,
  dontAsk: t.modes.dontAsk.short,
  bypassPermissions: t.modes.bypassPermissions.short,
})

export const modeShortLabel = (t: Dict, mode: string): string =>
  modeShort(t)[normalizeMode(mode)] ?? modeLabel(t, mode)

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
 * The generation out of a full identifier: "claude-opus-4-8" is 4.8, "claude-haiku-4-5-20251001" is 4.5.
 *
 * The dated tail is dropped - a build's date says nothing to anyone reading the bottom line, and it would
 * take up the whole button. Everything up to it is the version, dots instead of the dashes the identifier
 * writes it with.
 *
 * A choice rather than an identifier ("opus", "default", "opusplan") has no version at all, and there is
 * nothing to add to its caption.
 */
const modelVersion = (model: string): string => {
  const parts = model.toLowerCase().replace(/\[.*\]$/, '').split('-')
  const numbers = parts.filter((part) => /^\d+$/.test(part) && part.length < 5)
  return numbers.join('.')
}

/**
 * The model arrives as a full identifier - in the line we show an understandable name. About "1M" we say
 * so with a separate mark: such a model's context window is five times larger, and the family's name
 * alone does not tell one that.
 *
 * The generation stands in the caption too - "Opus 4.8" rather than a bare "Opus". The family alone was
 * enough while the panel only ever named the chosen model; it stopped being enough the moment the CLI
 * started moving conversations to another model by itself (see ModelSwitchItem): the guard's Opus 4.8 was
 * shown as plain "Opus", indistinguishable from the Opus that was chosen, and the swap read as the panel
 * fiddling with the selector behind one's back.
 */
export const modelLabel = (model?: string): string => {
  if (!model) return DEFAULT_MODEL_LABEL

  const known = MODEL_FAMILIES.find((family) => model.toLowerCase().includes(family.id))
  const named = known?.label ?? model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
  const version = known ? modelVersion(model) : ''
  const base = version ? `${named} ${version}` : named

  return /\[1m\]/i.test(model) ? `${base} 1M` : base
}

/** The caption until the model is named either by a choice or by the agent itself. */
const DEFAULT_MODEL_LABEL = 'default'

/**
 * How many columns a caption takes in the monospaced font the selectors are set in.
 *
 * Not its length: a Han character, a kana or a hangul syllable is drawn full width - two columns for one
 * character. Measured by length, the Chinese "不询问" (three characters, six columns) came out shorter
 * than "Don't ask" and the button was built too narrow for its own caption in half the languages the
 * panel now speaks.
 */
export const columns = (label: string): number =>
  [...label].reduce((total, character) => total + (isWide(character) ? 2 : 1), 0)

/** The ranges that are drawn full width: CJK and the kana, hangul and the fullwidth forms beside them. */
const isWide = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals and punctuation
    (code >= 0x3041 && code <= 0x33ff) || // kana, hangul compatibility jamo, CJK compatibility
    (code >= 0x3400 && code <= 0x4dbf) || // CJK extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK unified ideographs
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) || // hangul syllables
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) || // fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

/**
 * The longest caption that could end up on the button.
 *
 * The selector's width is measured by it rather than by whatever stands there right now. Otherwise every
 * model or mode change would change the button's width and with it the neighbours' positions: the whole
 * row would jerk over nothing.
 *
 * The value is set in the same monospaced font as the rest of the feed, so more columns is wider.
 */
const widestLabel = (labels: string[]): string =>
  labels.reduce((longest, label) => (columns(label) > columns(longest) ? label : longest), '')

/**
 * These three samples hold the width - the button draws them as an invisible spacer (see Selector). They
 * are assembled from the same lists the real captions come from, so that a new mode or model family
 * widens the button by itself, without an edit here.
 *
 * The rule they all obey: the reserve is the widest caption that can genuinely stand here, and not a
 * column more. A column no choice can ever fill is dead space on a button that already carries a label -
 * and it is dead space on all three of them at once, which is what used to push the row onto a second
 * line. The width itself does not move when the value does: that is the whole reason for the reserve.
 *
 * A model absent from the families (the CLI calls it its own way) may turn out longer - such a caption
 * is cut with an ellipsis but leaves the row alone. The full name is always in the hover tooltip.
 */

/**
 * The fallback reserve for MODEL, used until the CLI's own catalogue arrives - see [modelSample], which
 * is what the button actually measures itself by.
 *
 * The generation and the "1M" mark are counted in (see modelLabel): the widest real caption is a family
 * with both of them, and measuring by the bare family name would leave every such caption clipped. The
 * generation is counted as one digit, which is the shape every current one has - a decimal one ("4.5")
 * is two columns wider, and reserving for it in advance is reserving for a caption this installation
 * may well not have. The catalogue settles that question the moment it arrives.
 *
 * Opusplan is the exception - it is a mode of work rather than a model, and no version or window mark
 * ever stands beside it; counting it in with them would widen the button for a caption that cannot occur.
 */
export const MODEL_SAMPLE = widestLabel([
  DEFAULT_MODEL_LABEL,
  ...MODEL_FAMILIES.flatMap((family) =>
    family.id === 'opusplan' ? [family.label] : [family.label, `${family.label} 5 1M`],
  ),
])

/**
 * The room MODEL reserves for its value, measured against the models this installation actually offers.
 *
 * The catalogue is the only thing that knows which captions are reachable here: an organization's list,
 * a CLI newer than the panel, a family the panel has never heard of. Guessing at it in advance is how
 * the button came to reserve room for "Sonnet 4.5 1M" while the longest caption anyone could choose was
 * two columns shorter - and those two columns stood empty on the button whatever was picked in it.
 *
 * Until the catalogue arrives, the built-in shape stands in for it (see MODEL_SAMPLE). The reserve can
 * therefore settle once, in the first moment after the panel starts; it never moves on a choice, which
 * is the promise that matters.
 */
export const modelSample = (models: ModelInfo[] | null): string =>
  models === null || models.length === 0
    ? MODEL_SAMPLE
    : widestLabel([DEFAULT_MODEL_LABEL, ...models.map((model) => modelLabel(model.resolved || model.value))])

/**
 * What EFFORT says on the button, as opposed to in the menu.
 *
 * The same thing MODEL and MODE already do: the menu names the value in full ("Bypass permissions",
 * "claude-opus-5"), the button says it in the shortest form that is still unmistakable. Only "ultracode"
 * needs it - it is three columns longer than any other value, and those three columns stood empty on the
 * button for the other six. The word the CLI is actually given is untouched: this is a caption, and the
 * menu, the tooltip and the flag all still say "ultracode".
 */
const EFFORT_SHORT: Record<string, string> = { ultracode: 'ultra' }

export const effortShortLabel = (effort: string): string => EFFORT_SHORT[effort] ?? effort

/** Unchanged by the language: the flag's own values are what stands on this button. */
export const EFFORT_SAMPLE = widestLabel(
  ['auto', 'ultracode', 'max', 'xhigh', 'high', 'medium', 'low'].map(effortShortLabel),
)

export const modeSample = (t: Dict): string => widestLabel(Object.values(modeShort(t)))
