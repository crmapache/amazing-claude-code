/**
 * The format the interface talks to the plugin's shell in.
 *
 * The shell does not parse the agent's events, it forwards them as they are, so their shape is
 * described here too: this is the one place where knowledge about the Claude Code stream lives.
 */

export type SessionKind = 'main' | 'branch'

export interface SessionInfo {
  id: string
  title: string
  /**
   * Where the name came from - it decides whether it may be overwritten. The shell keeps this now
   * rather than the interface alone: a second client did not see the first message and cannot tell a
   * guessed name from one the model picked.
   */
  titleSource: TitleSource
  kind: SessionKind
  /** The conversation a fork grew out of. Absent for a root tab. */
  parentId?: string
  /** The root of the chain: forks and forks of forks carry one and the same one. */
  groupId: string
  /** The branching depth: 0 is a root, 1 a fork, 2 a fork of a fork. */
  depth: number
  status: AgentStatus
  /**
   * The conversation is stopped waiting for a person - a permission, a plan, a question. This is what
   * a list of sessions is really for: a running turn is work in progress, while a stopped one will not
   * move until you touch it.
   */
  awaitsYou: boolean
  /** Its process died on its own since the last turn. */
  crashed?: boolean
  /** The quote a side branch grew out of. Empty for the main session. */
  quote?: string
}

/** A paired device, as the IDE lists it. */
export interface RemoteDevice {
  id: string
  /** What the device called itself - untrusted by definition, since it is the device that says it. */
  label: string
  fingerprint: string
  pairedAt: number
  lastSeenAt: number
}

/** Where a tab's name came from - see SessionInfo.titleSource. */
export type TitleSource = 'default' | 'heuristic' | 'llm'

/** One subscription usage window: the share and when it resets. */
export interface UsageWindow {
  percent: number
  resets: string
}

/**
 * Extra usage: the work an exhausted limit no longer covers, paid for on top of the plan.
 *
 * `active` is the whole point of it - the work is going past the limit RIGHT NOW - and it is learned
 * from the agent's own limit events rather than from a question (see ClaudeRateLimit on the plugin's
 * side). The rest is the account's settings, which merely explain what is happening: whether extra
 * usage is allowed at all and how much of its monthly budget has gone.
 */
export interface ExtraUsage {
  active: boolean
  /**
   * Which window is being paid past, in the CLI's words: `five_hour`, `seven_day`, `seven_day_opus` and
   * so on. It decides which of the two rings burns and what the window is called in words (see
   * limitWindowName and limitWindowRing in feed/usage.ts). Absent when the CLI did not say.
   */
  window?: string
  enabled?: boolean
  percent?: number
}

/** A past conversation: the person's first message serves as its title. */
export interface HistoryEntry {
  id: string
  title: string
  updatedAt: number
  messages: number
  /**
   * Where the name came from - the model's own or a guess off the first line. A conversation carried on
   * in a tab keeps it, and a guess is the one a fresh name may replace (see sessionTitle).
   */
  titleSource?: TitleSource
}

/** Where a typed search looks: the conversation in the tab, or every conversation of the project. */
export type SearchScope = 'chat' | 'project'

/**
 * One thing the model did while searching (see AiStep on the IDE's side).
 *
 * A kind and a subject rather than a sentence: the words belong to the panel, which speaks ten
 * languages, and this is a fact about the run. `subject` is the pattern it searched for, or the title
 * of the conversation it opened.
 */
export interface SearchProgressStep {
  kind: 'grep' | 'read' | 'list' | 'other'
  subject: string
}

/**
 * One matched word as the feed paints it (see matchSpans in feed/searchText.ts, and Painted on the
 * IDE's side, where the rule lives). The panel applies it and knows no rule of its own.
 */
export interface PaintedTerm {
  /** The word as the index folds it - what a word on screen is compared with. */
  term: string
  /**
   * How many of its characters the query accounts for: the typed part of a word found by its beginning,
   * the stem of one found by its stem, the whole of one found by a typo. "use" lights the "Use" of
   * UserCard and no more.
   */
  paint: number
  /** Under Match case, what those characters have to be, exactly as typed. */
  text?: string
  /** Under Whole words, only a run of its own counts - not a camel-case part of a longer one. */
  whole?: boolean
}

/**
 * One message the search found - enough to show it in the list, to open the conversation it is in and
 * to jump to it there (see feed/search.ts). The words are found on the IDE's side, where the index is
 * (see SearchIndex and TextIndex.kt); the panel only draws.
 */
export interface SearchHit {
  /** The conversation the message is in - what resumeSession opens, what tabHolding recognises. */
  conversationId: string
  /** The transcript's own name for the message - what the feed scrolls to (see UserItem.uuid). */
  uuid: string
  speaker: 'you' | 'claude'
  /** Epoch milliseconds by the IDE's clock; zero when the transcript kept no time. */
  at: number
  /** The conversation's title, as the history lists it. */
  title: string
  /** Whether that title is the model's own rather than a guess off the first line - see HistoryEntry.titleSource. */
  named: boolean
  /** How many messages that conversation holds - what stands under its title where the list groups by it. */
  messages: number
  /** The whole message's length in characters, so an unfolded one can say how much of it is shown. */
  length: number
  /** A piece of the message around the first matched word, with an ellipsis where it was cut. */
  snippet: string
  /** Where the matched words stand in the snippet, as [start, end) pairs - what the list paints. */
  spans: [number, number][]
  /** The message itself, up to a budget - what unfolds under the snippet. */
  text: string
  truncated: boolean
  /** The model's one sentence on why it picked this - only on the hits of a described search. */
  reason?: string
}

/**
 * One MCP server the way the CLI itself sees it (the mcp_status answer). The statuses and the scopes
 * are its words rather than ours: the panel is obliged to call a server's state what the terminal
 * calls it.
 *
 * status: connected | needs-auth | failed | pending | disabled
 * scope: project | user | local | dynamic (plugins and built-ins) | claudeai
 */
export interface McpServerInfo {
  name: string
  status: string
  scope: string
  /** stdio, http, sse, claudeai-proxy - what the server connects with. */
  transport: string
  /** A command with its arguments, or an address - what the server comes up by. */
  command: string
  /** Filled in only for a failed one: an explanation from the CLI itself. */
  error: string
}

/**
 * One Claude account the panel may run conversations on.
 *
 * What the panel is told is who, never how: there is no store directory here, no keychain service name
 * and no credential. It could not leak one if it wanted to - the plugin does not hold any (the CLI
 * files each account's own, in the system's store), and this shape is the whole of what crosses into
 * the page.
 */
export interface AccountInfo {
  /** Opaque and stable - a digest of the address and the organisation, not a counter. */
  id: string
  /**
   * The person's own name for it - "Work", "Home". Empty when none was given, and then the address is
   * shown instead. A name given on purpose beats one Anthropic assigned.
   */
  alias: string
  email: string
  /** `max`, `pro`, `team` - the CLI's own word. Data, never translated. */
  plan: string
  /** A sign-in still going: the terminal is open and nothing has landed in its drawer yet. */
  pending?: boolean
  /**
   * The sign-in Claude Code already had - the one every machine has before this feature is touched.
   *
   * It has no credential drawer of its own (its id is the empty string): it IS the CLI's own store. So it
   * can be switched back to and renamed, but never forgotten - the only thing that could mean is signing
   * the person out of Claude Code altogether.
   */
  isDefault?: boolean
  /**
   * Whether a credential is filed for it - PRESENCE, not validity, and the words on screen say so.
   * The CLI answers "signed in" for any credential that parses, including one revoked last week; only
   * spending it proves anything, which is what the figures beside the row do.
   */
  health?: 'present' | 'absent' | 'unknown'
}

/** An installed plugin: the id already holds the marketplace - "name@marketplace". */
export interface InstalledPluginInfo {
  id: string
  version: string
  scope: string
  enabled: boolean
}

/** A plugin from a marketplace's catalogue, not installed yet - what the search runs over. */
export interface AvailablePluginInfo {
  id: string
  name: string
  description: string
  marketplace: string
  installCount: number
}

/** A connected marketplace - the source of the available plugins catalogue. */
export interface PluginMarketplaceInfo {
  name: string
  source: string
}

/**
 * One line of the model catalogue - exactly what `/model` shows in a terminal.
 *
 * The list comes from the CLI itself (the list_models control request): which models are available is
 * decided by the account, the provider and the organization's policy, while names and captions change
 * with versions - keeping a copy of our own means showing something other than what is there, sooner
 * or later.
 */
export interface ModelInfo {
  /** What goes back to the CLI: "default", "opus[1m]", "claude-fable-5[1m]" and so on. */
  value: string
  label: string
  description: string
  /**
   * What the CLI expands this value into ("claude-opus-5[1m]"). The bottom line names the model that is
   * genuinely working by it: behind "Default" there may be anything, and the single word "default" on a
   * button is not enough.
   */
  resolved: string
  /** Visible in the list but not choosable - that is how the terminal shows them too. */
  disabled?: boolean
}

/**
 * One message waiting for the turn in progress to end, as every client sees it.
 *
 * A row's worth and no more. What the message is actually made of - the chips it was typed with, the
 * bytes of a photo taken on a phone - stays in the IDE, which is what will send it (see SessionQueue.kt):
 * a queued photo is measured in hundreds of kilobytes and the frame to a phone has a limit of 256.
 */
export interface QueuedMessage {
  id: string
  text: string
  /** What the row shows beside the text - "3 refs". Empty when the message carried no attachments. */
  attach: string
  /** How many images travel with it - the numbering of the next one carries on past them. */
  images: number
}

/**
 * A scenario: the round of work somebody repeats, written down once so the panel can walk it.
 *
 * The same shape the IDE keeps on disk (see scenario/Scenario.kt) - one description of one thing, read
 * by the editor that writes it and by the timeline that draws a run of it.
 */
export interface Scenario {
  version: number
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** What the person is asked for when they press play - written into card text as {{name}}. */
  inputs: ScenarioInput[]
  /** The session that runs the whole thing and decides what the cards were asking about. */
  head: ScenarioHead
  stages: ScenarioStage[]
  /**
   * Which shelf it was read off: the repository, or the person's own Claude home.
   *
   * Not part of the file - the shelf is where the file lies, not what it says. It travels with the
   * scenario because everything that names one has to name the shelf too: two scenarios on two shelves
   * are allowed to carry the same identifier, and a delete that did not say which one it meant would be
   * a delete of whichever was found first.
   */
  scope: ScenarioScope
  /**
   * It travelled without its prose - every prompt, definition of done and hand-on emptied.
   *
   * True only on the way to a phone, where the shelves carry the shape of a scenario and nothing else
   * (see RemoteFeed.trimmedScenarios): a card's prompt is pages and no list draws a word of it.
   *
   * It is here because the rules would otherwise be read against a skeleton and answer confidently that
   * every card is missing its prompt - a shelf where every row says "needs fixing before it can run"
   * while the same scenarios run perfectly at the desk. What a screen holding one of these may say about
   * it is what the IDE told it; what it cannot do is judge it. The editor is never handed one - it asks
   * for the scenario whole (see `scenarioFetch`).
   */
  trimmed?: boolean
}

export type ScenarioScope = 'project' | 'user'

export interface ScenarioInput {
  id: string
  /** What a card's text writes as {{name}}. */
  name: string
  label: string
  placeholder: string
  required: boolean
}

/** What runs the show: one session for the whole run, and how much it is allowed to decide. */
export interface ScenarioHead {
  briefing: string
  /** Empty means whatever a new tab would start with, for both. */
  model: string
  effort: string
  /** What a card is trusted with before it has to stop and ask - the default every card falls back to. */
  permissionMode: string
  /** 'head' answers a card's question itself; 'stop' stands the run still and waits for a person. */
  onQuestion: 'head' | 'stop'
  /** How many times the head may send one card back to work before giving up on it. */
  retries: number
}

export interface ScenarioStage {
  id: string
  title: string
  /** How many passes, the first included. */
  repeat: number
  /** Whether `repeat` is a ceiling the head may stop short of, rather than an exact count. */
  untilDone: boolean
  cards: ScenarioCard[]
}

/**
 * One thing said to one session of its own.
 *
 * `prompt` is the work and is said to the card's own session. `dod` and `after` are read by the head:
 * they are how it knows the card is finished and what to carry forward. Which of the two a field speaks
 * to is the whole of understanding a card.
 */
export interface ScenarioCard {
  id: string
  title: string
  prompt: string
  slots: ScenarioCardSlot[]
  dod: string
  after: string
  /** Empty means "the same as the head" for all three. */
  model: string
  effort: string
  permissionMode: string
}

export interface ScenarioCardSlot {
  id: string
  /** Written in the prompt as [[name]] and filled by the head from what the cards above found out. */
  name: string
  description: string
}

export type ScenarioRunState =
  | 'starting'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'stopped'

export type ScenarioStepState =
  | 'waiting'
  | 'running'
  | 'asking'
  | 'judging'
  | 'paused'
  | 'done'
  | 'failed'
  | 'skipped'

