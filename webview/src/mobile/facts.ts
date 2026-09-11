import { calmVividOf } from '../calmColors'
import type { CommandEntry, CommandHint } from '../feed/slash'
import { buildCommands } from '../feed/slash'
import { emptyUsageBook, mergeUsageBook, usageOf, type UsageBook, type UsageFacts } from '../feed/usage'
import type { Dict } from '../i18n/en'
import type { Scenario, ScenarioRun, ScenarioRunSummary, ScenarioSchedule, ShellMessage } from '../protocol'
import { pastRuns } from '../scenarios/runs'

/**
 * What a phone knows about a project rather than about one conversation in it.
 *
 * The branch and its pull request, the subscription's windows, the descriptions of the slash commands,
 * the project's files, and the rounds of work it has written down. All of them arrive by themselves -
 * nobody asks for them (see ClaudeSessionHub.PROJECT_ORDER and RemoteFeed.projectFact) - and neither
 * the composer nor the scenarios screen can be drawn without them.
 *
 * Per project rather than per conversation, and that is the whole reason this is a file of its own:
 * they outlive the screen. Walking out of a chat and back into it must not empty the limit rings and
 * blank the branch while the IDE gets round to saying them again.
 */
export interface ProjectFacts extends UsageFacts {
  /**
   * The subscription's figures of every account this machine runs, not just one set.
   *
   * The same book the panel keeps, and for the same reason (see UsageBook): two accounts genuinely run
   * at once, both answer about their own subscription, and both send `usage` here. Folded into one
   * picture they interleave - one account's five-hour window beside the other's weekly one, permanently
   * and without any switching to produce it - and a reset meant for one of them blanked whichever the
   * phone happened to be showing.
   *
   * The flat fields above are what the screens read: the book resolved for the conversation in front of
   * the person (see [factsFor]). Kept flat because every screen under the thread reads them directly,
   * and a shape that differs from the desk's for no reason is a shape that drifts from it.
   */
  usage: UsageBook
  gitBranch?: string
  pullRequest?: string
  pullRequestUrl?: string
  /** The project's paths, for the "@" hint. Trimmed on the way out - see RemoteFeed.forPhone. */
  files: string[]
  hints: Record<string, CommandHint>
  /**
   * The names of the commands the agent knows, as the IDE last heard them (see the `commands` message).
   * A phone never sees a conversation start, so this is the only route by which the MCP servers'
   * commands - which live in no file and so have no hint of their own - reach the field at all.
   */
  commands: string[]
  /**
   * The language the panel at the desk is speaking, so this screen speaks it too.
   *
   * It is not a property of the project but of the person, and it arrives here the same way the project's
   * facts do because there is no other route: the phone is never sent `init`, which carries the working
   * directory (see RemoteFeed). Absent until the IDE says - and then it is English, as it always was.
   *
   * Both halves are kept as they arrived rather than folded into one here. Which of them wins is a rule
   * - an explicit choice beats the language of the IDE - and that rule already exists, in `activeLocale`;
   * applied here as well, it was written twice and `activeLocale` was left being called with a second
   * argument that could never mean anything.
   */
  locale?: { chosen: string; ide: string }
  /**
   * How much colour the gauges keep, as it was set at the desk - so the ones here are as calm as those.
   *
   * A property of the person like the language above it, and it travels the same way and for the same
   * reason: there is no other route to a phone that is never sent `init`. Absent until the IDE says -
   * and then the ladder, which is what the screen has always drawn.
   */
  calmVivid?: number
  /**
   * The models added by hand at that desk (see CustomModels.tsx), so this screen offers the same list
   * the panel does.
   *
   * It travels as a fact for the same reason as the two above - the phone is never sent `init` - and it
   * cannot be set from here either (see RemoteCommands): a model is added on the machine whose Claude
   * Code will be launched with it.
   */
  customModels?: string[]
  /**
   * The project's scenarios and which run is going in it right now (see ScenarioDesk).
   *
   * A fact rather than an answer, exactly as at the desk: a round of work started in the morning runs
   * for hours with nobody in front of it, and a phone that had to ask would show a project as quiet
   * until somebody thought to look. Cut down on the way out - what a card actually says to its agent is
   * pages of prose and is read where it is written (see RemoteFeed.trimmedScenarios).
   */
  scenarios?: ScenarioShelves
  /**
   * The runs this phone has been handed whole, by their id.
   *
   * By id rather than one slot, because two of them arrive by different roads and must not overwrite
   * each other: the live one is pushed as it moves, while a past one comes back because this phone
   * asked for it (see the `scenarioOpen` request). Held between visits for the reason the histories
   * are - a screen showing what it knew a minute ago beats one that says "Loading…" over it.
   */
  runs: Record<string, ScenarioRun>
  /**
   * The runs going right now, as summaries - see the `scenarioLive` message.
   *
   * Summaries rather than records because that is all any list needs, and because there may be several:
   * one scenario can be started as many times as somebody wants. The whole record of one is only worth
   * carrying for the run whose timeline is open (see [runs] above).
   */
  liveRuns?: ScenarioRunSummary[]
}

