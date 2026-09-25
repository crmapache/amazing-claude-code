import { en } from '../i18n/en'
import { describe, expect, it } from 'vitest'
import type { ScenarioRunSummary, ShellMessage } from '../protocol'
import { applyFact, emptyFacts, factsFor, isFact, phoneCommands } from './facts'

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
   * One "project" message is the whole answer about the branch and its pull request, and a branch with no
   * pull request says so with an empty field rather than by leaving it out. What this guards is the one
   * wrong thing the row can say: yesterday's PR number beside today's branch.
   */
  it('lets a branch with no PR say so, rather than inheriting the last one', () => {
    const withPr = applyFact(emptyFacts(), {
      type: 'project',
      gitBranch: 'feat/mobile-ui',
      pullRequest: '12',
      pullRequestUrl: 'https://example.test/12',
    } as ShellMessage)

    // Said with empty fields rather than by leaving them out, which is what the machine does (see
    // ProjectCatalog.refreshPullRequest): "there is no pull request" and "this message is not about one"
    // have to be different sentences.
    const switched = applyFact(withPr, {
      type: 'project',
      gitBranch: 'main',
      pullRequest: '',
      pullRequestUrl: '',
    } as ShellMessage)

    expect(switched.gitBranch).toBe('main')
    expect(switched.pullRequest).toBe('')
    expect(switched.pullRequestUrl).toBe('')
  })

  /**
   * A plugin older than this page sends the branch and the pull request as two messages, each with its
   * half. Replaced whole, the second wiped the first - and what that looked like was a branch on the
   * project card that vanished a minute after it appeared, every time the IDE looked at GitHub.
   */
  it('keeps the half an older machine did not mention', () => {
    const withBranch = applyFact(emptyFacts(), { type: 'project', gitBranch: 'main' } as ShellMessage)
    const withPr = applyFact(withBranch, {
      type: 'project',
      pullRequest: '12',
      pullRequestUrl: 'https://example.test/12',
    } as ShellMessage)

    expect(withPr.gitBranch).toBe('main')
    expect(withPr.pullRequest).toBe('12')
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
 * What is going in a project - and only that.
 *
 * An older plugin still sends the newest finished run beside the live ones, for a card row the phone no
 * longer draws. Kept in the facts, it would be a second answer to "what is running here" waiting for
 * somebody to read it as one.
 */
describe('applyFact, what a project is running', () => {
  const going = (id: string) => ({ id, scenarioId: 's1', state: 'running' }) as unknown as ScenarioRunSummary
  const over = (id: string) => ({ id, scenarioId: 's1', state: 'done' }) as unknown as ScenarioRunSummary

  it('takes the runs that are going and nothing else off the live message', () => {
    const facts = applyFact(emptyFacts(), {
      type: 'scenarioLive',
      runs: [going('a')],
      last: over('b'),
    } as unknown as ShellMessage)

    expect(facts.liveRuns?.map((run) => run.id)).toEqual(['a'])
    expect(Object.values(facts).flat().some((value) => (value as { id?: string } | undefined)?.id === 'b')).toBe(false)
  })

  it('empties when the last one ends', () => {
    const first = applyFact(emptyFacts(), { type: 'scenarioLive', runs: [going('a')] } as ShellMessage)
    const second = applyFact(first, { type: 'scenarioLive', runs: [] } as ShellMessage)

    expect(second.liveRuns).toEqual([])
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
