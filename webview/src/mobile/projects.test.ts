import { describe, expect, it } from 'vitest'
import type { LinkState } from './link'
import { buildProjects, type Inventory } from './projects'

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
})
