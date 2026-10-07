import type { ScenarioRoadmapStop, ScenarioRun, ScenarioStepState } from '../protocol'

/**
 * The road on the card of a going run: every card of every pass as a stop in a row, the finished ones
 * ticked, the one the run is on lit, the ones ahead numbered.
 *
 * A row of stops answers "how far, and what is left" before a word is read, which a bar and "2/5 cards"
 * did only by being read. What makes it a design problem is that the row has to hold on a panel a third
 * of a monitor wide and on a phone, while a stage that loops is written out pass by pass (see
 * timelineOf) - a round of three cards going five times is fifteen stops on its own. So when the row does
 * not fit, it folds the way a pager does: the first and the last stop stay (the last one's number IS the
 * size of the run), a window around the stop the run is on stays, and what is between collapses into a
 * count. Folding the past and the future, never the present.
 *
 * Worked out here rather than in the stylesheet because CSS can shrink things but cannot decide what to
 * leave out, and here it is tested.
 */

/** The sizes the road is drawn with, in CSS pixels - the same numbers as roadmap.module.css. */
export interface RoadMetrics {
  /** One stop. */
  stop: number
  /** The link between two neighbours - one length everywhere, so the stops stand evenly. */
  link: number
  /** A folded stretch - "+12" in a pill. */
  fold: number
}

export const ROAD: RoadMetrics = { stop: 18, link: 8, fold: 32 }

export type RoadItem =
  /** One card of one pass, by its place on the whole road. */
  | { kind: 'stop'; index: number }
  /** Stops left out to make the row fit, `from` to `to` inclusive. */
  | { kind: 'fold'; from: number; to: number }

/** Whether a stop is behind the run, however it went: done, failed, or never needed. */
export const isOver = (state: ScenarioStepState): boolean => state === 'done' || state === 'failed' || state === 'skipped'

/**
 * The road of a whole run, as the run's own screen draws it - the same stops the IDE's summary carries for
 * the card in the hub (see RunSummary.roadmap), read off the record it already has.
 */
export const roadOf = (run: ScenarioRun): ScenarioRoadmapStop[] => {
  const stageOf = new Map(run.snapshot.stages.map((stage, index) => [stage.id, index + 1]))
  return run.steps.map((step) => ({
    state: step.state,
    stage: stageOf.get(step.stageId) ?? 0,
    pass: step.pass,
    title: step.title,
  }))
}

/**
 * Where a finished road is looked at from: the last stop that had its go - the card it ended on, which is
 * what anybody opening a stopped run wants in the window when the road folds.
 */
export const endOf = (stops: ScenarioRoadmapStop[]): number => {
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (stops[index].state === 'done' || stops[index].state === 'failed') return index
  }
  return 0
}

/**
 * Which stop the run is on: the first one that is not over.
 *
 * Not "the one that is working": between two cards nothing is, and the run is still somewhere - at the head
 * of the next one, which is the stop that lights. A run whose every stop is over (it is about to say so) is
 * on its last. The name over the road is this stop's stage (see RunSummary.stageTitle), so the two agree.
 */
export const hereOf = (stops: ScenarioRoadmapStop[]): number => {
  const open = stops.findIndex((stop) => !isOver(stop.state))
  return open >= 0 ? open : stops.length - 1
}

/**
 * The stops of the stage the run is in, as a range of the road - the stretch the tint goes behind.
 *
 * Null where a tint would say nothing: a scenario of one stage is all one stage, and a stage of one card is
 * already said by the lit stop itself.
 */
export const bandOf = (stops: ScenarioRoadmapStop[], here: number): { from: number; to: number } | null => {
  const stage = stops[here]?.stage
  if (stage === undefined || stops.every((stop) => stop.stage === stage)) return null

  let from = here
  while (from > 0 && stops[from - 1].stage === stage) from -= 1
  let to = here
  while (to < stops.length - 1 && stops[to + 1].stage === stage) to += 1
  return to > from ? { from, to } : null
}

/**
 * How far short of a row the measured room may come and the row still count as fitting.
 *
 * The room is measured, and under a zoom that is not whole - an IDE at 90% on a retina screen draws a CSS
 * pixel as 1.8 device pixels - the box comes back snapped to the device grid, a hair narrower than the CSS
 * asked for. The run's own strip gives the road exactly its whole width (see roadWidth), so a hair short
 * folded a six-stop road into "+2" in a strip with a hand's width to spare. A pixel is less than any stop or
 * link, and a row that runs past its box by less than that is not seen.
 */
const ROAD_SNAP = 1

/**
 * Which stops to draw in `width` pixels: all of them when they fit, otherwise the widest window around the
 * present that does.
 */
export const roadLayout = (count: number, here: number, width: number, metrics: RoadMetrics = ROAD): RoadItem[] => {
  if (count <= 0) return []
  const at = Math.min(Math.max(here, 0), count - 1)

  for (let size = count; size > 1; size -= 1) {
    const items = windowed(count, at, size)
    if (widthOf(items, metrics) <= width + ROAD_SNAP) return items
  }
  return windowed(count, at, 1)
}

/**
 * `size` stops around the one the run is on, plus the first and the last, with what lies between folded.
 *
 * The window leans forward: a third of it behind the present (at least the one just finished, which says
 * the run is moving) and the rest ahead, because what is left is the question a going run is looked at
 * for. A fold of a single stop is drawn as the stop - it is narrower than the pill that would hide it.
 */
export const windowed = (count: number, here: number, size: number): RoadItem[] => {
  const span = Math.max(1, Math.min(size, count))
  const behind = Math.min(here, span - 1, Math.max(1, Math.floor((span - 1) / 3)))
  let from = here - behind
  let to = from + span - 1
  if (to > count - 1) {
    to = count - 1
    from = Math.max(0, to - span + 1)
  }

  const shown = (index: number): boolean => index === 0 || index === count - 1 || (index >= from && index <= to)
  const items: RoadItem[] = []

  for (let index = 0; index < count; index += 1) {
    if (shown(index)) {
      items.push({ kind: 'stop', index })
      continue
    }
    let last = index
    while (last + 1 < count && !shown(last + 1)) last += 1
    if (last === index) items.push({ kind: 'stop', index })
    else items.push({ kind: 'fold', from: index, to: last })
    index = last
  }
  return items
}

/**
 * How wide the whole road is, nothing folded - what a road sharing its line with other readings asks for,
 * so the readings follow it rather than being pushed to the far end (see the run's own strip).
 */
export const roadWidth = (count: number, metrics: RoadMetrics = ROAD): number =>
  count > 0 ? count * metrics.stop + (count - 1) * metrics.link : 0

/** How wide a row of items is drawn. */
export const widthOf = (items: RoadItem[], metrics: RoadMetrics = ROAD): number => {
  if (items.length === 0) return 0
  const pieces = items.reduce((sum, item) => sum + (item.kind === 'stop' ? metrics.stop : metrics.fold), 0)
  return pieces + (items.length - 1) * metrics.link
}
