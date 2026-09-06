import { describe, expect, it } from 'vitest'
import type { LinkState } from './link'
import { buildProjects, chatState, waitingFor, type Inventory } from './projects'

/**
 * The first screen's order.
 *
 * Worth a test of its own because it is the whole of what a phone is opened for: whatever needs a
 * person has to be at the top, and a project that is not even open has to be at the bottom however
 * recently it was used. Both are easy to get subtly wrong and impossible to notice from a screenshot
 * of a machine with two projects on it.
 */

const session = (id: string, extra: Partial<{ status: string; awaitsYou: boolean }> = {}) => ({
  id,
  title: id,
  status: extra.status ?? 'idle',
  awaitsYou: extra.awaitsYou ?? false,
  q: 0,
})

const agent = { agentId: 'a1', label: 'WebStorm on desk' }

const build = (inventory: Inventory, state: LinkState = 'connected', hidden: string[] = []) =>
  buildProjects([agent], { a1: inventory }, { a1: state }, new Set(hidden))

describe('the list of projects on a phone', () => {
  it('puts what waits for a person above what is merely working', () => {
    const projects = build({
      projects: [
        { key: 'quiet', name: 'quiet', sessions: [session('one')] },
        { key: 'busy', name: 'busy', sessions: [session('two', { status: 'running' })] },
        { key: 'stuck', name: 'stuck', sessions: [session('three', { awaitsYou: true })] },
      ],
    })

    expect(projects.map((project) => project.key)).toEqual(['stuck', 'busy', 'quiet'])
  })

  /** Inside a project too: the tab that will not move without you is the one to reach first. */
  it('orders the conversations inside a project the same way', () => {
    const [project] = build({
      projects: [
        {
          key: 'one',
          name: 'one',
          sessions: [session('idle'), session('running', { status: 'running' }), session('waiting', { awaitsYou: true })],
        },
      ],
    })

    expect(project?.sessions.map((one) => one.sessionId)).toEqual(['waiting', 'running', 'idle'])
  })

  /**
   * A closed project is last, but it is on the list: an IDE that has just been started has nothing
   * open at all, and a phone that could only reach open projects would be useless at exactly the
   * moment it is picked up.
   */
  it('keeps remembered projects last and marks them closed', () => {
    const projects = build({
      projects: [{ key: 'open', name: 'open', sessions: [] }],
      recents: [
        { key: 'r-1', name: 'yesterday' },
        { key: 'r-2', name: 'last week' },
      ],
    })

    expect(projects.map((project) => project.key)).toEqual(['open', 'r-1', 'r-2'])
    expect(projects.map((project) => project.closed)).toEqual([false, true, true])
  })

  /**
   * An IDE that is not answering is shown greyed rather than hidden - "my laptop is asleep" and
   * "nothing is happening" are different answers, and the screen must not merge them.
   */
  it('marks everything from an IDE that is not answering as offline', () => {
    const projects = build(
      { projects: [{ key: 'one', name: 'one', sessions: [session('a')] }], recents: [{ key: 'r-1', name: 'two' }] },
      'asleep',
    )

    expect(projects.every((project) => !project.online)).toBe(true)
    expect(projects[0]?.sessions.every((one) => !one.online)).toBe(true)
  })

  /**
   * Putting a conversation away is this phone's own business: it is not closed, not stopped, and not
   * hidden from anybody else - it simply stops taking up a row on a screen the size of a hand.
   */
  it('leaves out what this phone has put away, and says how much', () => {
    const [project] = build(
      { projects: [{ key: 'one', name: 'one', sessions: [session('a'), session('b')] }] },
      'connected',
      ['a1:one:b'],
    )

    expect(project?.sessions.map((one) => one.sessionId)).toEqual(['a'])
    expect(project?.hiddenCount).toBe(1)
  })

  /**
   * Except when it is waiting for a person. Answering those is the whole reason the phone is picked up,
   * and one tidied away an hour ago would otherwise sit unanswered out of sight.
   */
  it('brings a hidden conversation back when it needs answering', () => {
    const [project] = build(
      { projects: [{ key: 'one', name: 'one', sessions: [session('a', { awaitsYou: true })] }] },
      'connected',
      ['a1:one:a'],
    )

    expect(project?.sessions.map((one) => one.sessionId)).toEqual(['a'])
    expect(project?.hiddenCount).toBe(0)
  })

  /**
   * Every project's first tab is called "main" by the IDE itself, so an identifier says which
   * conversation only together with the project it is in. Hiding one used to hide the same-named tab
   * of every other project on that machine.
   */
  it('puts away one project\'s conversation without touching another project\'s namesake', () => {
    const projects = build(
      {
        projects: [
          { key: 'one', name: 'one', sessions: [session('main')] },
          { key: 'two', name: 'two', sessions: [session('main')] },
        ],
      },
      'connected',
      ['a1:one:main'],
    )

    expect(projects[0]?.sessions).toHaveLength(0)
    expect(projects[1]?.sessions.map((one) => one.sessionId)).toEqual(['main'])
  })

  /** An IDE that has not sent its list yet contributes nothing rather than an empty machine. */
  it('says nothing about an IDE that has not reported', () => {
    expect(buildProjects([agent], {}, { a1: 'connecting' })).toEqual([])
  })

  /** An IDE too old to send them says nothing about either, and nothing means the quiet state. */
  it('takes a conversation with no word about its work as quiet', () => {
    const projects = build({ projects: [{ key: 'one', name: 'one', sessions: [session('main')] }] })

    expect(projects[0]?.sessions[0]?.worked).toBe(false)
    expect(projects[0]?.sessions[0]?.crashed).toBe(false)
  })
})

