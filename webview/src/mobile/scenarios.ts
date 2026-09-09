import type { Dict } from '../i18n/en'

/**
 * The few words about a run that more than one screen on a phone needs.
 *
 * A file of their own rather than an export off whichever screen happened to write one first: several
 * screens say the same things about a run, and a helper living on one of them makes the others import a
 * screen to borrow a sentence.
 */

/** What the IDE could not do, in the words this side has for it - see the outcomes block of the dictionary. */
export const outcomeText = (t: Dict, code: string): string =>
  code in t.scenarios.outcomes
    ? t.scenarios.outcomes[code as keyof typeof t.scenarios.outcomes]
    : t.scenarios.outcomes.unknown
