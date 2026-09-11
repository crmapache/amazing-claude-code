import { builtinCommands, effortOptions, modelOptions, panelCommands, type CommandOption } from '../catalog'
import type { Dict } from '../i18n/en'
import type { ModelInfo } from '../protocol'
import { endsOpen } from './tokens'
import type { Chip, UserToken } from './types'

/** Typed text only, without attachments - an attachment cannot be a slash command. */
export const plainText = (tokens: UserToken[]): string =>
  tokens.map((token) => (token.kind === 'text' ? token.value : '')).join('')

/**
 * Appends an attachment to the end of a token sequence with a space on either side - by the same logic
 * as an insertion at the caret in the field: without a space it merges with the already typed text into
 * one unreadable word.
 */
export const appendChip = (tokens: UserToken[], chip: Chip): UserToken[] =>
  appendSpaced(tokens, { kind: 'chip', chip })

/**
 * The same as [appendChip], but as ordinary text - for cases where the text itself has to be visible and
 * copyable literally (an absolute path, for instance) rather than a chip with a shortened caption.
 */
export const appendText = (tokens: UserToken[], text: string): UserToken[] =>
  appendSpaced(tokens, { kind: 'text', value: text })

const appendSpaced = (tokens: UserToken[], token: UserToken): UserToken[] => {
  const next = [...tokens]
  const last = next.at(-1)

  if (last?.kind === 'text' && endsOpen(last.value)) next.push({ kind: 'text', value: ' ' })

  next.push(token)
  next.push({ kind: 'text', value: ' ' })
  return next
}

/**
 * The slash command hint right inside the input field - as in a terminal.
 *
 * There must be no separate window with a list: a command is typed rather than picked out of a
 * catalogue, so the list narrows as one types and disappears as soon as the line stops being a command.
 */

export type CommandGroup = 'panel' | 'built-in' | 'project'

export interface CommandEntry extends CommandOption {
  group: CommandGroup
}

/**
 * These commands the CLI does not run in streaming mode, it honestly answers with a refusal (verified
 * against a live agent) - showing them in the hint serves nothing, the choice would end in a useless
 * answer rather than an action.
 */
const UNAVAILABLE_IN_STREAM_MODE = new Set(['export', 'permissions', 'status'])

/** The description and argument syntax read out of a command's or skill's frontmatter. */
export interface CommandHint {
  description: string
  argumentHint: string
}

/**
 * Whether two maps of hints say the same thing.
 *
 * The IDE re-reads the disk every couple of seconds and sends the map unasked once a minute whether it
 * changed or not, and every arriving message is a fresh object - so without this the panel repaints on
 * a schedule rather than on news. Compared by content and not by the order the keys arrived in: that
 * order is the order the IDE walked the directories in, and the file system does not promise it twice.
 */
export const sameHints = (
  one: Record<string, CommandHint>,
  other: Record<string, CommandHint>,
): boolean => {
  const names = Object.keys(one)
  if (names.length !== Object.keys(other).length) return false

  return names.every((name) => {
    const mine = one[name]
    const theirs = other[name]

    return (
      theirs !== undefined &&
      mine !== undefined &&
      mine.description === theirs.description &&
      mine.argumentHint === theirs.argumentHint
    )
  })
}

/**
 * The agent's slash command list arrives with the session whole - it is the same catalogue the terminal
 * sees, the commands of every connected MCP server included. Our own panel commands and the built-in
 * ones described in advance come first and are always available, even before the session's first event;
 * everything else out of the real list is appended after them without duplicates.
 *
 * `hints` is what the panel found on disk (the project's and the user's commands and skills, and those
 * of installed plugins): a real file always outweighs our own hardcoded list - if the user has a plugin
 * that defines a command with the same name as one of our BUILTIN_COMMANDS, that is its definition
 * rather than our guess.
 */
