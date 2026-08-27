import type { StatisticsData, StatisticsDay } from '../protocol'
import { addDays, dayNumber, daysBetween, weekday } from './dates'
import { WEEKDAYS, clock, longDate } from './format'

/**
 * The arithmetic behind the statistics tab: out of the day records the IDE keeps, everything the tiles,
 * the chart, the calendar and the lists show - for whichever range is chosen.
 *
 * Pure functions over the message, so the range switches without a trip to the IDE and the whole of it
 * can be checked in a test. The words go in the components; here are the numbers.
 */

export type RangeKey = '1d' | '7d' | '30d' | 'all'

export interface Range {
  key: RangeKey
  /** The first and the last day counted, both included. */
  from: string
  to: string
  /** How many calendar days that is. */
  days: number
  /** "today", "last 30 days", "since Aug 26, 2026". */
  label: string
  /** "TODAY", "30D", "7D", "ALL" - the tag on the first tile. */
  tag: string
}

const RANGE_DAYS: Record<RangeKey, number> = { '1d': 1, '7d': 7, '30d': 30, all: 0 }

/** The first day anything at all was recorded, across every project - where "all time" begins. */
export const firstRecordedDay = (data: StatisticsData): string | null => {
  let first: string | null = null
  const consider = (day: string) => {
    if (first === null || day < first) first = day
  }
  for (const day of data.days) consider(day.date)
  for (const project of data.projects) for (const day of Object.keys(project.minutes)) consider(day)
  return first
}

export const rangeOf = (data: StatisticsData, key: RangeKey): Range => {
  const to = data.today
  if (key !== 'all') {
    const days = RANGE_DAYS[key]
    return {
      key,
      from: addDays(to, -(days - 1)),
      to,
      days,
      // A single day is today itself, and reads as such rather than as "last 1 days".
      label: days === 1 ? 'today' : `last ${days} days`,
      tag: days === 1 ? 'TODAY' : `${days}D`,
    }
  }

  const first = firstRecordedDay(data) ?? to
  const from = first < to ? first : to
  return {
    key,
    from,
    to,
    days: dayNumber(to) - dayNumber(from) + 1,
    label: `since ${longDate(from)}`,
    tag: 'ALL',
  }
}

const within = (day: string, from: string, to: string): boolean => day >= from && day <= to

const sum = (days: StatisticsDay[], pick: (day: StatisticsDay) => number | undefined): number =>
  days.reduce((total, day) => total + (pick(day) ?? 0), 0)

const max = (days: StatisticsDay[], pick: (day: StatisticsDay) => number | undefined): number =>
  days.reduce((best, day) => Math.max(best, pick(day) ?? 0), 0)

const isActive = (day: StatisticsDay): boolean => day.minutes > 0 || (day.turns ?? 0) > 0 || (day.prompts ?? 0) > 0

/** The days of this project inside the range. */
export const daysIn = (data: StatisticsData, range: Range): StatisticsDay[] =>
  data.days.filter((day) => within(day.date, range.from, range.to))

// --- Time in the panel -----------------------------------------------------------------

export interface TimeTile {
  /** This project's minutes in the range, and the change against the stretch of equal length before it. */
  minutes: number
  delta: number | null
  /** Every project's minutes in the range, and this project's minutes per calendar day of the range. */
  allMinutes: number
  perDay: number
}

/** Every project's minutes between two days, this one included. */
const allProjectMinutes = (data: StatisticsData, from: string, to: string): number => {
  let total = 0
  for (const project of data.projects) {
    for (const [day, minutes] of Object.entries(project.minutes)) {
      if (within(day, from, to)) total += minutes
    }
  }
  return total
}

export const timeTile = (data: StatisticsData, range: Range): TimeTile => {
  const days = daysIn(data, range)
  const minutes = sum(days, (day) => day.minutes)

  let delta: number | null = null
  if (range.key !== 'all') {
    const previousTo = addDays(range.from, -1)
    const previousFrom = addDays(previousTo, -(range.days - 1))
    const previous = sum(
      data.days.filter((day) => within(day.date, previousFrom, previousTo)),
      (day) => day.minutes,
    )
    delta = minutes - previous
  }

  return {
    minutes,
    delta,
    allMinutes: allProjectMinutes(data, range.from, range.to),
    perDay: minutes / Math.max(1, range.days),
  }
}

// --- Days at work -----------------------------------------------------------------------