/**
 * What a row's mark says, and in which order the states outrank each other.
 *
 * The order is the point: every state past the first is also true of the ones below it - a crashed
 * conversation is idle too, one waiting for a person may have worked before - so a mark that picks the
 * wrong one is a screen that quietly stops mentioning the thing worth acting on.
 */
describe("a conversation's mark", () => {
  const row = (extra: Partial<ReturnType<typeof plain>> = {}) => ({ ...plain(), ...extra })

  const plain = () => ({
    agentId: 'a1',
    agentLabel: 'WebStorm on desk',
    projectKey: 'one',
    projectName: 'one',
    sessionId: 'main',
    title: 'main',
    titleSource: 'default',
    status: 'idle',
    awaitsYou: false,
    worked: false,
    crashed: false,
    groupId: 'main',
    depth: 0,
    awaits: '',
    since: 0,
    seq: 0,
    online: true,
  })

  it('is unlit for a conversation that has never done anything', () => {
    expect(chatState(row())).toBe('idle')
  })

  it('is green once a turn has been carried through', () => {
    expect(chatState(row({ worked: true }))).toBe('done')
  })

  it('shows work in progress over work already done', () => {
    expect(chatState(row({ status: 'running', worked: true }))).toBe('running')
  })

  it('shows what waits for a person over anything that is merely running', () => {
    expect(chatState(row({ status: 'running', awaitsYou: true }))).toBe('attention')
  })

  it('shows a dead process above all of it', () => {
    expect(chatState(row({ crashed: true, awaitsYou: true, status: 'running', worked: true }))).toBe('crashed')
  })
})

/**
 * The band at the top of the first screen.
 *
 * Its own test because it is the reason the screen was redrawn: a phone is picked up to unblock
 * something, and having to find which of four project cards holds the one thing that needs an answer is
 * the work the band takes away. It has to gather across every project and every paired IDE, and it has
 * to keep the order the cards under it are already argued into - a band that disagrees with the list it
 * stands over is worse than no band.
 */
describe('what is waiting, across every project', () => {
  const inventory = (): Inventory => ({
    projects: [
      {
        key: 'quiet',
        name: 'quiet',
        sessions: [{ id: 'main', title: 'nothing here', status: 'idle', awaitsYou: false, q: 0 }],
      },
      {
        key: 'busy',
        name: 'busy',
        sessions: [
          { id: 'main', title: 'a plan', status: 'idle', awaitsYou: true, awaits: 'plan', q: 0 },
          { id: 'b', title: 'merely running', status: 'running', awaitsYou: false, q: 0 },
          { id: 'c', title: 'a permission', status: 'idle', awaitsYou: true, awaits: 'perm', q: 0 },
        ],
      },
    ],
  })

  const states: Record<string, LinkState> = { one: 'connected' }

  it('gathers only what is stopped for a person', () => {
    const projects = buildProjects([{ agentId: 'one', label: 'laptop' }], { one: inventory() }, states)

    expect(waitingFor(projects).map((session) => session.title)).toEqual(['a plan', 'a permission'])
  })

  it('carries what each one is stopped for, so the band can say which is one tap and which is a page', () => {
    const projects = buildProjects([{ agentId: 'one', label: 'laptop' }], { one: inventory() }, states)

    expect(waitingFor(projects).map((session) => session.awaits)).toEqual(['plan', 'perm'])
  })

  it('keeps the order of the list it stands over', () => {
    const projects = buildProjects([{ agentId: 'one', label: 'laptop' }], { one: inventory() }, states)

    // "busy" ranks above "quiet" because something in it waits - and the band follows, rather than
    // sorting itself and disagreeing with the cards below.
    expect(projects[0]?.name).toBe('busy')
    expect(waitingFor(projects)[0]?.projectName).toBe('busy')
  })

  it('says nothing when nothing is stopped', () => {
    const idle: Inventory = {
      projects: [{ key: 'p', name: 'p', sessions: [{ id: 'main', title: 'x', status: 'running', awaitsYou: false, q: 0 }] }],
    }

    expect(waitingFor(buildProjects([{ agentId: 'one', label: 'laptop' }], { one: idle }, states))).toEqual([])
  })
})