/** Both shelves of a project, the runs that came of them, and the ones waiting for their hour. */
export interface ScenarioShelves {
  list: Scenario[]
  past: ScenarioRunSummary[]
  schedules: ScenarioSchedule[]
  /**
   * The file of scheduled runs could not be read at all, which is not the same as having none.
   *
   * Carried here as well as at the desk because the screen is the same screen: read as "there are none",
   * a damaged file tells somebody every morning they set up is gone while the arrangements sit unharmed
   * on the machine - and from here there is not even a button to try to fix it with.
   */
  schedulesUnread: boolean
  /**
   * Whether that project has a repository to put a shared scenario in at all.
   *
   * It used to be dropped on the way in, because nothing was written from here. Now the editor is here,
   * and without this the shelf offered for a new scenario would be one the machine cannot write to - a
   * form that cannot be submitted, chosen from a phone and refused on a desk nobody is at.
   */
  canShare: boolean
}

export const emptyFacts = (): ProjectFacts => ({
  files: [],
  hints: {},
  commands: [],
  runs: {},
  usage: emptyUsageBook(),
})

/**
 * The project's facts as one conversation sees them: its own account's figures on top.
 *
 * Resolved here rather than when a `usage` message lands, because the account is a property of the
 * conversation on screen and the message belongs to the project. The empty string is the CLI's ordinary
 * sign-in, which is what every machine that never touches the accounts screen has.
 */
export const factsFor = (facts: ProjectFacts, account: string): ProjectFacts => ({
  ...facts,
  ...usageOf(facts.usage, account),
})

/**
 * Whether this is one of the project's facts rather than a line of somebody's conversation.
 *
 * The list is the client's half of the one in RemoteFeed: what that one lets out, this one takes in.
 * They are checked against each other by nothing but care, so both are short and both say why.
 */
export const isFact = (message: ShellMessage): boolean =>
  message.type === 'usage' ||
  message.type === 'project' ||
  message.type === 'files' ||
  message.type === 'commandHints' ||
  message.type === 'commands' ||
  message.type === 'locale' ||
  message.type === 'calmColors' ||
  message.type === 'customModels' ||
  message.type === 'scenarios' ||
  message.type === 'scenarioLive' ||
  message.type === 'scenarioRun'

/**
 * One fact folded into what is already known.
 *
 * The usage is folded by the shared rules rather than by a copy of them here (see mergeUsageBook): the
 * same message reaches the panel at the desk, and the two screens disagreeing about what a percentage
 * means would be worse than either of them saying nothing.
 *
 * `watching` is the run whose screen is open, and it decides what is done with the heaviest fact of all -
 * see the `scenarioRun` case.
 */