/**
 * A scheduled run: a scenario set to start by itself at an hour somebody chose (see ScenarioSchedule on
 * the IDE's side).
 *
 * Kept on the machine rather than in the scenario's file: the round of work is worth sharing through the
 * repository, "at nine, on my machine, with this branch" is one person's arrangement with their own day.
 *
 * A scenario may have as many of these as somebody wants, which is what `id` is for. They are drawn as a
 * list of their own under the shelves, each editable and removable on its own.
 */
export interface ScenarioSchedule {
  /** This arrangement's own name, and the only thing that tells two hours of one scenario apart. */
  id: string
  scenarioId: string
  scope: ScenarioScope
  /** Minutes from midnight in the machine's own timezone: 9:30 is 570. */
  at: number
  repeat: ScenarioRepeat
  /** For a weekly hour: the day, as java.time numbers them - Monday is 1, Sunday is 7. */
  weekday: number
  /** The answers to the scenario's own questions: at the hour there is nobody to ask. */
  inputs: Record<string, string>
  /**
   * When it is next due, in epoch millis, or 0 when nothing is coming.
   *
   * Zero means a one-off whose hour passed without starting anything. One that DID start something is not
   * here at all any more: its trace is the run itself, in the list of past runs, and a list of what is
   * going to happen must not fill up with things that already have.
   */
  nextAt: number
  /** When it last started something. */
  lastAt: number
  /**
   * When its hour came and nothing happened: the IDE was closed, the CLI was missing, or a run this same
   * arrangement started was still going.
   */
  missedAt: number
}

export type ScenarioRepeat = 'once' | 'daily' | 'weekdays' | 'weekly'

/**
 * One run of one scenario: the timeline as it happens and as the history keeps it.
 *
 * `snapshot` is the scenario exactly as it was when the button was pressed, and it is what the timeline
 * is drawn from. A run drawn against today's scenario would be a picture of work that never happened -
 * and a scenario somebody deleted would leave its runs with no picture at all, which is exactly when
 * anybody wants to look at them.
 */
export interface ScenarioRun {
  id: string
  scenarioId: string
  scenarioName: string
  scope: ScenarioScope
  snapshot: Scenario
  startedAt: number
  finishedAt: number
  state: ScenarioRunState
  /**
   * The scheduled arrangement that raised this, empty for a hand on the button.
   *
   * Nothing draws it. It is here because the whole record travels and a field quietly dropped on the way
   * out is a shape that depends on which side of the wire it is read from; what reads it is the IDE's own
   * clock, which will not raise a second run from an arrangement whose last one is still going.
   */
  runFrom: string
  inputs: Record<string, string>
  /** How many cards this run intended to start, every pass counted - what the bar is drawn from. */
  total: number
  /** The head's own conversation, once it has one. Its log is opened like any step's. */
  headConversationId: string
  /**
   * Time the run was not a run: the gap between an ending and the moment it was picked up again (see
   * `scenarioContinue`). Subtracted from every clock drawn over it. Absent on a record written before
   * there was such a thing.
   */
  idle?: number
  /** Every card of every pass, in the order they were planned - loops written out flat. */
  steps: ScenarioRunStep[]
  /** What the head said in words as it went, wedged into the timeline where it was said. */
  notes: ScenarioRunNote[]
  question: ScenarioRunQuestion | null
  failure: string
  error: string
  cost: number
  /**
   * How many tokens it has burnt, the head's own turns included.
   *
   * Beside the money rather than instead of it: what it cost is what came off the plan, while the tokens
   * are the size of the work - the figure that says whether a step read half the repository.
   */
  tokens: number
}

export interface ScenarioRunStep {
  /** stage:card:pass - one go at one card, which is not the same as one card. */
  key: string
  cardId: string
  stageId: string
  pass: number
  title: string
  state: ScenarioStepState
  /** The conversation it spoke in. Also how its log is found - a step is an ordinary conversation. */
  conversationId: string
  startedAt: number
  finishedAt: number
  slots: Record<string, string>
  /** The prompt as it was actually said, with the inputs and the slots written in. */
  prompt: string
  /** What the agent is saying right now, cut short. Empty once the turn is over. */
  said: string
  summary: string
  /** What the head said each time it sent this card back to work. */
  nudges: string[]
  verdict: '' | 'done' | 'undone'
  verdictReason: string
  handoff: string
  failure: string
  error: string
  cost: number
  tokens: number
}

export interface ScenarioRunNote {
  at: number
  /** The card the head was busy with when it said this. */
  stepKey: string
  text: string
}

export interface ScenarioRunQuestion {
  stepKey: string
  title: string
  tool: string
  detail: string
  options: string[]
  askedAt: number
}

/**
 * A run as the lists draw it - without the steps, which are the expensive part.
 *
 * The fields below `inputs` are what a card of a going run says about itself: where it has got to, what
 * it has burnt, and what it has stopped to ask. They are optional because they arrived later than the
 * rest and a page served from a relay is not deployed in lockstep with the IDE that fills them in - a
 * screen that reads them as absent draws one line less, while a screen that trusted them would draw
 * "stage undefined of undefined".
 */
export interface ScenarioRunSummary {
  id: string
  scenarioId: string
  scenarioName: string
  scope: ScenarioScope
  startedAt: number
  finishedAt: number
  state: ScenarioRunState
  total: number
  done: number
  failure: string
  cost: number
  inputs: Record<string, string>
  /** How many tokens it has burnt so far - see ScenarioRun.tokens. */
  tokens?: number
  /** See ScenarioRun.idle. */
  idle?: number
  /** Which stage of how many it is standing in, counting from one. Zero when it has not begun. */
  stage?: number
  stages?: number
  /** The card it is on right now, by name. */
  at?: string
  /** Which pass of that stage, and how many it may have. Zero when the stage does not loop. */
  pass?: number
  passes?: number
  /** How many times the main thread has sent the card it is on back to work. */
  nudges?: number
  /** What it has stopped to ask, when it is standing on a question. Empty otherwise. */
  asking?: string
}

/**
 * An occasion to call the person with a sound. The shell knows exactly these names: each has a file of
 * its own there (see AlertSounds.kt).
 */
export type SoundId =
  | 'turnFinished'
  | 'permission'
  | 'plan'
  | 'question'
  | 'rateLimit'
  | 'extraUsage'
  | 'trouble'

export interface SoundSettings {
  /**
   * Sounds switched off by hand. What is stored is what is off: by default everything sounds, and an
   * empty list means "as intended" - otherwise a sound added in the next version would arrive switched
   * off for everyone who ever opened this list.
   */
  muted: string[]
  /**
   * The volume in per cent, when it is not full. Kept apart from muted on purpose: clearing a checkbox
   * does not wipe a configured percentage - turning the sound back on, a person expects their previous
   * seventy rather than a hundred.
   */
  volumes: Record<string, number>
}

