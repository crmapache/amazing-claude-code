import type { ScenarioQueued, ScenarioQueueState, ScenarioRunSummary } from '../protocol'

/**
 * What the queue is doing, and what to call the turns waiting in it.
 *
 * Here rather than inside either screen because both of them ask: the band at the desk and the page on the
 * phone draw the same three states out of the same two facts. Written twice they would disagree on the
 * first change, and the way that shows is the worst thing this screen can do - a queue drawn as going
 * while it has actually stopped, on the one screen somebody checks before going to bed.
 */

/** How much of an answer stands as a turn's name. Longer than that is a paragraph, not a label. */
const MARK_CHARS = 40

/**
 * Where the queue stands, in the one order the three questions have to be asked in.
 *
 * Stopped first, and that is the whole of the ordering. A queue stops on a run that has already ended, so
 * nothing it stands behind is going - but a run somebody started by hand may well be, and a stopped queue
 * does not stand behind anything until a person lifts the stop. Asked the other way round, a night that
 * stopped at midnight would be drawn as "going" for as long as anybody happened to be working beside it.
 */
export type QueueStanding =
  /**
   * It stopped: the last turn did not end well, or would not start. Nothing else begins until a person says.
   *
   * [runId] is the run it stopped on, empty when what stopped it is a turn that would not start (that turn
   * wears the reason on its own row). [mark] is what tells that run apart - see [runMark].
   *
   * [after] is what going on anyway would stand behind: the newest run going beside the stopped queue, the
   * one the IDE writes down the moment the stop is lifted (see QueueRules.letGo and step on the Kotlin
   * side). Undefined when nothing is going, and only then does the button start anything. The button used
   * to say "Start the next one" either way, and over a run going beside it that promise is a second set of
   * agents in one working copy - which is exactly what pressing it does not do.
   */
  | {
      kind: 'held'
      why: string
      name: string
      runId: string
      mark: string
      after: ScenarioRunSummary | undefined
      afterMark: string
    }
  /**
   * The run it stands behind is going: the one it raised, or one started by hand or by the clock that was
   * going when the next turn's time came - the IDE writes that one into the queue as well (see
   * QueueMove.Follow on the Kotlin side), so both are found the same way.
   */
  | { kind: 'going'; run: ScenarioRunSummary; mark: string }
  /** Turns are waiting and the next one is about to be raised - the moment between two of them. */
  | { kind: 'waiting' }
  /** Nothing is lined up. */
  | { kind: 'empty' }

export const queueStanding = (
  queue: ScenarioQueueState | null,
  live: ScenarioRunSummary[],
  /** The runs that are over, for the one a stop names - it has left the live list by then. */
  past: ScenarioRunSummary[] = [],
): QueueStanding => {
  if (!queue) return { kind: 'empty' }
  if (queue.held) {
    const stoppedOn = queue.runId ? [...live, ...past].find((run) => run.id === queue.runId) : undefined
    // Asked of the queue as it will be once the stop is lifted - the run it stopped on forgotten with it.
    const after = queueBehind({ ...queue, runId: '' }, live)

    return {
      kind: 'held',
      why: queue.heldWhy,
      name: queue.heldName,
      runId: queue.runId,
      mark: runMark(stoppedOn, queue, live),
      after,
      afterMark: runMark(after, queue, live),
    }
  }

  const going = queue.runId ? live.find((run) => run.id === queue.runId) : undefined
  if (going) return { kind: 'going', run: going, mark: runMark(going, queue, live) }

  return queue.waiting.length > 0 ? { kind: 'waiting' } : { kind: 'empty' }
}

/** A run's name with what tells it apart, for a sentence: the mark stands in brackets after the name. */
export const namedRun = (name: string, mark: string): string => (mark ? `${name} (${mark})` : name)

/**
 * What tells the run a queue names apart from everything else on the screen with the same scenario name.
 *
 * The first answer it was given - the ticket - and only when something else in view carries its scenario:
 * another run going, or a turn waiting. That is the ordinary shape of a queue (one round of work against
 * three tickets), and it is exactly where a bare name lies. Recorded live: a queue stopped on a morning run
 * of "Task -> Prod", while a run of "Task -> Prod" started by hand was going and two more waited under it,
 * and the stop read as "the run you just started was stopped by you" - a Stop nobody remembered pressing.
 */
const runMark = (
  run: ScenarioRunSummary | undefined,
  queue: ScenarioQueueState,
  live: ScenarioRunSummary[],
): string => {
  if (!run) return ''

  const twin =
    live.some((one) => one.id !== run.id && one.scenarioId === run.scenarioId) ||
    queue.waiting.some((entry) => entry.scenarioId === run.scenarioId)

  return twin ? firstAnswer(run.inputs) : ''
}

/** The first answer somebody gave, cut to one line of a sensible length - it is free text and can be a paragraph. */
const firstAnswer = (inputs: Record<string, string> | undefined): string => {
  const answer = Object.values(inputs ?? {}).find((value) => value.trim().length > 0) ?? ''
  return answer.split('\n')[0]?.trim().slice(0, MARK_CHARS) ?? ''
}

/**
 * The run a turn put on the queue right now would stand behind, for the note in the foot of the form.
 *
 * The queue's own run while that is going, because its ending is judged first; otherwise the newest run
 * going in this project, whoever started it - which is what the IDE writes down as the turn's predecessor
 * the moment the turn's time comes (see QueueRules.step on the Kotlin side). Undefined when nothing is
 * going: the turn starts at once then. A prediction rather than the queue's word, and only ever shown
 * BEFORE the button is pressed: once it has been, the band names what the queue actually stands behind.
 * Said at all because a queue that waits for something is a rule that must be visible - the first version
 * did not wait for runs started by hand, and the second turn starting beside the first was the way it
 * showed.
 */
export const queueBehind = (
  queue: ScenarioQueueState | null,
  live: ScenarioRunSummary[],
): ScenarioRunSummary | undefined => {
  const own = queue?.runId ? live.find((run) => run.id === queue.runId) : undefined
  if (own) return own

  return live.reduce<ScenarioRunSummary | undefined>(
    (newest, run) => (!newest || run.startedAt > newest.startedAt ? run : newest),
    undefined,
  )
}

/**
 * What each waiting turn is called, beyond the name of its scenario.
 *
 * The first answer somebody gave it, because that is the ticket or the branch - the one thing that tells
 * two turns of one round of work apart. Empty for a turn that is the only one of its scenario on the
 * queue: the name says everything then, and a ticket beside it answers a question nobody asked.
 *
 * Unlike a run's mark (see runMarks) there is no clock to fall back on. Two turns of one scenario with the
 * same answers are genuinely the same request twice, and they are told apart by standing in a list in the
 * order somebody put them there - which is a queue's whole shape and needs no label.
 */
export const queueMarks = (waiting: ScenarioQueued[]): Record<string, string> => {
  const marks: Record<string, string> = {}

  for (const entry of waiting) {
    const only = waiting.every((other) => other.id === entry.id || other.scenarioId !== entry.scenarioId)

    marks[entry.id] = only ? '' : firstAnswer(entry.inputs)
  }

  return marks
}

/**
 * Whether this scenario has turns waiting, for the badge on its row.
 *
 * By identifier AND shelf, like everything else that matches a scenario: one identifier can stand on both
 * shelves at once - a project file that came back with a git checkout beside somebody's own copy.
 */
export const queuedFor = (
  queue: ScenarioQueueState | null,
  scenario: { id: string; scope: string },
): ScenarioQueued[] =>
  (queue?.waiting ?? []).filter((entry) => entry.scenarioId === scenario.id && entry.scope === scenario.scope)
