import { featureLabel } from './features.js'
import type { Product } from './products.js'
import { DAY_FIELDS, type DayField } from './report.js'
import { column, type Store } from './store.js'

/**
 * The figures the dashboard shows, worked out of the store for one plugin and one range of days.
 *
 * One plugin at a time, always: every query below names it, so the tab of one plugin never counts a
 * machine, a day or a feature of the other. The two are different products with different people behind
 * them, and a figure that mixed them would describe neither.
 *
 * Everything is counted per identifier and per day, and an identifier is a machine that allowed the
 * reports rather than a person: two IDEs on one computer share one (see UsageConsent on the plugin's
 * side), a person with a laptop and a desktop is two. "Active" means something happened in the panel
 * that day - a minute marked, a message sent or an answer finished.
 *
 * The days are the machines' own calendar days, not the server's: a report says "2026-09-29" in the
 * time zone it was made in, and that is the day it is filed under. Near midnight UTC this blurs today's
 * figure by a few hours either way, which is why the headline says "yesterday" rather than "today".
 *
 * A range that reaches back past the first report the plugin ever sent starts at that report instead
 * (`range.since`): the days before it were not quiet, nobody was counting yet. Drawn as zeros they read
 * as a month nobody used the plugin, and averaged in they dragged stickiness down to a few percent.
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
  /** Of the day's active machines, those on the first day they ever reported. The rest came back. */
  newActive: number
  /** Distinct machines active in the 7 days ending with this one. */
  weekly: number
  /** Distinct machines active in the 30 days ending with this one. */
  monthly: number
  /** Machines first seen that day, active or not - what "New in range" adds up. */
  fresh: number
  prompts: number
  medianMinutes: number
  /** Sittings per active machine that day, on average. */
  avgSittings: number
}

/**
 * Remote access, told apart from being switched on: how many machines have it on, how many have a phone
 * paired, and how many actually did something from a phone in the range.
 *
 * "Used" is any day with a press from a phone, a message from one, or the phone opening a conversation to
 * watch. Plugins before 0.13.11 do not send the presses, so on their days only the other two count - a
 * phone used only to approve things is invisible there and seen from that version on.
 */
export interface RemoteUse {
  /** Machines active in the range whose last report says remote access is on. */
  switchedOn: number
  /** Machines active in the range whose last report names at least one paired phone. */
  paired: number
  /** Machines that did something from a phone on at least one day of the range. */
  used: number
  /** Of all messages in the range, the share written on a phone. */
  messageShare: number
  /** Presses from a phone in the range, all machines together. */
  actions: number
  /** On average, how many days of the range a machine that used its phone used it on. */
  daysPerUser: number
  /** Machines that used a phone, day by day. */
  series: { day: string; machines: number }[]
}

/** The headline figures, each of which can be set against the same figure one window earlier. */
export type KpiKey = 'activeYesterday' | 'active7' | 'active30' | 'newInRange' | 'medianMinutes' | 'avgSittings' | 'avgPrompts' | 'stickiness'

export interface Overview {
  product: Product
  /**
   * The days asked for, `from` to `to`, and the day the figures actually start: `from`, or the first day
   * the plugin ever reported when that came later. Nothing before `since` was ever counted.
   */
  range: { days: number; from: string; to: string; since: string }
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
    /** The average day's active machines against everybody active in the range, over the days counted. */
    stickiness: number
  }
  /**
   * The same headline figures one window earlier: the day before yesterday, the 7 and 30 days before the
   * last 7 and 30, the range before this one. A figure is missing when its earlier window reaches back
   * past the first report - set against a half-counted window, every figure would look like growth.
   */
  previous: Partial<Record<KpiKey, number>>
  /** Day by day, from `range.since` to `range.to`. */
  series: SeriesPoint[]
  sittingLengths: Share[]
  sittingsPerDay: Share[]
  activeDaysPerInstall: Share[]
  features: FeatureRow[]
  remote: RemoteUse
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

interface MachineDay {
  install: string
  day: string
  minutes: number
  prompts: number
  sittings: string
  /** The first day the machine ever reported. */
  first: string
}

const sittingsOf = (row: { sittings: string }): number[] => {
  try {
    const parsed: unknown = JSON.parse(row.sittings)
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === 'number') : []
  } catch {
    return []
  }
}