type ShellMessageBody =
  | {
      type: 'init'
      projectName: string
      workingDirectory: string
      gitBranch?: string
      /** The panel's own version, shown at the foot of the menu (see SideMenu). */
      pluginVersion?: string
      /** The choice of model, effort and mode: it outlives both tabs and IDE restarts. */
      preferences?: {
        model: string
        effort: string
        mode: string
        /**
         * What a new tab is PINNED to, beside what was last chosen above. Empty - the usual case -
         * means "whatever was last chosen", which is what the panel did before the setting existed:
         * then an untouched tab is drawn by `model`/`effort`, and a pinned one by these (see
         * ClaudePreferences.newTabModel).
         */
        newTabModel?: string
        newTabEffort?: string
        /** Where the input field sits. Unset means a panel opened for the first time, behaving as before (at the bottom). */
        composerLayout?: string
        /**
         * From how many lines a pasted text folds into a chip, as a number in a string; "0" never folds
         * it. Unset means the panel's own default - see pasteCollapseLines in feed/reference.ts, where
         * the difference between "nothing chosen" and "switched off" is spelled out.
         */
        pasteCollapse?: string
        /**
         * Which key sends a message - 'enter' or 'modEnter'. Unset means Enter, which is what the panel
         * did before the setting existed (see normalizeSendKey).
         */
        sendKey?: string
        /**
         * The no-stress colour mode: the gauges drawn in one calm tone rather than by a ladder of four
         * (see hooks/useCalmColors.ts). Unset means off, which is what the panel did before the setting
         * existed.
         */
        calmColors?: boolean
        /**
         * The language chosen by hand. Empty - which is the usual case - means "whatever the IDE
         * speaks", so that a Chinese IDE gets a Chinese panel without anyone having to find the switch.
         */
        language?: string
        /**
         * What the IDE itself is set to, whether or not a choice was made. The picker needs it to say
         * which language "Automatic" means right now rather than promise something unnamed.
         */
        ideLanguage?: string
      }
      /** The sound alert settings - they outlive an IDE restart. */
      sounds?: SoundSettings
      /**
       * What the improve button asks for. Two texts rather than one: `instructions` is what the person
       * put in themselves and is usually empty, `builtIn` is what is in force while it is - the screen
       * shows the second as the first's placeholder and restores it on request, and a default a screen
       * cannot name is a default nobody edits (see PromptImprover on the IDE's side).
       */
      improve?: { instructions: string; builtIn: string }
    }
  /**
   * The language in force, on its own rather than only inside `init`.
   *
   * Two readers need it that way. A phone is never sent `init` - it carries the working directory (see
   * RemoteFeed) - and would otherwise never learn the language at all. And the setting is machine-wide,
   * so a change made in one window has to reach the other one, which is already past its own `init`.
   */
  | { type: 'locale'; language?: string; ideLanguage?: string }
  /**
   * The no-stress colour mode, on its own for the same two readers as the language above: a phone never
   * sees `init`, and a machine-wide setting switched in one window has to reach the other.
   */
  | { type: 'calmColors'; on: boolean }
  /**
   * The models somebody added by hand, on its own for the same two readers as the two above.
   *
   * They stand beside the catalogue rather than inside it, and that is the whole point: the catalogue
   * names what Claude Code itself offers, and this list exists for the machines where that is not the
   * whole truth - a proxy router or a gateway serving models the CLI has never heard of. Merged into the
   * menu by the panel and by the phone alike (see modelOptions), so both screens name the same models.
   */
  | { type: 'customModels'; models: string[] }
  /**
   * What a new tab starts with, on its own beside `init` for the same reason the three above stand
   * apart: the setting is machine-wide, and a second window is already past its own `init`.
   *
   * `model` and `effort` are the pins and travel empty when nothing is pinned - empty means "whatever
   * was last chosen". `mode` is resolved rather than raw: a mode nobody ever chose is Claude Code's own
   * default for that directory, and the selector has to name what the process will genuinely come up
   * with (see PermissionDefaultMode).
   */
  | { type: 'newTabDefaults'; model: string; effort: string; mode: string }
  | {
      type: 'usage'
      /**
       * Whose figures these are - empty for the CLI's ordinary sign-in.
       *
       * The panel keeps a set of rings per account and draws the ones belonging to the tab on screen.
       * Without this two accounts running side by side merge into one picture: one account's five-hour
       * window beside the other's weekly one, permanently, with no switch needed to produce it.
       *
       * Absent means the figure belongs to no account in particular - `todayTokens` is the only such
       * one, because it is counted by reading a transcripts folder that has no account marker in it.
       */
      account?: string
      session?: UsageWindow
      week?: UsageWindow
      /**
       * Everything known about the subscription is somebody else's now: the sign-in has moved to another
       * account (see ProjectUsage.forget). Said out loud because the message is merged field by field -
       * silence about a window means "nothing new about it", and a window the new account has not opened
       * yet is never mentioned at all, so without this the previous account's percentage would stay on
       * the ring for as long as its old reset time is ahead.
       */
      reset?: boolean
      /** Whether the plan's limit is being passed for money right now - see ExtraUsage. */
      extra?: ExtraUsage
      /** The current model's context window size: with the large ones it is a million, not two hundred thousand. */
      contextWindow?: number
      /**
       * Today's tokens across every project - the same "tok" figure as in a personal statusline.sh. It
       * is counted by a separate scan of the transcripts, so it arrives as a message of its own rather
       * than together with session/week/contextWindow.
       */
      todayTokens?: string
    }
  | {
      type: 'permission'
      id: string
      sessionId: string
      toolName: string
      target: string
      command: string
      mode: string
      /**
       * Who raised the question, in the CLI's own words: a safety check, an `ask` rule, a hook, the
       * "Auto" mode's classifier. Empty means the ordinary "the mode requires asking", with nothing to
       * explain (see PermissionReason on the IDE side).
       */
      reason?: string
      /**
       * Whether "Always allow" will work. It does not arrive at all when it will: a missing field means
       * "as usual", and only an explicit `false` removes the button - the rule would be written in that
       * case, but the question would come back with the very next call.
       */
      rememberable?: boolean
      /** Filled in only when the request was raised by a tool call inside a subagent. */
      agentId?: string
    }
  /**
   * The model catalogue from the CLI itself - see ModelInfo.
   *
   * Carries the account it belongs to: which models exist is decided by the plan, so a Pro account's tab
   * offered the Max account's list would let a person pick a model the CLI refuses before the first turn.
   */
  | { type: 'models'; models: ModelInfo[]; account?: string }
  /**
   * How much of this conversation's context window is taken - a figure from the CLI itself (the same
   * one `/context` prints). Counting it on our side is not an option: the window's size depends on the
   * model, and what is taken includes things a turn's usage does not show.
   */
  | { type: 'context'; sessionId: string; used: number; max: number }
  /**
   * What this conversation is waiting to say once the turn in progress ends, in the order it will say it.
   *
   * The whole list every time rather than what changed: it is short, both clients draw it, and either of
   * them may have been the one to change it. The bytes of a queued photo stay in the IDE - a row needs to
   * know that there is one, not what is in it.
   */
  | { type: 'queue'; sessionId: string; items: QueuedMessage[] }
  /**
   * How a bash-mode command ended. stdout and stderr separately: they travel to the agent as separate
   * fields, as Claude Code itself does it - by them one can see that a command complained even when
   * the exit code was zero.
   */
  | { type: 'bashResult'; sessionId: string; id: string; exitCode: number; stdout: string; stderr: string }
  /**
   * The tabs as the shell keeps them. It is the shell that owns this list now: the interface makes the
   * identifiers up (a "+" has to answer instantly) but the order, the grouping and the names live on
   * the other side, where a second client can see them too.
   */
  | { type: 'sessions'; sessions: SessionInfo[] }
  /**
   * A conversation's feed is about to be handed over from the shell's journal - everything up to
   * restoreFinished belongs to it and is applied as one change rather than one entry at a time.
   *
   * `from` is the number the client said it already had. `truncated` means the journal no longer
   * reaches that far back: part of the beginning is genuinely missing, and the feed says so rather
   * than showing a stump in silence.
   */
  | { type: 'restoreStarted'; sessionId: string; from: number; truncated?: boolean }
  | { type: 'restoreFinished'; sessionId: string; upTo: number }
  /**
   * The answer being printed at this very moment, as far as it has got. The deltas it is made of are
   * not kept in the journal (they are superseded by the finished block a moment later), so a client
   * joining mid-turn is handed the fold in one piece and carries on from the live ones.
   */
  | { type: 'streamingText'; sessionId: string; text: string; thinking: string }
  /**
   * The conversation behind this tab is gone - a past one has been opened in its place. Whatever the
   * feed held describes something else now.
   */
  | { type: 'sessionReset'; sessionId: string }
  /**
   * Who else is watching this project right now.
   *
   * The panel itself is not in the list - a person needs no telling that the window in front of them is
   * open. What matters is everyone else: a browser page beside the IDE today, a phone tomorrow. "It is
   * always visible in the IDE that someone is connected remotely" is a requirement of the remote access
   * plan (§3.4), not a nicety, and it is far cheaper to build now than to bolt on later.
   */
  | { type: 'clients'; count: number; clients: { id: string; local: boolean }[] }
  /**
   * Whether this IDE can be reached from outside, and how that is going.
   *
   * `state` is the connection's own word for itself: idle, connecting, connected, reconnecting,
   * relay_down, refused. They are kept apart on purpose - "reconnecting" is a train tunnel and fixes
   * itself, "relay_down" is somebody else's server, and "refused" means this plugin will never connect
   * to that relay however long it waits. One spinner for all three would tell a person nothing about
   * which of them to act on.
   */
  | {
      type: 'remoteState'
      state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'relay_down' | 'refused'
      enabled?: boolean
      relay: string
      agentId: string
      /** This IDE's own key fingerprint - the one a phone shows back during pairing. */
      fingerprint?: string
      /**
       * False when this IDE is set not to remember passwords: pairing would then work today and be
       * gone tomorrow, which is worth saying rather than letting someone find out by repetition.
       */
      keysKept?: boolean
      devices?: RemoteDevice[]
      /** A pairing being offered right now: the address behind the QR code, and when it expires. */
      pairing?: { url: string; expiresAt: number }
      /**
       * A device that has proved it saw the code and is waiting for a person to say yes.
       *
       * The proof alone is not enough, and what it misses is human rather than cryptographic: someone
       * who photographed the screen, or saw it in a recording, and scanned it before you did. The
       * fingerprint is shown on both screens so the two can be compared by eye.
       */
      pending?: { deviceId: string; label: string; fingerprint: string }
    }
  /**
   * A permission has been answered - possibly on another device. With one client this said nothing new
   * (it had drawn the decision on the click), with two it is the only way the other one learns its
   * buttons are no longer worth pressing.
   *
   * 'withdrawn' is nobody's decision: the agent took its question back (Stop pressed over a waiting
   * card, a hook that came to its own answer). The card closes exactly as after a decision - what it
   * must not do is go on offering buttons that now answer nobody. See PermissionChannel.Incoming.
   */
  | {
      type: 'permissionResolved'
      sessionId: string
      id: string
      decision: 'once' | 'always' | 'deny' | 'withdrawn'
    }
  | { type: 'planResolved'; sessionId: string; id: string; decision: string }
  /**
   * A person's message as it stands in the feed, echoed back by the shell.
   *
   * The message itself reaches the agent as plain text, and the stream says nothing about where it
   * began - so a feed rebuilt from the shell's journal would be answers with no questions above them.
   * The pieces travel through the shell untouched: what a chip or a quote is, is known here, and a
   * second description of it on the other side would drift from this one.
   *
   * `id` is the one the sender made up. Its own echo it ignores: it drew the message on the press,
   * long before this came back.
   */
  | {
      type: 'promptEcho'
      sessionId: string
      id?: string
      /** UserToken[] from feed/types - opaque to the shell, which is why it is not typed here. */
      tokens?: unknown
      quotes?: string[]
      steering?: boolean
    }
  | { type: 'askResolved'; sessionId: string; id: string; outcome: 'answered' | 'dismissed' | 'withdrawn' }
  | { type: 'status'; sessionId: string; state: AgentStatus }
  /**
   * The tab's name from the first message - not straight away: while the LLM thinks, the tab already
   * carries a heuristic title (see deriveSessionTitle), and this message merely replaces it with a more
   * meaningful one when that works out.
   */
  | { type: 'sessionTitle'; sessionId: string; title: string }
  | { type: 'error'; sessionId: string; message: string }
  /**
   * A conversation's event. `replay` marks a past conversation's replay, opened from the history: the
   * events are the same, but they happened long ago, and nothing of the moment (the taken context
   * window) may be read out of them - the exact figure the IDE sends separately.
   */
  | { type: 'agent'; sessionId: string; event: AgentEvent; replay?: boolean }
  /**
   * The replay has been played to the end - from here on this tab holds a live conversation only. The
   * panel needs this to close the work the replay left unfinished: there is nobody left to wait for its
   * result from (see build.ts).
   */
  | {
      type: 'replayFinished'
      sessionId: string
      /**
       * The boundary of what was replayed: the identifier of its topmost message, when the conversation
       * goes on above it. A tab is opened with the end of a conversation rather than the whole of it (see
       * ClaudeHistory.opening), so this is both the answer to "is there more above" - the mark over the
       * feed is drawn by it - and the `before` of the next historyPage request.
       *
       * Absent means the beginning is on screen: there is nothing further back to ask for.
       */
      cursor?: string
    }
  /** The answer to a request to pick a file, a folder or an image through the IDE's dialog. */
  | { type: 'picked'; kind: 'file' | 'dir' | 'img'; value: string }
  /**
   * A file is being dragged over the panel - from the project tree or from the system file manager.
   * Inside the IDE dragging goes past the embedded browser, and the page knows nothing about it:
   * without this message there would be nothing to highlight the input field with. A drop can land
   * anywhere in the panel while the chip still goes into the field - which is why the field is
   * highlighted rather than the whole panel.
   */
  | { type: 'fileDrag'; over: boolean }
  /**
   * The branch and its pull request. Apart from init: the PR number is asked of GitHub, and its answer
   * takes longer than the panel takes to open.
   */
  | { type: 'project'; gitBranch?: string; pullRequest?: string; pullRequestUrl?: string }
  /** This project's past conversations: Claude Code keeps them itself. */
  | { type: 'history'; conversations: HistoryEntry[] }
  /**
   * A page of one conversation's messages, older than what the client already has - read off the
   * transcript on disk rather than the journal's own catch-up, which forgets its own beginning long
   * before the disk does (see ClaudeSessionHub.CatchUp). `cursor` absent means the transcript's
   * beginning has been reached - there is nothing further back to ask for.
   */
  | {
      type: 'historyPage'
      sessionId: string
      entries: AgentEvent[]
      cursor?: string
      /**
       * The boundary this page answers - the `before` of the request, echoed back. A phone applies a page
       * only when it answers the boundary currently on screen: two taps on a lost frame would otherwise
       * be answered twice and the same messages would arrive twice.
       */
      before?: string
    }
  /**
   * What one agent of a workflow actually did - read off its own transcript on disk (see
   * WorkflowAgents.kt), because nothing about it ever reaches the stream.
   *
   * A fleet's agents are invisible by every ordinary route: their events carry no subagent mark, the CLI
   * writes their conversations straight into its own folder, and the report that does arrive holds 400
   * characters of the errand and 400 of the answer. For an agent sent to find bugs in the billing code
   * those 400 characters are the opening brace of its JSON - which is why a line unfolds into this.
   *
   * `found` false means the file is not there (a swept run, a conversation opened from the history on
   * another machine): the previews from the report are then all there is, and the panel says so rather
   * than showing an empty body.
   */
  | {
      type: 'agentTranscript'
      sessionId: string
      /** Whose transcript this is - the CLI's own name for the agent, echoed back (see WorkflowAgent). */
      agentId: string
      found: boolean
      /** The errand in full, as the run handed it over - not the report's 400 characters. */
      prompt?: string
      /** Its tool calls in order, as short lines: "Read src/App.tsx". */
      steps?: string[]
      /** The last thing it said - its structured answer, or its closing text. */
      output?: string
      /** The output was longer than the budget and was cut - the card says so under it. */
      truncated?: boolean
    }
  /**
   * The Claude Code sign-in. Without it the agent answers every question with a line about /login, so
   * the panel shows a sign-in button rather than an input field.
   */
  | {
      type: 'auth'
      /** False when there is no executable at all: then there is nowhere to sign in. */
      installed: boolean
      loggedIn: boolean
      email?: string
      plan?: string
      /** Which account this describes - empty for the CLI's ordinary sign-in. */
      accountId?: string
      /** The path to the CLI given by hand, if one is set. */
      executablePath?: string
      /** Where the executable was looked for - arrives only when it was not found. */
      searched?: string[]
    }
  /**
   * The sign-in could not even be started: there was no terminal to run it in, or the account in force
   * has no credential store here to run it into. A code rather than a sentence - the panel speaks ten
   * languages and the IDE speaks one.
   *
   * Without this the gate sat in "finish it in the terminal" over a terminal that never opened.
   */
  | { type: 'authProblem'; code: 'no-drawer' | 'no-terminal' }
  /**
   * The applied permission mode: the agent may have refused, and then applied is false while error
   * holds the reason - "auto", for instance, is not available on every model.
   */
  | { type: 'mode'; sessionId: string; mode: string; applied: boolean; error?: string }
  /**
   * The model now in force - the answer to setModel. The agent can genuinely refuse: a model may be
   * forbidden by an organization or unavailable on a plan. So this always holds the model in force
   * rather than the one asked for: on a refusal that is the previous one, the panel returns to it, and
   * the reason travels in error.
   */
  /**
   * The model in force in a tab. Answering a choice, `applied` says whether the agent took it. With
   * `born` it is the model the conversation came up on - a fact about the tab rather than a choice,
   * said at its birth the way the effort is: a conversation opened from the history carries on at its
   * own model (see ClaudeSessionHub.resumeConversation), and that is not what the next tab starts on.
   */
  | { type: 'model'; sessionId: string; model: string; applied: boolean; error?: string; born?: boolean }
  /**
   * The effort this conversation works at: on a change of its own, and once when the conversation is
   * born - that is the moment nothing else could tell the panel what the tab started on.
   *
   * There is no "applied" here on purpose. The CLI takes an effort change without answering yes or no
   * (see ClaudeSession.setEffort), so there is nothing to refuse with and nothing to roll back to: this
   * message says what is, not how the request went.
   */
  | { type: 'effort'; sessionId: string; effort: string }
  /**
   * Which Claude account a conversation runs on - said at its birth, like the effort and the model.
   *
   * The opaque id and nothing else. This message is per-conversation, so a subscribed phone receives it,
   * and a phone has no words for an account and no business with somebody's address. What the accounts
   * screen needs travels separately, as a project fact that never leaves the window.
   */
  | { type: 'account'; sessionId: string; accountId: string }
  /**
   * The IDE is stopping this turn itself, so the conversation can move to the account now chosen.
   *
   * Said out loud because no client could work it out. An interrupt looks from the outside exactly like
   * a turn ending a little early: the feed captioned it "Worked 3s", the finished sound played, a push
   * went to the phone about work nobody completed, and the tool calls the turn was in the middle of were
   * left running with live clocks against a process about to be destroyed.
   *
   * `reason` has one value today and is spelled out anyway: the panel words the row from it, and a turn
   * the IDE stopped for its own reasons must never be captioned "Stopped by you".
   */
  | { type: 'turnStopped'; sessionId: string; reason: 'account' }
  /**
   * The tab's process is being replaced while nothing was being said in it - the quiet half of an account
   * change, and of a second sign-in to the account already in use.
   *
   * Not a turn ending, which is why it is not `turnStopped`: the tab was idle, and there is nothing to
   * caption. What it does say is that everything the process was holding is gone - a workflow's fleet, a
   * background subagent, a background command. All three outlive the TURN that started them and none of
   * them outlives the process, so their cards were left ticking against a CLI that no longer existed:
   * forty agents at work an hour ago, still counting up at the end of the day.
   */
  | { type: 'processReplaced'; sessionId: string }
  /**
   * The machine's Claude accounts, and whether it can keep two of them apart at all.
   *
   * `capability` is proven on the machine rather than assumed: the mechanism rests on an undocumented
   * environment variable, and the plugin refuses the whole feature unless it can show that the variable
   * moved the credential AND left the configuration folder alone.
   *
   * - `supported` - both halves proven; accounts may be added and switched.
   * - `ignored` - this Claude Code does not keep the drawers apart, or moves more than the credential.
   * - `wsl` - the project is inside WSL, where the CLI runs on the other side of a share.
   * - `notSignedIn` - nobody is signed in yet, so there is nothing to keep apart.
   * - `apiKey` - the sign-in is an API key or a key helper, which outranks any drawer.
   *
   * On anything but `supported` the screen shows the one account there is and a sentence naming the
   * reason, and offers no way to add another: a button that would overwrite the existing sign-in must
   * not exist.
   *
   * Absent means "not proven yet". Proving it starts processes, so the IDE never does it on the thread
   * that carries these messages: the list goes out at once with whatever is known and again a moment
   * later with the answer (see AccountDesk.broadcast). Until then the screen shows neither the sentence
   * nor the button - saying "unsupported" of a machine nobody has asked about would be a guess, and an
   * Add button offered on one is the single press that can overwrite the account in use.
   */
  | {
      type: 'accounts'
      accounts: AccountInfo[]
      capability?: 'supported' | 'ignored' | 'wsl' | 'not_signed_in' | 'api_key'
      /** Which account new conversations start on. */
      current: string
      /** A sign-in is in flight: a terminal is open somewhere and its drawer is being watched. */
      pending?: boolean
    }
  /**
   * How an account request went, as a code rather than a sentence: the panel speaks ten languages and
   * the IDE speaks one (the `voiceMessage` precedent).
   */
  | { type: 'accountOutcome'; code: string }
  /**
   * The conversation a tab holds, said by the shell: after a reset, which wipes everything the panel
   * knew about the tab, and to a client joining. The panel writes it down itself the moment a past
   * conversation is picked (see the `resumed` action), and that is what keeps the same conversation from
   * opening twice - but the reset that follows the pick took the note with it, and the process names
   * the conversation only once it is up, seconds later or never. In between, a second press on the same
   * row opened a second tab on one transcript, and a search's jump into that conversation waited for a
   * process that might not come.
   */
  | { type: 'conversation'; sessionId: string; conversationId: string }
  /**
   * Whether the "no questions" mode is allowed on this machine: an organization's policy can forbid it,
   * and an old CLI does not allow switching into it on the fly either. The Shift+Tab cycle depends on
   * it - a forbidden mode it steps over.
   */
  | { type: 'modeAvailability'; bypassPermissions: boolean }
  /** A piece of a file sent from the editor through the context menu. */
  | {
      type: 'selection'
      path: string
      startLine: number
      startColumn: number
      endLine: number
      endColumn: number
      /** Whole lines are selected - then the columns in the reference are unnecessary. */
      wholeLines: boolean
    }
  /**
   * A conversation's process died on its own, not at our request. The panel is obliged to close
   * everything that was "running" at that moment - otherwise it hangs like that forever.
   */
  | { type: 'processExited'; sessionId: string; exitCode: number }
  /**
   * The system clipboard's contents - the answer to clipboardRead, see clipboard.ts. `id` is the same
   * one the request carried: several of them may be in flight at once.
   */
  | { type: 'clipboard'; id: string; text: string; html: string; image: string }
  /** Where a pasted file was written - the answer to `savePastedFile`. */
  | { type: 'pastedFile'; id: string; path: string }
  /** The answer to mcpList - and to mcpAdd/mcpRemove, so that the list refreshes at once. */
  /**
   * Both shelves and the runs that came of them (see ScenarioDesk).
   *
   * Told to everyone in the project rather than answered to whoever asked: a second window on the same
   * project has the same two shelves, and which run is live is a fact about the project. The IDE keeps
   * the latest of these, so a panel opened while a run is going is caught up without asking.
   */
  | {
      type: 'scenarios'
      scenarios: Scenario[]
      runs: ScenarioRunSummary[]
      /** The scheduled runs these scenarios have - see ScenarioSchedule. */
      schedules: ScenarioSchedule[]
      /**
       * Whether the file of scheduled runs could not be read at all - which is not an empty list.
       *
       * An unreadable file answered as "there are none" tells somebody every morning they set up is gone,
       * silently, while the arrangements sit unharmed on the disk; they set them all up again, and those
       * do not save either, because nothing writes over a list it could not read (see ScheduleStore).
       */
      schedulesUnread?: boolean
      /** Whether there is a repository to put a shared scenario in at all. */
      canShare: boolean
    }
  /**
   * What is going right now, as summaries (see ScenarioDesk.sendLive).
   *
   * Apart from the shelves above and from the record below because the three change at three different
   * rates: the shelves when somebody writes a scenario, this once a second while anything runs, the
   * record several times a second. This is what every screen NOT looking at a timeline reads - the hub's
   * live section, the phone's list, the badge on a project card - and it is a few hundred bytes.
   */
  | { type: 'scenarioLive'; runs: ScenarioRunSummary[] }
  /**
   * One run, whole. Pushed while it is live, answered when an old one is opened.
   *
   * With several runs going they take the push in turn, one per beat, so that the cost of it does not
   * grow with how many somebody started. Kept only for as long as there is a tab open on it.
   */
  | { type: 'scenarioRun'; run: ScenarioRun }
  | { type: 'scenarioSaved'; scenario: Scenario }
  /**
   * One scenario, whole, because somebody asked for it by name (see `scenarioFetch`).
   *
   * The shelves travel with their prose cut down to what a list draws, and that is the right trade for a
   * message that carries every scenario of a project: a card's prompt is pages, and a list shows none of
   * it. The editor needs every word of one of them, so it asks - the same shape as a run, which is listed
   * as a summary and asked for whole.
   *
   * `scenario` is absent for one that is no longer on either shelf, which is a thing a screen has to be
   * able to say rather than sit blank about.
   */
  | {
      type: 'scenarioFetched'
      id: string
      scope: ScenarioScope
      scenario?: Scenario
      /**
       * It would not fit through the wire and was therefore not sent at all.
       *
       * The one place on that road where shortening is forbidden: what an editor is shown is what it
       * saves back, so a prompt quietly cut to fit a frame would take a paragraph out of somebody's
       * repository the moment they pressed Save (see RemoteFeed.wholeScenario).
       */
      tooBig?: boolean
    }
  /**
   * What a model wrote out of a described round of work (see ScenarioAuthor on the IDE's side).
   *
   * Nothing has been saved: this opens in the editor as a fresh scenario, and Save is still the person's
   * to press. `id` is the request it answers - a screen that has moved on, or pressed Cancel, ignores an
   * answer that names something else.
   */
  | { type: 'scenarioDrafted'; id: string; scenario?: Scenario; error?: string; tooBig?: boolean }
  /**
   * A run has begun. `scheduled` means the clock started it and nobody pressed anything - then no screen
   * jumps to its tab: the person may be in the middle of something else entirely.
   */
  | { type: 'scenarioStarted'; runId: string; scheduled?: boolean }
  /**
   * What one step said, as the events of its own conversation.
   *
   * The panel builds a feed out of them with the same reducer the live one uses (see feed/build.ts), so
   * a step's log reads exactly as a conversation does. `truncated` says the beginning is not shown - a
   * log that silently begins in the middle reads as a step that began in the middle.
   */
  | {
      type: 'scenarioLog'
      runId: string
      key: string
      found: boolean
      truncated: boolean
      events: AgentEvent[]
    }
  /** Something could not be done, as a name the panel has words for in ten languages. */
  | { type: 'scenarioOutcome'; ok: boolean; code: string }
  | { type: 'mcpServers'; servers: McpServerInfo[] }
  /** The outcome of mcpAdd/mcpRemove - not to be mistaken for a `/mcp` inside the conversation. */
  | { type: 'mcpActionResult'; ok: boolean; message: string }
  /** The answer to pluginList: the installed ones plus the catalogue available from the marketplaces. */
  | { type: 'plugins'; installed: InstalledPluginInfo[]; available: AvailablePluginInfo[] }
  /** The outcome of install/uninstall/enable/disable - all of them direct CLI subcommands. */
  | { type: 'pluginActionResult'; ok: boolean; message: string }
  /** The answer to marketplaceList - and to marketplaceAdd/marketplaceRemove. */
  | { type: 'marketplaces'; marketplaces: PluginMarketplaceInfo[] }
  /**
   * The project's file list for the "@" hint in the input field - it arrives by itself, unasked, when
   * the panel is ready and periodically after that: the agent may have created new files, and waiting
   * for an explicit refresh from the person serves nothing.
   */
  | { type: 'files'; files: string[] }
  /**
   * The description and argument syntax of slash commands - out of the frontmatter of files on disk
   * (the project's and the user's commands and skills, and those of installed plugins). By the same
   * route as files: it arrives by itself when the panel is ready and periodically after that.
   */
  | { type: 'commandHints'; hints: Record<string, { description: string; argumentHint: string }> }
  /**
   * The names of the slash commands the agent itself knows - the catalogue it named the last time a
   * conversation's process came up in this project (see ClaudeCommandNames on the plugin's side).
   *
   * The commands that live in files the panel finds by itself, but an MCP server's ones
   * (`/mcp__server__prompt`) exist nowhere on disk: they are asked of the servers at start-up and named
   * in `system:init`, that is, only after the first message has been sent. This message is what the
   * hint offers them from before that - the panel just opened would otherwise answer a command typed
   * from memory with "Unknown command". The live list of the conversation itself (panel.slashCommands)
   * outranks it as soon as it arrives.
   */
  | { type: 'commands'; commands: string[] }
  /**
   * Which edge of the screen the panel is docked to. Only the side bordering the editor draws a
   * separating frame - as native tool windows do (the terminal, the project view and so on). It changes
   * on the fly: the user may drag the panel to another side while it is open.
   */
  | { type: 'dockAnchor'; anchor: 'left' | 'right' | 'top' | 'bottom' }
  /**
   * The fonts from the IDE's settings. The panel's contents are drawn in the console font - the same as
   * the built-in terminal - and what surrounds them in the interface font. It arrives at startup and
   * again on every change of colour scheme or look and feel.
   *
   * There is no size here on purpose: the whole page is scaled by the embedded browser's zoom (see
   * IdeTypography.kt on the plugin's side), so the layout knows nothing about it.
   */
  | { type: 'typography'; monoFamily: string; uiFamily: string; lineHeight: number }
  /**
   * The statistics tab's figures - the answer to the `statistics` request. The machine's days in full,
   * every project's minutes by day, and the achievements as they stand: the range shown (a week, a
   * month, all time) is chosen here, out of the days, rather than asked for (see stats/compute.ts).
   */
  | ({ type: 'statistics' } & StatisticsData)
  /**
   * The feedback screen's own state: the address a person left last time, and the files they have picked
   * for this one. The files are named by an id rather than by a path - the path stays in the IDE (see
   * FeedbackAttachments on the plugin's side), so the panel cannot name a file the person did not pick,
   * and a path cannot leak out of a screen that sends things to a stranger's server.
   */
  | { type: 'feedbackState'; email: string; attachments: FeedbackAttachment[]; note?: string }
  /**
   * The debug report, as text, in answer to `feedbackReport`. This is the whole of what the "attach
   * debug logs" switch attaches - what is shown here and what is sent are the same string, which is the
   * only way "nothing private travels" can be checked rather than believed.
   */
  | { type: 'feedbackLog'; text: string }
  /**
   * How the sending went. `error` is a sentence for a person, not a status code; `note` is what went with
   * it but should not have gone silently - a file that grew past the limit between being picked and being
   * sent, which is precisely the file a bug report is usually about.
   */
  | { type: 'feedbackSent'; ok: boolean; error?: string; note?: string }
  /**
   * The draft rewritten - the answer to a press of the sparkle button (see `improvePrompt` below).
   *
   * Exactly one of text/error arrives, and the press it belongs to is named: the panel applies nothing it
   * cannot match to a press it is still waiting on. An answer that arrives after the draft has moved on -
   * the message was sent, the field was edited - is dropped rather than applied over what is there now.
   */
  | { type: 'promptImproved'; sessionId: string; id: string; text?: string; error?: string }
  /**
   * The answer to a `search` or a `searchAi` below, named by the request's number: the panel shows
   * nothing it cannot match to a request it is still waiting on - a query typed on after the request
   * went out has an answer of its own coming.
   *
   * `terms` are the words the messages were found by, folded as the index folds them (see Words in
   * TextIndex.kt and feed/searchText.ts) - what the feed paints when the person jumps to a hit. Empty
   * for a described search: the model found the messages, not a word.
   */
  | {
      type: 'searchResults'
      id: string
      hits: SearchHit[]
      /** The words the feed paints, each with how far - see PaintedTerm. */
      terms: PaintedTerm[]
      /**
       * How many matched in each scope, and in how many conversations - the numbers on the window's tabs
       * and beside its field. Counted before the list was cut to its limit: a badge saying "50" over two
       * hundred matches lies about the one thing it says.
       */
      counts?: { chat: number; project: number; conversations: number }
      /** How many matched in the scope that was asked for - `hits` may be the first [limit] of them. */
      total?: number
      error?: string
    }
  /**
   * What the model is doing while it searches (see AiSearch and SearchDesk on the IDE's side).
   *
   * One message per step, in the order the steps happen. A kind and a subject rather than a sentence:
   * the words belong to the panel, which speaks ten languages, and this is a fact about the run. Sent
   * because the run takes ten to twenty-five seconds, and a spinner alone for that long is
   * indistinguishable from one that has hung.
   */
  | ({ type: 'searchProgress'; id: string } & SearchProgressStep)
  /**
   * Everything the voice input screen draws itself from - see VoiceDesk on the IDE's side.
   *
   * The Deepgram key is not in it and never will be: only `keyHint`, the last four characters of it, so
   * that a person can tell the key they pasted from some other one. The panel is a web page in an
   * embedded browser, and a secret that never enters it cannot leave through it.
   */
  | {
      type: 'voiceConfig'
      enabled: boolean
      /** A nova-3 language code, or `multi`. */
      language: string
      languages: VoiceLanguage[]
      /** The chosen input device by its name; empty means the system's own default. */
      device: string
      devices: VoiceDevice[]
      keyHint: string
      hotkeys: Record<VoiceHotkeySlot, VoiceHotkey>
    }
  /**
   * How a dictation is going, and the level of the microphone while it does.
   *
   * `error` is a code rather than a sentence - `no-key`, `mic`, `key`, `network`, `deepgram` - and the
   * words for it are written here, in the panel's own language. The IDE speaks one language; this side
   * speaks them all.
   */
  | {
      type: 'voiceState'
      phase: 'idle' | 'listening' | 'finishing'
      mode: 'push' | 'hold'
      /** 0..100, for the ring around the button. */
      level: number
      error: string
    }
  /**
   * Words from a dictation. `final: false` is the phrase as it is being said - it replaces the previous
   * one and is drawn in grey beside the caret; `final: true` is a phrase Deepgram has settled on, and
   * that is what goes into the draft.
   */
  | { type: 'voiceText'; text: string; final: boolean }
  /** The balance behind the key, asked for by `voiceBalance`. See VoiceBalance for what each state means. */
  | ({ type: 'voiceBalanceIs' } & VoiceBalance)
  /**
   * A hotkey recording that ended without a binding: Escape, or a mouse button we will not bind. A
   * successful one arrives as a fresh `voiceConfig` instead - the binding is a setting like any other.
   */
  | { type: 'voiceCapture'; slot: VoiceHotkeySlot; problem: 'button' | 'cancelled' }
  /**
   * A phone's permission to dictate: a token that expires, and what to ask Deepgram for (see VoiceGrant).
   *
   * The key itself is never here. This one lasts a minute and transcribes only, which is what makes it
   * safe to hand to a device that could be left on a train - see SECURITY-REMOTE-CONTROL.md.
   *
   * Exactly one of token/error arrives. The error is a code the phone says in its own words, the same
   * five `voiceState` uses, plus `off` for "voice input is switched off at the desk".
   */
  | {
      type: 'voiceGrant'
      /** The `voiceToken` this answers - see the request for why an answer has to name one. */
      id: string
      token?: string
      /** Seconds the token is good for - it is spent on the handshake and never again. */
      expiresIn?: number
      /** The language chosen at the desk: the same person is speaking, and two places to set it drift. */
      language?: string
      model?: string
      error?: string
    }

