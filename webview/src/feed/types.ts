/**
 * The kinds of feed item from the design. Each is drawn by a card of its own and comes from its own
 * place in the stream: some from an answer's blocks, some from calls of particular tools (the task
 * list, the plan, the questions), some from system events.
 */

import type { WorkflowView } from './workflow'

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
   * Where those bytes were kept (see PastedFiles.kt) - a pasted picture's only path on disk.
   *
   * Absent for everything else: the other attachments carry their path in [value], and this one cannot -
   * the caption "Image #3" is what the chip is called, and the numbering is what tells two screenshots
   * apart. Absent too when the shell could not write the file, or is too old to know how.
   */
  path?: string
  /**
   * The full text of something that has no path on disk to be re-read from: a quote out of the agent's
   * output and a collapsed paste from the clipboard. That text is the chip's whole content - it is what
   * travels to the agent, while the caption shows only its beginning.
   */
  text?: string
}

/**
 * Where a change to the field came from, as the field itself reports it (see Composer.onTokensChange).
 *
 * The panel has to tell them apart because one of them means something about the person: `hand` is them
 * moving on from what they had, and things that are only true of what they had - the way back to a draft
 * before a rewrite, the takes they have already turned down - end there. The other two are the field
 * putting back or renumbering what is already in it, and a rule that read them as a hand on the keyboard
 * would quietly throw away what the person never touched.
 */
export type DraftEdit =
  /** Typed, pasted, dropped, a chip closed - the person themselves. */
  | 'hand'
  /** A step of the field's own undo history: the same words as before, not new ones. */
  | 'history'
  /** The captions of images renumbered after a message went out - nothing about the draft's meaning. */
  | 'renumber'

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
  /** Italic - `*so*` or `_so_`. Bold and italic are not exclusive: `***so***` is both. */
  em?: boolean
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
  /**
   * A line the panel wrote itself rather than one the tool printed.
   *
   * Set instead of `text`, not beside it: what the panel says about a call has to be said in whatever
   * language the panel is speaking when the card is painted, and prose stored in the feed would stay in
   * the language it was built in - a conversation half in one language after a switch. Tool output is
   * the opposite case and keeps `text` as it came.
   */
  note?: DetailNote
}

/** What the panel itself has to say on a line of a card - see DetailLine.note. */
export type DetailNote =
  /** A call that never got a result, and why it was closed anyway. */
  | { kind: 'closed'; reason: ClosedReason }
  /** A subagent that did not finish on its own. */
  | { kind: 'taskEnded'; outcome: TaskOutcome }
  /** A command launched in the background, and how it ended. */
  | { kind: 'backgroundEnded'; outcome: TaskOutcome; duration: string }
  /** The tool printed more than a card shows, and this is how much was left out. */
  | { kind: 'moreLines'; count: number }
  /** How many of a subagent's earliest steps were dropped to keep its log bounded. */
  | { kind: 'trimmed'; count: number }

/**
 * Why a call that never got a result was closed anyway.
 *
 * The card is told which of the four happened rather than what to say about it: the sentence is chosen
 * at painting time (see Rows and ToolCard), so a change of language repaints the whole feed instead of
 * leaving yesterday's cards in yesterday's words.
 */
export type ClosedReason =
  /** Out of a saved conversation: the transcript simply holds no result for this call. */
  | 'replay'
  /** The process died under it. */
  | 'exited'
  /** The person pressed Stop. */
  | 'stopped'
  /** The turn ended without this call ever reporting back. */
  | 'turnEnded'
  /**
   * A background command that outlived the process which launched it.
   *
   * Not the same as 'exited': the command is very likely still running - a dev server does not die with
   * the CLI - but there is nobody left to report about it, so the panel stops following it. Saying it
   * was interrupted would be a lie about a process that is alive.
   */
  | 'untracked'

/**
 * The short summary at the end of a tool's line - "· 42 lines", "· no matches", "· +12 −4".
 *
 * A shape rather than a sentence, for the same reason as [ClosedReason] above: the words belong to the
 * moment of painting. The numbers are the tool's own and travel as they are.
 */