export interface DaysTile {
  active: number
  total: number
  /** The run of days reaching today or yesterday, and the longest run ever - this project's. */
  streak: number
  best: number
  /** The last fortnight, oldest first: whether each day was worked. */
  dots: { date: string; active: boolean }[]
}

const DOT_DAYS = 14

/** The longest run of consecutive days in a sorted list. */
export const bestStreak = (dates: string[]): number => {
  let best = 0
  let run = 0
  let previous: number | null = null

  for (const date of [...dates].sort()) {
    const number = dayNumber(date)
    run = previous !== null && number === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = number
  }

  return best
}

/** The run that reaches today, or yesterday since today may not have started. Zero otherwise. */
export const currentStreak = (dates: string[], today: string): number => {
  const set = new Set(dates)
  let cursor = set.has(today) ? today : addDays(today, -1)
  if (!set.has(cursor)) return 0

  let run = 0
  while (set.has(cursor)) {
    run++
    cursor = addDays(cursor, -1)
  }
  return run
}

export const daysTile = (data: StatisticsData, range: Range): DaysTile => {
  const activeDates = data.days.filter(isActive).map((day) => day.date)
  const inRange = activeDates.filter((date) => within(date, range.from, range.to))
  const activeSet = new Set(activeDates)

  return {
    active: inRange.length,
    total: range.days,
    streak: currentStreak(activeDates, data.today),
    best: bestStreak(activeDates),
    dots: daysBetween(addDays(data.today, -(DOT_DAYS - 1)), data.today).map((date) => ({
      date,
      active: activeSet.has(date),
    })),
  }
}

// --- What came out of it ----------------------------------------------------------------

export interface OutputTile {
  turns: number
  sessions: number
  filesTouched: number
  forks: number
}

export const outputTile = (data: StatisticsData, range: Range): OutputTile => {
  const days = daysIn(data, range)
  return {
    turns: sum(days, (day) => day.turns),
    sessions: sum(days, (day) => day.sessions),
    filesTouched: sum(days, (day) => day.filesTouched),
    forks: sum(days, (day) => day.forks),
  }
}

// --- Hours a day ------------------------------------------------------------------------

export interface HoursSeries {
  dates: string[]
  /** Hours a day: this project, and every project together. */
  project: number[]
  all: number[]
  /** The longest day of this project in the range, if there was one. */
  longest: { date: string; minutes: number } | null
}

export const hoursSeries = (data: StatisticsData, range: Range): HoursSeries => {
  const dates = daysBetween(range.from, range.to)
  const byDate = new Map(data.days.map((day) => [day.date, day]))

  const project = dates.map((date) => (byDate.get(date)?.minutes ?? 0) / 60)
  const all = dates.map((date) => {
    let minutes = 0
    for (const other of data.projects) minutes += other.minutes[date] ?? 0
    return minutes / 60
  })

  let longest: { date: string; minutes: number } | null = null
  for (const date of dates) {
    const minutes = byDate.get(date)?.minutes ?? 0
    if (minutes > 0 && (longest === null || minutes > longest.minutes)) longest = { date, minutes }
  }

  return { dates, project, all, longest }
}

// --- The hours of one day ---------------------------------------------------------------

export interface HourBar {
  hour: number
  minutes: number
}

export interface DayHours {
  /** All 24 hours, midnight first - the quiet ones included, so the day keeps its shape. */
  bars: HourBar[]
  minutes: number
  /** The busiest hour, and the first and the last hour with anything in them. Absent on a quiet day. */
  peak: HourBar | null
  first: number | null
  last: number | null
}

/**
 * Minutes by hour of the day, added up over the days of the range.
 *
 * This is what the chart shows when the range is a single day: a line of dots one day wide says
 * nothing, whereas the hours of that day say when the work happened.
 */
export const dayHours = (data: StatisticsData, range: Range): DayHours => {
  const minutes = Array.from({ length: 24 }, () => 0)
  for (const day of daysIn(data, range)) {
    ;(day.hours ?? []).forEach((value, hour) => {
      if (hour < 24) minutes[hour] = (minutes[hour] ?? 0) + value
    })
  }

  const bars = minutes.map((value, hour) => ({ hour, minutes: value }))
  const worked = bars.filter((bar) => bar.minutes > 0)
  let peak: HourBar | null = null
  for (const bar of worked) if (peak === null || bar.minutes > peak.minutes) peak = bar

  return {
    bars,
    minutes: minutes.reduce((total, value) => total + value, 0),
    peak,
    first: worked[0]?.hour ?? null,
    last: worked[worked.length - 1]?.hour ?? null,
  }
}

