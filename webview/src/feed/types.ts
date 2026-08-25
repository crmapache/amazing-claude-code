/**
 * The kinds of feed item from the design. Each is drawn by a card of its own and comes from its own
 * place in the stream: some from an answer's blocks, some from calls of particular tools (the task
 * list, the plan, the questions), some from system events.
 */

/**
 * An attachment to a user's message: a file, an image, a folder, a command, or a piece of a file sent
 * from the editor.
 */
export type ChipKind = 'file' | 'img' | 'dir' | 'cmd' | 'ref' | 'quote' | 'paste'

export interface Chip {
  kind: ChipKind
  value: string
  /** The range inside a file for a reference from the editor, `L12:5-L18:30` for instance. */
  range?: string
  /** An image pasted from the clipboard: a data URL with bytes rather than a path on disk. */
  data?: string
  /**
   * The full text of something that has no path on disk to be re-read from: a quote out of the agent's
   * output and a collapsed paste from the clipboard. That text is the chip's whole content - it is what
   * travels to the agent, while the caption shows only its beginning.
   */
  text?: string
}

export type UserToken =
  /**
   * echo marks a piece of text the panel put in on the person's behalf rather than something they wrote:
   * that is how the agent's question itself lands in the feed beside the chosen answer (see
   * App.sendAnswers). In the card such a piece is dimmed - the question has already been read above, and
   * the attention should go to the answer to it.
   */
  | { kind: 'text'; value: string; echo?: boolean }
  | { kind: 'chip'; chip: Chip }

/** A piece of text inside a paragraph: plain, code, marked or bold. */
export interface TextPart {
  text: string
  code?: boolean
  mark?: boolean
  strong?: boolean
  /** The URL, when the piece is a link (a markdown link or a bare http/https address in the text). */
  href?: string
}

/** How a table's column is aligned - from the separator row (`:---`, `---:`, `:---:`). */
export type TableAlign = 'left' | 'center' | 'right' | undefined

export interface TableData {
  align: TableAlign[]
  header: TextPart[][]
  rows: TextPart[][][]
}

export interface Paragraph {
  bullet?: boolean
  /**
   * What marks a list item: "1." for a numbered one, empty for an ordinary one (a dash is drawn then).
   * The numbering is part of the meaning: "do step 3" cannot be read without numbers.
   */
  marker?: string
  /** The item's nesting level, from zero. Worked out from the source line's indentation. */
  depth?: number
  /**
   * A heading (`#`..`######`) - drawn bold, as before, but with a gap in front of it, so that it reads
   * as the start of a section rather than merging with the paragraph above.
   */
  heading?: boolean
  /**
   * A quote (the line starts with `>`) - a strip on the left and dimmed text, like a conversation inside
   * a conversation.
   */
  quote?: boolean
  /** A code block is drawn as a monospaced slab whole, without being broken into parts. */
  codeBlock?: boolean
  language?: string
  /** A table - a `| a | b |` row with a `|---|---|` separator after it. parts is then empty. */
  table?: TableData
  parts: TextPart[]
}

/** The chip category of a tool call. It sets both the caption and the colour. */
export type ToolChip = 'READ' | 'GREP' | 'EDIT' | 'WRITE' | 'BASH' | 'WEB' | 'MCP' | 'SKILL' | 'TOOL'

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
  /** The pieces of output the message refers to. They are shown with it in the feed. */
  quotes: string[]
}

export interface TextItem {
  id: string
  kind: 'text'
  paragraphs: Paragraph[]
  /**
   * The same answer before the markup was parsed. Needed for comparison with errors: the CLI can say one
   * and the same trouble twice - as the agent's message and as a line in stderr - and recognising an
   * already-shown answer inside a red slab is only possible by the original text (see addError).
   */
  source: string
}

/**
 * The model's thoughts - a card of their own rather than lines inside a group of calls: otherwise they
 * were lost among the tools inside the first collapsible group.
 *
 * One card for every thought in a piece of a turn, as one group holds every call in a row: between
 * calls the model thinks almost always, and every thought as a card of its own sliced the feed into
 * slivers - a call, a thought, a call, a thought - with nothing to read in them. The last one stands
 * outside (on one line, with an ellipsis after it), the rest open along with it.
 */
