/**
 * The dashboard's charts, drawn on the server as SVG.
 *
 * No script on the page at all: the one person reading it gets figures that render the same in any
 * browser, a page that can be saved and opened later, and a Content-Security-Policy with nothing to
 * allow. What a script would add - a readout under the pointer - is done with CSS: every day of a line
 * chart carries its own transparent column with a hairline and a dot inside, shown on hover, and a
 * <title> the browser turns into a tooltip. Every figure a tooltip shows is also printed somewhere on
 * the page, so nothing is readable only by hovering.
 *
 * Colours come from classes, not attributes, so the light and dark palettes swap in one place (see the
 * stylesheet in page.ts). One series per chart, so one hue per chart and no legend box - the card's
 * title says what is plotted.
 */

export interface Point {
  label: string
  value: number
  /** What the tooltip says - the value in words, with its day. */
  tip: string
}

const WIDTH = 720

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A clean top for the axis and the step between its ticks: 0 / 5 / 10 / 15 / 20, never 0 / 4.7 / 9.4. */
export const niceScale = (max: number, ticks = 4): { top: number; step: number } => {
  if (max <= 0) return { top: ticks, step: 1 }
  const rough = max / ticks
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude
  const whole = step < 1 ? 1 : step
  return { top: Math.ceil(max / whole) * whole, step: whole }
}

export const formatNumber = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1)
}

export const formatShare = (share: number): string => {
  const percent = share * 100
  if (percent === 0) return '0%'
  if (percent < 1) return '<1%'
  return `${percent < 10 ? percent.toFixed(1).replace(/\.0$/, '') : Math.round(percent)}%`
}

/** "2026-09-03" -> "Sep 3". */
export const shortDay = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

interface Frame {
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

const FRAME: Frame = { height: 200, left: 44, right: 48, top: 14, bottom: 26 }

const axis = (frame: Frame, top: number, step: number): string => {
  const plotHeight = frame.height - frame.top - frame.bottom
  const lines: string[] = []
  for (let value = 0; value <= top + step / 1000; value += step) {
    const y = frame.top + plotHeight - (value / top) * plotHeight
    lines.push(
      `<line class="${value === 0 ? 'baseline' : 'grid'}" x1="${frame.left}" x2="${WIDTH - frame.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`,
      `<text class="tick" x="${frame.left - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${formatNumber(value)}</text>`,
    )
  }
  return lines.join('')
}

/** The labels under the x axis: the first day, the last, and a few evenly between - never all of them. */
const xLabels = (frame: Frame, points: Point[], xOf: (index: number) => number, all = false): string => {
  if (points.length === 0) return ''
  const wanted = all ? points.length : Math.min(points.length, 6)
  const indices = new Set<number>()
  for (let i = 0; i < wanted; i += 1) indices.add(Math.round((i * (points.length - 1)) / Math.max(1, wanted - 1)))

  return [...indices]
    .map((index) => {
      // Bins stand under their own columns; days at the ends are held inside the frame.
      const anchor = all ? 'middle' : index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'
      return `<text class="tick" x="${xOf(index).toFixed(1)}" y="${frame.height - 8}" text-anchor="${anchor}">${escape(points[index]!.label)}</text>`
    })
    .join('')
}

/**
 * A line over days, with a wash under it: the trend of one figure. The last value is written at the end
 * of the line - the one number worth reading off without the axis.
 */
export const lineChart = (points: Point[], ariaLabel: string): string => {
  const frame = FRAME
  const plotWidth = WIDTH - frame.left - frame.right
  const plotHeight = frame.height - frame.top - frame.bottom
  const { top, step } = niceScale(Math.max(0, ...points.map((point) => point.value)))

  const xOf = (index: number): number =>
    frame.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const yOf = (value: number): number => frame.top + plotHeight - (value / top) * plotHeight

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xOf(index).toFixed(1)},${yOf(point.value).toFixed(1)}`).join('')
  const base = yOf(0).toFixed(1)
  const area = points.length > 0 ? `${path}L${xOf(points.length - 1).toFixed(1)},${base}L${xOf(0).toFixed(1)},${base}Z` : ''

  const band = points.length <= 1 ? plotWidth : plotWidth / (points.length - 1)
  const hits = points
    .map((point, index) => {
      const x = xOf(index)
      return (
        `<g class="hit"><rect x="${(x - band / 2).toFixed(1)}" y="${frame.top}" width="${band.toFixed(1)}" height="${plotHeight}"/>` +
        `<line class="cross" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${frame.top}" y2="${base}"/>` +
        `<circle class="dot" cx="${x.toFixed(1)}" cy="${yOf(point.value).toFixed(1)}" r="4"/>` +
        `<title>${escape(point.tip)}</title></g>`
      )
    })
    .join('')

  const last = points[points.length - 1]
  const end = last
    ? `<circle class="end" cx="${xOf(points.length - 1).toFixed(1)}" cy="${yOf(last.value).toFixed(1)}" r="4"/>` +
      `<text class="endLabel" x="${(xOf(points.length - 1) + 9).toFixed(1)}" y="${(yOf(last.value) + 4).toFixed(1)}">${formatNumber(last.value)}</text>`
    : ''

  return (
    `<svg class="chart" viewBox="0 0 ${WIDTH} ${frame.height}" role="img" aria-label="${escape(ariaLabel)}">` +
    axis(frame, top, step) +
    `<path class="area" d="${area}"/><path class="line" d="${path}"/>` +
    xLabels(frame, points, xOf) +
    end +
    hits +
    `</svg>`
  )
}