const daysBetween = (start: string, end: string): number =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS)

/** How the active machine-days of a window were spent: the figures of the headline that are per day. */
const engagement = (rows: MachineDay[], start: string, end: string) => {
  const machines = new Set(rows.map((row) => row.install)).size
  return {
    medianMinutes: median(rows.map((row) => row.minutes)),
    avgSittings: average(rows.map((row) => sittingsOf(row).length).filter((count) => count > 0)),
    medianSitting: median(rows.flatMap(sittingsOf)),
    avgPrompts: average(rows.map((row) => row.prompts)),
    // The average day's active machines against all of the window's: the machine-days spread over the
    // days, then over the machines.
    stickiness: machines === 0 ? 0 : rows.length / (daysBetween(start, end) + 1) / machines,
  }
}

/**
 * For every day of the series, how many distinct machines were active in the [window] days ending with
 * it. Each machine-day lights up the days it falls in the window of; a machine counts once per day
 * however many of its days overlap there, which is what [coveredUntil] keeps. [rows] go by machine,
 * then by day, and may start before the series does - a day before it still counts towards its first days.
 */
const rollingActive = (rows: { install: string; day: string }[], since: string, length: number, window: number): number[] => {
  const diff = new Array<number>(length + 1).fill(0)
  let install = ''
  let coveredUntil = Number.NEGATIVE_INFINITY
  for (const row of rows) {
    if (row.install !== install) {
      install = row.install
      coveredUntil = Number.NEGATIVE_INFINITY
    }
    const at = daysBetween(since, row.day)
    const start = Math.max(at, coveredUntil + 1, 0)
    const end = Math.min(at + window - 1, length - 1)
    if (start <= end) {
      diff[start]! += 1
      diff[end + 1]! -= 1
    }
    coveredUntil = Math.max(coveredUntil, at + window - 1)
  }
  const out: number[] = []
  let running = 0
  for (let index = 0; index < length; index += 1) {
    running += diff[index]!
    out.push(running)
  }
  return out
}

