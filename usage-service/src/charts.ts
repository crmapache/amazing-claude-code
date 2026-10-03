/**
 * The dashboard's charts, drawn on the server: HTML for everything with text in it, SVG only for lines.
 *
 * No script on the page at all: the one person reading it gets figures that render the same in any
 * browser, a page that can be saved and opened later, and a Content-Security-Policy with nothing to
 * allow. What a script would add - a readout under the pointer - is done with CSS: every position of a
 * chart (a day, a bin) carries its own transparent column with a crosshair, dots and a readout card
 * inside, shown on hover. Every figure a readout shows is also in the chart's table, folded under it in a
 * <details>, so nothing is readable only by hovering.
 *
 * Why not one SVG per chart: an SVG scales as a picture, its text with it. Drawn 720 wide and shown on a
 * card 1900 wide, a chart had its axis labels at two and a half times their size and its line as thick as
 * a finger. So the plot is a box that stretches with its card, every label is HTML placed in percent of
 * that box and keeps its size, and a line is an SVG stretched over the box (preserveAspectRatio="none")
 * with a stroke that does not stretch with it (vector-effect) - the one thing a stretched picture is
 * good at. Dots are HTML too: a circle in a stretched SVG would come out an ellipse.
 *
 * Colours come from classes (s1, s2, s3 - the palette's categorical slots, in its fixed order), not
 * attributes, so the palette lives in one place: the stylesheet in page.ts.
 */

export interface Series {
  name: string
  /** The categorical slot that colours it, in the palette's fixed order: 1 blue, 2 orange, 3 aqua. */
  slot: 1 | 2 | 3
  values: number[]
}

export interface Chart {
  /** What the chart shows, for a screen reader. */
  label: string
  /** One per position along the x axis: a day ("2026-09-30") or the name of a bin. */
  x: string[]
  series: Series[]
  /** How a value reads in the readout, the legend and the table. Plain numbers when not given. */
  format?: (value: number) => string
  /**
   * The last position is a day still under way - today, counted so far. Its figure is bound to look like a
   * fall, so it is drawn as unfinished (a dashed last stretch, a paler column) and its readout says so.
   */
  partialLast?: boolean
}

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

/** "2026-09-03" -> "Thu, Sep 3": the readout's title, where there is room for the weekday. */
const longDay = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** A share of the plot as a CSS length. */
const pct = (share: number): string => `${(share * 100).toFixed(3).replace(/\.?0+$/, '')}%`

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

/** The gridlines with their figures in the gutter on the left; the one at zero is the baseline. */
const yAxis = (top: number, step: number): string => {
  const lines: string[] = []
  for (let index = 0; index * step <= top + step / 1000; index += 1) {
    const value = index * step
    lines.push(`<div class="gl${value === 0 ? ' base' : ''}" style="bottom:${pct(value / top)}"><span>${formatNumber(value)}</span></div>`)
  }
  return `<div class="gls" aria-hidden="true">${lines.join('')}</div>`
}

/**
 * The days under the x axis: the first, the last and a few evenly between - never all of them. A label at
 * an edge of the plot is held inside it rather than centred over the edge.
 */
const dayTicks = (days: string[], at: (index: number) => number): string => {
  if (days.length === 0) return ''
  const wanted = Math.min(days.length, 6)
  const indices = new Set<number>()
  for (let i = 0; i < wanted; i += 1) indices.add(Math.round((i * (days.length - 1)) / Math.max(1, wanted - 1)))
  return `<div class="xaxis" aria-hidden="true">${[...indices]
    .map((index) => {
      const x = at(index)
      const edge = x < 0.04 ? ' class="first"' : x > 0.96 ? ' class="last"' : ''
      return `<span${edge} style="left:${pct(x)}">${escape(shortDay(days[index]!))}</span>`
    })
    .join('')}</div>`
}

/**
 * The card that appears beside the crosshair: the day, then a row per series - the value strong, the
 * series' name after it, a short stroke of its colour before. In the right part of the plot it opens to
 * the left, so it never runs off the card.
 */
const readout = (title: string, rows: { slot?: number; name: string; value: string }[], flip: boolean): string =>
  `<div class="tip${flip ? ' flip' : ''}"><div class="tipTitle">${escape(title)}</div>${rows
    .map(
      (row) =>
        `<div class="tipRow">${row.slot ? `<i class="key s${row.slot}"></i>` : '<i class="key none"></i>'}<b>${escape(row.value)}</b><span>${escape(row.name)}</span></div>`,
    )
    .join('')}</div>`

