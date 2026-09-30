import { featureLabel } from './features.js'
import { DAY_FIELDS, type DayField } from './report.js'
import { column, type Store } from './store.js'

/**
 * The figures the dashboard shows, worked out of the store for one range of days.
 *
 * Everything is counted per identifier and per day, and an identifier is a machine that allowed the
 * reports rather than a person: two IDEs on one computer share one (see UsageConsent on the plugin's
 * side), a person with a laptop and a desktop is two. "Active" means something happened in the panel
 * that day - a minute marked, a message sent or an answer finished.
 *
 * The days are the machines' own calendar days, not the server's: a report says "2026-09-29" in the
 * time zone it was made in, and that is the day it is filed under. Near midnight UTC this blurs today's
 * figure by a few hours either way, which is why the headline says "yesterday" rather than "today".
 */

export interface Share {
  value: string
  count: number
  share: number
}

export interface FeatureRow {
  id: string
  label: string
  group: string
  users: number
  share: number
  uses: number
}

export interface Cohort {
  week: string
  size: number
  /** For each week after the first: the share of the cohort active in it, or null for a week yet to come. */
  weeks: (number | null)[]
}

export interface SeriesPoint {
  day: string
  active: number
  fresh: number
  prompts: number
  medianMinutes: number
}

export interface Overview {
  range: { days: number; from: string; to: string }
  kpi: {
    activeYesterday: number
    active7: number
    active30: number
    activeInRange: number
    newInRange: number
    installsEver: number
    /** Per active machine-day. */
    medianMinutes: number
    avgSittings: number
    medianSitting: number
    avgPrompts: number
    /** The average day's active machines against everybody active in the range. */
    stickiness: number
  }
  series: SeriesPoint[]
  sittingLengths: Share[]
  sittingsPerDay: Share[]
  activeDaysPerInstall: Share[]
  features: FeatureRow[]
  tools: Share[]
  models: Share[]
  slash: Share[]
  cohorts: Cohort[]
  environment: Record<EnvironmentField, Share[]>
  settings: { key: string; values: Share[] }[]
  totals: Record<DayField, number>
  medians: Record<DayField, number>
}

export const RANGES = [7, 30, 90, 365] as const

export type EnvironmentField = 'plugin' | 'ide' | 'ide_version' | 'os' | 'arch' | 'cli' | 'lang'

const ENVIRONMENT_FIELDS: EnvironmentField[] = ['plugin', 'ide', 'ide_version', 'os', 'arch', 'cli', 'lang']

const ACTIVE = '(minutes > 0 OR prompts > 0 OR turns > 0)'

const DAY_MS = 24 * 60 * 60 * 1000

export const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10)

export const addDays = (day: string, n: number): string => dayOf(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)

