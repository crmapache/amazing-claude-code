import { en } from '../i18n/en'
import { describe, expect, it } from 'vitest'
import type { ShellMessage } from '../protocol'
import type { ScenarioRunSummary } from '../protocol'
import { applyFact, emptyFacts, factsFor, isFact, phoneCommands, projectRuns } from './facts'

const window = (percent: number) => ({ percent, resets: '' })

/**
 * The figures as one conversation sees them - the ordinary sign-in here, whose id is the empty string.
 *
 * They are kept per account rather than as one picture (see ProjectFacts.usage): two accounts run at
 * once and both answer about their own subscription, so a screen has to say whose it is showing.
 */
const shown = (facts: ReturnType<typeof emptyFacts>) => factsFor(facts, '')

describe('isFact', () => {
  it('takes the ones the composer is drawn from', () => {
    expect(isFact({ type: 'usage' } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'project' } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'files', files: [] } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'commandHints', hints: {} } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'commands', commands: [] } as ShellMessage)).toBe(true)
  })

  /**
   * The live list above all: it is the only answer to "is anything running in this project", and three
   * screens are drawn from it. Left off this list it was thrown away at the door, and a phone said
   * "nothing is going here" over three rounds of work - the half of the feature the phone exists for.
   */
  it('takes what a project is running right now', () => {
    expect(isFact({ type: 'scenarios', scenarios: [], runs: [] } as unknown as ShellMessage)).toBe(true)
    expect(isFact({ type: 'scenarioLive', runs: [] } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'scenarioRun', run: { id: 'r1' } } as unknown as ShellMessage)).toBe(true)
  })

  /**
   * The other half of the list in RemoteFeed: what that one lets out, this one takes in. Nothing else
   * belongs to the project - a line of a conversation goes to the feed, and by another road.
   */
  it('leaves everything else to the conversation it belongs to', () => {
    expect(isFact({ type: 'status', sessionId: 'main', state: 'idle' } as ShellMessage)).toBe(false)
    expect(isFact({ type: 'context', sessionId: 'main', used: 1, max: 2 } as ShellMessage)).toBe(false)
  })
})

describe('applyFact', () => {
  /**
   * The usage arrives by two independent routes - the conversation's own windows, and separately the
   * scan of the transcripts that counts today's tokens. Taking the last message entire would let each
   * of them zero out what the other had just learned.
   */
  it('merges the usage rather than replacing it, so the two routes do not erase each other', () => {
    const withWindows = applyFact(emptyFacts(), {
      type: 'usage',
      account: '',
      session: window(12),
      week: window(38),
      contextWindow: 1_000_000,
    } as ShellMessage)

    const withTokens = shown(applyFact(withWindows, { type: 'usage', todayTokens: '4.2M' } as ShellMessage))

    expect(withTokens.session?.percent).toBe(12)
    expect(withTokens.week?.percent).toBe(38)
    expect(withTokens.contextWindow).toBe(1_000_000)
    expect(withTokens.todayTokens).toBe('4.2M')
  })

  /**
   * A zero is not nullish, and ?? would let one stick in the state for good - the context gauge would
   * then divide by it ever after.
   */
  it('ignores a context window of zero rather than storing it', () => {
    const known = applyFact(emptyFacts(), { type: 'usage', contextWindow: 200_000 } as ShellMessage)
    expect(shown(applyFact(known, { type: 'usage', contextWindow: 0 } as ShellMessage)).contextWindow).toBe(200_000)
  })

  /**
   * The report this was written for: two accounts at work on one machine, both answering about their
   * own subscription. Folded into one picture the phone showed one account's five-hour window beside
   * the other's weekly one - with no switching at all to produce it.
   */
  it('keeps each account\'s figures apart', () => {
    const work = applyFact(emptyFacts(), { type: 'usage', account: 'work', week: window(70) } as ShellMessage)
    const both = applyFact(work, { type: 'usage', account: 'home', week: window(4) } as ShellMessage)

    expect(factsFor(both, 'work').week?.percent).toBe(70)
    expect(factsFor(both, 'home').week?.percent).toBe(4)
  })

  /**
   * And a reset is one account's own: signing out of one must not blank the rings of the conversation
   * the person is actually looking at.
   */
  it('resets only the account it names', () => {
    const work = applyFact(emptyFacts(), { type: 'usage', account: 'work', week: window(70) } as ShellMessage)
    const both = applyFact(work, { type: 'usage', account: 'home', week: window(4) } as ShellMessage)
    const after = applyFact(both, { type: 'usage', account: 'home', reset: true } as ShellMessage)

    expect(factsFor(after, 'work').week?.percent).toBe(70)
    expect(factsFor(after, 'home').week).toBeUndefined()
  })

  /**
   * Unlike the usage, one "project" message is the whole answer about the branch: a branch with no
   * pull request says so by leaving the field out. Merging would keep yesterday's PR number beside
   * today's branch, which is the one wrong thing this row can say.
   */
  it('replaces the branch whole, so a branch with no PR does not inherit the last one', () => {
    const withPr = applyFact(emptyFacts(), {
      type: 'project',
      gitBranch: 'feat/mobile-ui',
      pullRequest: '12',
      pullRequestUrl: 'https://example.test/12',
    } as ShellMessage)

    const switched = applyFact(withPr, { type: 'project', gitBranch: 'main' } as ShellMessage)

    expect(switched.gitBranch).toBe('main')
    expect(switched.pullRequest).toBeUndefined()
    expect(switched.pullRequestUrl).toBeUndefined()
  })

  it('keeps the files and the hints apart from each other', () => {
    const withFiles = applyFact(emptyFacts(), { type: 'files', files: ['a.ts'] } as ShellMessage)
    const withHints = applyFact(withFiles, {
      type: 'commandHints',
      hints: { deploy: { description: 'publish', argumentHint: '' } },
    } as ShellMessage)

    expect(withHints.files).toEqual(['a.ts'])
    expect(withHints.hints.deploy?.description).toBe('publish')
  })
})