/**
 * One day of work, as the IDE kept it (see DayRecord on the plugin's side) - every project's day of that
 * date folded into one. Counts, sums and high-water marks only: a figure absent from the message is a
 * zero, which is why almost all of them are optional.
 */
export interface StatisticsDay {
  /** "2026-08-26" - the calendar day in the IDE's own time zone. */
  date: string
  /** Minutes with something going on in the panel, and how they fall by hour of the day. */
  minutes: number
  hours: number[]
  turns?: number
  prompts?: number
  sessions?: number
  forks?: number
  phonePrompts?: number
  earlyPrompts?: number
  latePrompts?: number
  turnMillis?: number
  longestTurnMillis?: number
  quickTurns?: number
  longTurns?: number
  maxTurnsInHour?: number
  tools?: Record<string, number>
  edits?: number
  linesAdded?: number
  linesRemoved?: number
  biggestEdit?: number
  singleLineEdits?: number
  maxFilesInTurn?: number
  testTurns?: number
  filesTouched?: number
  permissionsAsked?: number
  permissionsAllowed?: number
  permissionsDenied?: number
  editsRefused?: number
  plansApproved?: number
  todosDone?: number
  attachments?: number
  quotes?: number
  thanks?: number
  historian?: number
  watched?: number
  tokensIn?: number
  tokensOut?: number
  tokensCacheRead?: number
  tokensCacheWrite?: number
  cost?: number
  /** Turns by the model's family: Sonnet, Opus and so on. */
  models?: Record<string, number>
  mcpConnected?: number
  plugins?: number
  longestSession?: number
  longestStretch?: number
  maxForksInTree?: number
  maxDepth?: number
}

