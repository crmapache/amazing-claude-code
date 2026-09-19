import { describe, expect, it } from 'vitest'
import type { ScenarioQueued, ScenarioQueueState, ScenarioRunSummary } from '../protocol'
import { namedRun, queueBehind, queueMarks, queueStanding, queuedFor } from './queue'

const entry = (over: Partial<ScenarioQueued> = {}): ScenarioQueued => ({
  id: 'q1',
  scenarioId: 's1',
  scope: 'project',
  scenarioName: 'Review and fix',
  inputs: {},
  afterSuccess: true,
  addedAt: 1_000,
  failure: '',
  ...over,
})

const queue = (over: Partial<ScenarioQueueState> = {}): ScenarioQueueState => ({
  waiting: [],
  runId: '',
  runName: '',
  raisedAt: 0,
  held: false,
  heldWhy: '',
  heldName: '',
  ...over,
})

const run = (id: string, over: Partial<ScenarioRunSummary> = {}): ScenarioRunSummary =>
  ({
    id,
    scenarioId: 's1',
    scenarioName: 'Review and fix',
    scope: 'project',
    state: 'running',
    startedAt: 1_000,
    ...over,
  }) as ScenarioRunSummary

describe('where the queue stands', () => {
  it('says nothing is lined up for an empty one', () => {
    expect(queueStanding(queue(), []).kind).toBe('empty')
    expect(queueStanding(null, []).kind).toBe('empty')
  })

  it('names the run it raised while that run is going', () => {
    const standing = queueStanding(queue({ runId: 'r1', waiting: [entry()] }), [run('r1')])

    expect(standing).toEqual({ kind: 'going', run: run('r1'), mark: '' })
  })

  /**
   * The moment between two turns: the last one has ended and the next has not been raised yet. Drawn as
   * "empty" it would read as a queue that quietly dropped the rest of the night.
   */
  it('says turns are waiting between two of them', () => {
    expect(queueStanding(queue({ runId: 'r1', waiting: [entry()] }), []).kind).toBe('waiting')
  })

  /**
   * A queue stops on a run that has already ended, so nothing it stands behind is going - but a run
   * somebody started by hand may well be, and a stopped queue does not stand behind anything until a
   * person lifts the stop. Asked in the other order, a night that stopped at midnight would be drawn as
   * going for as long as anybody worked beside it.
   */
  it('says it has stopped even while an unrelated run is going', () => {
    const stopped = queue({ runId: 'r1', held: true, heldWhy: 'failed', heldName: 'Build it', waiting: [entry()] })

    expect(queueStanding(stopped, [run('r1'), run('r9')])).toEqual({
      kind: 'held',
      why: 'failed',
      name: 'Build it',
      runId: 'r1',
      mark: '',
      after: run('r1'),
      afterMark: '',
    })
  })

  /**
   * The case this was recorded from: a queue stopped on a morning run of "Task -> Prod" while a run of
   * "Task -> Prod" started by hand was going, and the stop read as "the run you just started was stopped
   * by you". The run it stopped on has left the live list, so it is found among the past ones.
   */
  it('names the run it stopped on by its ticket when a run of the same scenario is going', () => {
    const stopped = queue({ runId: 'r1', held: true, heldWhy: 'stopped', heldName: 'Task -> Prod', waiting: [entry()] })
    const morning = run('r1', { state: 'stopped', inputs: { task_path: 'notion/Read-a-change\nmore' } })
    const now = run('r9', { inputs: { task_path: 'notion/Tell-a-group' } })

    const standing = queueStanding(stopped, [now], [morning])

    expect(standing).toMatchObject({ kind: 'held', runId: 'r1', mark: 'notion/Read-a-change' })
    expect(standing.kind === 'held' && namedRun(standing.name, standing.mark)).toBe('Task -> Prod (notion/Read-a-change)')
  })

  /**
   * What the button promises. Over a run going beside the stopped queue it starts nothing - the queue stands
   * behind that run - and the band has to know which one to say so; over an idle working copy it starts the
   * next turn at once, and there is nothing to name.
   */
  it('knows which run going on anyway would stand behind', () => {
    const stopped = queue({ runId: 'r1', held: true, heldWhy: 'stopped', heldName: 'Task -> Prod', waiting: [entry()] })
    const live = [run('r8', { startedAt: 1_000 }), run('r9', { startedAt: 5_000, inputs: { task_path: 'notion/Tell-a-group' } })]

    expect(queueStanding(stopped, live)).toMatchObject({ after: { id: 'r9' }, afterMark: 'notion/Tell-a-group' })
    expect(queueStanding(stopped, [])).toMatchObject({ after: undefined, afterMark: '' })
  })

  /** Alone on the screen, the name says everything, and a ticket beside it answers a question nobody asked. */
  it('leaves the name bare when nothing else carries its scenario', () => {
    const stopped = queue({ runId: 'r1', held: true, heldWhy: 'failed', heldName: 'Build it', waiting: [entry({ scenarioId: 's2' })] })
    const past = [run('r1', { state: 'failed', inputs: { branch: 'mz/checkout' } })]

    expect(queueStanding(stopped, [], past)).toMatchObject({ kind: 'held', mark: '' })
  })

  /** A turn that would not start stops the queue with no run behind it: nothing to open, and its row says why. */
  it('names no run when a turn would not start', () => {
    const refused = queue({ held: true, heldWhy: 'scenarioGone', heldName: 'Build it', waiting: [entry({ failure: 'scenarioGone' })] })

    expect(queueStanding(refused, [])).toMatchObject({ kind: 'held', runId: '', mark: '' })
  })

  it('marks the run it stands behind when a turn of the same scenario waits under it', () => {
    const standing = queueStanding(
      queue({ runId: 'r9', waiting: [entry({ inputs: { task_path: 'notion/Decide' } })] }),
      [run('r9', { inputs: { task_path: 'notion/Tell-a-group' } })],
    )

    expect(standing).toMatchObject({ kind: 'going', mark: 'notion/Tell-a-group' })
  })
})

