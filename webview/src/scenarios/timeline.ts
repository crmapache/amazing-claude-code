import type { Scenario, ScenarioRun, ScenarioRunNote, ScenarioRunStep, ScenarioStage } from '../protocol'
import { passesOf } from './rules'

/**
 * A run read top to bottom: the stages in order, every pass of a loop written out as its own block, and
 * the head's own words wedged in where it said them.
 *
 * The loops are unrolled on purpose. A stage set to go round three times is six cards if it holds two,
 * and drawing it as "two cards, ×3" would be a picture of the scenario rather than of the run - the one
 * question anybody has at midnight is which of those six is happening now, and a folded loop cannot
 * answer it. The rows a loop will not reach are still drawn (see rules.plan): a timeline that loses rows
 * when the head ends a loop early is one whose length depends on the outcome.
 */

export type TimelineRow =
  | { kind: 'stage'; key: string; stageId: string; title: string }
  | {
      kind: 'step'
      key: string
      step: ScenarioRunStep
      index: number
      /** How many passes its stage was given, and whether that number is a ceiling. One means no loop. */
      passes: number
      untilDone: boolean
    }
  | { kind: 'note'; key: string; note: ScenarioRunNote }

export const timelineOf = (run: ScenarioRun): TimelineRow[] => {
  const rows: TimelineRow[] = []
  const stages = new Map(run.snapshot.stages.map((stage) => [stage.id, stage]))

  /*
   * A heading only where there is more than one stage to tell apart.
   *
   * Over a run of one stage it is a line and an indent spent on repeating a name the rows do not need:
   * everything under it belongs to it, and there is nothing to separate it from. Which pass a row is
   * travels with the row instead (see below) - that is the one thing a heading used to say that the
   * rows could not.
   */
  const many = new Set(run.steps.map((step) => step.stageId)).size > 1

  // Everything the head said before the first card was handed over: about the run itself rather than
  // about any one step of it (see the empty key in ScenarioEngine.note).
  for (const note of notesFor(run.notes, '')) rows.push({ kind: 'note', key: noteKey(note), note })

  let stageId = ''

  run.steps.forEach((step, index) => {
    const stage = stages.get(step.stageId)

    if (many && step.stageId !== stageId) {
      stageId = step.stageId
      rows.push({ kind: 'stage', key: `stage:${step.stageId}`, stageId: step.stageId, title: stage?.title ?? '' })
    }

    rows.push({
      kind: 'step',
      key: step.key,
      step,
      index,
      passes: stage ? passesOf(stage) : 1,
      untilDone: stage?.untilDone ?? false,
    })
    for (const note of notesFor(run.notes, step.key)) rows.push({ kind: 'note', key: noteKey(note), note })
  })

  return rows
}

/**
 * The head's words about one step, oldest first.
 *
 * Under the step rather than beside it, because the head speaks about a card twice - once choosing what
 * to put in its slots, once judging what came back - and both of those are about that card. Sorting the
 * whole lot by time instead would put the choosing above the card it was for, which reads as a remark
 * about the card before it.
 */
const notesFor = (notes: ScenarioRunNote[], stepKey: string): ScenarioRunNote[] =>
  notes.filter((note) => note.stepKey === stepKey).sort((one, two) => one.at - two.at)

const noteKey = (note: ScenarioRunNote): string => `note:${note.stepKey}:${note.at}`

/** How far the run has got, as the bar over the timeline draws it. */
export interface Progress {
  done: number
  failed: number
  /** Cards that had a go and have not finished it - at most one, but a paused run leaves it standing. */
  running: number
  total: number
}

export const progressOf = (run: ScenarioRun): Progress => ({
  done: run.steps.filter((step) => step.state === 'done').length,
  failed: run.steps.filter((step) => step.state === 'failed').length,
  running: run.steps.filter((step) => step.state === 'running' || step.state === 'asking' || step.state === 'judging')
    .length,
  total: run.total || run.steps.length,
})

/** Whether the run is over, however it ended. */
export const finished = (state: ScenarioRun['state']): boolean =>
  state === 'done' || state === 'failed' || state === 'stopped'

/** Whether a step ever had its go at all. */
export const begun = (state: ScenarioRunStep['state']): boolean => state !== 'waiting' && state !== 'skipped'

/**
 * The card a step is a go at, out of the run's own snapshot.
 *
 * The snapshot rather than today's scenario: what a card said the night it ran is what its step was, and
 * a timeline drawn from the scenario as it stands now would put words into a card that never said them.
 */
export const cardOf = (snapshot: Scenario, step: ScenarioRunStep): { stage: ScenarioStage; card: Scenario['stages'][number]['cards'][number] } | null => {
  const stage = snapshot.stages.find((one) => one.id === step.stageId)
  const card = stage?.cards.find((one) => one.id === step.cardId)
  return stage && card ? { stage, card } : null
}