describe('phoneCommands', () => {
  /**
   * The panel's own four - resume, fork, login, logout - are not commands the agent knows: the panel
   * intercepts each one and does something local with it, and two of them open a terminal on the work
   * machine, which is refused over the wire anyway. Offering them here would end in a command sent to
   * an agent that has never heard of it.
   */
  it('leaves out the panel’s own commands, which no agent would understand', () => {
    const ids = phoneCommands(en, emptyFacts().commands, emptyFacts().hints).map((command) => command.id)

    expect(ids).not.toContain('resume')
    expect(ids).not.toContain('fork')
    expect(ids).not.toContain('login')
    expect(ids).not.toContain('logout')
  })

  /**
   * A phone never sees a conversation start, so the agent's own list reaches it only as a project fact.
   * Without it the MCP servers' commands - which have no file and therefore no hint - could not be
   * offered on the small screen at all.
   */
  it('offers the commands the agent named, files or no files', () => {
    const facts = applyFact(emptyFacts(), {
      type: 'commands',
      commands: ['mcp__snakein__analyze'],
    } as ShellMessage)

    expect(phoneCommands(en, facts.commands, facts.hints).map((command) => command.id)).toContain('mcp__snakein__analyze')
  })

  it('keeps the built-in ones and adds whatever the project keeps on disk', () => {
    const facts = applyFact(emptyFacts(), {
      type: 'commandHints',
      hints: { deploy: { description: 'build, sign and publish', argumentHint: '' } },
    } as ShellMessage)

    const commands = phoneCommands(en, facts.commands, facts.hints)

    expect(commands.map((command) => command.id)).toContain('context')
    expect(commands.find((command) => command.id === 'deploy')).toEqual({
      id: 'deploy',
      hint: 'build, sign and publish',
      argumentHint: '',
      group: 'project',
    })
  })
})

/**
 * The record of a run is the heaviest thing a phone holds, and it now arrives for runs nobody asked for.
 *
 * A machine may have several rounds of work going at once, and the whole record of each is pushed to
 * every paired device several times a second (see ScenarioDesk's heartbeat). Kept as they arrive, a page
 * left open all day holds one per run the machine ever raised - including the ones its clock started at
 * nine in the morning, which nobody on this phone has ever looked at.
 */
describe('applyFact, the record of a run', () => {
  const record = (id: string) => ({ type: 'scenarioRun', run: { id } }) as unknown as ShellMessage

  it('keeps the one whose screen is open', () => {
    const facts = applyFact(emptyFacts(), record('r1'), 'r1')

    expect(Object.keys(facts.runs)).toEqual(['r1'])
  })

  it('lets go of the ones nobody is looking at', () => {
    const first = applyFact(emptyFacts(), record('r1'), 'r1')
    const second = applyFact(first, record('r2'), 'r2')

    expect(Object.keys(second.runs)).toEqual(['r2'])
  })

  it('holds nothing at all while no run is open', () => {
    const facts = applyFact(emptyFacts(), record('r1'), '')

    expect(facts.runs).toEqual({})
  })
})