export const buildCommands = (
  t: Dict,
  cliCommands: string[],
  hints: Record<string, CommandHint> = {},
): CommandEntry[] => {
  const entries: CommandEntry[] = []
  const seen = new Set<string>()

  for (const command of panelCommands(t)) {
    seen.add(command.id)
    entries.push({ ...command, group: 'panel' })
  }

  for (const command of builtinCommands(t)) {
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

  // Commands and skills found on disk but not yet named by the agent.
  //
  // It sends its own list with the conversation's start (system:init), that is, only after the first
  // message has been sent - until then the hint knew nothing but the built-in commands, and a user's own
  // skill simply could not be found in it. Files on disk lie there whether a conversation has begun or
  // not, so we take names from there too: by the time the agent names its own, the list already
  // matches.
  //
  // By name rather than in the order the map arrived in. That order is the order the IDE walked the
  // directories in, and underneath it the order the file system chose to list them - it is not promised
  // to be the same twice, so the same set of files could redraw the list in a different order for no
  // reason at all. Sorted here, the panel stops depending on the map's order entirely. Plain comparison
  // rather than a locale-aware one: these are file names, and the panel speaks ten languages - a list
  // whose order followed the interface language would be a test that passes on one machine only.
  const onDisk: CommandEntry[] = []
  for (const [id, hint] of Object.entries(hints)) {
    if (seen.has(id) || UNAVAILABLE_IN_STREAM_MODE.has(id)) continue
    seen.add(id)
    onDisk.push({ id, hint: hint.description, argumentHint: hint.argumentHint, group: 'project' })
  }
  onDisk.sort((one, other) => (one.id < other.id ? -1 : one.id > other.id ? 1 : 0))

  return [...entries, ...onDisk]
}

/**
 * A row of the hint the person has chosen with the arrow keys, and the list it was chosen in.
 *
 * Held by id rather than by position: the IDE now looks at the disk every couple of seconds, and the
 * agent re-sends its own catalogue at the start of every turn, so a list can be replaced while a finger
 * is on the arrow keys. Held by position, the choice slides onto whatever moved into that slot, and
 * Enter runs a command nobody picked.
 */
export interface HeldChoice {
  id: string
  /**
   * What the list was built from when the choice was made - the query after the slash, the value after
   * a command's name, or the text after the "@". It also tells the three lists apart: the list stops
   * being one of commands and becomes one of files or of a command's values, where a held command name
   * would mean nothing.
   */
  list: string
  /**
   * How the row came to be chosen. The arrows and a hovering mouse light the same row and go through
   * the same handler, but they do not mean the same thing: stepping down is a decision, and a cursor
   * that drifted across an open list on its way somewhere else is not - see [handPicked].
   */
  by: 'key' | 'pointer'
}

/**
 * Which row of an open hint stays chosen when the list underneath it changes.
 *
 * Answers a position, because that is what the list itself is drawn from and what Enter reads - one
 * resolution, so the highlighted row and the row that runs cannot disagree. A row that is no longer
 * there gives the first one: it is the only answer where the screen and the key still say the same
 * thing (an unresolvable position used to leave nothing highlighted while Enter quietly ran the top
 * row), and keeping the old position instead would be the very thing this exists to prevent.
 *
 * A choice made in another list does not count, which is what tells the three lists apart: a command's
 * name is no answer inside a list of file paths.
 */
export const chosenRow = (rows: { id: string }[], held: HeldChoice | null, list: string): number => {
  if (rows.length === 0) return 0
  if (!held || held.list !== list) return 0

  const at = rows.findIndex((row) => row.id === held.id)

  return at === -1 ? 0 : at
}

/** What has been typed after the slash, or null when the field is no longer about a command. */
export const slashQuery = (draft: string): string | null => {
  if (!draft.startsWith('/')) return null

  const rest = draft.slice(1)
  // A space means the command has already been named and its arguments have begun.
  return /\s/.test(rest) ? null : rest
}

/**
 * The name of a command already typed in full, when a space follows it directly and nothing after that:
 * the argument's slot is still empty, exactly like a placeholder in an ordinary input. The $ at the end
 * is required - without it the format hint would hold on to the end of the whole message rather than go
 * out as soon as the argument's first character is typed. Unlike [argumentQuery] it is not tied to a
 * particular set of commands with enumerable values: it suits any name, hyphens and "plugin:command"
 * included.
 */
const COMMAND_NAME_BEFORE_ARGUMENT = /^\/(\S+)\s+$/

export const commandNameBeforeArgument = (draft: string): string | null =>
  COMMAND_NAME_BEFORE_ARGUMENT.exec(draft)?.[1] ?? null

/** The hint scrolls by itself - the limit guards against an endless list rather than against a full one. */
const MAX_SUGGESTIONS = 50

/** Matches on the beginning come first: that is what one is looking for while typing the first letters. */
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

/** A panel command together with its value, when it has one. */
export interface LocalCommand {
  name: string
  /** What was typed after the name: the choice of a model or an effort. For the rest it is empty. */
  argument: string
}

/**
 * A command the panel runs itself.
 *
 * Sending the sign-in, the sign-out and branching to the agent is meaningless: the first two are
 * unavailable to it in streaming mode in principle, and the third is about the panel's own workings.
 *
 * `/model` and `/effort` with a familiar value are ours too: the choice lives in the panel, is inherited
 * by new tabs and outlives an IDE restart. Sent as a turn they would cost a separate exchange with the
 * agent, whose answer ("for this session only") is untrue besides. An unfamiliar value is left to the
 * agent: it may know a model we do not.
 */
export const localCommand = (
  t: Dict,
  text: string,
  models: ModelInfo[] | null = null,
  /** The models added by hand: `/model` names them too, or the panel would send them on as prose. */
  custom: string[] = [],
): LocalCommand | null => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  const [name = '', ...rest] = trimmed.slice(1).split(/\s+/)
  const argument = rest.join(' ')

  if (panelCommands(t).some((command) => command.id === name)) return { name, argument }

  // The values come from the same list as the hint and the menu in the bottom line - there would be
  // nothing for those three to drift over.
  const known = argumentOptions(t, name, models, custom)?.some((option) => option.id === argument)
  return known ? { name, argument } : null
}

