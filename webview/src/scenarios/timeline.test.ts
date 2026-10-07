import { describe, expect, it } from 'vitest'
import type { Scenario, ScenarioRun, ScenarioRunStep } from '../protocol'
import { cutCardOf, resumable, runWorked, stepWorked, timelineOf } from './timeline'

const snapshot: Scenario = {
  version: 1,
  id: 'x',
  name: 'Round',
  createdAt: 0,
  updatedAt: 0,
  inputs: [],
  head: { briefing: '', model: '', effort: '', permissionMode: 'default', onQuestion: 'head', retries: 2 },
  stages: [
    {
      id: 's1',
      title: 'Review',
      repeat: 2,
      untilDone: true,
      cards: [
        { id: 'a', title: 'Look', prompt: 'x', slots: [], dod: '', after: '', model: '', effort: '', permissionMode: '' },
        { id: 'b', title: 'Fix', prompt: 'y', slots: [], dod: '', after: '', model: '', effort: '', permissionMode: '' },
      ],
    },
  ],
  scope: 'project',
}

const step = (key: string, cardId: string, pass: number, state: ScenarioRunStep['state'] = 'waiting'): ScenarioRunStep => ({
  key,
  cardId,
  stageId: 's1',
  pass,
  title: cardId,
  state,
  conversationId: '',
  startedAt: 0,
  finishedAt: 0,
  slots: {},
  prompt: '',
  said: '',
  summary: '',
  nudges: [],
  verdict: '',
  verdictReason: '',
  handoff: '',
  failure: '',
  error: '',
  cost: 0,
  tokens: 0,
})

const run = (over: Partial<ScenarioRun> = {}): ScenarioRun => ({
  id: 'r1',
  scenarioId: 'x',
  scenarioName: 'Round',
  scope: 'project',
  runFrom: '',
  snapshot,
  startedAt: 0,
  finishedAt: 0,
  state: 'running',
  inputs: {},
  total: 4,
  headConversationId: '',
  steps: [step('s1:a:1', 'a', 1), step('s1:b:1', 'b', 1), step('s1:a:2', 'a', 2), step('s1:b:2', 'b', 2)],
  notes: [],
  question: null,
  failure: '',
  error: '',
  cost: 0,
  tokens: 0,
  ...over,
})

describe('a run read top to bottom', () => {
  // Two cards looped twice are four rows, not "two cards, ×2": the one question at midnight is which of
  // the four is happening now, and a folded loop cannot answer it.
  it('writes every pass of a loop out as a row of its own', () => {
    const rows = timelineOf(run())

    expect(rows.map((row) => row.key)).toEqual(['s1:a:1', 's1:b:1', 's1:a:2', 's1:b:2'])
  })

  // Without a heading per pass, the row is the only thing that can say which pass it is.
  it('tells every row which pass it is and how many there could be', () => {
    const rows = timelineOf(run())

    expect(rows.map((row) => (row.kind === 'step' ? [row.step.pass, row.passes, row.untilDone] : row.kind))).toEqual([
      [1, 2, true],
      [1, 2, true],
      [2, 2, true],
      [2, 2, true],
    ])
  })

  /*
   * A heading only where there is more than one stage to tell apart: over a run of one stage it repeats
   * a name that everything under it already belongs to.
   */
  it('names the stages only when there is more than one of them', () => {
    const two = run({
      snapshot: {
        ...snapshot,
        stages: [
          { ...snapshot.stages[0], repeat: 1, untilDone: false, cards: [snapshot.stages[0].cards[0]] },
          { id: 's2', title: 'Ship', repeat: 1, untilDone: false, cards: [snapshot.stages[0].cards[1]] },
        ],
      },
      steps: [step('s1:a:1', 'a', 1), { ...step('s2:b:1', 'b', 1), stageId: 's2' }],
      total: 2,
    })

    expect(timelineOf(two).map((row) => (row.kind === 'stage' ? row.title : row.key))).toEqual([
      'Review',
      's1:a:1',
      'Ship',
      's2:b:1',
    ])
  })

  // The head speaks about a card twice - choosing its slots, then judging what came back - and both are
  // about that card. Sorted by time alone, the choosing would sit above the card it was for.
  it('puts the head words under the card they were about', () => {
    const rows = timelineOf(
      run({
        notes: [
          { at: 30, stepKey: 's1:a:1', text: 'done, it read both files' },
          { at: 10, stepKey: '', text: 'read the briefing' },
          { at: 20, stepKey: 's1:a:1', text: 'nothing to fill' },
        ],
      }),
    )

    expect(rows.map((row) => (row.kind === 'note' ? row.note.text : row.key))).toEqual([
      'read the briefing',
      's1:a:1',
      'nothing to fill',
      'done, it read both files',
      's1:b:1',
      's1:a:2',
      's1:b:2',
    ])
  })
})