/**
 * How much colour the gauges keep, as the desk has it.
 *
 * Held by a test because the two sides of this are not updated together: the phone's bundle is served by
 * the relay and travels with it, while the plugin on the machine updates on its own. A machine that is a
 * version behind still says `on` and nothing else - read as "nothing was said", it would hand somebody
 * back the very red they had damped, on the screen they damped it for.
 */
describe('applyFact, the gauges’ colour', () => {
  const said = (body: { vivid?: number; on?: boolean }) =>
    ({ type: 'calmColors', ...body }) as unknown as ShellMessage

  it('is taken in as a fact of the project', () => {
    expect(isFact({ type: 'calmColors', vivid: 100 } as unknown as ShellMessage)).toBe(true)
  })

  it('keeps the figure the desk sent', () => {
    expect(applyFact(emptyFacts(), said({ vivid: 30 }), '').calmVivid).toBe(30)
    expect(applyFact(emptyFacts(), said({ vivid: 0 }), '').calmVivid).toBe(0)
  })

  it('reads the switch of an older machine', () => {
    expect(applyFact(emptyFacts(), said({ on: true }), '').calmVivid).toBe(0)
    expect(applyFact(emptyFacts(), said({ on: false }), '').calmVivid).toBe(100)
  })
})

/**
 * What a project's card on the first screen puts a row for.
 *
 * The rule fails in both directions and neither of them shows up as an error. Left at the live runs
 * alone, a round of work that ran all night and finished before breakfast is nowhere on the screen its
 * owner picks up in the morning; taken as "whatever the shelf lists first", a run still going gets a
 * second row under itself.
 */
describe('projectRuns', () => {
  const summary = (over: Partial<ScenarioRunSummary> = {}): ScenarioRunSummary => ({
    id: 'r1',
    scenarioId: 's1',
    scenarioName: 'Nightly review',
    scope: 'project',
    startedAt: 1_700_000_000_000,
    finishedAt: 0,
    state: 'running',
    total: 8,
    done: 0,
    failure: '',
    cost: 0,
    inputs: {},
    ...over,
  })

  const shelves = (past: ScenarioRunSummary[]) => ({
    list: [],
    past,
    schedules: [],
    schedulesUnread: false,
    canShare: true,
  })

  it('says nothing about a project that has never run one', () => {
    expect(projectRuns(undefined)).toEqual([])
    expect(projectRuns({ ...emptyFacts(), scenarios: shelves([]) })).toEqual([])
  })

  it('shows everything that is going, and only that', () => {
    const live = [summary({ id: 'a' }), summary({ id: 'b' })]
    const facts = { ...emptyFacts(), liveRuns: live, scenarios: shelves([...live, summary({ id: 'c', state: 'done' })]) }

    expect(projectRuns(facts).map((run) => run.id)).toEqual(['a', 'b'])
  })

  /** The half this was written for: the night is over, and the card is where its result is asked after. */
  it('falls back to the last round of work that is over', () => {
    const facts = {
      ...emptyFacts(),
      liveRuns: [],
      scenarios: shelves([
        summary({ id: 'b', state: 'done', startedAt: 20 }),
        summary({ id: 'a', state: 'failed', startedAt: 10 }),
      ]),
    }

    expect(projectRuns(facts).map((run) => run.id)).toEqual(['b'])
  })

  /**
   * One, not a list. The rest are history, and the screen behind the row is what history is for - a card
   * that grew a row per run would push the project's conversations off the first screen.
   */
  it('offers one door back into the past and no more', () => {
    const facts = {
      ...emptyFacts(),
      scenarios: shelves([
        summary({ id: 'c', state: 'done', startedAt: 30 }),
        summary({ id: 'b', state: 'done', startedAt: 20 }),
        summary({ id: 'a', state: 'done', startedAt: 10 }),
      ]),
    }

    expect(projectRuns(facts)).toHaveLength(1)
  })

  /**
   * The shelf is read off the disk and still lists what is going right now, with figures written whenever
   * it last got round to it. Taken as a past run, the row would stand under the live one as a second,
   * staler copy of the same work.
   */
  it('never repeats a run that is already going', () => {
    const going = summary({ id: 'a', done: 5 })
    const facts = {
      ...emptyFacts(),
      liveRuns: [going],
      scenarios: shelves([summary({ id: 'a', done: 2 })]),
    }

    expect(projectRuns(facts).map((run) => run.done)).toEqual([5])
  })
})
