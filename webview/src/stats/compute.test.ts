import { describe, expect, it } from 'vitest'
import type { StatisticsData, StatisticsDay } from '../protocol'
import {
  bestStreak,
  currentStreak,
  dayHours,
  daysTile,
  factsTile,
  filesTile,
  heatLevel,
  heatMap,
  hoursSeries,
  outputTile,
  projectRows,
  rangeOf,
  timeTile,
  toolRows,
  workSentence,
} from './compute'

const TODAY = '2026-08-26'

const day = (date: string, overrides: Partial<StatisticsDay> = {}): StatisticsDay => ({
  date,
  minutes: 0,
  hours: Array.from({ length: 24 }, () => 0),
  ...overrides,
})

/** A day with its minutes spread over the given hours, so the calendar's sentence has something to read. */
const busy = (date: string, minutes: number, hours: number[] = [10, 11, 12], overrides: Partial<StatisticsDay> = {}) => {
  const perHour = Array.from({ length: 24 }, () => 0)
  hours.forEach((hour) => {
    perHour[hour] = Math.round(minutes / hours.length)
  })
  return day(date, { minutes, hours: perHour, turns: 1, ...overrides })
}

const data = (days: StatisticsDay[], others: { key: string; name: string; minutes: Record<string, number> }[] = []): StatisticsData => ({
  now: Date.parse(`${TODAY}T12:00:00Z`),
  since: Date.parse('2026-06-01T00:00:00Z'),
  today: TODAY,
  ide: 'WebStorm',
  devicesPaired: 0,
  project: { key: 'p-this', name: 'amazing-claude-code' },
  projects: [
    { key: 'p-this', name: 'amazing-claude-code', minutes: Object.fromEntries(days.filter((d) => d.minutes > 0).map((d) => [d.date, d.minutes])) },
    ...others,
  ],
  days,
  achievements: [],
})

describe('the ranges', () => {
  it('counts a week and a month back from today, today included', () => {
    const empty = data([])
    expect(rangeOf(empty, '7d')).toMatchObject({ from: '2026-08-20', to: TODAY, days: 7, tag: '7D' })
    expect(rangeOf(empty, '30d')).toMatchObject({ from: '2026-07-28', to: TODAY, days: 30, tag: '30D' })
  })

  it('is today alone for a single day, and says so rather than "last 1 days"', () => {
    const range = rangeOf(data([]), '1d')
    expect(range).toMatchObject({ from: TODAY, to: TODAY, days: 1, tag: 'TODAY' })
    expect(range.label).toBe('today')
  })

  it('starts all time at the first recorded day of any project', () => {
    const withOther = data([busy('2026-08-01', 30)], [{ key: 'p-other', name: 'relay', minutes: { '2026-05-10': 5 } }])
    expect(rangeOf(withOther, 'all')).toMatchObject({ from: '2026-05-10', to: TODAY, days: 109, tag: 'ALL' })
    expect(rangeOf(withOther, 'all').label).toBe('since May 10, 2026')
  })

  it('all time on an empty book is today alone', () => {
    expect(rangeOf(data([]), 'all')).toMatchObject({ from: TODAY, to: TODAY, days: 1 })
  })
})

describe('time in the panel', () => {
  it('sums the days of the range against the stretch before it, and names how many projects they were', () => {
    const days = [busy('2026-08-25', 60), busy('2026-08-20', 30), busy('2026-08-10', 45)]
    const others = [{ key: 'p-other', name: 'relay', minutes: { '2026-08-25': 100, '2026-07-01': 500 } }]
    const tile = timeTile(data(days, others), rangeOf(data(days, others), '7d'))

    expect(tile.minutes).toBe(90)
    // The previous week held the 45 minutes of Aug 10 - wait, Aug 10 lies before Aug 13; so nothing.
    expect(tile.delta).toBe(90)
    expect(tile.perDay).toBeCloseTo(90 / 7)
    // Both projects worked inside the week; the one that only ever worked in July does not count.
    expect(tile.projects).toBe(2)
  })

  it('counts no project when the range holds no minutes', () => {
    const set = data([], [{ key: 'p-other', name: 'relay', minutes: { '2026-01-01': 30 } }])
    expect(timeTile(set, rangeOf(set, '7d'))).toMatchObject({ minutes: 0, projects: 0 })
  })

  it('has no delta for all time - there is no stretch before the beginning', () => {
    const set = data([busy('2026-08-25', 60)])
    expect(timeTile(set, rangeOf(set, 'all')).delta).toBeNull()
  })
})