export interface ThinkItem {
  id: string
  kind: 'think'
  /** One per thought, in the order they appeared; the last one is visible from outside. */
  thoughts: string[]
  /** Still streaming - the card updates as the text arrives. */
  pending: boolean
}

export interface ToolItem {
  id: string
  kind: 'tool'
  chip: ToolChip
  /**
   * The tool's name and input are needed later: the result arrives as a separate event, while the diff
   * and the caption are built out of what was in the input.
   */
  toolName: string
  input: unknown
  target: string
  meta: string
  duration: string
  detail: DetailLine[]
  hunks: Hunk[]
  isError: boolean
  /** While there is no result, the line shows that the tool is still working. */
  pending: boolean
}

export interface ToolGroupItem {
  id: string
  kind: 'toolGroup'
  /** Consecutive calls of ordinary tools, unbroken by text or by another card. */
  tools: ToolItem[]
  /** Whether at least one call inside has not finished yet. */
  pending: boolean
  /** The exact time from the group's creation to the last result; while pending it ticks. */
  duration: string
  /** The moment the group was created - fixed, independent of what happens to state.startedAt. */
  startedAt: number
}

/**
 * How a task ended: on its own, by being stopped from outside, or with an error. It arrives as a status
 * in task_notification - before that every ending was drawn the same green, and a killed agent looked
 * like one that had finished successfully.
 */
export type TaskOutcome = 'ok' | 'stopped' | 'failed'

export interface TaskItem {
  id: string
  kind: 'task'
  /**
   * What the CLI itself calls this task. It does not always match the card's id: an agent launched by a
   * Task call is known to the card by the call's identifier, while the task's real name arrives after
   * it, in a system event about its start. Without it a task cannot be stopped - it is what one asks to
   * kill it by.
   */
  taskId?: string
  target: string
  meta: string
  duration: string
  percent: number
  log: DetailLine[]
  pending: boolean
  /** Empty while the task runs; after it ends, exactly how it ended. */
  outcome?: TaskOutcome
  /**
   * The subagent was launched in the background: the turn that called it ends without waiting for it,
   * and the result arrives later as a separate notification. Such a card survives even an interrupted
   * turn - Stop stops what the turn stood for, while the background work ran apart from it (see
   * keepTasks in closeUnfinished).
   *
   * The mark is optional, and all one may know by it is what it says: it is set by the "Async agent
   * launched" answer to a call in the main stream, while subagents raised by a skill have no such call
   * at all.
   */
  background?: boolean
}

/**
 * A command launched in the background (`run_in_background`). It already has a card of its own in the
 * feed - what lives here is only what the chip in the header needs: while the process runs, this is the
 * one place in the whole panel where it is visible at all. Such a task must not be called an agent,
 * although the CLI reports it with the same events (see task_type in build.ts).
 */
export interface BackgroundTask {
  id: string
  /** The Bash call that launched it - the command's card lies in the feed under it. */
  toolUseId?: string
  /** What it was launched with, in two words: `sandbox.sh`, `pnpm dev`. That is what stands on the chip. */
  label: string
  /**
   * The model's own human description of the command ("Bringing up the sandbox with the plugin"). It
   * does not fit on the chip - it lives in the hover tooltip.
   */
  description: string
  /**
   * The command itself, first line and whole. The chip's caption is two words of it, which is enough to
   * tell one chip from another and not enough to say what is running: a waiting loop and a build look
   * alike at that length. This is what the tooltip shows.
   */
  command: string
  duration: string
}

export type TodoState = 'todo' | 'active' | 'done'

