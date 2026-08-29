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
  for (const [id, hint] of Object.entries(hints)) {
    if (seen.has(id) || UNAVAILABLE_IN_STREAM_MODE.has(id)) continue
    seen.add(id)
    entries.push({ id, hint: hint.description, argumentHint: hint.argumentHint, group: 'project' })
  }

  return entries
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
): LocalCommand | null => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  const [name = '', ...rest] = trimmed.slice(1).split(/\s+/)
  const argument = rest.join(' ')

  if (panelCommands(t).some((command) => command.id === name)) return { name, argument }

  // The values come from the same list as the hint and the menu in the bottom line - there would be
  // nothing for those three to drift over.
  const known = argumentOptions(t, name, models)?.some((option) => option.id === argument)
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
): CommandOption[] | undefined =>
  command === 'model'
    ? modelOptions(t, models).map((option) => ({ id: option.id, hint: option.sub ?? '' }))
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
): ArgumentQuery | null => {
  const match = /^\/([a-z]+) ([^\s]*)$/.exec(draft)
  if (!match) return null

  const command = match[1] ?? ''
  const options = argumentOptions(t, command, models)
  if (!options) return null

  return { command, query: match[2] ?? '', options }
}

export const matchArguments = (options: CommandOption[], query: string, limit = MAX_SUGGESTIONS): CommandOption[] => {
  const needle = query.toLowerCase()
  if (!needle) return options.slice(0, limit)

  return options.filter((option) => option.id.toLowerCase().startsWith(needle)).slice(0, limit)
}