describe('days at work', () => {
  it('counts the streak up to yesterday and the best run ever', () => {
    const dates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-24', '2026-08-25']
    expect(bestStreak(dates)).toBe(4)
    expect(currentStreak(dates, TODAY)).toBe(2)
    expect(currentStreak(['2026-08-20'], TODAY)).toBe(0)
  })

  it('lays out a fortnight of dots ending today', () => {
    const set = data([busy('2026-08-25', 10), busy('2026-08-13', 10), busy('2026-08-12', 10)])
    const tile = daysTile(set, rangeOf(set, '30d'))

    expect(tile.dots).toHaveLength(14)
    expect(tile.dots[0]).toEqual({ date: '2026-08-13', active: true })
    expect(tile.dots[13]).toEqual({ date: TODAY, active: false })
    expect(tile.active).toBe(3)
    expect(tile.total).toBe(30)
    expect(tile.streak).toBe(1)
    expect(tile.best).toBe(2)
  })
})

describe('what came out of it', () => {
  it('adds the turns, sessions, files and forks of the range', () => {
    const set = data([
      busy('2026-08-25', 10, [9], { turns: 12, sessions: 2, filesTouched: 5, forks: 1 }),
      busy('2026-07-01', 10, [9], { turns: 100, sessions: 9, filesTouched: 50, forks: 9 }),
    ])
    expect(outputTile(set, rangeOf(set, '30d'))).toEqual({ turns: 12, sessions: 2, filesTouched: 5, forks: 1 })
  })
})

describe('hours a day', () => {
  it('gives one point per day of the range, in hours', () => {
    const set = data([busy('2026-08-25', 90)], [{ key: 'p-other', name: 'relay', minutes: { '2026-08-25': 30 } }])
    const series = hoursSeries(set, rangeOf(set, '7d'))

    expect(series.dates).toHaveLength(7)
    expect(series.hours).toHaveLength(7)
    expect(series.hours[5]).toBeCloseTo(1.5)
    expect(series.hours[6]).toBe(0)
    expect(series.longest).toEqual({ date: '2026-08-25', minutes: 90 })
  })
})

describe('the hours of one day', () => {
  it('adds the minutes up by hour, keeping the quiet hours in place', () => {
    const set = data([busy(TODAY, 90, [9, 10, 17]), busy('2026-08-25', 60, [11])])
    const hours = dayHours(set, rangeOf(set, '1d'))

    expect(hours.bars).toHaveLength(24)
    expect(hours.minutes).toBe(90)
    expect(hours.bars[9]).toEqual({ hour: 9, minutes: 30 })
    expect(hours.bars[11]).toEqual({ hour: 11, minutes: 0 })
    expect(hours.first).toBe(9)
    expect(hours.last).toBe(17)
    expect(hours.peak).toEqual({ hour: 9, minutes: 30 })
  })

  it('has no peak and no edges on a day with nothing in it', () => {
    const set = data([busy('2026-08-25', 60)])
    expect(dayHours(set, rangeOf(set, '1d'))).toMatchObject({ minutes: 0, peak: null, first: null, last: null })
  })
})

