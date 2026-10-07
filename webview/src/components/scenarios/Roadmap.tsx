import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ScenarioRoadmapStop, ScenarioRunState } from '../../protocol'
import { useT } from '../../i18n'
import { bandOf, endOf, hereOf, isOver, roadLayout, type RoadItem } from '../../scenarios/roadmap'
import s from './roadmap.module.css'

/**
 * The road of a going run: (✓)-(✓)-(3)-(4)-(5).
 *
 * Every card of every pass is a stop - ticked when it is done, crossed when it failed, dashed when a loop
 * ended before it was needed, numbered while it is ahead. The stop the run is on keeps its number and
 * glows, pulsing, in the tone of what the run is doing (working, waiting for you); on a pause it stands
 * still and grey. Its card's name is in the hint over it, not beside it: a stop that grows a label pushes
 * every stop after it along and makes the row uneven. The stage it belongs to is tinted behind it, so the
 * stage named over the road can be found on it. A finished run's road has no present: nothing glows and
 * nothing is tinted - the ticks, the cross where it stopped and the dashes of what it never reached say it.
 *
 * The stops stand at one short distance from each other, whatever the card's width - a road stretched
 * across a wide card reads as gaps, not as a road. What fits is decided by measuring (see
 * scenarios/roadmap.ts): a road too long for the card folds its past and its future into counts and keeps
 * the present. Measured before the paint, so a panel dragged narrow never shows a frame of stops pushed
 * past the card's edge - the road's own width does not depend on what it draws, so the answer after a fold
 * is the answer before it.
 *
 * Its stylesheet is its own: the phone draws the same road, and the hub's stylesheet would come with it.
 */
export const Roadmap = ({ stops, state }: { stops: ScenarioRoadmapStop[]; state: ScenarioRunState }) => {
  const t = useT()
  const road = useRef<HTMLOListElement>(null)
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY)

  useLayoutEffect(() => {
    const element = road.current
    if (!element) return
    const read = () => element.getBoundingClientRect().width
    setWidth(read())
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      const next = read()
      flushSync(() => setWidth(next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (stops.length === 0) return null

  const going = state !== 'done' && state !== 'failed' && state !== 'stopped'
  const here = going ? hereOf(stops) : -1
  const band = going ? bandOf(stops, here) : null
  const items = roadLayout(stops.length, going ? here : endOf(stops), width)
  // Behind a link is covered ground when what stands before it is over - a stop, or every stop of a fold.
  const covered = (item: RoadItem): boolean =>
    item.kind === 'stop'
      ? isOver(stops[item.index].state)
      : stops.slice(item.from, item.to + 1).every((one) => isOver(one.state))
  const tone = state === 'blocked' ? s.toneAsks : state === 'paused' ? s.tonePaused : s.toneGoing

  const inBand = (index: number): boolean => band !== null && index >= band.from && index <= band.to
  // The tint's round ends go on the first and the last stop of the stage that is DRAWN: a stage half folded
  // away still reads as a stretch with two ends, rather than as a strip cut off by the fold beside it.
  const tintedStops = items.flatMap((item) => (item.kind === 'stop' && inBand(item.index) ? [item.index] : []))
  const tintStart = tintedStops[0] ?? -1
  const tintEnd = tintedStops[tintedStops.length - 1] ?? -1

  return (
    <ol ref={road} className={`${s.road} ${tone}`} aria-label={t.scenarios.run.road}>
      {items.map((item, position) => {
        const before = items[position - 1]
        const link = before ? (
          <li
            key={`link:${firstOf(item)}`}
            aria-hidden="true"
            className={classes(
              s.link,
              covered(before) && s.linkDone,
              before.kind === 'stop' && item.kind === 'stop' && inBand(before.index) && inBand(item.index) && s.banded,
            )}
          />
        ) : null

        if (item.kind === 'fold') {
          const folded = t.scenarios.run.roadFolded(item.from + 1, item.to + 1)
          return [
            link,
            <li
              key={`fold:${item.from}`}
              className={classes(s.fold, covered(item) && s.foldDone)}
              data-tooltip={folded}
              aria-label={folded}
            >
              +{item.to - item.from + 1}
            </li>,
          ]
        }

        const stop = stops[item.index]
        const tinted = inBand(item.index)
        const pass = stop.pass > 1 ? t.scenarios.run.passOf(stop.pass, passesIn(stops, stop.stage)) : ''
        const said = [`${item.index + 1}. ${stop.title}`, t.scenarios.stepStates[stop.state], pass]
          .filter(Boolean)
          .join(' · ')

        return [
          link,
          <li
            key={`stop:${item.index}`}
            className={classes(
              s.cell,
              tinted && s.banded,
              tinted && item.index === tintStart && s.bandStart,
              tinted && item.index === tintEnd && s.bandEnd,
            )}
            aria-label={said}
            aria-current={item.index === here ? 'step' : undefined}
            data-tooltip={said}
          >
            <span className={classes(s.stop, toneOf(stop.state), item.index === here && s.here)}>
              {stop.state === 'done' ? <Tick /> : stop.state === 'failed' ? <Cross /> : item.index + 1}
            </span>
          </li>,
        ]
      })}
    </ol>
  )
}

const classes = (...names: (string | false)[]): string => names.filter(Boolean).join(' ')

const firstOf = (item: RoadItem): number => (item.kind === 'stop' ? item.index : item.from)

/** How many passes a stage was planned for, read off the road - its highest pass. */
const passesIn = (stops: ScenarioRoadmapStop[], stage: number): number =>
  stops.reduce((most, stop) => (stop.stage === stage ? Math.max(most, stop.pass) : most), 1)

const toneOf = (state: ScenarioRoadmapStop['state']): string =>
  state === 'done' ? s.done : state === 'failed' ? s.failed : state === 'skipped' ? s.skipped : s.ahead

/** Drawn on the same 16-unit grid as the hub's other marks (see icons.tsx), smaller to sit in a stop. */
const Tick = () => (
  <svg
    viewBox="0 0 16 16"
    width="10"
    height="10"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3.5 8.4l3 3 6-6.8" />
  </svg>
)

const Cross = () => (
  <svg
    viewBox="0 0 16 16"
    width="9"
    height="9"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </svg>
)