/** One achievement as the IDE evaluated it - the words and the paint for it live in stats/catalogue.ts. */
export interface AchievementState {
  id: string
  /** 0 is locked; the tier reached otherwise - up to [steps]. */
  tier: number
  /**
   * How many lines this achievement has in all: the card draws a pip for each of them.
   *
   * Five for most, and the ones that differ differ for a reason - a milestone has a single line to cross,
   * and saying thanks two ways of the three is thanks enough. Absent from an older IDE, and five is what
   * it meant then.
   */
  steps?: number
  /** The figure behind it, in the achievement's own unit. */
  value: number
  /** The next line to cross, absent when the top tier is reached. */
  target?: number
  /**
   * The line the standing tier was earned for - absent while nothing is earned. What "earned lately"
   * says a tier was given for, and where the progress bar starts filling from (see Achievements.kt).
   */
  line?: number
  /** When each tier was reached, by tier number - the source of "earned lately". */
  earned: Record<string, number>
}

export interface StatisticsData {
  /** The IDE's clock at the moment of building - the panel's own may disagree by a little. */
  now: number
  /** When counting began on this machine. */
  since: number
  /** Today by the IDE's calendar - the day the ranges are counted back from. */
  today: string
  /** The IDE this is counted in - "WebStorm", "IntelliJ IDEA" - for the line under a shared picture. */
  ide: string
  devicesPaired: number
  project: { key: string; name: string }
  /** Every project the ledger knows, this one included: its name and its minutes by day. */
  projects: { key: string; name: string; minutes: Record<string, number> }[]
  /**
   * The days, in full, with every project's own day of that date folded into one.
   *
   * The minutes are joined rather than added: two projects working through the same minute spent one
   * minute of a person's life, not two. So the projects above can add up to more than a day here holds,
   * and that is the truth about a day with two agents running - not a figure that disagrees with itself.
   */
  days: StatisticsDay[]
  achievements: AchievementState[]
}

/**
 * What every message about a conversation carries besides its own fields.
 *
 * `seq` is the entry's number in that conversation's journal on the shell side, and `at` is when it
 * happened. Both exist so a client can be caught up after a break: it says the last number it saw and
 * is handed only the tail. Without the time, a restored feed would count every duration from the
 * moment of restoring - a turn that ran for a minute would come back as having just started.
 *
 * They are absent on messages that are not kept: the project's own facts, the deltas of an answer
 * being printed, and answers addressed to whoever asked (the clipboard, a command's output).
 */
export interface JournalMarks {
  seq?: number
  at?: number
}

export type ShellMessage = ShellMessageBody & JournalMarks