describe('when you work', () => {
  it('paints the busiest day darkest and the quiet ones by their share of it', () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(20, 100)).toBe(1)
    expect(heatLevel(50, 100)).toBe(2)
    expect(heatLevel(70, 100)).toBe(3)
    expect(heatLevel(100, 100)).toBe(4)
  })

  it('ends the calendar on the coming Sunday, with the days ahead marked as such', () => {
    const map = heatMap(data([busy('2026-08-25', 40)]))
    const newest = map.weeks[0]!
    // Aug 26, 2026 is a Wednesday: the newest week runs Mon Aug 24 to Sun Aug 30.
    expect(newest[0]!.date).toBe('2026-08-24')
    expect(newest[6]!.date).toBe('2026-08-30')
    expect(newest[6]!.ahead).toBe(true)
    expect(newest[1]).toMatchObject({ date: '2026-08-25', minutes: 40, level: 4, ahead: false })
    expect(map.weeks).toHaveLength(53)
  })

  it('names the days and the hours the work lands on', () => {
    const days = [
      busy('2026-08-18', 120, [10, 11, 12]), // Tuesday
      busy('2026-08-19', 120, [10, 11, 12]), // Wednesday
      busy('2026-08-20', 120, [10, 11, 12]), // Thursday
      busy('2026-08-22', 5, [22]), // Saturday, barely
    ]
    expect(workSentence(days)).toBe('Most of your work lands Tue–Thu, between 10:00 and 13:00.')
  })

  it('has a sentence for an empty calendar too', () => {
    expect(workSentence([])).toMatch(/Nothing here yet/)
  })
})

describe('what the agent did', () => {
  it('lists the five busiest tools against the busiest', () => {
    const set = data([
      busy('2026-08-25', 10, [9], { tools: { Read: 10, Edit: 5, Bash: 4, Grep: 3, Write: 1, Glob: 1 } }),
      busy('2026-08-24', 10, [9], { tools: { Read: 10 } }),
    ])
    const rows = toolRows(set, rangeOf(set, '30d'))

    expect(rows.map((row) => row.name)).toEqual(['Read', 'Edit', 'Bash', 'Grep', 'Glob'])
    expect(rows[0]).toMatchObject({ count: 20, share: 1, tone: 'neutral' })
    expect(rows[1]).toMatchObject({ count: 5, share: 0.25, tone: 'edit' })
    expect(rows[2]?.tone).toBe('command')
  })
})

describe('where the hours went', () => {
  it('ranks the projects by their minutes in the range and marks this one', () => {
    const set = data(
      [busy('2026-08-25', 60)],
      [
        { key: 'p-relay', name: 'relay', minutes: { '2026-08-25': 120, '2026-01-01': 999 } },
        { key: 'p-idle', name: 'idle', minutes: { '2026-01-01': 5 } },
      ],
    )
    const rows = projectRows(set, rangeOf(set, '30d'))

    expect(rows.map((row) => row.name)).toEqual(['relay', 'amazing-claude-code'])
    expect(rows[0]).toMatchObject({ minutes: 120, share: 1, current: false })
    expect(rows[1]).toMatchObject({ minutes: 60, share: 0.5, current: true })
  })
})

describe('files', () => {
  it('adds the lines up and keeps the biggest edit of the range', () => {
    const set = data([
      busy('2026-08-25', 10, [9], {
        linesAdded: 100,
        linesRemoved: 40,
        filesTouched: 3,
        editsRefused: 1,
        biggestEdit: 80,
      }),
      busy('2026-08-24', 10, [9], { linesAdded: 20, biggestEdit: 30 }),
    ])
    expect(filesTile(set, rangeOf(set, '30d'))).toEqual({
      added: 120,
      removed: 40,
      touched: 3,
      refused: 1,
      biggest: 80,
    })
  })
})

describe('sessions, models, forks', () => {
  it('averages the turns and shares out the models', () => {
    const set = data([
      busy('2026-08-25', 10, [9], {
        turns: 4,
        turnMillis: 40_000,
        sessions: 2,
        longestSession: 90,
        forks: 1,
        maxDepth: 2,
        models: { Sonnet: 3, Opus: 1 },
        tokensIn: 100,
        tokensOut: 50,
        tokensCacheRead: 800,
        tokensCacheWrite: 50,
        cost: 1.5,
      }),
    ])
    const tile = factsTile(set, rangeOf(set, '30d'))

    expect(tile.averageTurnMs).toBe(10_000)
    expect(tile.models).toEqual([
      { name: 'Sonnet', turns: 3, share: 0.75 },
      { name: 'Opus', turns: 1, share: 0.25 },
    ])
    expect(tile.tokens).toBe(1000)
    expect(tile.cost).toBe(1.5)
    expect(tile.longestSessionMinutes).toBe(90)
    expect(tile.deepestChain).toBe(2)
  })
})
