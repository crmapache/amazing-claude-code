import { isOpenablePath } from './paths'
import type { DetailLine, DiffLine, Hunk, ToolChip, ToolMeta } from './types'

/** How many lines of a tool's output are shown when it is expanded. */
const DETAIL_LIMIT = 60

const CHIPS: Record<string, ToolChip> = {
  Read: 'READ',
  NotebookRead: 'READ',
  Grep: 'GREP',
  Glob: 'GREP',
  Edit: 'EDIT',
  MultiEdit: 'EDIT',
  NotebookEdit: 'EDIT',
  Write: 'WRITE',
  Bash: 'BASH',
  BashOutput: 'BASH',
  KillShell: 'BASH',
  WebFetch: 'WEB',
  WebSearch: 'WEB',
  Skill: 'SKILL',
}

export const chipFor = (name: string): ToolChip => {
  if (name.startsWith('mcp__')) return 'MCP'
  return CHIPS[name] ?? 'TOOL'
}

/**
 * The tools that rewrite a piece of a file, and are therefore the ones with a diff.
 *
 * Asked in three places that must agree: the summary at the end of the row, the diff itself, and the
 * rule that keeps such a call out of a group so its diff stands open in the feed (see STANDS_ALONE in
 * build.ts). Written out three times, a fourth edit tool - or a rename of one - would part them in
 * silence, and the diff would go back to hiding inside a burst of calls, which is the exact breakage all
 * of this was written against.
 */
export const isEditTool = (name: string): boolean =>
  name === 'Edit' || name === 'MultiEdit' || name === 'NotebookEdit'

/**
 * The line of an edit to land on when the file opens - or nothing, and then it opens at the top.
 *
 * A place in the file is what the panel cannot ask for: the CLI answers an edit with a sentence about
 * success and no position at all, so what travels instead is a line of the change itself, and the IDE
 * finds it in the file it is about to show (see OpenInEditor).
 *
 * The longest added line rather than the first: the first is as often as not a brace or a blank, and a
 * search for "  {" lands confidently in the wrong part of the file - worse than not moving the caret. For
 * the same reason a change with nothing substantial in it sends nothing: the top of the file is an honest
 * answer, a wrong line in the middle is not.
 */
export const editAnchor = (hunks: Hunk[]): string => {
  const added = hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === 'add')
  const best = added.reduce<string>((longest, line) => {
    const text = line.text.trim()
    return text.length > longest.length ? text : longest
  }, '')

  return best.length >= ANCHOR_MIN_CHARS ? best : ''
}

/** Below this a line is too ordinary to be found by: a brace, a comma, a closing bracket. */
const ANCHOR_MIN_CHARS = 8

/** Whether the panel shows a file's path in the head of this call's card, and opens it on a click. */
export const filePathOf = (name: string, input: unknown): string => {
  // A pattern is not a file: Glob and Grep take a `path` too, but theirs is the directory to search
  // under, and an editor has nothing to open for one. Anything else is asked by name rather than
  // guessed: a third-party MCP tool with a `path` argument would otherwise get a link that promises an
  // editor and, half the time, opens nothing.
  if (!FILE_TOOLS.has(name)) return ''

  const data = asInput(input)
  const path = str(data.file_path) || str(data.notebook_path) || str(data.path)
  return isOpenablePath(path) ? path.trim() : ''
}

/** The tools whose argument is one file, named outright. */
const FILE_TOOLS = new Set([
  'Read',
  'NotebookRead',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
])

type ToolInput = Record<string, unknown>

const asInput = (input: unknown): ToolInput =>
  typeof input === 'object' && input !== null ? (input as ToolInput) : {}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A path is shown relative to the project: a full one does not fit and adds nothing. */
