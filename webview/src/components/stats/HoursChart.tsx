import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { HoursSeries } from '../../stats/compute'
import { duration, shortDate } from '../../stats/format'
import s from './stats.module.css'

/**
 * Hours a day in the panel: this project against every project, as two soft lines with a wash of colour
 * under each.
 *
 * Drawn by hand into an SVG rather than by a charting library: the panel loads nothing off the network,
 * and a library for one line chart would be the heaviest thing in it. The width comes from the box the
 * chart sits in - it is measured rather than assumed, because the tool window is as wide as the person
 * made it.
 */

interface HoursChartProps {
  series: HoursSeries
}

const HEIGHT = 150
const PAD_LEFT = 28
const PAD_RIGHT = 8
const PAD_TOP = 6
const PAD_BOTTOM = 18
const MAX_X_LABELS = 8
const MAX_Y_TICKS = 4

/** The smallest of the customary steps that keeps the ticks to four: 0.5h, 1h, 2h, 5h... */
const tickStep = (top: number): number => {
  for (const step of [0.5, 1, 2, 5, 10, 20, 50]) {
    if (top / step <= MAX_Y_TICKS) return step
  }
  return 100
}

/** The top of the scale: at least an hour, and a whole number of tick steps above the highest day. */
const scaleTop = (values: number[]): number => {
  const highest = Math.max(1, ...values)
  const step = tickStep(highest)
  return Math.ceil(highest / step) * step
}

/**
 * A curve through the points that never overshoots them - a day of zero stays on the floor rather than
 * dipping below it as a plain spline would. The tangents are the monotone cubic ones (Fritsch-Carlson),
 * the segments are drawn as cubic Béziers.
 */
export const monotonePath = (points: { x: number; y: number }[]): string => {
  const count = points.length
  if (count === 0) return ''
  if (count === 1) return `M${points[0]!.x} ${points[0]!.y}`

  const slopes: number[] = []
  const deltas: number[] = []
  for (let index = 0; index < count - 1; index++) {
    const a = points[index]!
    const b = points[index + 1]!
    const dx = b.x - a.x
    deltas.push(dx === 0 ? 0 : (b.y - a.y) / dx)
  }

  slopes.push(deltas[0]!)
  for (let index = 1; index < count - 1; index++) {
    const before = deltas[index - 1]!
    const after = deltas[index]!
    slopes.push(before * after <= 0 ? 0 : (before + after) / 2)
  }
  slopes.push(deltas[count - 2]!)

  // Keep the tangents inside the band that guarantees monotonicity between two points.
  for (let index = 0; index < count - 1; index++) {
    const delta = deltas[index]!
    if (delta === 0) {
      slopes[index] = 0
      slopes[index + 1] = 0
      continue
    }
    const alpha = slopes[index]! / delta
    const beta = slopes[index + 1]! / delta
    const norm = alpha * alpha + beta * beta
    if (norm > 9) {
      const scale = 3 / Math.sqrt(norm)
      slopes[index] = scale * alpha * delta
      slopes[index + 1] = scale * beta * delta
    }
  }

  let path = `M${points[0]!.x} ${points[0]!.y}`
  for (let index = 0; index < count - 1; index++) {
    const a = points[index]!
    const b = points[index + 1]!
    const dx = (b.x - a.x) / 3
    path += ` C${a.x + dx} ${a.y + slopes[index]! * dx} ${b.x - dx} ${b.y - slopes[index + 1]! * dx} ${b.x} ${b.y}`
  }
  return path
}

const round = (value: number): number => Math.round(value * 100) / 100