export type WebviewMessage =
  /**
   * The interface is mounted and ready to receive messages.
   *
   * `since` is what it already has, by conversation - the numbers it read off the messages themselves.
   * A page that has just opened sends nothing and is given everything; one that has merely been
   * reloaded over a live conversation is given only the tail. The conversations outlive the page now,
   * so that difference is worth having.
   */
  | { type: 'ready'; since?: Record<string, number> }
  | {
      type: 'prompt'
      sessionId: string
      /** This message's own identifier - it comes back in promptEcho, and by it the sender knows its own. */
      id?: string
      /** The pieces the feed draws this message from - see promptEcho. */
      tokens?: unknown
      quotes?: string[]
      steering?: boolean
      text: string
      /** Images from the clipboard: bytes rather than a path for a tool to read. */
      images?: { mediaType: string; data: string }[]
    }
  /**
   * The same message, to be said when the agent comes free rather than now.
   *
   * It waits in the IDE rather than in the window that typed it. That is what makes the button mean
   * anything on a phone: a page in a pocket is thrown out by the browser without warning, and what it
   * was holding used to go with it - the message was neither sent nor queued, and the conversation
   * simply stopped after the last turn.
   */
  | {
      type: 'queuePrompt'
      sessionId: string
      /** Made up by the sender, and the name it takes the message back out of the queue by. */
      id: string
      text: string
      /** What the row shows beside the text - "3 refs". Worked out here; the IDE only carries it. */
      attach?: string
      tokens?: unknown
      quotes?: string[]
      images?: { mediaType: string; data: string }[]
    }
  /** The cross on a queued message: it is not going to be said after all. */
  | { type: 'unqueuePrompt'; sessionId: string; id: string }
  /** The queue dragged into another order - the identifiers, in the order they are to fire. */
  | { type: 'reorderQueue'; sessionId: string; ids: string[] }
  /**
   * A command typed into the field through "!": the shell runs it in the project's working directory,
   * not the agent. The answer arrives as a single bashResult with the same id.
   */
  | { type: 'bash'; sessionId: string; id: string; command: string }
  | { type: 'stop'; sessionId: string }
  /** The ordinary Stop went unconfirmed - the user asked outright to kill the process. */
  | { type: 'kill'; sessionId: string }
  /**
   * Kill one of the conversation's tasks - a subagent or a background command - without touching the
   * turn itself. The identifier is the one the CLI calls it by in its own events (task_started and the
   * rest). About the task's end the CLI reports itself, with an ordinary notification - the panel
   * invents nothing.
   */
  | { type: 'stopTask'; sessionId: string; taskId: string }
  | {
      type: 'newSession'
      kind: SessionKind
      /** The new session's identifier is set by the interface: it is the one that uses it. */
      sessionId: string
      title: string
      /** The conversation we branch off. The branch gets its whole transcript. */
      parentId?: string
      quote?: string
      /**
       * What this conversation is to start on, when the client had to be asked rather than reading the
       * settings - which is the phone's case: the selectors it would read live at the desk.
       *
       * Absent means the settings decide, which is what the panel always does. It applies to this
       * conversation alone and writes nothing down: a tab started on Opus from a phone says nothing
       * about what the next tab opened at the keyboard starts on.
       */
      model?: string
      effort?: string
      mode?: string
    }
  | { type: 'closeSession'; sessionId: string }
  /**
   * The name the interface guessed from the first message (see deriveSessionTitle). The guessing stays
   * here rather than moving to the shell: the rule already exists here, both clients have to use the
   * same one, and a copy of it in another language would drift from this one.
   */
  | { type: 'renameSession'; sessionId: string; title: string }
  /** The tabs' new order after a drag - by group, as moveTab arranges it. The statistics tab is the panel's own and is never reported here. */
  | { type: 'reorderGroups'; groupId: string; beforeGroupId?: string }
  /**
   * The same after a fork was dragged inside its own group - by tab, as moveWithinGroup arranges it.
   *
   * `beforeSessionId` is the tab this one now stands before; absent means the end of its group. It never
   * leaves that group and never steps in front of its head, so nothing here can rearrange the groups
   * themselves.
   */
  | { type: 'reorderTabs'; sessionId: string; beforeSessionId?: string }
  /**
   * Turn remote access on or off. Off is how the plugin ships and how it stays until this arrives:
   * what it opens is a channel that can send messages to an agent with a shell on this machine, and
   * nobody should acquire one by installing a plugin.
   */
  | { type: 'setRemoteEnabled'; enabled: boolean }
  /**
   * Which relay to use. Empty means the public one. Being able to change it is the other half of
   * publishing the relay's source - reading the code of a server you are obliged to use is only half
   * an answer.
   */
  | { type: 'setRelayUrl'; url: string }
  /** Offer a pairing: the IDE makes a one-time code and shows it as a QR. */
  | { type: 'startPairing' }
  | { type: 'cancelPairing' }
  /** The person compared the fingerprints and said yes - or no. */
  | { type: 'approvePairing' }
  | { type: 'refusePairing' }
  /**
   * Forget a device. It takes effect at once and while the phone is switched off: with the secret gone
   * its frames simply no longer open.
   */
  | { type: 'revokeDevice'; deviceId: string }
  | { type: 'revokeAllDevices' }
  /** One dialog for every attachment: splitting them across three buttons serves nothing. */
  | { type: 'pick' }
  /**
   * Files and folders dropped into the input field. The paths go into the shell rather than becoming
   * chips on the spot: whether it is a file or a folder, and how its path looks relative to the
   * project, only the shell knows - inside the browser all that is left of a drop is a name. The answer
   * arrives as an ordinary picked, the same as for the chooser dialog.
   */
  | { type: 'dropped'; paths: string[] }
  | { type: 'permissionDecision'; id: string; decision: 'once' | 'always' | 'deny' }
  /**
   * The buttons under a plan. This is a permission too, only asked not by a permission card but by the
   * plan itself: the agent is waiting for an answer to its ExitPlanMode call and does nothing until it
   * comes. "Approve" returns "the plan is accepted" and it carries on in the same turn; "keep planning"
   * is a refusal with an explanation, after which it reworks the plan and shows it again. The
   * identifier is the same as the plan card's in the feed: the shell remembered the pending question
   * under it.
   */
  | {
      type: 'planDecision'
      sessionId: string
      id: string
      decision: 'approve' | 'keepPlanning'
      /**
       * A remark about the plan: what the person wrote into the input field while the plan card was
       * waiting for a decision. It travels to the agent instead of a generic "rework the plan" - it was
       * asking what is wrong with it, after all.
       */
      message?: string
    }
  /**
   * An answer to a question with options (AskUserQuestion). It goes back by the same request the
   * question came in: the key in `answers` is the question's text, the value the chosen option's label
   * or a typed-in answer of one's own. `id` is the tool call's identifier, and also the identifier of
   * the question's card in the feed.
   *
   * `text` is the same answer as ordinary text, in case there is nobody left waiting for it (the
   * conversation has been restarted since): then it travels as the next message.
   */
  | { type: 'askAnswer'; sessionId: string; id: string; answers: Record<string, string>; text: string }
  /**
   * The question was closed without an option being picked: the person will answer in their own words
   * in the input field. The agent gets a refusal of its call - silence would leave the turn standing on
   * a question that is no longer on screen.
   */
  | { type: 'askDismiss'; sessionId: string; id: string }
  /**
   * Play an alert sound.
   *
   * The panel decides, the shell sounds (see protocol, the sound message): the page lives in an
   * embedded browser that renders offscreen and obeys the autoplay policy - without a mouse click the
   * very first sound would simply not be heard. Only here, though, is it known what exactly the turn is
   * busy with: whether it waits for a decision about a plan or has reached its end.
   */
  | {
      type: 'sound'
      sound: SoundId
      volume: number
      /**
       * The occasion happens in the very tab the person is looking at. Then the sound is needed only if
       * looking at it is not working out: the panel is out of sight or the IDE's window is not focused -
       * and that is known only to the shell. From a background tab and from the "listen" button it
       * arrives without this flag: there it has to sound in any case.
       */
      onlyIfAway?: boolean
    }
  /** The sound checkboxes and volumes: the shell keeps them along with the model and the mode. */
  | { type: 'soundSettings'; muted: SoundId[]; volumes: Record<string, number> }
  /** The permission mode is set at process launch, so the shell is the one that changes it. */
  | { type: 'setMode'; sessionId: string; mode: string }
  /**
   * What new tabs start in - apart from setMode, which reaches one conversation and no further.
   * Choosing how to work in this tab says nothing about the next one, and the two used to be one
   * message: a mode picked once became the starting mode in every project and after every restart.
   */
  | { type: 'setDefaultMode'; mode: string }
  /**
   * And what a new tab starts ON - the other two thirds of the same screen.
   *
   * An empty string is a value here rather than a missing one: it means "whatever was last chosen",
   * which is what the first entry of each list sets and what the panel did before the setting existed.
   * Apart from `setModel`/`setEffort` for the reason `setDefaultMode` stands apart from `setMode`: a
   * pick in the chip is about this tab, and this is about every tab after it.
   */
  | { type: 'setDefaultModel'; model: string }
  | { type: 'setDefaultEffort'; effort: string }
  /** The model and the effort are held by the shell too: new conversations inherit them. */
  | { type: 'setModel'; sessionId: string; model: string }
  | { type: 'setEffort'; sessionId: string; effort: string }
  /** Where the input field sits - also a choice that outlives an IDE restart. */
  | { type: 'setComposerLayout'; layout: string }
  /** From how many lines a paste folds into a chip; '0' never folds, an empty string restores the default. */
  | { type: 'setPasteCollapse'; lines: string }
  /** Which key sends a message - 'enter' or 'modEnter'. Machine-wide, like the layout (see sendKey.ts). */
  | { type: 'setSendKey'; key: string }
  /**
   * The no-stress colour mode. Machine-wide beside the layout and the send key: whether a red gauge
   * presses on somebody is a property of the person rather than of the repository.
   */
  | { type: 'setCalmColors'; on: boolean }
  /**
   * The whole list of hand-added models, never a single addition or removal.
   *
   * Machine-wide beside the colour mode above it, and the whole list because that is what the screen
   * holds: an addition and a removal are the same message, and a list is the one shape that cannot
   * arrive out of order. What is unusable as a launch argument the IDE drops on the way in - see
   * ClaudePreferences.customModels.
   */
  | { type: 'setCustomModels'; models: string[] }
  /**
   * What language the panel speaks. An empty string is a value, not a missing one: it means "follow the
   * IDE", which is what the picker's first entry sets and what a panel nobody has touched already does.
   */
  | { type: 'setLanguage'; language: string }
  | { type: 'refreshUsage' }
  | { type: 'openDevTools' }
  /**
   * Which cursor the CSS under the mouse asks for.
   *
   * Needed because the embedded browser renders offscreen (the platform switches that on itself,
   * ignoring the request for a window): the page lives in a separate process, and its cursor does not
   * reach the IDE's window - there is always an arrow there, however much cursor is set in the styles.
   * So the shell sets the cursor and the page only says which one.
   */
  | { type: 'cursor'; cursor: string }
  /** A link (a PR number, for instance) - we open it in the system browser rather than in JCEF. */
  | { type: 'openExternal'; url: string }
  /**
   * A path named in the feed, opened in the IDE's editor: the head of a call's card, a file mentioned in
   * an answer, a `path:line` reference.
   *
   * The path travels as the agent wrote it - absolute, or relative to the project - and the line and the
   * column are 1-based, the way a person reads them. Both are the shell's to make sense of (see OpenInEditor): the
   * panel knows neither where the project sits on disk nor whether the file is there at all.
   *
   * `find` stands in for the line where there is no number to send: the CLI answers an edit with a
   * sentence rather than with a position, so what travels is the first line the edit added, and the place
   * is looked up in the file on the other side.
   */
  | {
      type: 'openFile'
      path: string
      line?: number
      column?: number
      /** The end of a range the reference named - then the editor selects it rather than only going there. */
      endLine?: number
      endColumn?: number
      find?: string
    }
  /**
   * A picture the panel drew of itself - the statistics as an image to share (see stats/poster.ts).
   *
   * The embedded browser has no downloads of its own: a link with `download` on it quietly does nothing
   * inside JCEF, so the bytes go to the IDE and it writes the file where downloads belong. `name` is a
   * file name and nothing more - the shell keeps its own folder and takes no path from here.
   */
  | { type: 'saveImage'; name: string; data: string }
  /**
   * Something pasted into the panel - a screenshot, a document - to be kept as a file (see
   * PastedFiles.kt). The answer comes back as `pastedFile` with the same id: an attachment with a path
   * can be copied, opened and named to somebody, while pasted bytes could only ever be called "Image #3".
   *
   * `name` is what the clipboard called it, empty for a screenshot - the clipboard holds pixels and no
   * name at all.
   */
  | { type: 'savePastedFile'; id: string; name: string; mediaType: string; data: string }
  /**
   * The clipboard through the shell: the embedded browser's own does not meet the IDE's (see
   * clipboard.ts). Reading comes with an answer, hence its `id`; writing needs none.
   */
  | { type: 'clipboardRead'; id: string }
  | { type: 'clipboardWrite'; text: string; html: string }
  /**
   * A batch of messages did not reach the page whole - the pieces it was cut into arrived out of order,
   * or the join of them stopped being JSON (see the bridge in WebviewHost).
   *
   * Sent by the bridge itself rather than by the interface, and only so that the loss leaves a trace: the
   * messages are already gone, and the IDE writes the fact into its diagnostics buffer. Before this a
   * whole feed could fail to draw itself with nothing anywhere to say why.
   */
  | { type: 'channelLoss'; reason: 'order' | 'parse'; expected: number; got: number }
  | { type: 'history' }
  /** A page further back than the journal's own catch-up reaches - see ShellMessageBody's historyPage. */
  | { type: 'historyPage'; sessionId: string; before?: string }
  /**
   * What one agent of a workflow did, asked for when its line is unfolded - see the answer of the same
   * name above. Asked rather than pushed: a fleet of forty holds forty transcripts of a megabyte each,
   * and what is read is the one line somebody opened.
   */
  | { type: 'agentTranscript'; sessionId: string; agentId: string }
  /** Continue a past conversation in this tab. */
  /**
   * Continue a past conversation in this tab - the shell opens the tab too when there is none under this
   * id (see ClaudeSessionHub.resumeConversation). The name travels along because resuming drops the one
   * the tab wore, and only the client that chose the conversation knows what it is called.
   */
  | { type: 'resumeSession'; sessionId: string; conversationId: string; title?: string; titleSource?: TitleSource }
  /** Open the IDE's terminal with a Claude Code sign-in or sign-out. */
  | { type: 'login' }
  /*
   * The accounts screen. Every one of these is refused to a phone (RemoteCommands.DENIED) and handled at
   * the window's own door, which a network client does not physically reach: adding an account opens a
   * terminal and a browser sign-in on somebody's machine, and choosing one decides whose subscription
   * pays for every conversation started afterwards.
   */
  | { type: 'accountList' }
  /**
   * Choose an account: new conversations start on it, and the ones already open move onto it too.
   *
   * All of them, not only the next one, and a chat opened from the history afterwards runs on it too.
   * Choosing an account means "this is what I am working on now", and a chat open in front of the person
   * going on being billed elsewhere is not that.
   *
   * A conversation in the middle of a turn is STOPPED so that it can move - the same interrupt the Stop
   * button sends, announced to every client as `turnStopped` so nothing calls it a finished turn. What it
   * had already written stays in the chat: the CLI closes the interrupted call and writes it into the
   * transcript, which the new process resumes onto (see ClaudeSessions.switchAllTo).
   */
  | { type: 'accountUse'; id: string }
  /** Sign in to another account: a terminal opens with a credential drawer of its own. */
  | { type: 'accountAdd' }
  /**
   * Stop waiting for a sign-in that is under way.
   *
   * The wait is generous on purpose - a browser, a password manager and an SSO detour all fit inside it
   * - and until this existed there was no way out of it at all: the drawer stayed minted and the "Add"
   * button stayed shut for the ten minutes the wait had left. The terminal is not touched; it is the
   * person's window to close.
   */
  | { type: 'accountCancel' }
  | { type: 'accountForget'; id: string }
  /**
   * Sign out of Claude Code entirely, and move to another account if one is signed in here.
   *
   * Offered only for the sign-in the CLI already had, because it is the only removal that account has:
   * it holds no drawer to delete. Unlike forgetting, this revokes the credential on Anthropic's side -
   * which is what "Log out" means, and why the panel asks before sending it.
   */
  | { type: 'accountLogout'; id: string }
  /** The person's own name for an account - "Work", "Home". Empty clears it back to the address. */
  | { type: 'accountRename'; id: string; alias: string }
  /**
   * Authorize Claude Design for the account in force: a terminal opens with `/design-login` already
   * running in that account's credential drawer.
   *
   * It cannot happen in the panel, and that is the CLI's doing rather than an omission here. The command
   * draws an interactive screen, so a streaming session does not merely refuse it - the command is left
   * out of the session's list altogether ("isn't available in this environment"). DesignSync's other road
   * to the same authorization, straight out of a permission prompt, is shut by the same condition. See
   * DesignLogin for both, and for why the drawer has to travel with the terminal.
   *
   * Answered only when it fails, as an `accountOutcome` like every other request on this screen: when it
   * works, the terminal is in front of the person with the sign-in already under way.
   */
  | { type: 'designLogin' }
  | { type: 'logout' }
  | { type: 'checkAuth' }
  /**
   * A line into the IDE's log. The panel lives in an embedded browser rendering offscreen: what really
   * happens there is invisible from outside, and opening the developer tools for one line is a whole
   * undertaking. There are no permanent users of this: it is a channel for investigations like "do
   * mouse events reach the tabs", switched on deliberately and for a while.
   */
  | { type: 'trace'; message: string }
  /** The path to the CLI given by hand - for when the automatic search missed. */
  | { type: 'setExecutablePath'; path: string }
  /**
   * The MCP status is asked of the conversation itself - the servers are held by its process, and only
   * it knows who is connected, who needs a sign-in and who failed. The conversation is brought up for
   * this, as in the terminal, where `/mcp` is asked of a session.
   */
  | { type: 'mcpList'; sessionId: string }
  /** Raise one server anew - this is also how a failed one is retried. */
  | { type: 'mcpReconnect'; sessionId: string; name: string }
  /**
   * Signing in to a server that requires it. The shell opens the address in the system browser, the
   * code from it is caught by the CLI itself - the panel is left waiting for a new status.
   */
  | { type: 'mcpAuthenticate'; sessionId: string; name: string }
  /** Adding and removing are config edits, not part of a conversation. */
  | { type: 'mcpAdd'; sessionId: string; name: string; command: string; transport?: string }
  | { type: 'mcpRemove'; sessionId: string; name: string }
  /**
   * Plugins and marketplaces are config edits too. Unlike MCP, install/uninstall/enable/disable have
   * CLI subcommands of their own, so they all travel as separate messages rather than as a prompt into
   * the conversation.
   */
  | { type: 'pluginList' }
  | { type: 'pluginInstall'; plugin: string }
  | { type: 'pluginUninstall'; plugin: string }
  | { type: 'pluginEnable'; plugin: string }
  | { type: 'pluginDisable'; plugin: string }
  | { type: 'marketplaceList' }
  | { type: 'marketplaceAdd'; source: string }
  | { type: 'marketplaceRemove'; name: string }
  /** The statistics tab's figures - answered with a `statistics` message. */
  | { type: 'statistics' }
  /**
   * Something only the interface can count, reported for the statistics: a hand on the keyboard or the
   * wheel (`activity`, sent once in a while rather than on every keystroke), the chips a message went
   * out with (`prompt` - what a chip is, is the interface's business and the shell does not look
   * inside), the heart pressed (`thanks`). The shell counts everything else itself, where it sees it.
   */
  | { type: 'stat'; kind: 'activity'; sessionId?: string }
  | { type: 'stat'; kind: 'prompt'; attachments: number; quotes: number }
  /** Which way of saying thanks was taken: the star, the review, or the line copied - see Thanks.tsx. */
  | { type: 'stat'; kind: 'thanks'; way: string }
  /**
   * Feedback: a message to the plugin's author, with files and a debug report beside it.
   *
   * All of it is handled by the panel's own window rather than by the conversation's commands (see
   * ClaudePanel on the plugin's side): it belongs to no conversation, and a message that makes the IDE
   * read files off the disk and post them to a server is exactly the kind a remote client must never be
   * able to send. It is refused for them twice over - by the list in RemoteCommands, and by never
   * reaching the place that handles it.
   */
  | { type: 'feedbackOpen' }
  /**
   * Build the debug report and answer with `feedbackLog` - asked for when the preview is opened. The
   * conversation is named because the report describes one: the tab being looked at is the one the
   * complaint is about, and the IDE has several open.
   */
  | { type: 'feedbackReport'; sessionId: string }
  /** Open the IDE's file dialog and add whatever is chosen; answered with a fresh `feedbackState`. */
  | { type: 'feedbackAttach' }
  | { type: 'feedbackDetach'; id: string }
  | {
      type: 'feedbackSend'
      kind: FeedbackKind
      sessionId: string
      text: string
      /** May be empty: an answer is offered, not required. */
      email: string
      /** Whether the report goes with it. The panel sends the flag; the text itself is built here. */
      logs: boolean
    }
  /**
   * Rewrite what stands in the input field (see feed/improve.ts here and PromptImprover on the IDE's
   * side).
   *
   * `draft` is the field's text with a [[n]] marker wherever it holds an attachment, and `attachments`
   * says what each marker is - a file's path, an image's name, a quote's first words. The chips
   * themselves never leave the panel, and an image's bytes certainly do not: what comes back is text with
   * the same markers in it, and the attachments are put back here.
   */
  | {
      type: 'improvePrompt'
      sessionId: string
      id: string
      draft: string
      attachments: string[]
      /**
       * Rewrites of this same draft the person has already been shown and pressed the button past, oldest
       * first. A second press means the first answer was not what they wanted, so it travels along as
       * something to avoid rather than being quietly thrown away - otherwise the button rolls the same dice
       * again and can hand back very nearly the same sentence.
       */
      rejected?: string[]
    }
  /**
   * What that button asks by, in the person's own words - kept in the IDE's settings, like the model and
   * the mode. Empty puts the built-in text back in force.
   */
  | { type: 'setImproveInstructions'; text: string }
  /**
   * The search behind the magnifier (see SearchDesk on the IDE's side). A typed query, matched against
   * the index of this project's conversations; `sessionId` names the tab whose conversation a 'chat'
   * search is kept to - the IDE knows which conversation that tab holds.
   */
  | {
      type: 'search'
      id: string
      sessionId: string
      scope: SearchScope
      query: string
      /** The field's two switches, the pair Find in Files has - off when absent (see TextIndex.search). */
      matchCase?: boolean
      wholeWords?: boolean
    }
  /**
   * The same, described in words for a model to find (see AiSearch): what it was about, roughly when.
   * A run of its own with read-only tools over the conversations as text, never the tab's conversation.
   */
  | { type: 'searchAi'; id: string; sessionId: string; query: string }
  /** The person stopped waiting for the model's search: its process ends, its answer is dropped. */
  | { type: 'searchCancel'; id: string }
  /**
   * The scenarios (see ScenarioDesk on the IDE's side): both shelves, the runs that came of them, and
   * whichever run is going right now.
   *
   * Every one of these is refused to a remote client (see RemoteCommands). Writing one writes a file
   * into the repository and running one raises agents that work unattended for hours - both are decided
   * at a keyboard, in front of the diff they produce.
   */
  | { type: 'scenarios' }
  /** Write one down. `scope` is the shelf it goes on, which is also how one is moved between the two. */
  | { type: 'scenarioSave'; scenario: Scenario; scope: ScenarioScope }
  | { type: 'scenarioDelete'; id: string; scope: ScenarioScope }
  | { type: 'scenarioDuplicate'; id: string; scope: ScenarioScope }
  /**
   * One scenario, with every word of it - what the editor is opened on.
   *
   * Asked for rather than read off the shelves, because the shelves are cut down on their way to a phone:
   * a card's prompt is pages of prose that no list draws, and carrying every one of them for every
   * scenario of a project is the whole weight of that message. The panel is on the same machine and is
   * sent the shelves whole, so it opens the editor out of what it already holds - this is the phone's
   * road, and it exists so that the cut can stay in place rather than being undone for one screen.
   */
  | { type: 'scenarioFetch'; id: string; scope: ScenarioScope }
  /**
   * Have a model write one out of a sentence about the round of work.
   *
   * The form of a scenario is what nobody wants to fill in the first time, and describing the work is
   * what anybody can do - so this is what the button that makes a new scenario offers first, with the
   * empty form beside it. `id` is this request's own, so the answer and a Cancel both name it.
   */
  | { type: 'scenarioDraft'; id: string; description: string }
  /** The person stopped waiting for it: the process ends and its answer is dropped. */
  | { type: 'scenarioDraftCancel'; id: string }
  /** Press play. `inputs` are the answers to the scenario's own questions, by name. */
  | { type: 'scenarioRun'; id: string; scope: ScenarioScope; inputs: Record<string, string> }
  /**
   * Add a scheduled run to this scenario, or change one it already has.
   *
   * Two identifiers, named apart on purpose. A scenario may carry as many arrangements as somebody wants,
   * so the scenario has to be named for what is being scheduled to be checked at all, and the arrangement
   * has to be named to say which of them is being changed. Both sides read these BY NAME and a missing
   * name reads as an empty string, so one of them called `id` would compile everywhere and quietly edit
   * the wrong thing.
   *
   * An empty `scheduleId` means a new one. The answers to the scenario's questions travel with it: when
   * the hour comes there is nobody at the keyboard to ask for them.
   */
  | {
      type: 'scenarioSchedule'
      scenarioId: string
      scope: ScenarioScope
      /** Empty for a new arrangement; otherwise the one being changed. */
      scheduleId: string
      /** Minutes from midnight, machine time. */
      at: number
      repeat: ScenarioRepeat
      /** Monday is 1, Sunday is 7. Read only for a weekly hour. */
      weekday: number
      inputs: Record<string, string>
    }
  | { type: 'scenarioUnschedule'; scheduleId: string }
  /**
   * Everything stops where it stands and nothing dies: the turn running right now is interrupted the
   * way Escape interrupts one at the desk, and both processes stay up with everything they remember.
   */
  | { type: 'scenarioPause'; runId: string }
  /** Carry on: the head is asked its question again, and the card is told to continue. */
  | { type: 'scenarioResume'; runId: string }
  /**
   * Pick a finished run up where it stood - one that was stopped or fell over (see ScenarioEngine.carryOn
   * on the IDE's side). The same record and the same tab: the main thread and the card that was cut
   * short come back over their own transcripts, remembering everything.
   */
  | { type: 'scenarioContinue'; runId: string }
  | { type: 'scenarioStop'; runId: string }
  /** An answer to the question a run is standing on - only when the scenario said to wait for a person. */
  | { type: 'scenarioAnswer'; runId: string; allow: boolean; text: string }
  /** The whole record of one run: the live one from memory, an older one off the disk. */
  | { type: 'scenarioOpen'; runId: string }
  | { type: 'scenarioRunDelete'; runId: string }
  /**
   * What one step said, read off the conversation it said it in.
   *
   * The run keeps none of it: a step is an ordinary conversation of the CLI's and its transcript is
   * already on the disk, so this is read when somebody opens a step and never for the rest.
   */
  | { type: 'scenarioLog'; runId: string; key: string; conversationId: string }
  /**
   * Voice input (see VoiceDesk on the IDE's side).
   *
   * Handled by the panel's own window like the feedback messages above, and refused to a remote client
   * twice over - by the list in RemoteCommands and by never reaching the place that handles them. The
   * microphone belongs to the machine the IDE runs on, and a message that opens it from across the
   * network is a listening device whatever it was meant for.
   */
  | { type: 'voiceStart'; mode: VoiceMode }
  /** The speech is over: stop the microphone and wait for the tail Deepgram still owes. */
  | { type: 'voiceStop' }
  /** Escape, or the field going away: throw the dictation out without putting anything in the draft. */
  | { type: 'voiceCancel' }
  /** Send `voiceConfig` - asked for when the settings screen opens. */
  | { type: 'voiceConfig' }
  | { type: 'voiceEnabled'; enabled: boolean }
  | { type: 'voiceLanguage'; language: string }
  | { type: 'voiceDevice'; device: string }
  /**
   * The Deepgram key, on its way to the system keychain (see VoiceKeys). Empty forgets it.
   *
   * This is the only direction it ever travels: the IDE answers with the last four characters and never
   * with the key.
   */
  | { type: 'voiceKey'; key: string }
  | { type: 'voiceBalance' }
  /** Wait for the next key or mouse button and bind it to this slot. */
  | { type: 'voiceCaptureHotkey'; slot: VoiceHotkeySlot }
  | { type: 'voiceStopCapture' }
  | { type: 'voiceClearHotkey'; slot: VoiceHotkeySlot }
  /**
   * A phone asking to dictate - the one voice message a remote client may send (see RemoteCommands).
   *
   * It asks for a token rather than for a microphone: the phone records with its own and streams to
   * Deepgram itself, so the audio never crosses the relay and the machine's microphone is never opened
   * from outside. Answered with `voiceGrant` carrying the same [id].
   *
   * The id is the phone's own, and the answer is worthless without it. A grant is minted over the
   * network, so it can land after the press that asked for it is over - and it is handed back to the
   * device that asked, out of a channel that carries several: acted on blindly, one phone's refusal
   * ended another phone's dictation in the middle of a word.
   */
  | { type: 'voiceToken'; id: string }