describe('what a turn added now would stand behind', () => {
  it('names nothing when nothing is going', () => {
    expect(queueBehind(queue(), [])).toBeUndefined()
  })

  /** The queue's own run first: its ending is what the next turn is judged against. */
  it('names the run the queue raised while it is going', () => {
    const live = [run('r1', { startedAt: 1_000 }), run('r9', { startedAt: 5_000 })]

    expect(queueBehind(queue({ runId: 'r1' }), live)?.id).toBe('r1')
  })

  /**
   * Otherwise the newest run going, whoever started it - the one the IDE will write into the queue when
   * the turn's time comes. This is the whole fix for "I ran one, queued the next, and it started beside
   * it": the form says so before the button is pressed.
   */
  it('names the newest run started by hand otherwise', () => {
    const live = [run('r8', { startedAt: 1_000, scenarioName: 'Older' }), run('r9', { startedAt: 5_000, scenarioName: 'Newer' })]

    expect(queueBehind(queue(), live)?.scenarioName).toBe('Newer')
    // A queue whose own run is over looks at what is going, not at what it raised.
    expect(queueBehind(queue({ runId: 'r1' }), live)?.scenarioName).toBe('Newer')
  })
})

describe('what a waiting turn is called', () => {
  it('says nothing when it is the only turn of its scenario', () => {
    expect(queueMarks([entry({ inputs: { branch: 'mz/checkout' } })])).toEqual({ q1: '' })
  })

  it('uses the first answer when two turns of one scenario are lined up', () => {
    const marks = queueMarks([
      entry({ id: 'q1', inputs: { branch: 'mz/checkout' } }),
      entry({ id: 'q2', inputs: { branch: 'mz/totals' } }),
    ])

    expect(marks).toEqual({ q1: 'mz/checkout', q2: 'mz/totals' })
  })

  it('keeps a label to one line and a sensible length', () => {
    const marks = queueMarks([
      entry({ id: 'q1', inputs: { note: ` ${'x'.repeat(60)}\nsecond line` } }),
      entry({ id: 'q2' }),
    ])

    expect(marks.q1).toBe('x'.repeat(40))
  })
})

describe('what one scenario has waiting', () => {
  /** One identifier can stand on both shelves at once - a project file beside somebody's own copy. */
  it('matches the shelf as well as the identifier', () => {
    const lined = queue({
      waiting: [entry({ id: 'q1', scope: 'project' }), entry({ id: 'q2', scope: 'user' })],
    })

    expect(queuedFor(lined, { id: 's1', scope: 'project' }).map((one) => one.id)).toEqual(['q1'])
  })
})