// --- When you work ----------------------------------------------------------------------

export interface HeatCell {
  date: string
  minutes: number
  /** 0 is quiet, 4 is the busiest a day gets. */
  level: number
  /** Whether the day lies in the future - the rest of this week, drawn empty. */
  ahead: boolean
}

export interface HeatMap {
  /** Weeks, newest first; each week Monday to Sunday. */
  weeks: HeatCell[][]
  /** "Most of your work lands Tue–Thu, between 10:00 and 13:00." */
  sentence: string
}

/** How many weeks the calendar is ready to show - the panel decides how many of them fit. */
export const HEAT_WEEKS = 53

/** The busiest quarter of days is the top level; the rest are spread evenly below it. */
export const heatLevel = (minutes: number, busiest: number): number => {
  if (minutes <= 0 || busiest <= 0) return 0
  const share = minutes / busiest
  if (share <= 0.25) return 1
  if (share <= 0.5) return 2
  if (share <= 0.75) return 3
  return 4
}

export const heatMap = (data: StatisticsData): HeatMap => {
  const byDate = new Map(data.days.map((day) => [day.date, day]))
  const today = data.today
  // The newest week ends on the coming Sunday, so today always sits in the last column.
  const end = addDays(today, 6 - weekday(today))
  const start = addDays(end, -(HEAT_WEEKS * 7 - 1))
  const dates = daysBetween(start, end)

  const busiest = max(
    data.days.filter((day) => within(day.date, start, today)),
    (day) => day.minutes,
  )

  const cells = dates.map((date) => {
    const minutes = byDate.get(date)?.minutes ?? 0
    return { date, minutes, level: heatLevel(minutes, busiest), ahead: date > today }
  })

  const weeks: HeatCell[][] = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))

  return { weeks: weeks.reverse(), sentence: workSentence(data.days) }
}

/**
 * The days of the week and the hours of the day the work lands in - the run of three weekdays and the
 * run of three hours that hold the most minutes.
 */
export const workSentence = (days: StatisticsDay[]): string => {
  const byWeekday = Array.from({ length: 7 }, () => 0)
  const byHour = Array.from({ length: 24 }, () => 0)
  let total = 0

  for (const day of days) {
    if (day.minutes <= 0) continue
    total += day.minutes
    byWeekday[weekday(day.date)] = (byWeekday[weekday(day.date)] ?? 0) + day.minutes
    day.hours.forEach((minutes, hour) => {
      byHour[hour] = (byHour[hour] ?? 0) + minutes
    })
  }

  if (total === 0) return 'Nothing here yet - the calendar fills in as you work.'

  const dayRun = bestRun(byWeekday, 3, false)
  const hourRun = bestRun(byHour, 3, true)

  const dayWords =
    dayRun.length === 1
      ? `${WEEKDAYS[dayRun.start]}`
      : `${WEEKDAYS[dayRun.start]}–${WEEKDAYS[(dayRun.start + dayRun.length - 1) % 7]}`
  const hourWords = `between ${clock(hourRun.start)} and ${clock(hourRun.start + hourRun.length)}`

  return `Most of your work lands ${dayWords}, ${hourWords}.`
}

/**
 * The run of up to `width` neighbouring slots holding the most, shortened from either end while the
 * end slot adds too little to be worth naming - "Tue–Thu" rather than "Mon–Thu" when Monday is quiet.
 */
const bestRun = (values: number[], width: number, wrap: boolean): { start: number; length: number } => {
  const size = values.length
  let best = { start: 0, length: 1, total: -1 }

  for (let start = 0; start < size; start++) {
    let total = 0
    for (let offset = 0; offset < width; offset++) {
      const index = start + offset
      if (index >= size && !wrap) break
      total += values[index % size] ?? 0
    }
    if (total > best.total) best = { start, length: Math.min(width, wrap ? width : size - start), total }
  }

  // Trim the quiet ends: a slot holding under a fifth of the run's busiest slot is not where the work is.
  let start = best.start
  let length = best.length
  const peak = Math.max(...Array.from({ length }, (_, offset) => values[(start + offset) % size] ?? 0))
  while (length > 1 && (values[start % size] ?? 0) < peak * 0.2) {
    start++
    length--
  }
  while (length > 1 && (values[(start + length - 1) % size] ?? 0) < peak * 0.2) length--

  return { start: start % size, length }
}