/** The readout's title for a day: the day with its weekday, and a word when it is still under way. */
const dayTitle = (chart: Chart, index: number): string =>
  `${longDay(chart.x[index]!)}${chart.partialLast && index === chart.x.length - 1 ? ', so far' : ''}`

/** The legend: a key per series, its name, and - for a line - where it stands on the last day. */
const legend = (chart: Chart, mark: 'line' | 'box', withLast: boolean): string => {
  if (chart.series.length < 2) return ''
  const format = chart.format ?? formatNumber
  const showLast = withLast && chart.x.length > 0
  return `<div class="legend">${chart.series
    .map((series) => {
      const last = series.values[series.values.length - 1]
      return `<span><i class="key ${mark} s${series.slot}"></i>${escape(series.name)}${showLast && last !== undefined ? ` <b>${escape(format(last))}</b>` : ''}</span>`
    })
    .join('')}${showLast && chart.partialLast ? '<span class="legendNote">today, so far</span>' : ''}</div>`
}

/** The chart as a table, folded away: what a screen reader reads, and every figure without hovering. */
const tableView = (chart: Chart, head: string, label: (x: string) => string): string => {
  const format = chart.format ?? formatNumber
  return (
    `<details class="tableView"><summary>Table</summary><div class="tableScroll"><table>` +
    `<thead><tr><th>${escape(head)}</th>${chart.series.map((series) => `<th class="num">${escape(series.name)}</th>`).join('')}</tr></thead>` +
    `<tbody>${chart.x
      .map(
        (x, index) =>
          `<tr><td>${escape(label(x))}</td>${chart.series.map((series) => `<td class="num">${escape(format(series.values[index] ?? 0))}</td>`).join('')}</tr>`,
      )
      .join('')}</tbody></table></div></details>`
  )
}

const at = ([x, y]: [number, number]): string => `${x.toFixed(1)},${y.toFixed(1)}`

/**
 * A smooth line through the points that never overshoots them: a cubic between each two, with the
 * tangents of a monotone curve (Fritsch-Carlson, as d3's curveMonotoneX). A day with nothing stays on the
 * baseline instead of dipping below it, and a peak is not drawn higher than it was.
 *
 * One piece per gap between two points, each starting where the one before it ended - so a line can be
 * drawn in two parts, the finished days and the one still under way.
 */
const smoothPieces = (points: [number, number][]): string[] => {
  if (points.length < 3) return points.slice(1).map((point) => `L${at(point)}`)

  const sign = (value: number): number => (value < 0 ? -1 : 1)
  const n = points.length
  const tangents = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i += 1) {
    const h0 = points[i]![0] - points[i - 1]![0]
    const h1 = points[i + 1]![0] - points[i]![0]
    const s0 = (points[i]![1] - points[i - 1]![1]) / h0
    const s1 = (points[i + 1]![1] - points[i]![1]) / h1
    const p = (s0 * h1 + s1 * h0) / (h0 + h1)
    tangents[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
  }
  const end = (i: number, j: number, inner: number): number => {
    const h = points[j]![0] - points[i]![0]
    const slope = (points[j]![1] - points[i]![1]) / h
    return (3 * slope - inner) / 2
  }
  tangents[0] = end(0, 1, tangents[1]!)
  tangents[n - 1] = end(n - 2, n - 1, tangents[n - 2]!)

  const pieces: string[] = []
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = points[i]!
    const [x1, y1] = points[i + 1]!
    const third = (x1 - x0) / 3
    pieces.push(`C${at([x0 + third, y0 + tangents[i]! * third])} ${at([x1 - third, y1 - tangents[i + 1]! * third])} ${at([x1, y1])}`)
  }
  return pieces
}

export const smoothPath = (points: [number, number][]): string =>
  points.length === 0 ? '' : `M${at(points[0]!)}${smoothPieces(points).join('')}`

/** The stretched box lines are drawn in: a thousand units each way, whatever the card's size. */
const BOX = 1000