export type ToolMeta =
  | { kind: 'none' }
  /** The call answered with an error. */
  | { kind: 'failed' }
  | { kind: 'lines'; count: number }
  | { kind: 'matches'; count: number }
  /** Whether a command printed anything at all - the one thing worth saying about a Bash result. */
  | { kind: 'output'; empty: boolean }
  | { kind: 'diff'; added: number; removed: number }
  /** The call was closed without a result - see [ClosedReason]. */
  | { kind: 'closed'; reason: ClosedReason }

export interface UserItem {
  id: string
  kind: 'user'
  time: string
  tokens: UserToken[]
  /** The pieces of output the message refers to. They are shown with it in the feed. */
  quotes: string[]
  /**
   * The transcript's own name for this message - what a search hit is jumped to by (see feed/search.ts).
   * Only a message read off the disk has one: the person's own live message is put into the feed at
   * the press of Send, before the CLI has written it anywhere, so a hit on it is found by its text.
   */
  uuid?: string
}

export interface TextItem {
  id: string
  kind: 'text'
  /** The transcript's own name for the answer this text is part of - see UserItem.uuid. */
  uuid?: string
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
  meta: ToolMeta
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
  /**
   * What the agent was actually asked, in full - the `prompt` of the Task call, cut to a readable length
   * (see TASK_PROMPT_CHARS in build.ts).
   *
   * `meta` beside it is one line: the model's own description of the errand, which is what the chip and
   * the card's head can hold. The whole errand is the thing one opens the card for - without it a
   * subagent was a name and a duration, and what it had been sent to do was nowhere on the screen.
   *
   * Absent for an agent a skill raised: it reaches the panel through system events, which carry the
   * description and no prompt at all.
   */
  prompt?: string
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
  /**
   * The inside of a workflow - its phases and the agents in them (see feed/workflow.ts).
   *
   * Only a `Workflow` call has one. Its agents reach the panel by no other route: their events carry no
   * mark of a subagent and never arrive in the stream at all, so without this the card is a single tool
   * call that goes quiet for ten minutes while forty agents work behind it.
   */
  workflow?: WorkflowView
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
  /**
   * The list came out of a past conversation's replay rather than out of a live turn.
   *
   * It is kept rather than dropped - the conversation genuinely had it, and the agent resumed from that
   * transcript still holds it - but the panel pinned over the input field is about what is being worked
   * on now, and after a replay nothing is (see latestTodo in App). A conversation opened from the
   * history put a list of yesterday's tasks over the field with one of them marked RUNNING.
   */
  replayed?: boolean
}

export interface PlanItem {
  id: string
  kind: 'plan'
  /** How many steps the plan has, counted by its top-level items. The card puts it into words itself. */
  steps: number
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

/**
 * How a permission card was closed. The first three are the person's decision; 'withdrawn' is nobody's -
 * the agent took the question back itself and there was nothing left to decide (see
 * PermissionChannel.Incoming.Withdrawn on the IDE's side).
 */
export type PermDecision = 'once' | 'always' | 'deny' | 'withdrawn'

export interface PermItem {
  id: string
  kind: 'perm'
  target: string
  /**
   * The permission mode the question was asked under, as the CLI names it ("bypassPermissions").
   *
   * The identifier rather than the caption, because the card is drawn long after the reducer ran: the
   * words are chosen when it is painted, so changing the panel's language repaints the whole feed
   * instead of leaving yesterday's cards in yesterday's language (see PermissionPanel).
   */
  mode: string
  command: string
  decision: PermDecision | null
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
  /** What the mark says, when the words are the CLI's or the conversation's own. */
  target: string
  /**
   * What the mark says, when the words are the panel's. Set instead of `target` - see DetailLine.note
   * for why the panel's own prose is never stored in the feed.
   */
  targetKey?: 'cleared' | 'earlier' | 'notKept' | 'notOnPhone'
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
  /** What the card says, when the words are the CLI's own (the error of a failed compaction). */
  target: string
  /** What the card says, when the words are the panel's - see [CompactOutcome]. */
  outcome?: CompactOutcome
  /** The compaction is still running - the card appears at once, before the outcome is known. */
  pending: boolean
  /**
   * When the compaction began, by the clock of the machine the IDE runs on.
   *
   * The percentage after the caption is counted from here rather than from a stopwatch started when the
   * card was drawn (see CompactRow). A stopwatch lives inside the card on screen, and everything that
   * rebuilds the feed from the journal - coming back to the IDE, a panel restored after a reload, a phone
   * joining - built a new card and started it at zero, so the figure walked back to nothing while the
   * compaction it describes went on running.
   */
  startedAt: number
}

/**
 * What became of a compaction, and the figures the sentence is built from.
 *
 * `manual` says who asked for it, `before`/`after` are the context in tokens either side. Both may be
 * missing: the CLI does not always say, and then the card says only that it happened.
 */
export interface CompactOutcome {
  state: 'running' | 'done'
  manual?: boolean
  before?: number
  after?: number
  took?: string
}

export interface MetaItem {
  id: string
  kind: 'meta'
  /**
   * The turn's result in English, and it stays English whatever the panel speaks.
   *
   * This is not a caption but a marker: it travels to the IDE, and NotificationReasons.kt reads
   * "Stopped by you" out of it to decide that an interrupted turn is not worth a push on the phone (see
   * STOPPED_BY_YOU in build.ts, and the same prefix in sounds.ts). Translate it and every non-English
   * user starts getting a notification for every Escape - silently.
   *
   * What is drawn on screen comes from [outcome] below instead.
   */
  stats: string[]
  /** How the turn ended and how long it took - the card's own words are chosen from these. */
  outcome?: { state: 'worked' | 'stopped'; duration: string }
}

/** How a chain of retries ended: the request went through, the CLI gave up, or the turn was interrupted. */
export type RetryOutcome = 'recovered' | 'failed' | 'stopped'

/**
 * Why the request was refused, as a fact rather than as a sentence about it.
 *
 * The words are chosen where the row is painted (see RetryRow), like every other line the panel writes
 * itself: the caption goes inside a translated frame (see stream.retryWaiting), so an English one drawn
 * from here left half a Russian sentence on screen.
 */
export type RetryReason = 'rateLimited' | 'overloaded' | 'auth' | 'error'

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
  /** Why the request was refused - see RetryReason. */
  reason: RetryReason
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
  /** The exit code, when the process left one. The sentence around it is built when the card is drawn. */
  exitCode?: number
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
}