export interface TodoEntry {
  id: string
  text: string
  state: TodoState
  /**
   * The same item named as the work happening right now: "Fix auth bug" → "Fixing auth bug". The model
   * writes it itself, and the terminal shows exactly that in its spinner while the item is in progress.
   * Optional: the model is free not to write it. The panel does not show this field anywhere at the
   * moment - it merely keeps it along with the item's other data.
   */
  activeForm?: string
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
   * The whole plan parsed as markdown - by the same parsing as an ordinary answer from the agent. This
   * used to hold "steps": lines cut out of the plan by their list marker. Everything that was not an
   * item (section headings, explanatory paragraphs, nested clarifications) was lost in the process,
   * markup inside an item showed up as raw asterisks, and the first path in backticks was cut out of the
   * text into a separate note - after which the sentence began with a comma.
   */
  paragraphs: Paragraph[]
  /**
   * A plan out of a past conversation's replay: the decision about it was taken (or not taken) some time
   * in the past, and holding the panel with it is not an option - otherwise a tab opened from the
   * history stands forever with "Waiting for you" under the feed and a "needs an answer" dot on its tab.
   * Such a card has no buttons anyway (see PlanCard.awaiting).
   */
  historic?: boolean
}

/**
 * One finding of a code review, exactly as the review tool reports it (see ReportFindings) - a place, a
 * claim about it, and the way it goes wrong.
 *
 * `failureScenario` is the whole of the evidence: concrete input and state on one side, the wrong output
 * on the other. It is what tells a real defect from a guess, and it is also the longest field of the
 * three - hence the row that opens rather than a list of paragraphs standing open in the feed.
 */
export interface Finding {
  file: string
  line?: number
  summary: string
  failureScenario: string
  /** A compressed label for the row's head, when the review sent one shorter than the summary. */
  shortSummary?: string
  /** The kind of the finding in one word: `correctness`, `simplification`, `efficiency`. */
  category?: string
  /** Set when the review ran a verify pass; absent on a review that only looked once. */
  verdict?: 'CONFIRMED' | 'PLAUSIBLE'
  /** What happened to the finding afterwards - only in a report re-sent after the fixes were applied. */
  outcome?: 'fixed' | 'skipped' | 'no_change_needed'
}

/**
 * A code review's findings as a card rather than as the raw JSON they arrive in - see readReview.
 *
 * They come from an ordinary answer rather than from a tool call: `/code-review` is run by the CLI
 * itself, and in streaming mode it hands the whole outcome back as text with a fenced block inside.
 */
export interface FindingsItem {
  id: string
  kind: 'findings'
  findings: Finding[]
}

export interface PermItem {
  id: string
  kind: 'perm'
  target: string
  meta: string
  command: string
  decision: 'once' | 'always' | 'deny' | null
  /**
   * Why it asked, when the asker was not the mode: a safety check, an `ask` rule, a hook, a classifier.
   * Empty means an ordinary question, and there must be no extra line in the card.
   */
  reason?: string
  /** Whether "Always allow" will work: no means there will be no button at all. */
  rememberable: boolean
  /** Unset means a decision of the main stream. Set means it belongs to a particular agent. */
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
  /** Unset means a question of the main stream. Set means a question of a particular agent. */
  taskId?: string
  /**
   * A question out of a past conversation's replay rather than a live turn.
   *
   * Such a question is not shown as a card: there is nobody left to answer it - the turn that asked
   * ended some time in the past - and the answer, if there was one, stands in the feed as the person's
   * very next message. A tab opened from the history would otherwise greet the person with a card of
   * options floating over the input field about a question from the week before last, and it would hold
   * the panel until closed.
   */
  historic?: boolean
}

export interface CheckpointItem {
  id: string
  kind: 'checkpoint'
  chip: string
  target: string
}

/**
 * A command run by the panel itself through "!" - not a tool call by the agent but the person's trip to
 * a terminal. It stands in the feed in its own place in time.
 *
 * The agent sees the output not here but appended to the next message - and only what managed to come
 * back by the time of sending. Anything sent while the command is still running travels without it, and
 * the output goes to the message after: the panel does not hold the agent's turn back for it. The card
 * in the feed honestly shows "running" the whole time, so what is missing is visible.
 */