/**
 * The arguments of commands whose values come from a fixed set - exactly what the native terminal shows
 * as the hint's second step. The models come from the CLI's live catalogue (see modelOptions), the
 * effort from a list of its own: its set of values is the same across versions.
 */
const argumentSets = (t: Dict): Record<string, CommandOption[]> => ({
  effort: effortOptions(t).map((option) => ({ id: option.id, hint: option.sub ?? '' })),
})

/**
 * A command without its argument is meaningless - sending it as it is, Enter included, serves nothing.
 *
 * Asked by name alone rather than of the list above, because the answer is about which commands take an
 * argument at all: that is the same in every language, and building a translated list to look one name
 * up in it would be work for nothing.
 */
export const requiresArgument = (id: string): boolean => id === 'model' || id === 'effort'

/** A command's enumerable values, when it has any - for the argument's hint. */
export const argumentOptions = (
  t: Dict,
  command: string,
  models: ModelInfo[] | null = null,
  custom: string[] = [],
): CommandOption[] | undefined =>
  command === 'model'
    ? modelOptions(t, models, custom).map((option) => ({ id: option.id, hint: option.sub ?? '' }))
    : argumentSets(t)[command]

/** The name of a command typed in full and exactly one space after it - the field's start up to the caret. */
const COMPLETED_COMMAND = /^\/(\S+) $/

/**
 * Cuts the first `length` characters of typed text off the front - the piece the caret has already
 * passed over - and returns everything that is left.
 *
 * An attachment is indivisible: meeting one inside the piece being cut means this was not a head of
 * plain text at all, and then nothing is touched. The same when the text runs out before the length
 * does: what was measured is not what lies in the field.
 */
const withoutTextHead = (tokens: UserToken[], length: number): UserToken[] | null => {
  const rest: UserToken[] = []
  let left = length

  for (const token of tokens) {
    if (left === 0) {
      rest.push(token)
      continue
    }

    if (token.kind !== 'text') return null

    if (token.value.length <= left) {
      left -= token.value.length
      continue
    }

    rest.push({ kind: 'text', value: token.value.slice(left) })
    left = 0
  }

  return left === 0 ? rest : null
}

/** Removes one leading space - so that the one behind a chip and the one already typed do not double up. */
const withoutLeadingSpace = (tokens: UserToken[]): UserToken[] => {
  const first = tokens[0]
  if (first?.kind !== 'text' || !first.value.startsWith(' ')) return tokens

  const value = first.value.slice(1)
  return value ? [{ kind: 'text', value }, ...tokens.slice(1)] : tokens.slice(1)
}

/**
 * Puts ready tokens in place of the command being typed, keeping everything that stands after the caret.
 *
 * A command is the field's beginning rather than the whole of it: one may return to the start of an
 * already written message and put a command in front of it. Everything past the caret was typed before
 * the command and has to survive it untouched - the text, and the attachments in it too.
 *
 * `head` is the field's text from its start up to the caret (see headText): it is what is replaced.
 * Returns null when that head is not plain text - then there is nothing to replace here.
 */
export const replaceCommandHead = (
  tokens: UserToken[],
  head: string,
  replacement: UserToken[],
): UserToken[] | null => {
  const rest = withoutTextHead(tokens, head.length)
  if (rest === null) return null

  // The replacement ends in a space of its own (the caret stands on it), so a space already typed right
  // after would be the second one in a row - and it would travel to the agent that way.
  const last = replacement.at(-1)
  const spaced = last?.kind === 'text' && last.value.endsWith(' ')

  return [...replacement, ...(spaced ? withoutLeadingSpace(rest) : rest)]
}

/**
 * The moment a hand-typed command becomes a chip: the name is finished and a space has been put after
 * it. What follows is its argument - as ordinary text, as in a terminal, so only the name itself becomes
 * a chip.
 *
 * The name is read from `head` - the field's start up to the caret - rather than from the whole of the
 * contents: a command typed in front of an already written message is a command just the same, and the
 * message after it stays as it is. A head of null means there is no caret in the text at all, or an
 * attachment stands before it: with something in front of it a slash is no longer a command.
 *
 * An unfamiliar name is left alone: a chip promises that the command exists, and that promise has to be
 * true. Returns null when there is nothing to turn into one.
 */
