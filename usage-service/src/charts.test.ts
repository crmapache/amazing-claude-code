import { describe, expect, it } from 'vitest'
import { columnChart, lineChart, smoothPath, sparkline } from './charts.js'

/**
 * The charts are text on the server, so what matters about them can be read off the text: no label is
 * drawn inside the stretched picture, a curve never leaves the range of its points, and a day still under
 * way is told apart from the finished ones.
 */

const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30']

/** Every y a path names, control points included. */
const ys = (path: string): number[] =>
  [...path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[2]))

describe('the charts', () => {
  it('draws a curve that stays between its lowest and highest point', () => {
    // A day of nothing between two busy ones: a plain spline would dip below the baseline there.
    const path = smoothPath([[0, 1000], [250, 0], [500, 1000], [750, 1000], [1000, 200]])

    expect(Math.min(...ys(path))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys(path))).toBeLessThanOrEqual(1000)
  })

  it('writes every label as HTML, so it keeps its size however wide the card is', () => {
    const html = lineChart({ id: 'test', label: 'Active', x: DAYS, series: [{ name: 'active', slot: 1, values: [2, 5, 3] }] })
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'))

    expect(svg).not.toContain('<text')
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(html).toContain('<span class="first" style="left:0%">Sep 28</span>')
    // The last value beside the end of a single line, and in the table.
    expect(html).toContain('class="endLabel"')
    expect(html).toContain('<td>Sep 30</td><td class="num">3</td>')
  })

  it('tells a day still under way from the finished ones', () => {
    const chart = { label: 'Active', x: DAYS, partialLast: true, series: [{ name: 'active', slot: 1 as const, values: [2, 5, 3] }] }
    const line = lineChart({ ...chart, id: 'test' })
    const columns = columnChart(chart)

    expect(line.match(/class="line partial s1"/g)).toHaveLength(1)
    expect(line).toContain('Wed, Sep 30, so far')
    expect(line).not.toContain('Tue, Sep 29, so far')
    expect(columns).toContain('<div class="col partial">')
    expect(columns).toContain('Wed, Sep 30, so far')
  })

  it('stacks the series of a column and sums them in the readout', () => {
    const html = columnChart({
      label: 'New and returning',
      x: DAYS,
      series: [
        { name: 'Returning', slot: 1, values: [1, 2, 3] },
        { name: 'New', slot: 2, values: [1, 0, 2] },
      ],
    })

    expect(html).toContain('<i class="s1" style="flex-grow:3"></i><i class="s2" style="flex-grow:2"></i>')
    expect(html).toContain('<b>5</b><span>in all</span>')
  })

  it('averages a long range into runs before drawing a sparkline, and draws nothing without a shape', () => {
    const year = Array.from({ length: 365 }, (_, i) => (i % 7 === 5 ? 0 : 10))

    expect(ys(sparkline(year)).length).toBeLessThan(400)
    expect(sparkline([0, 0, 0])).toBe('')
    expect(sparkline([4])).toBe('')
  })
})