export interface BashItem {
  id: string
  kind: 'bash'
  command: string
  /** stdout and stderr together, as they are seen in a terminal; empty while pending. */
  output: string
  /** Unset while the command runs. */
  exitCode?: number
  pending: boolean
}

export interface CompactItem {
  id: string
  kind: 'compact'
  target: string
  /** The compaction is still running - the card appears at once, before the outcome is known. */
  pending: boolean
}

export interface MetaItem {
  id: string
  kind: 'meta'
  stats: string[]
}

/** How a chain of retries ended: the request went through, the CLI gave up, or the turn was interrupted. */
export type RetryOutcome = 'recovered' | 'failed' | 'stopped'

/**
 * The server refused, and the CLI is waiting the refusal out to repeat the request.
 *
 * While that pause lasts, nothing happens in the conversation: no text, no calls, not even a question -
 * the request does not reach the model. From outside that looks like a hung panel, and this card is the
 * only honest account of what is going on. One card for the whole chain of attempts: they run one after
 * another, differing only by number and pause, and each on a line of its own would drown the feed.
 *
 * The chain has no event of its own for a successful end - it simply stops getting in the way, and the
 * ordinary stream carries on - so the card is closed by whatever happens next (see closeRetry in
 * build.ts).
 */
export interface RetryItem {
  id: string
  kind: 'retry'
  /** The refusal in the terminal's own words: "API overloaded", "Rate limited". */
  label: string
  attempt: number
  maxRetries: number
  /** When the next attempt goes - the countdown grows out of it. */
  retryAt: number
  /** How long the whole chain took. Empty while it runs. */
  duration: string
  pending: boolean
  /** Empty while the chain runs; after it, exactly how it ended. */
  outcome?: RetryOutcome
}

/**
 * The conversation moved to another model not by the person's doing - the CLI swapped it itself.
 *
 * It happens for reasons that have nothing to do with the panel: the chosen model's safeguards flagged
 * the message (a security audit reads as "cyber" to them), or the model needs credits that have not been
 * paid for. From that moment the answers are signed by the other model, the bottom line names it, and
 * without this card the only visible trace of the whole story is a selector that has "switched itself"
 * behind the person's back.
 *
 * So the card says three things at once: which model the conversation was on, which one it is on now,
 * and why - in the CLI's own words, the same ones the terminal shows (see AgentSystemEvent.content).
 * The reason is empty when the swap was noticed by the signature under an answer rather than announced
 * by an event of its own: nobody said why, and inventing a reason would be worse than saying nothing.
 */
export interface ModelSwitchItem {
  id: string
  kind: 'model'
  /** The model that was working until now - empty when the conversation opens straight on the new one. */
  from?: string
  to: string
  /** The CLI's explanation, as it stands; empty when the swap was noticed rather than announced. */
  reason: string
}

/** The conversation's process died on its own - a separate, unambiguous mark in the feed. */
export interface CrashItem {
  id: string
  kind: 'crash'
  message: string
}

/**
 * A refusal from the agent or the process - in its place in the chronology rather than as a pinned slab
 * over the input field.
 *
 * Pinned, it hung there until closed by hand - and half an hour into the work it still reported, say, a
 * limit that had long since reset. In the feed an error has what the slab lacked: a time. It travels
 * upwards along with the turn it happened in and stops passing itself off as the state of things right
 * now.
 */
export interface ErrorItem {
  id: string
  kind: 'error'
  message: string
  /**
   * The turn was stopped by an exhausted subscription limit rather than by a breakage. A separate mark,
   * because it is not the same thing: there is nothing to fix, one has to wait for the window to reset -
   * and a sound of its own calls about it.
   */
  limit?: boolean
}

export type FeedItem =
  | UserItem
  | BashItem
  | TextItem
  | ThinkItem
  | ToolGroupItem
  | TaskItem
  | TodoItem
  | PlanItem
  | FindingsItem
  | PermItem
  | AskItem
  | CheckpointItem
  | CompactItem
  | MetaItem
  | RetryItem
  | ModelSwitchItem
  | CrashItem
  | ErrorItem