export const captureCommand = (
  tokens: UserToken[],
  commands: CommandEntry[],
  head: string | null,
): UserToken[] | null => {
  if (head === null) return null

  const name = COMPLETED_COMMAND.exec(head)?.[1]
  if (!name || !commands.some((command) => command.id === name)) return null

  // The space after the chip stays: the caret needs somewhere to stand, and the argument needs something
  // to be separated from in the text that travels to the agent.
  return replaceCommandHead(tokens, head, [
    { kind: 'chip', chip: { kind: 'cmd', value: name } },
    { kind: 'text', value: ' ' },
  ])
}

/**
 * The command at a message's very start as a chip - for one that came into the field ready-made rather
 * than character by character.
 *
 * Typing turns a command into a chip at one exact moment: the space after a finished name (see
 * [captureCommand]). A command pasted from the clipboard never passes through that moment, and neither
 * does one sent with Enter right after its own name - there the hint has nothing left to substitute, so
 * Enter sends. The agent reads "/name" either way, but in the feed one of them stood as a chip and the
 * other as bare text: the same command looked like a different thing depending on how it had been
 * written.
 *
 * The name has to be a known one, as everywhere else: a chip promises that the command exists.
 */
export const captureWrittenCommand = (tokens: UserToken[], commands: CommandEntry[]): UserToken[] | null => {
  const first = tokens[0]
  // Only the field's start: a slash with anything in front of it is not a command (see [commandChip]).
  if (first?.kind !== 'text') return null

  const name = /^\/(\S+)/.exec(first.value)?.[1]
  if (!name || !commands.some((command) => command.id === name)) return null

  const head = `/${name}`
  const chip: UserToken = { kind: 'chip', chip: { kind: 'cmd', value: name } }
  // The space only where nothing follows the name: an argument brings its own separator, and a second one
  // would travel to the agent inside the message.
  const replacement = first.value.length > head.length ? [chip] : [chip, { kind: 'text' as const, value: ' ' }]

  return replaceCommandHead(tokens, head, replacement)
}

/** A command that has already become a chip: it is always first - a command with something before it is not a command. */
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
 * The command's name has been typed and exactly one space follows it - what comes next is its argument,
 * and if the command supports one, it needs a hint too.
 */
export const argumentQuery = (
  t: Dict,
  draft: string,
  models: ModelInfo[] | null = null,
  custom: string[] = [],
): ArgumentQuery | null => {
  const match = /^\/([a-z]+) ([^\s]*)$/.exec(draft)
  if (!match) return null

  const command = match[1] ?? ''
  const options = argumentOptions(t, command, models, custom)
  if (!options) return null

  return { command, query: match[2] ?? '', options }
}

export const matchArguments = (options: CommandOption[], query: string, limit = MAX_SUGGESTIONS): CommandOption[] => {
  const needle = query.toLowerCase()
  if (!needle) return options.slice(0, limit)

  return options.filter((option) => option.id.toLowerCase().startsWith(needle)).slice(0, limit)
}

/**
 * Whether the choice standing over this list was put there by a hand on the arrow keys.
 *
 * Any edit to the field clears it (see the composer), so a choice that is still here and still belongs
 * to this list is a deliberate one - which is the whole of what [enterSends] needs to know. The mouse
 * is not counted: hovering lights a row through the same handler, and a cursor left lying over an open
 * list would otherwise turn Enter from "send" into "substitute" without anybody having decided that.
 */
export const handPicked = (held: HeldChoice | null, list: string): boolean =>
  held !== null && held.list === list && held.by === 'key'

/**
 * Whether Enter over an open hint sends what is typed instead of substituting the chosen row.
 *
 * [typedInFull] alone is not the answer, and that was the defect. Reading only the text, Enter sent the
 * typed name even when the person had stepped down onto a neighbouring row - and while the names in a
 * list do not overlap that is invisible, but the moment one typed name is the beginning of another
 * (this machine has such pairs right now) the row lit up on screen and the row that ran were different
 * commands. The same went for a command's values: one model chosen, another applied. Tab substituted
 * correctly all along, so two keys over one list had come to mean different things.
 *
 * So an explicit choice outranks the rule. Nothing chosen by hand, and it is exactly as before: a name
 * typed in full means send, because substituting a second time serves nothing.
 */
export const enterSends = (typedInFull: boolean, held: HeldChoice | null, list: string): boolean =>
  typedInFull && !handPicked(held, list)
