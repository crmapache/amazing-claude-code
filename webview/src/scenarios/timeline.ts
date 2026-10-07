import type { UserToken } from '../feed/types'
import type { ScenarioRun, ScenarioRunNote, ScenarioRunStep } from '../protocol'
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

/**
 * Where a stage stands, as the one word its own heading carries.
 *
 * A chapter rather than a caption: "done in 8m", "here now", "not reached" answers what the rows under it
 * would otherwise have to be counted to work out. `ahead` covers both a stage nothing has begun in and one
 * a loop ended before it reached - from in front of the screen those are the same sentence.
 */
export type StageStanding = 'done' | 'here' | 'ahead'

export type TimelineRow =
  | {
      kind: 'stage'
      key: string
      stageId: string
      title: string
      /** Which stage of how many, counting from one - the number in front of the heading. */
      index: number
      total: number
      passes: number
      untilDone: boolean
      standing: StageStanding
      /** How long the whole stage took, once every go at it is over. Zero while it is not. */
      took: number
    }
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
      const of = run.steps.filter((one) => one.stageId === step.stageId)

      rows.push({
        kind: 'stage',
        key: `stage:${step.stageId}`,
        stageId: step.stageId,
        title: stage?.title ?? '',
        index: run.snapshot.stages.findIndex((one) => one.id === step.stageId) + 1,
        total: run.snapshot.stages.length,
        passes: stage ? passesOf(stage) : 1,
        untilDone: stage?.untilDone ?? false,
        standing: standingOf(of),
        took: tookBy(of),
      })
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

/**
 * What the person wrote to the main thread, as the pieces a chat message is drawn from (see SentTokens).
 *
 * The field's own tokens when the note carries them; its text as one piece when it does not - a note from an
 * IDE that sent no tokens, or one read on a phone, which gets the text alone (see RemoteFeed.runBody). Nothing
 * for the main thread's own notes.
 */
export const toldTokens = (note: ScenarioRunNote): UserToken[] => {
  if (note.who !== 'person') return []
  if (Array.isArray(note.tokens) && note.tokens.length > 0) return note.tokens as UserToken[]
  return note.text ? [{ kind: 'text', value: note.text }] : []
}

// Who as well as when: the person's words and the main thread's answer are two notes of one moment.
const noteKey = (note: ScenarioRunNote): string => `note:${note.who ?? ''}:${note.stepKey}:${note.at}`

/**
 * Where a stage stands, from its own steps and nothing else.
 *
 * "Here now" wins over everything: a stage with a card working in it is where the run is, whatever the
 * rows above and below have done. A stage nothing has begun in and one whose passes were all skipped are
 * both `ahead` - it was never reached either way, and "skipped" is a word about a row rather than about a
 * chapter.
 */
const standingOf = (steps: ScenarioRunStep[]): StageStanding => {
  if (steps.some((step) => step.state === 'running' || step.state === 'asking' || step.state === 'judging')) {
    return 'here'
  }
  if (steps.some((step) => step.state === 'paused')) return 'here'
  if (steps.some((step) => step.state === 'done' || step.state === 'failed')) {
    return steps.every((step) => step.state !== 'waiting') ? 'done' : 'here'
  }
  return 'ahead'
}

/**
 * How long a stage took, from the first go at it to the last.
 *
 * The span rather than the sum of its cards: a stage is a stretch of the evening, and two cards of six
 * minutes each with the head thinking between them took more than twelve. Zero while anything in it is
 * still open, because the number would go on changing under the heading. What its cards stood still for
 * is not in it (see ScenarioRunStep.rested) - the heading and the run's clock agree about a pause.
 */
const tookBy = (steps: ScenarioRunStep[]): number => {
  const begun = steps.filter((step) => step.startedAt > 0)
  if (begun.length === 0 || begun.some((step) => step.finishedAt === 0)) return 0

  const from = Math.min(...begun.map((step) => step.startedAt))
  const to = Math.max(...begun.map((step) => step.finishedAt))
  const rested = begun.reduce((sum, step) => sum + (step.rested ?? 0), 0)
  return Math.max(0, to - from - rested)
}

/**
 * Whether a finished run can be picked up where it stood - the screens' half of CarryOn.pointOf on
 * the IDE's side, which decides for real: a run that was stopped or fell over, and whose main thread
 * came up at all. A finished one has nothing to pick up, and a head that never came up remembers
 * nothing.
 */
export const resumable = (run: ScenarioRun): boolean =>
  (run.state === 'stopped' || run.state === 'failed') && run.headConversationId.length > 0

/**
 * The card a finished run got to: the last that ever began. What the sentence over the timeline names
 * - "you stopped it at X" - and empty for a run that ended before its first card.
 */
export const cutCardOf = (run: ScenarioRun): string =>
  [...run.steps].reverse().find((step) => step.startedAt > 0)?.title ?? ''

/** What a clock is worked out of - a whole run and a summary of one carry the same fields. */
export interface RunClock {
  startedAt: number
  finishedAt: number
  idle?: number
  rested?: number
  restingSince?: number
}

/**
 * How long the run has genuinely worked: the span from its start to its end (or to now) without the
 * stretches it was not working - waiting to be picked up again (`idle`), standing still on a pause or on a
 * person's question (`rested`, and the stretch it is standing in now). The same sum as RunClock.kt.
 *
 * A run standing still does not tick: the open stretch grows exactly as fast as the span. A run whose IDE
 * went away ends where it was last written (see RunStore.abandoned), so the night it lay is not here
 * either. `now` is the IDE's clock on a phone, not the phone's (see hooks/useNow).
 */
export const runWorked = (run: RunClock, now: number): number => {
  const end = run.finishedAt > 0 ? run.finishedAt : now
  const standing = run.finishedAt === 0 && (run.restingSince ?? 0) > 0 ? Math.max(0, now - (run.restingSince ?? 0)) : 0
  return Math.max(0, end - run.startedAt - (run.idle ?? 0) - (run.rested ?? 0) - standing)
}

/**
 * How long one card has genuinely worked - its span without what the run stood still for while it was on
 * the board. Only the card that is open can be standing still right now, so only its row stops with the
 * run's clock; a finished card needs neither the clock nor its run. Zero for a card that never had its go.
 */
export const stepWorked = (
  step: Pick<ScenarioRunStep, 'startedAt' | 'finishedAt' | 'rested'>,
  now = 0,
  run?: Pick<RunClock, 'restingSince' | 'finishedAt'>,
): number => {
  if (step.startedAt === 0) return 0
  const open = step.finishedAt === 0
  const end = open ? now : step.finishedAt
  const resting = run?.restingSince ?? 0
  const standing =
    open && run?.finishedAt === 0 && resting > 0 ? Math.max(0, now - Math.max(resting, step.startedAt)) : 0
  return Math.max(0, end - step.startedAt - (step.rested ?? 0) - standing)
}

/** Whether the run is over, however it ended. */
export const finished = (state: ScenarioRun['state']): boolean =>
  state === 'done' || state === 'failed' || state === 'stopped'

/** Whether a step ever had its go at all. */
export const begun = (state: ScenarioRunStep['state']): boolean => state !== 'waiting' && state !== 'skipped'