/**
 * Which way a dictation is being held.
 *
 * `push` records while the hotkey is held, like a walkie-talkie; `hold` is a toggle - one press starts
 * it, the next stops it, and the hands are free in between.
 */
export type VoiceMode = 'push' | 'hold'

/**
 * The four hotkeys. Each mode takes a chord and a mouse button, and they are independent triggers of the
 * same thing: a release from the keyboard must not stop what a thumb on the mouse is holding.
 */
export type VoiceHotkeySlot = 'push' | 'hold' | 'pushMouse' | 'holdMouse'

/**
 * A binding as the screen draws it: the keys it is pressed with, in the order a hand takes them. Empty
 * means nothing is bound.
 *
 * Keys rather than one assembled string, because the signs are not in the panel's font: ⌥ and ⌘ used to
 * arrive inside the label and fell through to whatever the system had, at a size and weight of their own
 * in the middle of a line. Each cap is drawn here instead - see HotkeyCaps.
 */
export interface VoiceHotkey {
  caps: VoiceHotkeyCap[]
}

/**
 * One key of a binding. Assembled by the IDE, whose business it is which sign belongs on a key: a Mac
 * prints ⌥ and ⌘ and spells the rest out, Windows prints its own key, Linux has Super.
 */
export interface VoiceHotkeyCap {
  /** A sign the panel has a drawing for. Empty means the key is a word - see `text`. */
  glyph: VoiceHotkeyGlyph
  /** The word on the key: 'Ctrl', 'Shift', 'F', 'Space', or a mouse button's number. */
  text: string
  /**
   * Which side of the keyboard, and only for a binding that is one bare modifier - there the side is the
   * binding. A word, so it is said here: 'left', 'right', or empty.
   */
  side: string
}