// --- What the agent did -------------------------------------------------------------------

export interface ToolRow {
  name: string
  count: number
  /** Against the busiest tool: 0 to 1. */
  share: number
  /** The feed's own paint for it: reads on the neutral backing, edits on the primary, a command on sand. */
  tone: 'neutral' | 'edit' | 'command' | 'agent' | 'mcp'
}

const TOOL_TONE: Record<string, ToolRow['tone']> = {
  Read: 'neutral',
  Grep: 'neutral',
  Glob: 'neutral',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'command',
  Task: 'agent',
  MCP: 'mcp',
}

export const TOOL_ROWS = 5

export const toolRows = (data: StatisticsData, range: Range, limit = TOOL_ROWS): ToolRow[] => {
  const counts = new Map<string, number>()
  for (const day of daysIn(data, range)) {
    for (const [name, count] of Object.entries(day.tools ?? {})) counts.set(name, (counts.get(name) ?? 0) + count)
  }

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
  const top = rows[0]?.[1] ?? 0

  return rows.map(([name, count]) => ({
    name,
    count,
    share: top > 0 ? count / top : 0,
    tone: TOOL_TONE[name] ?? 'neutral',
  }))
}

// --- Where the hours went ------------------------------------------------------------------

export interface ProjectRow {
  key: string
  name: string
  minutes: number
  share: number
  current: boolean
}

export const PROJECT_ROWS = 5

export const projectRows = (data: StatisticsData, range: Range, limit = PROJECT_ROWS): ProjectRow[] => {
  const rows = data.projects
    .map((project) => {
      let minutes = 0
      for (const [day, value] of Object.entries(project.minutes)) {
        if (within(day, range.from, range.to)) minutes += value
      }
      return { key: project.key, name: project.name || 'unnamed', minutes, share: 0, current: project.key === data.project.key }
    })
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
    .slice(0, limit)

  const top = rows[0]?.minutes ?? 0
  return rows.map((row) => ({ ...row, share: top > 0 ? row.minutes / top : 0 }))
}

/** How many projects the ledger knows at all - what this project is compared with. */
export const projectCount = (data: StatisticsData): number => data.projects.length

// --- Files -----------------------------------------------------------------------------------

export interface FilesTile {
  added: number
  removed: number
  touched: number
  refused: number
  biggest: number
}

export const filesTile = (data: StatisticsData, range: Range): FilesTile => {
  const days = daysIn(data, range)

  return {
    added: sum(days, (day) => day.linesAdded),
    removed: sum(days, (day) => day.linesRemoved),
    touched: sum(days, (day) => day.filesTouched),
    refused: sum(days, (day) => day.editsRefused),
    biggest: max(days, (day) => day.biggestEdit),
  }
}

// --- Sessions · models · forks ----------------------------------------------------------------

export interface FactsTile {
  sessions: number
  turns: number
  /** The mean turn, in milliseconds - null without a single turn. */
  averageTurnMs: number | null
  longestSessionMinutes: number
  forks: number
  deepestChain: number
  /** Turns by model family, the busiest first, as shares of all turns. */
  models: { name: string; turns: number; share: number }[]
  tokens: number
  cost: number
}

export const factsTile = (data: StatisticsData, range: Range): FactsTile => {
  const days = daysIn(data, range)
  const turns = sum(days, (day) => day.turns)
  const turnMillis = sum(days, (day) => day.turnMillis)

  const modelTurns = new Map<string, number>()
  for (const day of days) {
    for (const [name, count] of Object.entries(day.models ?? {})) modelTurns.set(name, (modelTurns.get(name) ?? 0) + count)
  }
  const modelTotal = [...modelTurns.values()].reduce((total, value) => total + value, 0)
  const models = [...modelTurns.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, turns: count, share: modelTotal > 0 ? count / modelTotal : 0 }))

  return {
    sessions: sum(days, (day) => day.sessions),
    turns,
    averageTurnMs: turns > 0 ? turnMillis / turns : null,
    longestSessionMinutes: max(days, (day) => day.longestSession),
    forks: sum(days, (day) => day.forks),
    deepestChain: max(days, (day) => day.maxDepth),
    models,
    tokens:
      sum(days, (day) => day.tokensIn) +
      sum(days, (day) => day.tokensOut) +
      sum(days, (day) => day.tokensCacheRead) +
      sum(days, (day) => day.tokensCacheWrite),
    cost: sum(days, (day) => day.cost),
  }
}
