import { describe, expect, it } from 'vitest'
import type { ShellMessage } from '../protocol'
import { applyFact, emptyFacts, isFact, phoneCommands } from './facts'

const window = (percent: number) => ({ percent, resets: '' })

describe('isFact', () => {
  it('takes the ones the composer is drawn from', () => {
    expect(isFact({ type: 'usage' } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'project' } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'files', files: [] } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'commandHints', hints: {} } as ShellMessage)).toBe(true)
    expect(isFact({ type: 'commands', commands: [] } as ShellMessage)).toBe(true)
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
      session: window(12),
      week: window(38),
      contextWindow: 1_000_000,
    } as ShellMessage)

    const withTokens = applyFact(withWindows, { type: 'usage', todayTokens: '4.2M' } as ShellMessage)

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
    expect(applyFact(known, { type: 'usage', contextWindow: 0 } as ShellMessage).contextWindow).toBe(200_000)
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
    const ids = phoneCommands(emptyFacts()).map((command) => command.id)

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

    expect(phoneCommands(facts).map((command) => command.id)).toContain('mcp__snakein__analyze')
  })

  it('keeps the built-in ones and adds whatever the project keeps on disk', () => {
    const facts = applyFact(emptyFacts(), {
      type: 'commandHints',
      hints: { deploy: { description: 'build, sign and publish', argumentHint: '' } },
    } as ShellMessage)

    const commands = phoneCommands(facts)

    expect(commands.map((command) => command.id)).toContain('context')
    expect(commands.find((command) => command.id === 'deploy')).toEqual({
      id: 'deploy',
      hint: 'build, sign and publish',
      argumentHint: '',
      group: 'project',
    })
  })
})