/**
 * Lines over days: the trend of one figure, or of a few that share its unit. The first series gets a wash
 * under it that fades towards the baseline; the others stay bare lines, so the washes never pile up.
 * Every series ends in a dot on the last day, and a single series has its last value written beside it -
 * the one number worth reading off without the axis. With two or more, the legend carries those values.
 *
 * [id] tells this chart's fade apart from the other charts' on the page.
 */
export const lineChart = (chart: Chart & { id: string }, options: { height?: number } = {}): string => {
  const format = chart.format ?? formatNumber
  const n = chart.x.length
  const { top, step } = niceScale(Math.max(0, ...chart.series.flatMap((series) => series.values)))
  const xAt = (index: number): number => (n <= 1 ? 0.5 : index / (n - 1))
  const heightAt = (value: number): number => Math.min(1, Math.max(0, value / top))
  const single = chart.series.length === 1

  const fade = `fade-${chart.id}`
  const paths = chart.series.map((series) =>
    series.values.map((value, index): [number, number] => [xAt(index) * BOX, (1 - heightAt(value)) * BOX]),
  )
  const first = chart.series[0]
  const firstPoints = paths[0] ?? []
  const area =
    first && firstPoints.length > 1
      ? `<defs><linearGradient id="${fade}" class="s${first.slot}" x1="0" y1="0" x2="0" y2="1"><stop class="top" offset="0"/><stop class="bottom" offset="1"/></linearGradient></defs>` +
        `<path class="area" fill="url(#${fade})" d="${smoothPath(firstPoints)}L${firstPoints[firstPoints.length - 1]![0].toFixed(1)},${BOX}L${firstPoints[0]![0].toFixed(1)},${BOX}Z"/>`
      : ''
  // The first series is drawn last, on top of the others: it is the one the chart is about. A day under
  // way gets its stretch of the line dashed, apart from the finished days.
  const lines = chart.series
    .map((series, k) => {
      const points = paths[k]!
      if (!chart.partialLast || points.length < 2) return `<path class="line s${series.slot}" d="${smoothPath(points)}"/>`
      const pieces = smoothPieces(points)
      return (
        `<path class="line s${series.slot}" d="M${at(points[0]!)}${pieces.slice(0, -1).join('')}"/>` +
        `<path class="line partial s${series.slot}" d="M${at(points[points.length - 2]!)}${pieces[pieces.length - 1]}"/>`
      )
    })
    .reverse()
    .join('')

  const svg = `<svg class="lines" viewBox="0 0 ${BOX} ${BOX}" preserveAspectRatio="none" aria-hidden="true">${area}${lines}</svg>`

  const ends =
    n === 0
      ? ''
      : chart.series
          .map((series) => {
            const value = series.values[n - 1] ?? 0
            const label = single ? `<span class="endLabel" style="bottom:${pct(heightAt(value))}">${escape(format(value))}</span>` : ''
            return `<i class="dot end s${series.slot}" style="left:${pct(xAt(n - 1))};bottom:${pct(heightAt(value))}"></i>${label}`
          })
          .join('')

  // Each day's column reaches halfway to its neighbours, so the pointer finds the nearest day anywhere.
  const band = n <= 1 ? 1 : 1 / (n - 1)
  const hits = chart.x
    .map((_, index) => {
      const x = xAt(index)
      const left = Math.max(0, x - band / 2)
      const width = Math.min(1, x + band / 2) - left
      const dots = chart.series
        .map((series) => `<i class="dot s${series.slot}" style="bottom:${pct(heightAt(series.values[index] ?? 0))}"></i>`)
        .join('')
      const rows = chart.series.map((series) => ({ slot: series.slot, name: series.name, value: format(series.values[index] ?? 0) }))
      return `<div class="hit" style="left:${pct(left)};width:${pct(width)};--at:${pct(width === 0 ? 0.5 : (x - left) / width)}"><i class="cross"></i>${dots}${readout(dayTitle(chart, index), rows, x > 0.6)}</div>`
    })
    .join('')

  return (
    `<figure class="viz">` +
    legend(chart, 'line', true) +
    `<div class="plot${single ? ' labelled' : ''}" style="height:${options.height ?? 220}px" role="img" aria-label="${escape(chart.label)}">` +
    yAxis(top, step) +
    svg +
    ends +
    `<div class="hits">${hits}</div>` +
    `</div>` +
    dayTicks(chart.x, xAt) +
    tableView(chart, 'Day', shortDay) +
    `</figure>`
  )
}