/** The keys the panel draws rather than spells: the two a Mac prints, the Windows key, and a mouse. */
export type VoiceHotkeyGlyph = '' | 'option' | 'command' | 'win' | 'mouse'

/** A language nova-3 will listen in. Both names travel untranslated - a language names itself. */
export interface VoiceLanguage {
  code: string
  native: string
  english: string
}

export interface VoiceDevice {
  id: string
  label: string
}

/**
 * What is left on the Deepgram account.
 *
 * `noAccess` is not a failure and is the reason this is a union rather than a number: reading a balance
 * needs the owner or admin role, so a key made as a member transcribes perfectly and cannot see the
 * money at all. Saying "something went wrong" over a key that works would send people replacing a key
 * that is fine.
 */
export type VoiceBalance =
  | { state: 'ok'; amount: number; units: string }
  | { state: 'checking' }
  | { state: 'none' }
  | { state: 'noAccess' }
  | { state: 'rejected' }
  | { state: 'failed' }

/** What a piece of feedback is about. The words on the screen differ; these are what travel. */
export type FeedbackKind = 'bug' | 'idea' | 'hello'

/**
 * A file picked for a piece of feedback, as the panel is allowed to know it: enough to draw a row and
 * to take it back off the list, and nothing that says where on the disk it came from.
 */
export interface FeedbackAttachment {
  id: string
  name: string
  bytes: number
}

export type AgentStatus = 'idle' | 'running'

// --- The agent's event stream -----------------------------------------------

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input?: unknown
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  is_error?: boolean
  content?: unknown
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

/**
 * One line of a workflow's report - see `workflow_progress` in [AgentSystemEvent].
 *
 * Everything but the kind and the number is optional on purpose: this is somebody else's shape, read out
 * of the stream rather than agreed with anyone, and a field that stops arriving must leave the panel
 * showing less rather than showing nothing.
 */
export type WorkflowProgress =
  /** A phase of the script - `phase('Review')`. Agents point back at it by [index]. */
  | { type: 'workflow_phase'; index: number; title?: string; kind?: string }
  /** A line the script printed itself - `log('12 of 40 found')`. */
  | { type: 'workflow_log'; message?: string }
  | {
      type: 'workflow_agent'
      /** Its number in the run, counted from one - and the key the report is merged by. */
      index: number
      /** What to call it on screen: `opts.label`, or the first words of its prompt. */
      label?: string
      phaseIndex?: number
      phaseTitle?: string
      agentId?: string
      agentType?: string
      model?: string
      /** 'start' covers both queued and running - the two are told apart by [startedAt]. */
      state?: 'start' | 'done' | 'error'
      isolation?: 'worktree' | 'remote'
      /** A resumed run gave this one back out of the journal instead of running it again. */
      cached?: boolean
      /** The safety classifier refused the spawn; [error] says why. */
      blocked?: boolean
      /** Dropped by hand from the workflows screen rather than failed. */
      skipped?: boolean
      attempt?: number
      error?: string
      promptPreview?: string
      resultPreview?: string
      queuedAt?: number
      startedAt?: number
      durationMs?: number
      tokens?: number
      toolCalls?: number
    }

export interface AgentSystemEvent {
  type: 'system'
  subtype: string
  /**
   * The mark Claude Code stamps every line of its stream with. Only the lines the transcript keeps can
   * be asked for a page older than themselves, and a system event is generally not one of them - which
   * is exactly what a phone has to be able to tell (see keptOnDisk in mobile/feed.ts).
   */
  uuid?: string
  session_id?: string
  model?: string
  cwd?: string
  permissionMode?: string
  slash_commands?: string[]
  /** Arrives with an automatic context compaction. */
  compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number; duration_ms?: number }
  /** A separate status event - "compacting", for instance, while a compaction is under way. */
  status?: string
  /** The compaction's outcome - arrives together with status:null, when the attempt has ended. */
  compact_result?: string
  compact_error?: string
  /**
   * The CLI moved the conversation to another model by itself, without asking anyone - the subtypes
   * `model_refusal_fallback` (the chosen model's safeguards flagged the message: a security audit, say,
   * counts as "cyber" for them) and `model_consent_fallback` (the chosen one needs credits or a consent
   * that has not been given).
   *
   * [content] is the CLI's own explanation, word for word as the terminal shows it - with the reason and
   * a link to the support article. The panel repeats it rather than inventing a wording of its own: the
   * reason for the swap is the whole point of the message, and only the CLI knows it.
   *
   * The swap holds for the session (scope `session`), not for one request: from here on the answers are
   * signed by the fallback model, and the bottom line must name it. Without this event the change is
   * silent - the selector simply starts naming another model, and that looks like the panel switching
   * things around behind one's back (which is exactly the complaint this was written for).
   */
  content?: string
  originalModel?: string
  fallbackModel?: string
  /**
   * Originally introduced only for a background subagent launched by a skill or workflow (/code-review,
   * for instance) - unlike an ordinary Task tool call, which, as it then seemed, always arrives as a
   * separate tool_use block in the assistant's stream. In practice (verified directly against CLI
   * 2.1.220) that turned out not to be so: an ordinary Task travels over this very channel too - there
   * is no tool_use block for it at all, only these system events (task_started/task_progress/
   * task_notification arrive even before the turn's own system:init). task_id is the shared key for both
   * cases, which is what lets build.ts handle them alike.
   */
  task_id?: string
  tool_use_id?: string
  description?: string
  subagent_type?: string
  task_type?: string
  usage?: { total_tokens?: number; tool_uses?: number; duration_ms?: number }
  last_tool_name?: string
  summary?: string
  /**
   * The inside of a running workflow - a `Workflow` call, which is one task with a whole fleet of agents
   * in it (`task_type` is then `local_workflow`).
   *
   * Those agents are not subagents of the ordinary kind and cannot be shown as such: their events never
   * reach this stream at all - not one line of theirs carries `parent_tool_use_id`, and their
   * conversations are written straight to disk. This report is the only word about them the panel gets,
   * and it holds everything: the phases in order, every agent with its state, its model, what it cost and
   * how it ended (checked against CLI 2.1.247). Without reading it a workflow looks like a single tool
   * call that goes quiet for ten minutes, whatever is going on inside.
   *
   * The whole list arrives every time rather than what changed - the CLI keeps it in the task and merges
   * into it itself - so it is read as it stands rather than accumulated (see feed/workflow.ts).
   */
  workflow_progress?: WorkflowProgress[]
  /**
   * A request to the model failed with a refusal the CLI waits out itself (subtype `api_retry`): the
   * attempt's number, how many there are in total and how long until the next one. While that pause
   * lasts, precisely nothing happens in the stream - the panel puts it into words, or the conversation
   * looks stuck (see applyApiRetry in feed/build.ts).
   *
   * error_status is the server's response code; a broken connection (a timeout, the network dropping)
   * had no response at all, and null arrives. error is the same refusal in one word: overloaded,
   * rate_limit, authentication_failed, server_error, unknown. The panel reads the code only: the refusal
   * is named by it, in the same four kinds the terminal tells apart (see retryReason in feed/retry.ts),
   * while the word is kept as a description of the stream's shape.
   */
  attempt?: number
  max_retries?: number
  retry_delay_ms?: number
  error_status?: number | null
  error?: string
}

/**
 * A message's content - usually a list of blocks, but not always: some messages arrive with a bare
 * string instead. The summary after `/compact` is one such. The parsing is obliged to accept both
 * shapes (see blocksOf in build.ts): meeting a string where a list was expected, the panel used to
 * break entirely.
 */
export type MessageContent = ContentBlock[] | string

export interface AgentAssistantEvent {
  type: 'assistant'
  /**
   * The mark Claude Code stamps every line of its stream with. What a phone anchors a request for an
   * earlier page on - see keptOnDisk in mobile/feed.ts.
   */
  uuid?: string
  /**
   * usage here is a snapshot of THIS request to the model rather than a total over the turn: its input
   * part is the taken context window for this step. The meter lives by it while a turn runs and the
   * exact figure from the CLI has not arrived yet (see liveContextUsed in build).
   */
  message: { id?: string; content: MessageContent; model?: string; usage?: AgentUsage }
  /** Non-empty for a subagent's messages: it is the identifier of the call that spawned it. */
  parent_tool_use_id?: string | null
}

export interface AgentUserEvent {
  type: 'user'
  /**
   * The mark Claude Code stamps every line of its stream with. What a phone anchors a request for an
   * earlier page on - see keptOnDisk in mobile/feed.ts.
   */
  uuid?: string
  message: { content: MessageContent }
  parent_tool_use_id?: string | null
  /**
   * Both fields exist only in records from a saved conversation - in a live stream they do not occur,
   * and they are needed by the replay alone (see build.ts).
   *
   * isMeta marks a record written by the CLI rather than the person: a skill's instructions, a caption
   * under an attached image and whatever else lands in a conversation internally. timestamp is when it
   * was actually said; without it messages from a past conversation would carry the time the tab was
   * opened.
   */
  isMeta?: boolean
  timestamp?: string
}

export interface AgentUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * The result event's own usage - with a breakdown by internal steps, if the agent called several tools
 * in a row before answering (num_turns greater than 1). The top-level fields are then a SUM over every
 * step (which suits the turn's cost), while what is really in the context window right now is only in
 * the last step.
 */
export interface AgentResultUsage extends AgentUsage {
  iterations?: AgentUsage[]
}

export interface AgentResultEvent {
  type: 'result'
  subtype: string
  result?: string
  is_error?: boolean
  duration_ms?: number
  num_turns?: number
  total_cost_usd?: number
  session_id?: string
  usage?: AgentResultUsage
}

/**
 * The subscription limit changed state. The event arrives in ordinary life too, and its "rejected" is
 * not the same as "the work has stopped" - see rate_limit_event in feed/build.ts for what each field
 * turns out to mean.
 */
export interface AgentRateLimitEvent {
  type: 'rate_limit_event'
  rate_limit_info?: {
    /** allowed | allowed_warning | rejected - the CLI's own three. */
    status?: string
    /** When the window resets, in seconds, as is customary in the CLI itself. */
    resetsAt?: number
    /** five_hour | seven_day | seven_day_opus | seven_day_sonnet | seven_day_overage_included | overage */
    rateLimitType?: string
    /**
     * The requests are going through past the limit, billed on top of the plan. Two names for one and
     * the same thing - which of them arrives depends on the CLI's version.
     */
    isUsingOverage?: boolean
    overageInUse?: boolean
    /** The limit is over but the current step is allowed to finish: the work has not stopped either. */
    rateLimitGraceActive?: boolean
  }
}

export interface AgentStreamEvent {
  type: 'stream_event'
  event: {
    type: string
    index?: number
    delta?: { type: string; text?: string; thinking?: string }
  }
  parent_tool_use_id?: string | null
}

/**
 * Only the events the panel draws are described. The stream is wider and grows over time, so the
 * parsing is obliged to skip what it does not know, silently.
 */
export type AgentEvent =
  | AgentSystemEvent
  | AgentAssistantEvent
  | AgentUserEvent
  | AgentResultEvent
  | AgentStreamEvent
  | AgentRateLimitEvent
  /** Arrives from /clear - the conversation has started afresh, without its old history. */
  | { type: 'conversation_reset'; new_conversation_id?: string }
  | { type: 'unknown' }