/**
 * The subscription limit, in the feed rather than as a red refusal.
 *
 * The panel used to lay every "rejected" from the CLI down as an error, on the reading that a used-up
 * limit stops the work. It does not always: with extra usage the requests go through and are billed on
 * top of the plan, so the work carries on without a pause - the breakage sound, the cross and the red
 * were a false alarm about work that never stopped. And when it does stop, an error is still the wrong
 * word: nothing is broken and there is nothing to fix, one waits for the window - so the row says when.
 *
 * Hence two kinds rather than one:
 * - `extra` - the limit is used up, the work goes on for money. It stays in the feed: this is the mark
 *   of the moment the money started, and the ring in the composer's row is painted for as long as it
 *   lasts (see UsageMeters). The moment itself gets a sound of its own - not an alarm about a halt, but
 *   the one notice that the spending has begun (see sounds.ts).
 * - `waiting` - the work has genuinely stopped until [resetsAt]. It goes away by itself at that moment:
 *   a row saying "waiting until noon" at half past noon is worse than no row at all.
 */
export interface LimitItem {
  id: string
  kind: 'limit'
  state: 'extra' | 'waiting'
  /**
   * Which window ran out, as the CLI names it ("five_hour", "seven_day_opus"). Empty when it did not say.
   *
   * The identifier rather than the words, for the same reason as the mode on a permission card: the card
   * is drawn long after the reducer ran, so the wording is chosen at painting time and a change of
   * language repaints the whole feed rather than leaving old cards in the old language.
   */
  window: string
  /** When the window resets, in milliseconds; absent when the CLI did not say. */
  resetsAt?: number
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
  | LimitItem

/**
 * What the feed actually draws as a row of its own.
 *
 * The task list, the agent's question and a permission request live in the pinned panels over the input
 * field. They are all in the feed's items and none of them is on the screen the person scrolls (see
 * drawnInFeed in build.ts).
 *
 * A subagent's card used to be in this list too - it lived on its chip in the header alone. The chip is
 * hidden the moment the agent finishes and nobody is watching it (see hiddenTaskIds in App), so what an
 * agent had been sent to do and what it answered left the panel with it: the conversation kept no trace
 * of a launch at all. Now the card stands in the feed like any other call, and the chip is what it
 * always was - the way to watch one while it runs.
 */
export type FeedRowItem = Exclude<FeedItem, TodoItem | AskItem | PermItem>
