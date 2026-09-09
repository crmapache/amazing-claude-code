import type { ScenarioRunSummary } from '../protocol'

/**
 * What is going and what is over, and what to call one run when its scenario's name is not enough.
 *
 * Here rather than inside either screen because both of them ask: the hub at the desk draws a section of
 * live runs above a section of finished ones, and the phone draws the same two bands. Written twice they
 * would disagree on the first change, and the way that shows is a run standing in both lists at once on
 * whichever screen was not updated.
 */

/** Whether this summary is one of the runs the IDE says is going right now. */
const isLive = (run: ScenarioRunSummary, live: ScenarioRunSummary[]): boolean =>
  live.some((one) => one.id === run.id)

/**
 * The runs going right now, newest first.
 *
 * Taken from what the IDE says is live rather than from the list of past runs, because the list of past
 * runs is read off the disk and only sent when something else happens: a run started at nine would stand
 * at "0 of 12 cards" until it finished. The live list is built from memory and arrives every second.
 */
export const runningRuns = (live: ScenarioRunSummary[]): ScenarioRunSummary[] =>
  [...live].sort((a, b) => b.startedAt - a.startedAt)

/**
 * The runs that are over, newest first.
 *
 * The live ones are taken out rather than left in with a badge on them. They were in one list while there
 * could only ever be one of them; with several going at once, a heading that says PAST RUNS over three
 * things that are happening right now is simply wrong.
 */
export const pastRuns = (runs: ScenarioRunSummary[], live: ScenarioRunSummary[]): ScenarioRunSummary[] =>
  runs.filter((run) => !isLive(run, live))

/**
 * What each of these runs is called, beyond the name of its scenario.
 *
 * Worked out over the SET rather than for one run at a time, and that is the whole point of it. The most
 * ordinary second start is the same round of work against the same ticket - the start form is even filled
 * in from the last run's answers - so two runs of one scenario usually carry the same first answer. A
 * label computed alone would give both of them the same words, which is exactly the state it exists to
 * prevent: three tabs called "Nightly review", three identical rows, and Stop pressed on whichever.
 *
 * The first answer somebody gave, because that is the ticket or the branch; and when two of them come out
 * the same, or there is no answer at all, the minute it started at. Cut to one line and a sensible length
 * because an answer is free text a person typed and can be a paragraph.
 *
 * Empty for a run that is the only one of its scenario in the set, and that is the same decision made
 * once rather than at each of the four places this is drawn. The name of the scenario says everything
 * then, and a ticket or a clock beside it is a qualifier answering a question nobody asked.
 */
export const runMarks = (
  runs: { id: string; scenarioId: string; inputs: Record<string, string>; startedAt: number }[],
): Record<string, string> => {
  const said = new Map<string, string>()
  for (const run of runs) {
    const answer = Object.values(run.inputs ?? {}).find((value) => value.trim().length > 0) ?? ''
    said.set(run.id, answer.split('\n')[0]?.trim().slice(0, MARK_CHARS) ?? '')
  }

  const marks: Record<string, string> = {}
  for (const run of runs) {
    const only = runs.every((other) => other.id === run.id || other.scenarioId !== run.scenarioId)
    if (only) {
      marks[run.id] = ''
      continue
    }

    const answer = said.get(run.id) ?? ''
    // The clock is added whenever another run says the same thing, and not only when nothing was said:
    // two starts against one ticket are the common case, not the odd one.
    const alone = runs.every((other) => other.id === run.id || said.get(other.id) !== answer)
    const started = clockOf(run.startedAt)

    marks[run.id] = answer.length > 0 && alone ? answer : [answer, started].filter(Boolean).join(' · ')
  }

  return marks
}

/**
 * The moment a run started, to the second.
 *
 * To the second because two presses of Run land in the same minute more often than not, and the only job
 * this has is telling those two apart. Not localised, like the rest of the readings on this screen.
 */
const clockOf = (at: number): string => {
  const time = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`
}

/** How much of an answer stands as a run's name. Longer than that is a paragraph, not a label. */
const MARK_CHARS = 40

/**
 * How close two presses of Run have to be to count as one.
 *
 * Long enough to catch a finger that bounced, short enough that somebody deliberately starting the same
 * round of work twice never notices it. A second press after this is a second run, which is the whole
 * point of letting them go side by side.
 */
export const DOUBLE_PRESS_MS = 1500

/** When each Run button was last pressed, by scenario - see [pressedAgain]. */
export type Presses = Record<string, number>

/**
 * The presses with this one added, or null when it was the same finger bouncing.
 *
 * Kept per BUTTON rather than per panel, and that is the whole of the rule. One moment for the whole
 * screen turned the ordinary sequence - start this round of work, then start that one - into a press
 * that sent nothing: no run, no row, and no word on the screen either, because from the panel's side
 * nothing had happened. The guard exists for a finger that bounced on ONE button; a second button is a
 * second decision.
 *
 * A press that was refused is forgotten by whoever hears the refusal (writing a zero against it), so the
 * same button can be tried again at once. Waiting out a guard nobody can see is worse than the bounce it
 * protects against.
 */
export const pressedAgain = (presses: Presses, key: string, now: number): Presses | null =>
  now - (presses[key] ?? 0) < DOUBLE_PRESS_MS && presses[key] ? null : { ...presses, [key]: now }