export const overview = (store: Store, product: Product, days: number, now: number = Date.now()): Overview => {
  const to = dayOf(now)
  const from = addDays(to, -(days - 1))
  const yesterday = addDays(to, -1)

  const firstEver = store.get<{ day: string | null }>('SELECT MIN(first_day) AS day FROM installs WHERE product = ?', product)?.day ?? null
  const since = firstEver !== null && firstEver > from ? (firstEver > to ? to : firstEver) : from
  /** Whether a window starting on [start] was counted from its first day. */
  const counted = (start: string): boolean => firstEver !== null && firstEver <= start

  const distinctActive = (start: string, end: string): number =>
    store.get<{ n: number }>(
      `SELECT COUNT(DISTINCT install) AS n FROM days WHERE product = ? AND day BETWEEN ? AND ? AND ${ACTIVE}`,
      product,
      start,
      end,
    )?.n ?? 0

  const firstSeen = (start: string, end: string): number =>
    store.get<{ n: number }>('SELECT COUNT(*) AS n FROM installs WHERE product = ? AND first_day BETWEEN ? AND ?', product, start, end)
      ?.n ?? 0

  const activeInRange = distinctActive(from, to)
  const ofActive = (count: number): number => (activeInRange === 0 ? 0 : count / activeInRange)

  // --- Machine-days: the rows everything per-day is measured on -----------------------------------
  // Only the days' own columns are left unqualified: `product` is in both tables.
  const machineDays = (start: string, end: string): MachineDay[] =>
    store.all<MachineDay>(
      `SELECT d.install AS install, d.day AS day, d.minutes AS minutes, d.prompts AS prompts, d.sittings AS sittings,
              i.first_day AS first
       FROM days d JOIN installs i ON i.id = d.install
       WHERE d.product = ? AND d.day BETWEEN ? AND ? AND ${ACTIVE}`,
      product,
      start,
      end,
    )

  const rows = machineDays(from, to)
  const allSittings = rows.flatMap(sittingsOf)

  const byDay = new Map<string, { active: number; newActive: number; prompts: number; minutes: number[]; sittings: number[] }>()
  const daysByInstall = new Map<string, number>()
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { active: 0, newActive: 0, prompts: 0, minutes: [], sittings: [] }
    entry.active += 1
    if (row.first === row.day) entry.newActive += 1
    entry.prompts += row.prompts
    entry.minutes.push(row.minutes)
    const sittings = sittingsOf(row).length
    if (sittings > 0) entry.sittings.push(sittings)
    byDay.set(row.day, entry)
    daysByInstall.set(row.install, (daysByInstall.get(row.install) ?? 0) + 1)
  }

  const freshByDay = new Map(
    store
      .all<{ day: string; n: number }>(
        'SELECT first_day AS day, COUNT(*) AS n FROM installs WHERE product = ? AND first_day BETWEEN ? AND ? GROUP BY first_day',
        product,
        from,
        to,
      )
      .map((row) => [row.day, row.n]),
  )

  const length = daysBetween(since, to) + 1
  // A month before the series starts, so its first days are counted over a whole window too.
  const windowRows = store.all<{ install: string; day: string }>(
    `SELECT install, day FROM days WHERE product = ? AND day BETWEEN ? AND ? AND ${ACTIVE} ORDER BY install, day`,
    product,
    addDays(since, -29),
    to,
  )
  const weekly = rollingActive(windowRows, since, length, 7)
  const monthly = rollingActive(windowRows, since, length, 30)

  const series: SeriesPoint[] = []
  for (let index = 0, day = since; day <= to; index += 1, day = addDays(day, 1)) {
    const entry = byDay.get(day)
    series.push({
      day,
      active: entry?.active ?? 0,
      newActive: entry?.newActive ?? 0,
      weekly: weekly[index] ?? 0,
      monthly: monthly[index] ?? 0,
      fresh: freshByDay.get(day) ?? 0,
      prompts: entry?.prompts ?? 0,
      medianMinutes: median(entry?.minutes ?? []),
      avgSittings: average(entry?.sittings ?? []),
    })
  }

  const current = engagement(rows, since, to)
  const newInRange = [...freshByDay.values()].reduce((sum, n) => sum + n, 0)

  const previous: Partial<Record<KpiKey, number>> = {}
  const dayBefore = addDays(yesterday, -1)
  if (counted(dayBefore)) previous.activeYesterday = distinctActive(dayBefore, dayBefore)
  if (counted(addDays(to, -13))) previous.active7 = distinctActive(addDays(to, -13), addDays(to, -7))
  if (counted(addDays(to, -59))) previous.active30 = distinctActive(addDays(to, -59), addDays(to, -30))
  const earlierFrom = addDays(from, -days)
  const earlierTo = addDays(from, -1)
  if (counted(earlierFrom)) {
    const earlier = engagement(machineDays(earlierFrom, earlierTo), earlierFrom, earlierTo)
    previous.newInRange = firstSeen(earlierFrom, earlierTo)
    previous.medianMinutes = earlier.medianMinutes
    previous.avgSittings = earlier.avgSittings
    previous.avgPrompts = earlier.avgPrompts
    previous.stickiness = earlier.stickiness
  }

  // --- Named counts --------------------------------------------------------------------------------
  const named = (kind: string) =>
    store.all<{ name: string; users: number; uses: number }>(
      `SELECT name, COUNT(DISTINCT install) AS users, SUM(value) AS uses
       FROM counts WHERE product = ? AND kind = ? AND day BETWEEN ? AND ? GROUP BY name ORDER BY users DESC, uses DESC`,
      product,
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
    ...featureLabel(product, row.name),
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
     WHERE i.product = ? AND i.first_day >= ? AND (d.minutes > 0 OR d.prompts > 0 OR d.turns > 0)`,
    product,
    firstCohort,
  )
  const sizes = store.all<{ first: string }>(
    'SELECT first_day AS first FROM installs WHERE product = ? AND first_day >= ?',
    product,
    firstCohort,
  )

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
  // Every query that uses it passes its three parameters first: the plugin, then the range.
  const activeIds = `SELECT DISTINCT install FROM days WHERE product = ? AND day BETWEEN ? AND ? AND ${ACTIVE}`

  const environment = {} as Record<EnvironmentField, Share[]>
  for (const field of ENVIRONMENT_FIELDS) {
    environment[field] = store
      .all<{ value: string; n: number }>(
        `SELECT ${field} AS value, COUNT(*) AS n FROM installs WHERE id IN (${activeIds})
         GROUP BY ${field} ORDER BY n DESC`,
        product,
        from,
        to,
      )
      .map((row) => ({ value: row.value || 'unknown', count: row.n, share: ofActive(row.n) }))
  }

  const tallies = new Map<string, Map<string, number>>()
  for (const row of store.all<{ settings: string }>(`SELECT settings FROM installs WHERE id IN (${activeIds})`, product, from, to)) {
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

  // --- Remote access -------------------------------------------------------------------------------
  const PHONE = '(phone_actions > 0 OR phone_prompts > 0 OR watched > 0)'
  const phoneDays = store.all<{ install: string; day: string }>(
    `SELECT install, day FROM days WHERE product = ? AND day BETWEEN ? AND ? AND ${PHONE}`,
    product,
    from,
    to,
  )
  const phoneUsers = new Map<string, number>()
  const phoneByDay = new Map<string, Set<string>>()
  for (const row of phoneDays) {
    phoneUsers.set(row.install, (phoneUsers.get(row.install) ?? 0) + 1)
    const machines = phoneByDay.get(row.day) ?? new Set<string>()
    machines.add(row.install)
    phoneByDay.set(row.day, machines)
  }

  const settingOf = (key: string, pass: (value: unknown) => boolean): number =>
    store
      .all<{ settings: string }>(`SELECT settings FROM installs WHERE id IN (${activeIds})`, product, from, to)
      .filter((row) => {
        try {
          return pass((JSON.parse(row.settings) as Record<string, unknown>)[key])
        } catch {
          return false
        }
      }).length

  const phoneSums = store.get<{ prompts: number; phone: number; actions: number }>(
    `SELECT COALESCE(SUM(prompts), 0) AS prompts, COALESCE(SUM(phone_prompts), 0) AS phone,
            COALESCE(SUM(phone_actions), 0) AS actions
     FROM days WHERE product = ? AND day BETWEEN ? AND ?`,
    product,
    from,
    to,
  )

  const remote: RemoteUse = {
    switchedOn: settingOf('remote', (value) => value === true),
    paired: settingOf('pairedDevices', (value) => typeof value === 'number' && value > 0),
    used: phoneUsers.size,
    messageShare: phoneSums && phoneSums.prompts > 0 ? phoneSums.phone / phoneSums.prompts : 0,
    actions: phoneSums?.actions ?? 0,
    daysPerUser: average([...phoneUsers.values()]),
    series: series.map((point) => ({ day: point.day, machines: phoneByDay.get(point.day)?.size ?? 0 })),
  }

  // --- Totals ---------------------------------------------------------------------------------------
  const sums = store.get<Record<string, number>>(
    `SELECT ${DAY_FIELDS.map((field) => `COALESCE(SUM(${column(field)}), 0) AS ${field}`).join(', ')}
     FROM days WHERE product = ? AND day BETWEEN ? AND ? AND ${ACTIVE}`,
    product,
    from,
    to,
  )
  const totals = {} as Record<DayField, number>
  for (const field of DAY_FIELDS) totals[field] = sums?.[field] ?? 0

  const markRows = store.all<Record<string, number>>(
    `SELECT ${DAY_FIELDS.map((field) => `${column(field)} AS ${field}`).join(', ')}
     FROM days WHERE product = ? AND day BETWEEN ? AND ? AND ${ACTIVE}`,
    product,
    from,
    to,
  )
  const medians = {} as Record<DayField, number>
  for (const field of DAY_FIELDS) medians[field] = median(markRows.map((row) => row[field] ?? 0))

  return {
    product,
    range: { days, from, to, since },
    kpi: {
      activeYesterday: distinctActive(yesterday, yesterday),
      active7: distinctActive(addDays(to, -6), to),
      active30: distinctActive(addDays(to, -29), to),
      activeInRange,
      newInRange,
      installsEver: store.get<{ n: number }>('SELECT COUNT(*) AS n FROM installs WHERE product = ?', product)?.n ?? 0,
      ...current,
    },
    previous,
    series,
    sittingLengths: binned(allSittings, SITTING_BINS),
    sittingsPerDay: binned(rows.map((row) => sittingsOf(row).length).filter((count) => count > 0), SITTINGS_PER_DAY_BINS),
    activeDaysPerInstall: binned([...daysByInstall.values()], ACTIVE_DAYS_BINS),
    features,
    remote,
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
