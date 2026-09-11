import type { Dict } from './i18n/en'

/**
 * How much colour the gauges keep: a hundred is the ladder as it has always been drawn, nought is one
 * calm tone whatever the reading. Everything between is that ladder faded towards the tone (see
 * [data-acc-calm] in tokens.css, which is where the fading actually happens).
 *
 * A figure rather than a switch because the answer is rarely either end: the red is what presses on
 * somebody working all day, but a gauge with no colour left in it stops answering "how bad is this" at
 * a glance - and where between those the line falls is a property of the person.
 */
export const CALM_VIVID_FULL = 100
export const CALM_VIVID_CALM = 0

/** A whole number inside the scale. Anything unreadable is the full ladder - what the panel always drew. */
export const clampVivid = (value: number): number => {
  if (!Number.isFinite(value)) return CALM_VIVID_FULL

  return Math.min(CALM_VIVID_FULL, Math.max(CALM_VIVID_CALM, Math.round(value)))
}

/**
 * What the IDE said, read tolerantly - because the two sides of this are not updated together.
 *
 * The setting used to be a switch, and it travelled as `on`. The phone's client is served by the relay
 * and updates with it, while the plugin on the machine updates on its own, so "a new client talking to a
 * plugin that still says `on`" is an ordinary day rather than an edge case. The figure wins wherever it
 * is present: a plugin new enough to send it also sends `on` alongside, for a client older than itself.
 */
export const calmVividOf = (said: { vivid?: number; on?: boolean }): number => {
  if (typeof said.vivid === 'number') return clampVivid(said.vivid)
  if (said.on === true) return CALM_VIVID_CALM

  return CALM_VIVID_FULL
}

/**
 * The value beside the row in the settings list.
 *
 * The two ends are named because that is how they are meant - "full colour", "one tone" - and everything
 * between is the figure itself. The per cent is not in the dictionaries: it is a reading, like `ctx 87%`
 * over the input field, and the same in all ten languages.
 */
export const calmColorsSummary = (t: Dict, vivid: number): string => {
  if (vivid >= CALM_VIVID_FULL) return t.calmColors.full
  if (vivid <= CALM_VIVID_CALM) return t.calmColors.none

  return `${vivid}%`
}