/** The Monday of the week a day falls in. */
const weekOf = (day: string): string => {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
  return addDays(day, -weekday)
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

/** Values into labelled bins, in the bins' own order - a histogram rather than a ranking. */
const binned = (values: number[], bins: { label: string; upTo: number }[]): Share[] => {
  const counts = bins.map(() => 0)
  for (const value of values) {
    const index = bins.findIndex((bin) => value <= bin.upTo)
    counts[index === -1 ? bins.length - 1 : index]! += 1
  }
  const total = values.length || 1
  return bins.map((bin, index) => ({ value: bin.label, count: counts[index]!, share: counts[index]! / total }))
}

const SITTING_BINS = [
  { label: 'under 5 min', upTo: 4 },
  { label: '5-15 min', upTo: 15 },
  { label: '15-30 min', upTo: 30 },
  { label: '30-60 min', upTo: 60 },
  { label: '1-2 h', upTo: 120 },
  { label: '2-4 h', upTo: 240 },
  { label: '4 h and more', upTo: Number.POSITIVE_INFINITY },
]

const SITTINGS_PER_DAY_BINS = [
  { label: '1', upTo: 1 },
  { label: '2', upTo: 2 },
  { label: '3', upTo: 3 },
  { label: '4-5', upTo: 5 },
  { label: '6 and more', upTo: Number.POSITIVE_INFINITY },
]

const ACTIVE_DAYS_BINS = [
  { label: '1 day', upTo: 1 },
  { label: '2-3 days', upTo: 3 },
  { label: '4-7 days', upTo: 7 },
  { label: '8-14 days', upTo: 14 },
  { label: '15 days and more', upTo: Number.POSITIVE_INFINITY },
]

/** How many weekly cohorts the retention grid shows, and how many weeks after the first it follows. */
const COHORTS = 8

const WEEKS_FOLLOWED = 7

export const overview = (store: Store, days: number, now: number = Date.now()): Overview => {
  const to = dayOf(now)
  const from = addDays(to, -(days - 1))
  const yesterday = addDays(to, -1)

  const distinctActive = (start: string, end: string): number =>
    store.get<{ n: number }>(
      `SELECT COUNT(DISTINCT install) AS n FROM days WHERE day BETWEEN ? AND ? AND ${ACTIVE}`,
      start,
      end,
    )?.n ?? 0

  const activeInRange = distinctActive(from, to)
  const ofActive = (count: number): number => (activeInRange === 0 ? 0 : count / activeInRange)

  // --- Machine-days: the rows everything per-day is measured on -----------------------------------
  const rows = store.all<{ install: string; day: string; minutes: number; prompts: number; sittings: string }>(
    `SELECT install, day, minutes, prompts, sittings FROM days WHERE day BETWEEN ? AND ? AND ${ACTIVE}`,
    from,
    to,
  )

  const sittingsOf = (row: { sittings: string }): number[] => {
    try {
      const parsed: unknown = JSON.parse(row.sittings)
      return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === 'number') : []
    } catch {
      return []
    }
  }

  const allSittings = rows.flatMap(sittingsOf)
  const sittingCounts = rows.map((row) => sittingsOf(row).length).filter((count) => count > 0)

  const byDay = new Map<string, { active: number; prompts: number; minutes: number[] }>()
  const daysByInstall = new Map<string, number>()
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { active: 0, prompts: 0, minutes: [] }
    entry.active += 1
    entry.prompts += row.prompts
    entry.minutes.push(row.minutes)
    byDay.set(row.day, entry)
    daysByInstall.set(row.install, (daysByInstall.get(row.install) ?? 0) + 1)
  }

  const freshByDay = new Map(
    store
      .all<{ day: string; n: number }>(
        'SELECT first_day AS day, COUNT(*) AS n FROM installs WHERE first_day BETWEEN ? AND ? GROUP BY first_day',
        from,
        to,
      )
      .map((row) => [row.day, row.n]),
  )

  const series: SeriesPoint[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const entry = byDay.get(day)
    series.push({
      day,
      active: entry?.active ?? 0,
      fresh: freshByDay.get(day) ?? 0,
      prompts: entry?.prompts ?? 0,
      medianMinutes: median(entry?.minutes ?? []),
    })
  }

  // --- Named counts --------------------------------------------------------------------------------
  const named = (kind: string) =>
    store.all<{ name: string; users: number; uses: number }>(
      `SELECT name, COUNT(DISTINCT install) AS users, SUM(value) AS uses
       FROM counts WHERE kind = ? AND day BETWEEN ? AND ? GROUP BY name ORDER BY users DESC, uses DESC`,
      kind,
      from,
      to,
    )

  const byUses = (kind: string): Share[] => {
    const list = named(kind).sort((a, b) => b.uses - a.uses)
    const total = list.reduce((sum, row) => sum + row.uses, 0) || 1
    return list.map((row) => ({ value: row.name, count: row.uses, share: row.uses / total }))
  }

  const features: FeatureRow[] = named('features').map((row) => ({
    id: row.name,
    ...featureLabel(row.name),
    users: row.users,
    share: ofActive(row.users),
    uses: row.uses,
  }))

  const slash: Share[] = named('slash').map((row) => ({ value: row.name, count: row.users, share: ofActive(row.users) }))

  // --- Retention -----------------------------------------------------------------------------------
  const thisWeek = weekOf(to)
  const firstCohort = addDays(thisWeek, -7 * (COHORTS - 1))
  const cohortRows = store.all<{ install: string; day: string; first: string }>(
    `SELECT d.install AS install, d.day AS day, i.first_day AS first
     FROM days d JOIN installs i ON i.id = d.install
     WHERE i.first_day >= ? AND (d.minutes > 0 OR d.prompts > 0 OR d.turns > 0)`,
    firstCohort,
  )
  const sizes = store.all<{ first: string }>('SELECT first_day AS first FROM installs WHERE first_day >= ?', firstCohort)

  const cohorts: Cohort[] = []
  for (let index = 0; index < COHORTS; index += 1) {
    const week = addDays(firstCohort, 7 * index)
    const size = sizes.filter((row) => weekOf(row.first) === week).length
    const weeks: (number | null)[] = []
    for (let after = 1; after <= WEEKS_FOLLOWED; after += 1) {
      const start = addDays(week, 7 * after)
      if (start > to) {
        weeks.push(null)
        continue
      }
      const end = addDays(start, 6)
      const back = new Set(
        cohortRows
          .filter((row) => weekOf(row.first) === week && row.day >= start && row.day <= end)
          .map((row) => row.install),
      )
      weeks.push(size === 0 ? 0 : back.size / size)
    }
    cohorts.push({ week, size, weeks })
  }

  // --- The machines active in the range: versions and settings --------------------------------------
  const activeIds = `SELECT DISTINCT install FROM days WHERE day BETWEEN ? AND ? AND ${ACTIVE}`

  const environment = {} as Record<EnvironmentField, Share[]>
  for (const field of ENVIRONMENT_FIELDS) {
    environment[field] = store
      .all<{ value: string; n: number }>(
        `SELECT ${field} AS value, COUNT(*) AS n FROM installs WHERE id IN (${activeIds})
         GROUP BY ${field} ORDER BY n DESC`,
        from,
        to,
      )
      .map((row) => ({ value: row.value || 'unknown', count: row.n, share: ofActive(row.n) }))
  }

  const tallies = new Map<string, Map<string, number>>()
  for (const row of store.all<{ settings: string }>(`SELECT settings FROM installs WHERE id IN (${activeIds})`, from, to)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.settings)
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null) continue
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const tally = tallies.get(key) ?? new Map<string, number>()
      const word = String(value)
      tally.set(word, (tally.get(word) ?? 0) + 1)
      tallies.set(key, tally)
    }
  }
  const settings = [...tallies.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, tally]) => ({
      key,
      values: [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count, share: ofActive(count) })),
    }))

  // --- Totals ---------------------------------------------------------------------------------------
  const sums = store.get<Record<string, number>>(
    `SELECT ${DAY_FIELDS.map((field) => `COALESCE(SUM(${column(field)}), 0) AS ${field}`).join(', ')}
     FROM days WHERE day BETWEEN ? AND ? AND ${ACTIVE}`,
    from,
    to,
  )
  const totals = {} as Record<DayField, number>
  for (const field of DAY_FIELDS) totals[field] = sums?.[field] ?? 0

  const markRows = store.all<Record<string, number>>(
    `SELECT ${DAY_FIELDS.map((field) => `${column(field)} AS ${field}`).join(', ')}
     FROM days WHERE day BETWEEN ? AND ? AND ${ACTIVE}`,
    from,
    to,
  )
  const medians = {} as Record<DayField, number>
  for (const field of DAY_FIELDS) medians[field] = median(markRows.map((row) => row[field] ?? 0))

  const dailyActive = series.map((point) => point.active)

  return {
    range: { days, from, to },
    kpi: {
      activeYesterday: distinctActive(yesterday, yesterday),
      active7: distinctActive(addDays(to, -6), to),
      active30: distinctActive(addDays(to, -29), to),
      activeInRange,
      newInRange: [...freshByDay.values()].reduce((sum, n) => sum + n, 0),
      installsEver: store.get<{ n: number }>('SELECT COUNT(*) AS n FROM installs')?.n ?? 0,
      medianMinutes: median(rows.map((row) => row.minutes)),
      avgSittings: average(sittingCounts),
      medianSitting: median(allSittings),
      avgPrompts: average(rows.map((row) => row.prompts)),
      stickiness: activeInRange === 0 ? 0 : average(dailyActive) / activeInRange,
    },
    series,
    sittingLengths: binned(allSittings, SITTING_BINS),
    sittingsPerDay: binned(sittingCounts, SITTINGS_PER_DAY_BINS),
    activeDaysPerInstall: binned([...daysByInstall.values()], ACTIVE_DAYS_BINS),
    features,
    tools: byUses('tools'),
    models: byUses('models'),
    slash,
    cohorts,
    environment,
    settings,
    totals,
    medians,
  }
}