/**
 * Columns over ordered positions: days, or the bins of a histogram. Two or more series stack, the first at
 * the bottom, with a sliver of the card between the parts.
 *
 * [bins] is for a handful of named bins: every bin gets its name under it and its figure on its cap. A
 * month of days gets neither - the axis names a few days, the readout and the table carry the figures.
 */
export const columnChart = (chart: Chart, options: { bins?: boolean; height?: number } = {}): string => {
  const format = chart.format ?? formatNumber
  const n = chart.x.length
  const totals = chart.x.map((_, index) => sum(chart.series.map((series) => series.values[index] ?? 0)))
  const { top, step } = niceScale(Math.max(0, ...totals))
  const stacked = chart.series.length > 1

  const columns = chart.x
    .map((x, index) => {
      const total = totals[index]!
      const segments = chart.series
        .filter((series) => (series.values[index] ?? 0) > 0)
        .map((series) => `<i class="s${series.slot}" style="flex-grow:${series.values[index]}"></i>`)
        .join('')
      const stack = total > 0 ? `<span class="stack" style="height:${pct(Math.min(1, total / top))}">${segments}</span>` : ''
      const cap = options.bins && total > 0 ? `<span class="cap" style="bottom:${pct(Math.min(1, total / top))}">${escape(format(total))}</span>` : ''
      const rows: { slot?: number; name: string; value: string }[] = chart.series.map((series) => ({
        slot: series.slot,
        name: series.name,
        value: format(series.values[index] ?? 0),
      }))
      if (stacked) rows.push({ name: 'in all', value: format(total) })
      const title = options.bins ? x : dayTitle(chart, index)
      const partial = chart.partialLast && index === n - 1 ? ' partial' : ''
      return `<div class="col${partial}">${stack}${cap}${readout(title, rows, (index + 0.5) / n > 0.6)}</div>`
    })
    .join('')

  const xAxis = options.bins
    ? `<div class="xaxis bins" aria-hidden="true">${chart.x.map((x) => `<span>${escape(x)}</span>`).join('')}</div>`
    : dayTicks(chart.x, (index) => (index + 0.5) / Math.max(1, n))

  return (
    `<figure class="viz">` +
    legend(chart, 'box', false) +
    `<div class="plot columns${options.bins ? ' capped' : ''}" style="height:${options.height ?? 200}px" role="img" aria-label="${escape(chart.label)}">` +
    yAxis(top, step) +
    `<div class="cols${n > 45 ? ' dense' : ''}">${columns}</div>` +
    `</div>` +
    xAxis +
    tableView(chart, options.bins ? 'Bin' : 'Day', options.bins ? (x) => x : shortDay) +
    `</figure>`
  )
}

/** The most points a sparkline draws: past a month, days are averaged in runs that end on the last one. */
const SPARK_POINTS = 30

const runs = (values: number[]): number[] => {
  if (values.length <= SPARK_POINTS) return values
  const size = Math.ceil(values.length / SPARK_POINTS)
  const out: number[] = []
  for (let end = values.length; end > 0; end -= size) {
    const run = values.slice(Math.max(0, end - size), end)
    out.unshift(sum(run) / run.length)
  }
  return out
}

/**
 * The little trend under a headline figure: its shape over the range, no axis, no labels. Nothing when
 * there is no shape to show - a single day, or nothing but zeros. A quarter or a year of days is averaged
 * into runs first: at that width every weekend is a spike, and the spikes hide the trend the line is for.
 */
export const sparkline = (days: number[]): string => {
  const values = runs(days)
  if (values.length < 2 || values.every((value) => value === 0)) return ''
  const max = Math.max(...values)
  const points = values.map((value, index): [number, number] => [
    (index / (values.length - 1)) * BOX,
    // A hair of room at the top and bottom, so the stroke is never cut in half by the edge.
    60 + (1 - (max === 0 ? 0 : value / max)) * (BOX - 120),
  ])
  const path = smoothPath(points)
  return (
    `<svg class="spark" viewBox="0 0 ${BOX} ${BOX}" preserveAspectRatio="none" aria-hidden="true">` +
    `<path class="sparkArea" d="${path}L${BOX},${BOX}L0,${BOX}Z"/><path class="sparkLine" d="${path}"/>` +
    `</svg>`
  )
}
