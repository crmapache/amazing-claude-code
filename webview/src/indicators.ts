import type { Dict } from './i18n/en'

/**
 * The indicators around the input field that a person may switch off one by one: the context bar above
 * the field and its "ctx 42%", the usage rings, the day's tokens, the feedback bubble and the heart.
 *
 * The panel wears them all day in the corner of the eye, and what is useful to one person is noise to
 * another - somebody on a plan without a model's own week has no use for its ring, somebody who never
 * looks at the token count would rather have the width. So each one is a switch of its own rather than
 * one "minimal mode" that decides for everybody which of them matters.
 *
 * In the order they stand on the screen, which is also the order of the settings list: top to bottom,
 * then left to right along the row under the field.
 *
 * Machine-wide and the desk's alone (see ClaudePreferences.hiddenIndicators): the phone draws its own
 * strip for a thumb, and has neither the counter nor the two buttons at all.
 */
export const INDICATORS = [
  'contextBar',
  'contextFigure',
  'fiveHour',
  'week',
  'modelWeek',
  'tokens',
  'feedback',
  'thanks',
] as const

export type IndicatorId = (typeof INDICATORS)[number]

/**
 * What is switched OFF, never what is on - the same shape the IDE stores it in, and for the same reason:
 * an indicator added in a later version arrives switched on for everybody, rather than hidden for whoever
 * once opened this list.
 */
export type HiddenIndicators = readonly IndicatorId[]

/**
 * The list as the IDE sent it, cleaned: a name this version does not know is dropped (a setting written
 * by a newer panel, or by hand), repeats go, and the order is the screen's - so two lists naming the same
 * indicators compare equal whichever way round they were written.
 */
export const normalizeHidden = (ids: readonly string[] | undefined): HiddenIndicators =>
  INDICATORS.filter((id) => (ids ?? []).includes(id))

export const shows = (hidden: HiddenIndicators, id: IndicatorId): boolean => !hidden.includes(id)

/** The list with one indicator flipped - the switch's own press. */
export const toggleIndicator = (hidden: HiddenIndicators, id: IndicatorId): HiddenIndicators =>
  normalizeHidden(shows(hidden, id) ? [...hidden, id] : hidden.filter((other) => other !== id))

export const sameHidden = (a: HiddenIndicators, b: HiddenIndicators): boolean =>
  a.length === b.length && a.every((id, index) => b[index] === id)

/**
 * The visible parts of the row under the field, asked once rather than id by id at every place that
 * draws them - there are three such places, one per layout, and a switch one of them forgot to ask would
 * be a switch that works in two layouts out of four.
 */
export interface ShownIndicators {
  contextBar: boolean
  contextFigure: boolean
  fiveHour: boolean
  week: boolean
  modelWeek: boolean
  tokens: boolean
  feedback: boolean
  thanks: boolean
}

export const shownIndicators = (hidden: HiddenIndicators): ShownIndicators => ({
  contextBar: shows(hidden, 'contextBar'),
  contextFigure: shows(hidden, 'contextFigure'),
  fiveHour: shows(hidden, 'fiveHour'),
  week: shows(hidden, 'week'),
  modelWeek: shows(hidden, 'modelWeek'),
  tokens: shows(hidden, 'tokens'),
  feedback: shows(hidden, 'feedback'),
  thanks: shows(hidden, 'thanks'),
})

/** The right-hand side of the row in the settings list: how many are on, the same words as the sounds'. */
export const indicatorsSummary = (t: Dict, hidden: HiddenIndicators): string =>
  t.common.countOn(INDICATORS.length - hidden.length)