export const applyFact = (facts: ProjectFacts, message: ShellMessage, watching = ''): ProjectFacts => {
  switch (message.type) {
    case 'usage':
      // Into the account it names, never over the picture on screen - see [ProjectFacts.usage].
      return { ...facts, usage: mergeUsageBook(facts.usage, message) }

    case 'project':
      // Replaced rather than merged, unlike the usage: this one message is the whole answer about the
      // branch, and a branch with no pull request says so by leaving the field out. Merging would keep
      // yesterday's PR number beside today's branch.
      return {
        ...facts,
        gitBranch: message.gitBranch,
        pullRequest: message.pullRequest,
        pullRequestUrl: message.pullRequestUrl,
      }

    case 'files':
      return { ...facts, files: message.files }

    case 'commandHints':
      return { ...facts, hints: message.hints }

    case 'commands':
      return { ...facts, commands: message.commands }

    /*
     * Both halves, as they were said. Which of them wins is decided where every screen asks for it (see
     * activeLocale) - the phone is looking at the same setting as the panel, it simply cannot change it
     * (see RemoteCommands).
     */
    case 'locale':
      return { ...facts, locale: { chosen: message.language ?? '', ide: message.ideLanguage ?? '' } }

    /*
     * The gauges' paint, as the desk has it - the phone obeys it and cannot set it (see RemoteCommands).
     * Read through calmVividOf because a machine whose plugin is older than this page still says `on`.
     */
    case 'calmColors':
      return { ...facts, calmVivid: calmVividOf(message) }

    /* And the hand-added models, on the same terms: shown here, added only at the desk. */
    case 'customModels':
      return { ...facts, customModels: message.models }

    /*
     * The shelves, replaced whole: this one message is the entire answer about what the project has,
     * and a scenario deleted at the desk is said by its absence.
     */
    case 'scenarios':
      return {
        ...facts,
        scenarios: {
          list: message.scenarios,
          past: message.runs,
          schedules: message.schedules ?? [],
          schedulesUnread: message.schedulesUnread === true,
          canShare: message.canShare === true,
        },
      }

    /*
     * What is going right now, as summaries.
     *
     * The only answer to "is anything running here", and it arrives about once a second while something
     * is. It used to be one identifier inside the shelves, which was true while a project could only
     * have one run; a phone that had to have the whole record before it could draw a card also had to
     * wait for that record, and a run standing on a question never sends another beat at all.
     */
    case 'scenarioLive':
      return { ...facts, liveRuns: message.runs }

    /*
     * One run, whole - and only the one whose screen is open.
     *
     * The record is the heaviest thing this page holds, and it arrives for runs nobody here asked for:
     * a machine may have several rounds of work going at once, and every one of them is pushed to every
     * paired device several times a second (see ScenarioDesk's heartbeat). Kept as they arrive, a page
     * left open all day holds one per run the machine ever raised, including the ones its clock started
     * at nine in the morning while this phone was asleep. The panel keeps the same rule against its open
     * tabs; here there is one screen, so there is one run.
     *
     * Still a map under an id rather than a single slot, because two of them arrive by different roads
     * and must not overwrite each other: the live one is pushed as it moves, while an old one comes back
     * because this phone asked for it (see the `scenarioOpen` request).
     */
    case 'scenarioRun':
      return message.run.id === watching
        ? { ...facts, runs: { [message.run.id]: message.run } }
        : facts

    default:
      return facts
  }
}

/**
 * The slash commands a phone may offer.
 *
 * The panel's own four - resume, fork, login, logout - are dropped rather than shown greyed out. They
 * are not commands the agent knows: the panel intercepts each one and does something local with it,
 * and two of them (login, logout) open a terminal on the work machine, which is refused over the wire
 * anyway (see RemoteCommands.DENIED). Offering them here would end in a command sent to an agent that
 * has never heard of it.
 *
 * Past conversations are not lost by this: the phone has a screen for them already, reached from the
 * project rather than from the field.
 *
 * Takes the two facts it is made of rather than the whole bundle, and that is what keeps the composer's
 * memo honest. Every project fact returns a new bundle and one of them arrives about once a second, so
 * the memo has to depend on these two alone - and given the bundle it used to depend on a promise in a
 * comment that nobody would read a third fact here. Now a third one cannot be read without changing the
 * signature, and the call site with it.
 */
export const phoneCommands = (
  t: Dict,
  commands: ProjectFacts['commands'],
  hints: ProjectFacts['hints'],
): CommandEntry[] => buildCommands(t, commands, hints).filter((command) => command.group !== 'panel')

/**
 * The runs going in a project right now, or nothing.
 *
 * Beside the shape of the facts rather than in a screen, because three of them ask: the list, the card on
 * the project screen and the badge in the drawer. It used to be written twice - once here, once by hand
 * inside the project card - and a rule written twice is a rule that disagrees with itself on the first
 * change.
 *
 * Summaries, so a run that is standing on a question counts like any other. The old rule waited for two
 * facts to agree - the shelves naming a run and its whole record having arrived - which was honest with
 * one run and quietly wrong with several: the record of only one of them can be cached for a phone
 * joining late, and a paused run sends no beat at all.
 */
export const liveRunsOf = (facts: ProjectFacts | undefined): ScenarioRunSummary[] => facts?.liveRuns ?? []

/**
 * The runs a project's card puts a row for: what is going, or the last round of work that is over.
 *
 * The live ones alone answered "is anything happening here", which is the question the row was built for
 * and not the only one asked of it. A scenario started at four in the morning is finished by breakfast,
 * and a card that says nothing about it sends somebody through the menu and two screens to find out how
 * the night went - for work that belongs to this project as much as any conversation on the card does.
 *
 * One when nothing is going, not a list: the rest are history, and history is what the screen behind the
 * row is for. The newest by when it STARTED, because that is the order the list behind it is in, and two
 * screens disagreeing about which run is the latest is worse than either ordering.
 *
 * A row drawn from this one is not a live row, and the dot has to be told so (see runDot): the summary is
 * read off that machine's disk, and an IDE closed in the middle of a step leaves "running" written there
 * for ever.
 */
export const projectRuns = (facts: ProjectFacts | undefined): ScenarioRunSummary[] => {
  const live = liveRunsOf(facts)
  if (live.length > 0) return live

  const last = pastRuns(facts?.scenarios?.past ?? [], live)[0]

  return last ? [last] : []
}
