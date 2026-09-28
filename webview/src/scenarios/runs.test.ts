import { describe, expect, it } from 'vitest'
import type { ScenarioRunSummary } from '../protocol'
import {
  answerLabel,
  DOUBLE_PRESS_MS,
  liveDot,
  pastRuns,
  pressedAgain,
  runDot,
  runMarks,
  runningRuns,
  runsOf,
} from './runs'

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

/**
 * The dot a run is drawn with. It fails quietly in the only direction that matters: a run working for an
 * hour under the grey dot of a tab nobody has open says the panel is idle when it is not.
 */
describe('runsOf', () => {
  // Dragged over to the other shelf mid-run: the run still carries the shelf it was started from.
  it('follows a scenario that was moved to the other shelf', () => {
    const run = summary({ scenarioId: 's1', scope: 'project' })
    const moved = { id: 's1', scope: 'user' as const }

    expect(runsOf([run], moved, [moved])).toEqual([run])
  })

  // A project file back from a checkout beside somebody's own copy: the shelf is all that tells them apart.
  it('lets the shelf decide between two scenarios under one identifier', () => {
    const project = { id: 's1', scope: 'project' as const }
    const own = { id: 's1', scope: 'user' as const }
    const run = summary({ scenarioId: 's1', scope: 'project' })

    expect(runsOf([run], project, [project, own])).toEqual([run])
    expect(runsOf([run], own, [project, own])).toEqual([])
  })

  it('leaves out the runs of other scenarios', () => {
    const scenario = { id: 's1', scope: 'project' as const }

    expect(runsOf([summary({ scenarioId: 's2' })], scenario, [scenario])).toEqual([])
  })
})

describe('runDot', () => {
  it('breathes while the run is going, from the first moment', () => {
    expect(runDot(summary({ state: 'starting' }))).toBe('running')
    expect(runDot(summary({ state: 'running' }))).toBe('running')
  })

  it('calls for a person when the run stands on a question', () => {
    expect(runDot(summary({ state: 'blocked', asking: 'Ship it?' }))).toBe('attention')
  })

  /** Parked by a hand, and nothing is being spent - a breathing dot there would promise work. */
  it('goes quiet on a pause and on a stop', () => {
    expect(runDot(summary({ state: 'paused' }))).toBe('idle')
    expect(runDot(summary({ state: 'stopped', finishedAt: 9 }))).toBe('idle')
  })

  /** A pause laid over an open question: the question can still be answered, so it still calls. */
  it('keeps calling when the pause came down over a question', () => {
    expect(runDot(summary({ state: 'paused', asking: 'Ship it?' }))).toBe('attention')
  })

  it('tells a finished round of work from a failed one', () => {
    expect(runDot(summary({ state: 'done', finishedAt: 9 }))).toBe('done')
    expect(runDot(summary({ state: 'failed', finishedAt: 9, failure: 'crashed' }))).toBe('crashed')
  })

  /**
   * A summary is read off that machine's disk, and an IDE closed in the middle of a step leaves the last
   * state it wrote there for ever. Drawn from the record alone, such a row breathes over work that ended
   * in the night - on the first screen of a phone, which is read to find out whether anything is going.
   */
  it('goes quiet over a run the machine no longer lists as going', () => {
    expect(runDot(summary({ state: 'running' }), false)).toBe('idle')
    expect(runDot(summary({ state: 'blocked', asking: 'Ship it?' }), false)).toBe('idle')
  })

  /** How it ended is a fact about the record, and being over does not take it away. */
  it('still tells how a run that is over ended', () => {
    expect(runDot(summary({ state: 'done', finishedAt: 9 }), false)).toBe('done')
    expect(runDot(summary({ state: 'failed', finishedAt: 9, failure: 'crashed' }), false)).toBe('crashed')
  })
})

describe('liveDot', () => {
  it('says nothing when nothing is going', () => {
    expect(liveDot([])).toBe('idle')
  })

  it('lets the one being waited for speak for the whole shelf', () => {
    const live = [summary({ id: 'a' }), summary({ id: 'b', state: 'blocked', asking: 'Ship it?' })]

    expect(liveDot(live)).toBe('attention')
  })

  it('breathes while any of them works', () => {
    expect(liveDot([summary({ id: 'a', state: 'paused' }), summary({ id: 'b' })])).toBe('running')
  })

  /**
   * The one live run of a shelf, and it is the first of the list - which is the trap. Handed straight to
   * map, runDot is called with the index as its second argument, and a zero there says "this run is not
   * going": the shelf with one round of work under way went grey, and only that one.
   */
  it('breathes over a single run that is going', () => {
    expect(liveDot([summary({ id: 'a', state: 'running' })])).toBe('running')
    expect(liveDot([summary({ id: 'a', state: 'blocked', asking: 'Ship it?' })])).toBe('attention')
  })

  it('stays quiet over runs that are all parked', () => {
    expect(liveDot([summary({ id: 'a', state: 'paused' })])).toBe('idle')
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

  /**
   * Caught on a phone: two runs of one scenario against two Notion pages. Cut to a label's width, both
   * marks read "https://app.notion.com/p/" and nothing else.
   */
  it('names a link by the page it points at rather than by its head', () => {
    const marks = runMarks([
      { id: 'a', scenarioId: 's1', inputs: { task: 'https://app.notion.com/p/Shopify-checkout-2a3f5c' }, startedAt: 1 },
      { id: 'b', scenarioId: 's1', inputs: { task: 'https://app.notion.com/p/Name-cleanup-9b1e07' }, startedAt: 2 },
    ])

    expect(marks.a).toBe('Shopify-checkout-2a3f5c')
    expect(marks.b).toBe('Name-cleanup-9b1e07')
  })
})

describe('answerLabel', () => {
  it('keeps plain answers as they are', () => {
    expect(answerLabel({ ticket: 'ACC-12' })).toBe('ACC-12')
    expect(answerLabel({ empty: '  ', ticket: 'ACC-12' })).toBe('ACC-12')
    expect(answerLabel({})).toBe('')
  })

  /** "45" alone could be anything; the segment before it says what it is a number of. */
  it('keeps what a bare number is a number of', () => {
    expect(answerLabel({ pr: 'https://github.com/crmapache/amazing-claude-code/pull/45' })).toBe('pull/45')
    expect(answerLabel({ issue: 'https://github.com/org/repo/issues/123/' })).toBe('issues/123')
  })

  it('reads a segment the way a person would, and drops the query', () => {
    expect(answerLabel({ page: 'https://www.notion.so/team/%D0%9F%D0%BB%D0%B0%D0%BD-abc?pvs=4' })).toBe('План-abc')
    expect(answerLabel({ ticket: 'https://acme.atlassian.net/browse/PROJ-812#comment' })).toBe('PROJ-812')
  })

  it('names a link with no path by its host', () => {
    expect(answerLabel({ site: 'https://www.example.com/' })).toBe('example.com')
  })

  /** A line that only starts with a link is a sentence about it, and stays one. */
  it('leaves text that merely contains a link alone', () => {
    expect(answerLabel({ note: 'see https://example.com/a for context' })).toBe('see https://example.com/a for context')
  })

  it('cuts to the length it is asked for', () => {
    expect(answerLabel({ page: 'https://app.notion.com/p/Shopify-checkout-2a3f5c' }, 8)).toBe('Shopify-')
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