describe('a run that ended', () => {
  const begun = (key: string, cardId: string, pass: number, state: ScenarioRunStep['state']): ScenarioRunStep => ({
    ...step(key, cardId, pass, state),
    startedAt: 1_000,
  })

  /*
   * Picked up where it stood: only a run that was stopped or fell over, and only when its main thread came
   * up at all - a head that never came up remembers nothing. The IDE decides for real (see CarryOn on its
   * side); this is what the button is drawn from.
   */
  it('can be picked up when it was stopped or fell over and had a main thread', () => {
    expect(resumable(run({ state: 'stopped', headConversationId: 'head' }))).toBe(true)
    expect(resumable(run({ state: 'failed', headConversationId: 'head' }))).toBe(true)
    expect(resumable(run({ state: 'done', headConversationId: 'head' }))).toBe(false)
    expect(resumable(run({ state: 'running', headConversationId: 'head' }))).toBe(false)
    expect(resumable(run({ state: 'failed', headConversationId: '' }))).toBe(false)
  })

  // The sentence over the timeline names the card it happened at - the last that ever began.
  it('is placed by the last card that began', () => {
    const cut = run({
      state: 'stopped',
      steps: [begun('s1:a:1', 'a', 1, 'done'), begun('s1:b:1', 'b', 1, 'failed'), step('s1:a:2', 'a', 2, 'skipped')],
    })

    expect(cutCardOf(cut)).toBe('b')
    expect(cutCardOf(run({ state: 'stopped' }))).toBe('')
  })

  /*
   * The time it stood picked-up-later does not count: a run stopped at midnight and continued after
   * breakfast took the minutes it worked, not the night in between.
   */
  it('does not count the time it stood between an ending and a pick-up', () => {
    expect(runWorked({ startedAt: 1_000, finishedAt: 61_000, idle: 20_000 }, 0)).toBe(40_000)
    expect(runWorked({ startedAt: 1_000, finishedAt: 0, idle: 5_000 }, 31_000)).toBe(25_000)
    // A record written before there was such a thing.
    expect(runWorked({ startedAt: 1_000, finishedAt: 4_000 }, 0)).toBe(3_000)
  })

  /*
   * A pause and a question nobody has answered are not work either: a question asked at eleven and answered
   * after breakfast is not nine hours of the run's.
   */
  it('does not count what it stood still for, and stands still while it stands', () => {
    // Ten seconds of a pause, already over.
    expect(runWorked({ startedAt: 0, finishedAt: 60_000, rested: 10_000 }, 0)).toBe(50_000)
    // Standing still since 40s: the clock reads 40s - 5s rested, whenever it is looked at.
    const paused = { startedAt: 0, finishedAt: 0, rested: 5_000, restingSince: 40_000 }
    expect(runWorked(paused, 50_000)).toBe(35_000)
    expect(runWorked(paused, 900_000)).toBe(35_000)
    // A stamp left on an ended run is not read: the end closes the stretch.
    expect(runWorked({ ...paused, finishedAt: 70_000 }, 900_000)).toBe(65_000)
  })

  it('takes a pause off the card that was on the board, and only off that one', () => {
    const live = { finishedAt: 0, restingSince: 50_000 }
    // The open card stops with the run.
    expect(stepWorked({ startedAt: 10_000, finishedAt: 0, rested: 1_000 }, 80_000, live)).toBe(39_000)
    // A finished card keeps what it had.
    expect(stepWorked({ startedAt: 1_000, finishedAt: 11_000, rested: 2_000 })).toBe(8_000)
    // One that never had its go has no time at all.
    expect(stepWorked({ startedAt: 0, finishedAt: 0 }, 80_000, live)).toBe(0)
  })

  it('takes what its cards stood still for off a stage heading', () => {
    const done = timelineOf(
      run({
        steps: [
          { ...begun('s1:a:1', 'a', 1, 'done'), startedAt: 1_000, finishedAt: 61_000, rested: 20_000 },
          { ...begun('s2:b:1', 'b', 1, 'done'), stageId: 's2', startedAt: 61_000, finishedAt: 62_000 },
        ],
      }),
    )
    const stage = done.find((row) => row.kind === 'stage')
    expect(stage?.kind === 'stage' ? stage.took : -1).toBe(40_000)
  })
})