export const shortenPath = (path: string, workingDirectory: string): string => {
  if (!path) return ''
  if (workingDirectory && path.startsWith(workingDirectory)) {
    return path.slice(workingDirectory.length).replace(/^\//, '')
  }
  return path
}

/** Preparation for a run rather than the work itself: such a start of a command only clutters the caption. */
const SETUP_HEAD = /^(?:cd|source|export|\.)\s/

/**
 * Words that say how something runs rather than what runs.
 *
 * A shell loop is the case this exists for: out of `until curl … ; do sleep 10; done` the first two
 * words are `until` and `curl`, and a chip reading "until curl" answers nothing at all - every waiting
 * loop on the header looked the same. What is worth naming is what the loop keeps doing.
 */
const CONTROL_HEAD = new Set(['until', 'while', 'if', 'for', 'do', 'then', 'else', 'time', 'nohup', 'exec', 'command'])

/** `sh -c '…'` and its family: what runs is inside the string, not the shell that runs it. */
const SHELL = new Set(['sh', 'bash', 'zsh'])

/** `NODE_ENV=production pnpm build` - what tells about the command is the second word, not the first. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/**
 * A short caption of a command for a background work chip: what it was launched with, in two words. The
 * full line is not needed there - it is in the command's card in the feed whole, while the chip in the
 * header only answers "what is this that keeps running".
 *
 * A script's path is collapsed to the file's name, flags and arguments are dropped: out of
 * `cd /long/path && ./scripts/sandbox.sh --fresh` only `sandbox.sh` is left.
 */
export const commandLabel = (command: string): string => {
  const line = command.split('\n')[0]?.trim() ?? ''
  if (!line) return ''

  // A leading `cd … &&` or `source … &&` is a preamble before the business, and what the command was
  // launched for stands after it.
  const step =
    line
      .split('&&')
      .map((part) => part.trim())
      .filter(Boolean)
      .find((part) => !SETUP_HEAD.test(part)) ?? line

  // Everything up to the first word that names work: the loop keyword, the `env` assignments before it,
  // the shell that is only there to be handed a string.
  const words = unwrap(step.split(/\s+/).filter((word) => !ASSIGNMENT.test(word)))

  const head = words[0]?.split('/').pop() ?? ''
  if (!head) return ''

  const next = words[1]
  const takesNext = next && !next.startsWith('-') && !next.includes('/') && next.length <= 14
  return takesNext ? `${head} ${next}` : head
}

/**
 * Step past the words that only say how, and into the string a shell was handed.
 *
 * Both cases end the same way - the caption is taken from what genuinely runs - and both used to end
 * with a chip named after a keyword: "until curl", "sh -c".
 */
const unwrap = (words: string[]): string[] => {
  let rest = words
  while (rest.length > 1 && CONTROL_HEAD.has(rest[0] ?? '')) rest = rest.slice(1)

  const head = rest[0]?.split('/').pop() ?? ''
  if (!SHELL.has(head) || rest[1] !== '-c') return rest

  // What was quoted, without the quotes: `sh -c 'pnpm build && node dist'` is a run of pnpm.
  const inner = rest
    .slice(2)
    .join(' ')
    .replace(/^['"]|['"]$/g, '')
    .trim()

  return inner ? unwrap(inner.split(/\s+/)) : rest
}

export const targetFor = (name: string, input: unknown, workingDirectory: string): string => {
  const data = asInput(input)

  /**
   * Which skill is being run is the whole of the news about such a call, and it stood in the body: the
   * head read "Skill" and to learn whether this was `infra` or `deploy` the card had to be opened. The
   * arguments follow the name - the caption is clipped by the head's width, so the name is always seen.
   */
  if (name === 'Skill') {
    const skill = str(data.skill)
    if (skill) {
      const args = str(data.args).split('\n')[0]?.trim() ?? ''
      return args ? `${skill} ${args}` : skill
    }
  }

  const filePath = str(data.file_path) || str(data.notebook_path) || str(data.path)
  if (filePath) return shortenPath(filePath, workingDirectory)

  if (name === 'Bash' || name === 'BashOutput') {
    const command = str(data.command)
    return command.split('\n')[0] ?? name
  }

  const pattern = str(data.pattern)
  if (pattern) return pattern

  const url = str(data.url) || str(data.query)
  if (url) return url

  const description = str(data.description) || str(data.prompt)
  if (description) return description.split('\n')[0] ?? name

  return name
}

/**
 * The summary at the end of a tool's line, as a shape rather than as a sentence.
 *
 * The figures are the tool's own; the words around them are chosen when the card is painted (see
 * ToolMeta and ToolCard). Nothing here knows what language the panel is in, and it does not need to.
 */
export const metaFor = (name: string, input: unknown, result: string, isError: boolean): ToolMeta => {
  if (isError) return { kind: 'failed' }

  const data = asInput(input)

  if (name === 'Read' || name === 'NotebookRead') {
    const lines = countLines(result)
    return lines > 0 ? { kind: 'lines', count: lines } : { kind: 'none' }
  }

  if (name === 'Grep' || name === 'Glob') return { kind: 'matches', count: countLines(result) }

  if (isEditTool(name)) {
    const before = countLines(str(data.old_string))
    const after = countLines(str(data.new_string))
    return { kind: 'diff', added: Math.max(after - before, 0) + Math.min(before, after), removed: before }
  }

  if (name === 'Write') {
    const lines = countLines(str(data.content))
    return lines > 0 ? { kind: 'lines', count: lines } : { kind: 'none' }
  }

  if (name === 'Bash') return { kind: 'output', empty: result.trim().length === 0 }

  return { kind: 'none' }
}

export const detailFor = (result: string): DetailLine[] => {
  if (!result.trim()) return []

  const lines = result.split('\n')
  const shown: DetailLine[] = lines.slice(0, DETAIL_LIMIT).map((text) => ({ text, tone: toneOf(text) }))

  // The panel's own words about the output rather than a line of it, so they are put into the card in
  // whatever language it is being painted in (see DetailLine.note). Written into the feed as a finished
  // sentence, this was the one English line inside every Russian or Chinese card - and it is the most
  // common card there is.
  if (lines.length > DETAIL_LIMIT) {
    shown.push({
      text: '',
      tone: 'dim' as const,
      note: { kind: 'moreLines' as const, count: lines.length - DETAIL_LIMIT },
    })
  }

  return shown
}

const toneOf = (line: string): DetailLine['tone'] => {
  if (/^\s*(✓|✔|PASS|passed\b)/i.test(line)) return 'ok'
  if (/^\s*(✗|✘|FAIL|error\b|Error:)/i.test(line)) return 'bad'
  return 'dim'
}

/**
 * A piece of an edit to be shown in the feed.
 *
 * There is no real diff in the stream: the edit tool sends the old and the new text. So we cut off the
 * matching start and end and show the difference as removed and added lines - exactly what the design
 * draws.
 */
export const hunksFor = (
  id: string,
  name: string,
  input: unknown,
  result: string,
  /** The call failed. Then there is no diff at all: nothing was written - see below. */
  isError = false,
): Hunk[] => {
  if (!isEditTool(name)) return []

  /**
   * A failed edit changed nothing, so it has nothing to show.
   *
   * The diff is built out of what the agent asked to replace rather than out of what came back, and on a
   * refusal ("the text to replace was not found") that is a picture of a change that never happened -
   * struck-out old lines and green new ones over an untouched file. The card's own body is given up for
   * a diff (see applyToolResults), so the CLI's explanation was thrown away along with it: the person
   * was left with an invention instead of a reason.
   */
  if (isError) return []

  const data = asInput(input)
  const oldText = str(data.old_string)
  const newText = str(data.new_string)

  /**
   * A call that carries neither half is not an edit we can draw.
   *
   * `MultiEdit` keeps its pairs inside an `edits` array and `NotebookEdit` names a cell, so neither has
   * these fields at all - and out of two empty strings the arithmetic below produced one empty hunk
   * captioned "+0 -0". An empty diff is still a diff as far as the card is concerned, so the tool's real
   * answer was dropped and the caret that could have shown it was gone.
   */
  if (!oldText && !newText) return []

  const before = oldText.split('\n')
  const after = newText.split('\n')

  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++

  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++
  }

  const removed = before.slice(head, before.length - tail)
  const added = after.slice(head, after.length - tail)
  const startLine = firstLineNumber(result)

  const lines: DiffLine[] = []
  let n = startLine === null ? null : startLine + head

  const context = (text: string) => {
    lines.push({ n, sign: ' ', kind: 'ctx', text })
    if (n !== null) n += 1
  }

  if (head > 0) context(before[head - 1] ?? '')

  for (const text of removed) {
    lines.push({ n: null, sign: '-', kind: 'del', text })
  }

  for (const text of added) {
    lines.push({ n, sign: '+', kind: 'add', text })
    if (n !== null) n += 1
  }

  if (tail > 0) context(before[before.length - tail] ?? '')

  return [
    {
      id: `${id}-h1`,
      range: startLine === null ? '@@ edit @@' : `@@ ${startLine + head} @@`,
      note: `+${added.length} −${removed.length}`,
      lines,
    },
  ]
}

/** The edit tool returns a piece of the file with line numbers - we take the first number from there. */
const firstLineNumber = (result: string): number | null => {
  const match = /^\s*(\d+)\t/m.exec(result)
  if (!match) return null

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

const countLines = (value: string): number => {
  const trimmed = value.replace(/\n+$/, '')
  return trimmed.length === 0 ? 0 : trimmed.split('\n').length
}

/**
 * Duration in the design's style: fractions of a second for quick calls, whole ones for long calls.
 *
 * Past an hour, hours are added to the minutes, but the seconds stay: the minutes used to pile up
 * without a limit, and a background command launched the day before (the same dev server) was captioned
 * "1010m 08s" - a number the eye does not convert into hours. The seconds, meanwhile, tick with exactly
 * what shows that time is passing rather than standing still: without them a long turn looks frozen for
 * a whole minute.
 *
 * A negative span is shown as none at all rather than as a minus. Time does not run backwards, so a
 * negative one always means the two ends of it were read off two different clocks - which is a thing
 * that genuinely happens on the phone, where the start of a turn comes from the machine with the IDE
 * and "now" from the device in someone's hand (see mobile/clock.ts, where that difference is measured
 * and taken out). This is the floor under that measurement rather than a substitute for it: an estimate
 * can be off by a fraction of a second, and a caption reading "-0.2s" is worse than one reading "0.0s"
 * however small the error behind it.
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${(Math.max(0, ms) / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`

  // We carry the seconds' rounding up into the minutes ourselves: otherwise 59.6 seconds comes out as
  // "5m 60s" - a time that does not exist.
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, '0')}s`

  const paddedSeconds = String(seconds).padStart(2, '0')
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m ${paddedSeconds}s`
}

/** A tool result's text may be a string, a list of blocks or an object. */
export const resultToText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (content === null || content === undefined) return ''

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null && 'text' in item) {
          const text = (item as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return JSON.stringify(content, null, 2)
}
