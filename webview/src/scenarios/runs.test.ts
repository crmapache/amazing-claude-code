import { describe, expect, it } from 'vitest'
import type { ScenarioRunSummary } from '../protocol'
import { DOUBLE_PRESS_MS, pastRuns, pressedAgain, runMarks, runningRuns } from './runs'

/**
 * Splitting the runs into what is going and what is over, and naming them apart.
 *
 * Both rules are read by two screens - the hub at the desk and the phone - and both fail quietly: a run
 * in two lists at once, or three tabs with the same name over three different pieces of work.
 */

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

describe('runningRuns and pastRuns', () => {
  it('puts the newest run of the live ones first', () => {
    const live = [summary({ id: 'a', startedAt: 1 }), summary({ id: 'b', startedAt: 2 })]

    expect(runningRuns(live).map((run) => run.id)).toEqual(['b', 'a'])
  })

  /**
   * A run stands in one section or the other and never in both. It used to be one list with a badge,
   * which was honest while only one run could ever be going.
   */
  it('keeps a live run out of the finished ones', () => {
    const live = [summary({ id: 'a' })]
    const all = [summary({ id: 'a' }), summary({ id: 'b', state: 'done', finishedAt: 5 })]

    expect(pastRuns(all, live).map((run) => run.id)).toEqual(['b'])
  })

  it('leaves everything in the past when nothing is going', () => {
    const all = [summary({ id: 'a', state: 'done' }), summary({ id: 'b', state: 'failed' })]

    expect(pastRuns(all, []).map((run) => run.id)).toEqual(['a', 'b'])
  })
})

describe('runMarks', () => {
  it('names a run by the first answer it was given', () => {
    const marks = runMarks([
      { id: 'a', scenarioId: 's1', inputs: { ticket: 'ACC-12' }, startedAt: 1 },
      { id: 'b', scenarioId: 's1', inputs: { ticket: 'ACC-99' }, startedAt: 2 },
    ])

    expect(marks.a).toBe('ACC-12')
    expect(marks.b).toBe('ACC-99')
  })

  /**
   * The name of the scenario already says everything when it is the only run of it about; a ticket or a
   * clock beside it would be a qualifier answering a question nobody asked.
   */
  it('says nothing about a run that is the only one of its scenario', () => {
    const marks = runMarks([
      { id: 'a', scenarioId: 's1', inputs: { ticket: 'ACC-12' }, startedAt: 1 },
      { id: 'b', scenarioId: 's2', inputs: { ticket: 'ACC-99' }, startedAt: 2 },
    ])

    expect(marks.a).toBe('')
    expect(marks.b).toBe('')
  })

  /**
   * The case the whole function exists for: the same round of work against the same ticket, started
   * twice. The start form is even filled in from the last run's answers, so this is the ordinary second
   * run rather than an odd one.
   */
  it('tells two runs with the same answers apart', () => {
    const at = new Date(2025, 0, 6, 9, 41, 12).getTime()
    const marks = runMarks([
      { id: 'a', scenarioId: 's1', inputs: { ticket: 'ACC-12' }, startedAt: at },
      { id: 'b', scenarioId: 's1', inputs: { ticket: 'ACC-12' }, startedAt: at + 4_000 },
    ])

    expect(marks.a).not.toBe(marks.b)
    expect(marks.a).toContain('ACC-12')
    expect(marks.a).toContain('09:41:12')
    expect(marks.b).toContain('09:41:16')
  })

  /** A scenario that asks nothing has no answer to be named by, so the clock is all there is. */
  it('falls back to the clock when nothing was asked', () => {
    const at = new Date(2025, 0, 6, 9, 41, 12).getTime()
    const marks = runMarks([
      { id: 'a', scenarioId: 's1', inputs: {}, startedAt: at },
      { id: 'b', scenarioId: 's1', inputs: {}, startedAt: at + 9_000 },
    ])

    expect(marks.a).toBe('09:41:12')
    expect(marks.b).toBe('09:41:21')
  })

  /** An answer is free text somebody typed: it arrives as a paragraph often enough. */
  it('cuts a long answer to one short line', () => {
    const marks = runMarks([
      { id: 'a', scenarioId: 's1', inputs: { notes: `${'x'.repeat(200)}\nsecond line` }, startedAt: 1 },
      { id: 'b', scenarioId: 's1', inputs: { notes: 'other' }, startedAt: 2 },
    ])

    expect(marks.a).toBe('x'.repeat(40))
  })
})

/**
 * The guard against a finger that bounced on Run.
 *
 * It belongs to the BUTTON that was pressed, not to the panel. One mark for the whole screen made the
 * ordinary thing - start this round of work, then start that one - fail silently: the second press sent
 * nothing at all, and the screen said nothing either, because from the panel's side nothing happened.
 */
describe('pressedAgain', () => {
  it('lets a different scenario start straight away', () => {
    const after = pressedAgain({}, 'one:project', 1_000)
    expect(after).not.toBe(null)

    expect(pressedAgain(after!, 'two:project', 1_100)).not.toBe(null)
  })

  it('swallows the second press on the same button', () => {
    const after = pressedAgain({}, 'one:project', 1_000)!

    expect(pressedAgain(after, 'one:project', 1_000 + DOUBLE_PRESS_MS - 1)).toBe(null)
    expect(pressedAgain(after, 'one:project', 1_000 + DOUBLE_PRESS_MS)).not.toBe(null)
  })

  /**
   * A press that was refused started nothing, so there is nothing to guard against: without this, an
   * error meant waiting out the guard before the same button could be tried again - and nothing on the
   * screen said to wait.
   */
  it('forgets a press that came to nothing', () => {
    const after = pressedAgain({}, 'one:project', 1_000)!

    expect(pressedAgain({ ...after, 'one:project': 0 }, 'one:project', 1_100)).not.toBe(null)
  })
})
