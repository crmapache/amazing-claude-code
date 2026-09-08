import type { Dict } from '../i18n/en'
import type { ScenarioRun } from '../protocol'
import { progressOf } from '../scenarios/timeline'

/**
 * The few words about a run that more than one screen on a phone needs.
 *
 * A file of their own rather than an export off whichever screen happened to write one first: the list
 * of scenarios, the run itself and the side menu all say how far a run has got, and a helper living on
 * one of those screens makes the other two import a screen to borrow a sentence.
 */

/** How far a run has got, in the words its own card uses - so no two places can word it differently. */
export const runBadge = (t: Dict, run: ScenarioRun): string => {
  const progress = progressOf(run)
  return t.scenarios.run.cards(progress.done, progress.total)
}

/** What the IDE could not do, in the words this side has for it - see the outcomes block of the dictionary. */
export const outcomeText = (t: Dict, code: string): string =>
  code in t.scenarios.outcomes
    ? t.scenarios.outcomes[code as keyof typeof t.scenarios.outcomes]
    : t.scenarios.outcomes.unknown

/**
 * When something happened, as short as a row allows: "6 Sep, 22:21".
 *
 * The whole stamp with its seconds and its AM is the width of the name beside it, and nobody reading a
 * list of past runs is choosing between two of them by the second. The clock is twenty-four hour for
 * the reason a scheduled hour is: the two stand on the same screen and must not read as two clocks.
 */
export const dayAndHour = (at: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at))
