import { describe, expect, it } from 'vitest'
import type { Scenario, ScenarioRun, ScenarioRunStep } from '../protocol'
import { cutCardOf, progressOf, resumable, runElapsed, timelineOf } from './timeline'

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

  it('counts how far it has got', () => {
    const counted = run({
      steps: [
        step('s1:a:1', 'a', 1, 'done'),
        step('s1:b:1', 'b', 1, 'running'),
        step('s1:a:2', 'a', 2, 'failed'),
        step('s1:b:2', 'b', 2, 'skipped'),
      ],
    })

    expect(progressOf(counted)).toEqual({ done: 1, failed: 1, running: 1, total: 4 })
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
    expect(runElapsed({ startedAt: 1_000, finishedAt: 61_000, idle: 20_000 }, 0)).toBe(40_000)
    expect(runElapsed({ startedAt: 1_000, finishedAt: 0, idle: 5_000 }, 31_000)).toBe(25_000)
    // A record written before there was such a thing.
    expect(runElapsed({ startedAt: 1_000, finishedAt: 4_000 }, 0)).toBe(3_000)
  })
})