export const HoursChart = ({ series }: HoursChartProps) => {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const element = box.current
    if (!element) return

    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const count = series.dates.length
  const top = scaleTop([...series.project, ...series.all])
  const step = tickStep(top)
  const plotWidth = Math.max(0, width - PAD_LEFT - PAD_RIGHT)
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const xOf = (index: number): number => PAD_LEFT + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth)
  const yOf = (hours: number): number => PAD_TOP + plotHeight - (Math.min(top, Math.max(0, hours)) / top) * plotHeight
  const floor = PAD_TOP + plotHeight

  const toPoints = (values: number[]) => values.map((value, index) => ({ x: round(xOf(index)), y: round(yOf(value)) }))
  const projectPoints = toPoints(series.project)
  const allPoints = toPoints(series.all)

  const area = (points: { x: number; y: number }[]): string => {
    if (points.length === 0) return ''
    const line = monotonePath(points)
    const first = points[0]!
    const last = points[points.length - 1]!
    return `${line} L${last.x} ${floor} L${first.x} ${floor} Z`
  }

  const ticks: number[] = []
  for (let value = 0; value <= top + 1e-9; value += step) ticks.push(round(value))

  const labelEvery = Math.max(1, Math.ceil(count / MAX_X_LABELS))

  const onMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (count === 0 || plotWidth <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left - PAD_LEFT
    const index = count <= 1 ? 0 : Math.round((x / plotWidth) * (count - 1))
    setHover(Math.max(0, Math.min(count - 1, index)))
  }

  const hovered = hover === null ? null : series.dates[hover]
  const tipLeft = hover === null ? 0 : xOf(hover)
  const tipOnLeft = width > 0 && tipLeft > width * 0.6

  return (
    <div className={s.chart} ref={box}>
      {width > 0 ? (
        <svg
          className={s.chartSvg}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
          height={HEIGHT}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Hours a day in the panel"
        >
          <defs>
            <linearGradient id="acc-stats-all" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(var(--acc-ch-aqua) / 10%)" />
              <stop offset="1" stopColor="rgb(var(--acc-ch-aqua) / 0%)" />
            </linearGradient>
            <linearGradient id="acc-stats-project" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(var(--acc-ch-moon) / 22%)" />
              <stop offset="1" stopColor="rgb(var(--acc-ch-moon) / 0%)" />
            </linearGradient>
          </defs>

          {ticks.map((value) => (
            <g key={value}>
              <line className={s.chartGrid} x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={yOf(value)} y2={yOf(value)} />
              <text className={s.chartTick} x={PAD_LEFT - 6} y={yOf(value) + 3} textAnchor="end">
                {`${value}h`}
              </text>
            </g>
          ))}

          <line className={s.chartAxis} x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={floor} y2={floor} />

          {series.dates.map((date, index) =>
            index % labelEvery === 0 && (count - 1 - index >= labelEvery / 2 || index === count - 1) ? (
              <text
                key={date}
                className={s.chartTick}
                x={xOf(index)}
                y={HEIGHT - 4}
                textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
              >
                {shortDate(date)}
              </text>
            ) : null,
          )}

          <path d={area(allPoints)} fill="url(#acc-stats-all)" />
          <path d={monotonePath(allPoints)} fill="none" stroke="rgb(var(--acc-ch-aqua) / 50%)" strokeWidth="1" />
          <path d={area(projectPoints)} fill="url(#acc-stats-project)" />
          <path d={monotonePath(projectPoints)} fill="none" stroke="rgb(var(--acc-ch-moon) / 90%)" strokeWidth="1.4" />

          {projectPoints.length > 0 ? (
            <circle
              cx={projectPoints[projectPoints.length - 1]!.x}
              cy={projectPoints[projectPoints.length - 1]!.y}
              r="2.6"
              fill="var(--acc-c-moon-4)"
            />
          ) : null}

          {hover !== null ? (
            <g>
              <line className={s.chartGuide} x1={xOf(hover)} x2={xOf(hover)} y1={PAD_TOP} y2={floor} />
              <circle cx={xOf(hover)} cy={yOf(series.all[hover] ?? 0)} r="3" fill="rgb(var(--acc-ch-aqua) / 85%)" />
              <circle cx={xOf(hover)} cy={yOf(series.project[hover] ?? 0)} r="3.4" fill="var(--acc-c-moon-4)" />
            </g>
          ) : null}
        </svg>
      ) : null}

      {hover !== null && hovered ? (
        <div
          className={s.chartTip}
          style={tipOnLeft ? { right: width - tipLeft + 10 } : { left: tipLeft + 10 }}
        >
          <span className={s.chartTipTitle}>{shortDate(hovered)}</span>
          <span className={s.chartTipLine}>
            <span className={s.chartTipWho}>project</span>
            {duration((series.project[hover] ?? 0) * 60)}
          </span>
          <span className={s.chartTipLine}>
            <span className={s.chartTipWho}>all</span>
            {duration((series.all[hover] ?? 0) * 60)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