/** A column with a rounded top and a square foot on the baseline. */
const column = (x: number, y: number, width: number, base: number): string => {
  const height = base - y
  if (height <= 0) return ''
  const radius = Math.min(4, width / 2, height)
  return (
    `M${x.toFixed(1)},${base.toFixed(1)}V${(y + radius).toFixed(1)}` +
    `Q${x.toFixed(1)},${y.toFixed(1)} ${(x + radius).toFixed(1)},${y.toFixed(1)}` +
    `H${(x + width - radius).toFixed(1)}` +
    `Q${(x + width).toFixed(1)},${y.toFixed(1)} ${(x + width).toFixed(1)},${(y + radius).toFixed(1)}` +
    `V${base.toFixed(1)}Z`
  )
}

/**
 * Columns over ordered categories: days, or the bins of a histogram. [capLabels] writes each value on its
 * column - right for a handful of bins, wrong for a month of days, where the axis and the tooltip carry
 * them instead.
 */
export const columnChart = (
  points: Point[],
  ariaLabel: string,
  options: { capLabels?: boolean; compact?: boolean } = {},
): string => {
  const frame: Frame = options.compact ? { ...FRAME, height: 170, right: 12 } : FRAME
  const plotWidth = WIDTH - frame.left - frame.right
  const plotHeight = frame.height - frame.top - frame.bottom
  const { top, step } = niceScale(Math.max(0, ...points.map((point) => point.value)))
  const base = frame.top + plotHeight

  const bandWidth = plotWidth / Math.max(1, points.length)
  // Never wider than 24 pixels, and never touching the neighbour: the band's leftover is air.
  const width = Math.max(1, Math.min(24 * (WIDTH / 360), bandWidth - 2, bandWidth * 0.72))
  const xOf = (index: number): number => frame.left + bandWidth * index + bandWidth / 2

  const bars = points
    .map((point, index) => {
      const x = xOf(index) - width / 2
      const y = base - (point.value / top) * plotHeight
      const label = options.capLabels && point.value > 0
        ? `<text class="capLabel" x="${xOf(index).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${formatNumber(point.value)}</text>`
        : ''
      return (
        `<g class="bar"><rect class="barHit" x="${(xOf(index) - bandWidth / 2).toFixed(1)}" y="${frame.top}" width="${bandWidth.toFixed(1)}" height="${plotHeight}"/>` +
        `<path class="column" d="${column(x, y, width, base)}"/>${label}<title>${escape(point.tip)}</title></g>`
      )
    })
    .join('')

  return (
    `<svg class="chart" viewBox="0 0 ${WIDTH} ${frame.height}" role="img" aria-label="${escape(ariaLabel)}">` +
    axis(frame, top, step) +
    bars +
    xLabels(frame, points, xOf, options.capLabels === true) +
    `</svg>`
  )
}
