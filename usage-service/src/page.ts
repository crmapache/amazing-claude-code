import { columnChart, formatNumber, formatShare, lineChart, shortDay, sparkline } from './charts.js'
import { GROUPS } from './features.js'
import { RANGES, type EnvironmentField, type FeatureRow, type KpiKey, type Overview, type RemoteUse, type Share } from './dashboard.js'
import { NAMES, owns, PRODUCTS, REPORTED_SETTINGS, type Product } from './products.js'
import type { DayField } from './report.js'

/**
 * The two pages a person sees: the password, and the figures behind it.
 *
 * Plain HTML written on the server, styles inside the page and no script anywhere (see charts.ts for
 * why). Every piece of text that came from a report - a version, a feature id, a setting's value - is
 * escaped on the way in, even though the report was already held to identifiers on arrival: the page is
 * the last door, and it does not lean on the one before it.
 *
 * The figures page has a tab per plugin. Without a script a tab is simply a link: the plugin is in the
 * address (`/admin?product=acx`), the server draws that plugin's page, and the address can be kept or
 * sent to open the same tab again. Everything on a tab is that plugin's alone, its wording included -
 * where the two plugins name a thing differently (the agent, its accounts, its plugins), [WORDING] holds
 * both.
 *
 * Light only, on purpose: it is read by one person in a browser that may well be dark, and a dashboard
 * that followed the browser came out as a dim grey page nobody asked for.
 */

export const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const shell = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`

/** Both plugins, for the page that comes before either of them. */
const ALL_PLUGINS = PRODUCTS.map((product) => NAMES[product].plugin).join(' and ')

/** The little mark beside the title: three rising columns, in the colours the charts use. */
const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9"/><rect class="m1" x="8" y="15" width="4.5" height="9" rx="1.5"/><rect class="m2" x="14" y="11" width="4.5" height="13" rx="1.5"/><rect class="m3" x="20" y="7" width="4.5" height="17" rx="1.5"/></svg>`

export const loginPage = (error: string | null): string =>
  shell(
    `Usage - ${ALL_PLUGINS}`,
    `<main class="login">
  <form method="post" action="/admin/login" class="loginCard">
    ${MARK}
    <h1>Usage</h1>
    <p class="muted">${escape(ALL_PLUGINS)}</p>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
    ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
    <button type="submit">Sign in</button>
  </form>
</main>`,
  )

export const notConfiguredPage = (): string =>
  shell(
    'Usage - not configured',
    `<main class="login"><div class="loginCard">${MARK}<h1>Not configured</h1>
<p class="muted">Set ADMIN_PASSWORD in the service's environment to open this page.</p></div></main>`,
  )

const IDE_NAMES: Record<string, string> = {
  IU: 'IntelliJ IDEA',
  IC: 'IntelliJ IDEA Community',
  WS: 'WebStorm',
  PS: 'PhpStorm',
  PY: 'PyCharm',
  PC: 'PyCharm Community',
  GO: 'GoLand',
  CL: 'CLion',
  RD: 'Rider',
  RM: 'RubyMine',
  DB: 'DataGrip',
  RR: 'RustRover',
  DS: 'DataSpell',
  AI: 'Android Studio',
  QA: 'Aqua',
}

const OS_NAMES: Record<string, string> = { mac: 'macOS', windows: 'Windows', linux: 'Linux', other: 'Other' }

/** What differs between the two tabs beyond the figures: the words for what each plugin drives. */
interface Wording {
  /** The version of the agent each machine runs, as the environment card titles it. */
  cli: string
  /** The agent's own plugins, as "a typical day" counts them. */
  plugins: string
  models: string
  tools: string
  commands: string
}

const WORDING: Record<Product, Wording> = {
  acc: {
    cli: 'Claude Code version',
    plugins: 'Claude Code plugins installed',
    models: "Share of answers, by model family; a model of one's own counts as Other",
    tools: 'Share of tool calls; every MCP tool counts as MCP',
    commands: 'Share of machines that used each; commands of their own count as custom',
  },
  acx: {
    cli: 'Codex CLI version',
    plugins: 'Codex plugins installed',
    models: 'Share of answers, by model in the Codex catalogue; any other model counts as Other',
    tools: 'Share of tool calls, under the names the panel shows them by; every MCP tool counts as MCP',
    commands: 'Share of machines that used each; prompts of their own (/prompts:) and skills count as custom',
  },
}

const environmentTitles = (product: Product): Record<EnvironmentField, string> => ({
  plugin: 'Plugin version',
  ide: 'IDE',
  ide_version: 'IDE version',
  os: 'Operating system',
  arch: 'Processor',
  cli: WORDING[product].cli,
  lang: 'Panel language',
})

const environmentValue = (field: EnvironmentField, value: string): string => {
  if (field === 'ide') return IDE_NAMES[value] ? `${IDE_NAMES[value]} (${value})` : value
  if (field === 'os') return OS_NAMES[value] ?? value
  return value
}

const TOTALS: { field: DayField; label: string }[] = [
  { field: 'prompts', label: 'Messages sent' },
  { field: 'phonePrompts', label: '...of them from a phone' },
  { field: 'phoneActions', label: 'Presses from a phone (messages, answers, approvals)' },
  { field: 'turns', label: 'Answers finished' },
  { field: 'conversations', label: 'Conversations' },
  { field: 'forks', label: 'Forks' },
  { field: 'edits', label: 'Edits that landed' },
  { field: 'linesAdded', label: 'Lines added' },
  { field: 'linesRemoved', label: 'Lines removed' },
  { field: 'filesEdited', label: 'Files edited (distinct per day)' },
  { field: 'permissionsAsked', label: 'Permission questions' },
  { field: 'permissionsDenied', label: '...of them denied' },
  { field: 'plansApproved', label: 'Plans approved' },
  { field: 'todosDone', label: 'Task lists finished' },
  { field: 'attachments', label: 'Files and images attached' },
  { field: 'quotes', label: 'Quotes and editor references' },
  { field: 'ranOutFiveHour', label: 'Five-hour limit ran out' },
  { field: 'watched', label: 'Watched from a phone' },
]

const medians = (product: Product): { field: DayField; label: string; unit: string }[] => [
  { field: 'minutes', label: 'Active time', unit: 'min' },
  { field: 'prompts', label: 'Messages', unit: '' },
  { field: 'turnSeconds', label: 'Agent working time', unit: 's' },
  { field: 'longestConversation', label: 'Longest conversation', unit: 'min' },
  { field: 'mcpConnected', label: 'MCP servers connected', unit: '' },
  { field: 'plugins', label: WORDING[product].plugins, unit: '' },
]

const minutes = (value: number): string => {
  if (Math.round(value) < 60) return `${Math.round(value)} min`
  const hours = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}


/** How a headline figure moved against the same figure one window earlier. */
interface Change {
  direction: 'up' | 'down' | 'same'
  /** The size of the move, in the figure's own unit: "3", "5 min", "4 pts". */
  text: string
  /** The earlier figure and its window, under the value: "8 the day before". */
  against: string
}

/**
 * The move from [before] to [now], or nothing when there is no earlier window to set it against. A move
 * too small to show in the figure's own rounding is no move: 2.46 against 2.5 reads "2.5" twice.
 *
 * [show] writes the move, [level] the earlier figure, when the two read differently: a share moves by
 * points, but was a percentage.
 */
const change = (
  now: number,
  before: number | undefined,
  show: (value: number) => string,
  window: string,
  level: (value: number) => string = show,
): Change | undefined => {
  if (before === undefined) return undefined
  const text = show(Math.abs(now - before))
  const direction = text === show(0) ? 'same' : now > before ? 'up' : 'down'
  return { direction, text, against: `${level(before)} ${window}` }
}

interface Tile {
  label: string
  value: string
  note?: string
  change?: Change
  /** The figure day by day over the range, drawn faintly under it. */
  trend?: number[]
}

const ARROW = { up: '▲', down: '▼', same: '=' } as const

/**
 * A headline figure: its name, the value, how it moved, and its shape over the range. Every figure here
 * grows the right way up, so up is green and down is red - with an arrow, never colour alone.
 */
const tile = ({ label, value, note, change: moved, trend }: Tile): string => {
  const delta = moved
    ? `<span class="delta ${moved.direction}" title="${escape(moved.direction === 'same' ? `The same as ${moved.against}` : `${moved.direction === 'up' ? 'Up' : 'Down'} ${moved.text} from ${moved.against}`)}">` +
      `${ARROW[moved.direction]} ${escape(moved.direction === 'same' ? 'same' : moved.text)}</span>`
    : ''
  return (
    `<div class="tile"><div class="tileLabel">${escape(label)}</div>` +
    `<div class="tileMain"><span class="tileValue">${escape(value)}</span>${delta}</div>` +
    (moved ? `<div class="tileNote">vs ${escape(moved.against)}</div>` : '') +
    (note ? `<div class="tileNote">${escape(note)}</div>` : '') +
    (trend ? sparkline(trend) : '') +
    `</div>`
  )
}

type Span = 4 | 6 | 8 | 12

/** A card; one that is the whole of its section goes without a title of its own, the section's says it. */
const card = (span: Span, title: string, subtitle: string, body: string): string =>
  `<article class="card span${span}">${title ? `<header><h3>${escape(title)}</h3>${subtitle ? `<p class="sub">${escape(subtitle)}</p>` : ''}</header>` : ''}${body}</article>`

/** A part of the page under its own heading: who uses it, how, what with, on what. */
const section = (id: string, title: string, lead: string, cards: string): string =>
  `<section class="block" aria-labelledby="${id}"><div class="blockHead"><h2 id="${id}">${escape(title)}</h2><p>${escape(lead)}</p></div><div class="grid">${cards}</div></section>`

/**
 * A ranked list, a thin bar under each row: a chart and its own table at once. The figure is printed on
 * every row, so the bar is there for the eye and never the only way to read the number.
 *
 * The bar is the share on a scale of the whole, not of the longest row: a feature used by one machine in
 * ten must look like one in ten, and stretching the top row to the full width would make it look like
 * everybody's.
 */
const barList = (rows: { label: string; share: number; value: string; detail?: string }[], empty = 'Nothing yet'): string => {
  if (rows.length === 0) return `<p class="empty">${escape(empty)}</p>`
  return `<ul class="bars">${rows
    .map(
      (row) =>
        `<li><span class="barLabel" title="${escape(row.label)}">${escape(row.label)}</span>` +
        `<span class="barFigure"><b>${escape(row.value)}</b>${row.detail ? ` <span>${escape(row.detail)}</span>` : ''}</span>` +
        `<span class="barTrack"><span class="barFill" style="width:${(Math.min(1, row.share) * 100).toFixed(1)}%"></span></span></li>`,
    )
    .join('')}</ul>`
}

const shares = (list: Share[], limit: number, label: (value: string) => string = (value) => value): string =>
  barList(list.slice(0, limit).map((row) => ({ label: label(row.value), share: row.share, value: formatShare(row.share), detail: formatNumber(row.count) })))

const featureSection = (features: FeatureRow[]): string => {
  if (features.length === 0) return '<p class="empty">No feature has been counted in this range yet.</p>'

  const groups = new Map<string, FeatureRow[]>()
  for (const feature of features) groups.set(feature.group, [...(groups.get(feature.group) ?? []), feature])

  // Groups by their most used feature, so the section reads from what matters most to what matters least.
  const ordered = [...groups.entries()].sort(
    (a, b) => Math.max(...b[1].map((row) => row.share)) - Math.max(...a[1].map((row) => row.share)),
  )

  return `<div class="groups">${ordered
    .map(
      ([group, rows]) =>
        `<div class="group"><h4>${escape(GROUPS[group] ?? group)}</h4>` +
        barList(
          rows.map((row) => ({
            label: row.label,
            share: row.share,
            value: formatShare(row.share),
            detail: `${formatNumber(row.users)} machines · ${formatNumber(row.uses)} uses`,
          })),
        ) +
        `</div>`,
    )
    .join('')}</div>`
}

/**
 * Remote access in one card: switched on, a phone paired, actually used - three numbers that tell apart
 * people who tried the feature from people who live on it - and the machines using a phone day by day.
 */
const remoteSection = (remote: RemoteUse, activeInRange: number): string => {
  const share = (count: number): string | undefined =>
    activeInRange === 0 ? undefined : `${formatShare(count / activeInRange)} of active machines`

  return (
    `<div class="tiles inner">` +
    tile({ label: 'Remote access on', value: formatNumber(remote.switchedOn), note: share(remote.switchedOn) }) +
    tile({ label: 'A phone paired', value: formatNumber(remote.paired), note: share(remote.paired) }) +
    tile({ label: 'Used from a phone', value: formatNumber(remote.used), note: share(remote.used) }) +
    tile({ label: 'Days with the phone', value: remote.daysPerUser.toFixed(1), note: 'average, per machine that used it' }) +
    tile({ label: 'Messages from a phone', value: formatShare(remote.messageShare), note: 'of all messages in the range' }) +
    tile({ label: 'Presses from a phone', value: formatNumber(remote.actions), note: 'messages, answers, approvals, stops' }) +
    `</div>` +
    `<h4>Machines that used a phone, per day</h4>` +
    lineChart(
      {
        id: 'phone',
        label: 'Machines that used a phone per day',
        x: remote.series.map((point) => point.day),
        partialLast: true,
        series: [{ name: 'machines used a phone', slot: 1, values: remote.series.map((point) => point.machines) }],
      },
      { height: 170 },
    )
  )
}

/** Shades for the retention grid: nine steps of one blue, light for few and dark for many. */
const heatStep = (share: number): number => Math.min(8, Math.max(0, Math.round(share * 8)))

/**
 * The retention grid. The weeks before the first machine was ever seen are left out rather than drawn as
 * rows of nobody.
 */
const cohortTable = (overview: Overview): string => {
  const firstFull = overview.cohorts.findIndex((cohort) => cohort.size > 0)
  if (firstFull === -1) return '<p class="empty">No machine was first seen in the last eight weeks.</p>'
  const cohorts = overview.cohorts.slice(firstFull)

  const weeks = cohorts[0]?.weeks.length ?? 0
  const head = `<tr><th>First seen, week of</th><th class="num">Machines</th>${Array.from({ length: weeks }, (_, i) => `<th>Week ${i + 1}</th>`).join('')}</tr>`
  const body = cohorts
    .map(
      (cohort) =>
        `<tr><td>${escape(shortDay(cohort.week))}</td><td class="num">${formatNumber(cohort.size)}</td>${cohort.weeks
          .map((share) =>
            share === null || cohort.size === 0
              ? '<td class="heat none"></td>'
              : `<td class="heat h${heatStep(share)}" title="${escape(`${formatShare(share)} of ${cohort.size} came back`)}">${formatShare(share)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')
  const scale = `<div class="scale" aria-hidden="true"><span>0%</span>${Array.from({ length: 9 }, (_, i) => `<i class="h${i}"></i>`).join('')}<span>100%</span></div>`
  return `<div class="tableWrap"><table class="cohorts">${head}${body}</table></div>${scale}`
}

/** The address of one tab over one range - what both rows of links are made of. */
const adminLink = (product: Product, days: number): string => `/admin?product=${product}&amp;days=${days}`

/** The plugins, as tabs. Switching keeps the range, so the two can be compared over the same days. */
const productNav = (current: Product, days: number): string =>
  `<nav class="seg products" aria-label="Plugin">${PRODUCTS.map(
    (product) =>
      `<a href="${adminLink(product, days)}"${product === current ? ' aria-current="page" class="on"' : ''}>${escape(NAMES[product].tab)}</a>`,
  ).join('')}</nav>`

const rangeNav = (product: Product, current: number): string =>
  `<nav class="seg ranges" aria-label="Range">${RANGES.map(
    (days) =>
      `<a href="${adminLink(product, days)}"${days === current ? ' aria-current="page" class="on"' : ''}>${days === 365 ? 'Year' : `${days} days`}</a>`,
  ).join('')}</nav>`

/** "the 30 days before", for the window a range-wide figure is set against. */
const rangeBefore = (days: number): string => (days === 365 ? 'the year before' : `the ${days} days before`)

const pick = (overview: Overview, key: KpiKey): number | undefined => overview.previous[key]

export const dashboardPage = (overview: Overview): string => {
  const { kpi, series, range, product } = overview
  const wording = WORDING[product]
  const settingTitles = REPORTED_SETTINGS[product]
  const days = series.map((point) => point.day)
  const count = (value: number): string => formatNumber(Math.round(value))
  const oneDecimal = (value: number): string => value.toFixed(1)
  const points = (value: number): string => `${Math.round(value * 100)} pts`

  // The trends under the headline stop at yesterday: today, counted so far, would end every one of them
  // in a fall.
  const finished = series.length > 2 ? series.slice(0, -1) : series

  const tiles = [
    tile({
      label: 'Active yesterday',
      value: formatNumber(kpi.activeYesterday),
      change: change(kpi.activeYesterday, pick(overview, 'activeYesterday'), count, 'the day before'),
      trend: finished.map((point) => point.active),
    }),
    tile({
      label: 'Active, last 7 days',
      value: formatNumber(kpi.active7),
      change: change(kpi.active7, pick(overview, 'active7'), count, 'the 7 days before'),
      trend: finished.map((point) => point.weekly),
    }),
    tile({
      label: 'Active, last 30 days',
      value: formatNumber(kpi.active30),
      change: change(kpi.active30, pick(overview, 'active30'), count, 'the 30 days before'),
      trend: finished.map((point) => point.monthly),
    }),
    tile({
      label: 'New in range',
      value: formatNumber(kpi.newInRange),
      change: change(kpi.newInRange, pick(overview, 'newInRange'), count, rangeBefore(range.days)),
      note: `${formatNumber(kpi.installsEver)} machines ever`,
      trend: finished.map((point) => point.fresh),
    }),
    tile({
      label: 'Active time per day',
      value: minutes(kpi.medianMinutes),
      change: change(kpi.medianMinutes, pick(overview, 'medianMinutes'), minutes, rangeBefore(range.days)),
      note: 'median, per active machine-day',
      trend: finished.map((point) => point.medianMinutes),
    }),
    tile({
      label: 'Sittings per day',
      value: kpi.avgSittings.toFixed(1),
      change: change(kpi.avgSittings, pick(overview, 'avgSittings'), oneDecimal, rangeBefore(range.days)),
      note: `median sitting ${minutes(kpi.medianSitting)}`,
      trend: finished.map((point) => point.avgSittings),
    }),
    tile({
      label: 'Messages per day',
      value: kpi.avgPrompts.toFixed(1),
      change: change(kpi.avgPrompts, pick(overview, 'avgPrompts'), oneDecimal, rangeBefore(range.days)),
      note: 'average, per active machine-day',
      trend: finished.map((point) => (point.active === 0 ? 0 : point.prompts / point.active)),
    }),
    tile({
      label: 'Stickiness',
      value: formatShare(kpi.stickiness),
      change: change(kpi.stickiness, pick(overview, 'stickiness'), points, rangeBefore(range.days), formatShare),
      note: "the average day's active machines against the range's",
    }),
  ].join('')

  const bins = (title: string, list: Share[], noun: string): string =>
    columnChart(
      { label: title, x: list.map((bin) => bin.value), series: [{ name: noun, slot: 1, values: list.map((bin) => bin.count) }] },
      { bins: true, height: 170 },
    )

  const stats = (rows: { label: string; value: string }[], className = 'stats'): string =>
    `<div class="${className}">${rows.map((row) => `<div><span>${escape(row.label)}</span><b>${escape(row.value)}</b></div>`).join('')}</div>`

  const totals = stats(TOTALS.map((row) => ({ label: row.label, value: formatNumber(overview.totals[row.field]) })))

  const typicalDay = stats(
    medians(product).map((row) => {
      const value = overview.medians[row.field]
      return { label: row.label, value: row.unit === 'min' ? minutes(value) : row.unit === 's' ? minutes(value / 60) : formatNumber(value) }
    }),
    'stats single',
  )

  const environmentTitle = environmentTitles(product)
  const environment = (Object.keys(environmentTitle) as EnvironmentField[])
    .map(
      (field) =>
        `<div class="mini"><h4>${escape(environmentTitle[field])}</h4>${shares(overview.environment[field], 8, (value) => environmentValue(field, value))}</div>`,
    )
    .join('')

  const settings = overview.settings.length
    ? `<div class="minis">${overview.settings
        .map(
          (setting) =>
            `<div class="mini"><h4>${escape(owns(settingTitles, setting.key) ? settingTitles[setting.key]! : setting.key)}</h4>${shares(setting.values, 6)}</div>`,
        )
        .join('')}</div>`
    : '<p class="empty">No settings reported in this range yet.</p>'

  const since =
    range.since > range.from
      ? `<span class="pill" title="The first report from this plugin came on ${escape(shortDay(range.since))}; nothing before it was counted, so the range starts there.">Counting since ${escape(shortDay(range.since))}</span>`
      : ''

  const audience =
    card(
      12,
      'Active machines',
      'Daily: active that day. 7-day and 30-day: distinct machines active in the 7 or 30 days up to that day',
      lineChart(
        {
          id: 'active',
          label: 'Active machines per day, and over 7 and 30 days',
          x: days,
        partialLast: true,
          series: [
            { name: 'Daily', slot: 1, values: series.map((point) => point.active) },
            { name: '7-day', slot: 2, values: series.map((point) => point.weekly) },
            { name: '30-day', slot: 3, values: series.map((point) => point.monthly) },
          ],
        },
        { height: 240 },
      ),
    ) +
    card(
      6,
      'New and returning',
      "Each day's active machines: new on the first day they reported, the rest came back",
      columnChart({
        label: 'New and returning machines per day',
        x: days,
        partialLast: true,
        series: [
          { name: 'Returning', slot: 1, values: series.map((point) => point.active - point.newActive) },
          { name: 'New', slot: 2, values: series.map((point) => point.newActive) },
        ],
      }),
    ) +
    card(
      6,
      'Days active in the range',
      'Per machine: one-off visits against daily use',
      bins('Active days per machine', overview.activeDaysPerInstall, 'machines'),
    ) +
    card(12, 'Retention', 'Of the machines first seen in a week, the share active in each week after', cohortTable(overview))

  const engagement =
    card(
      6,
      'Active time per machine-day',
      'Median minutes with something going on in the panel',
      lineChart({
        id: 'minutes',
        label: 'Median active minutes per machine-day',
        x: days,
        partialLast: true,
        series: [{ name: 'median active time', slot: 1, values: series.map((point) => point.medianMinutes) }],
        format: minutes,
      }),
    ) +
    card(
      6,
      'Messages per day',
      'All machines together',
      columnChart({
        label: 'Messages per day',
        x: days,
        partialLast: true,
        series: [{ name: 'messages', slot: 1, values: series.map((point) => point.prompts) }],
      }),
    ) +
    card(4, 'How long a sitting lasts', 'A stretch of work with no gap longer than 30 minutes', bins('Sitting length', overview.sittingLengths, 'sittings')) +
    card(4, 'Sittings in a day', 'Per active machine-day', bins('Sittings per day', overview.sittingsPerDay, 'machine-days')) +
    card(4, 'A typical day', 'Median per active machine-day', typicalDay)

  const body = `
<div class="wrap">
<header class="top">
  <div class="title">
    ${MARK}
    <div>
      <h1>Usage</h1>
      <p>${escape(NAMES[product].plugin)} · ${escape(shortDay(range.since))} - ${escape(shortDay(range.to))} · machines that allowed the anonymous report</p>
    </div>
  </div>
  <form method="post" action="/admin/logout"><button type="submit" class="ghost">Sign out</button></form>
</header>
<div class="controls">
  ${productNav(product, range.days)}
  ${rangeNav(product, range.days)}
  ${since}
</div>

<div class="tiles">${tiles}</div>

${section('audience', 'Audience', 'Who opens the panel, and whether they come back', audience)}
${section('engagement', 'Engagement', 'How long and how much a machine works in a day', engagement)}
${section('features', 'Features', `Share of the ${formatNumber(kpi.activeInRange)} machines active in the range that used each at least once`, card(12, '', '', featureSection(overview.features)))}
${section('remote', 'Remote access', 'Switched on and paired are what the last report said; used means a message, a press or watching from a phone', card(12, '', '', remoteSection(overview.remote, kpi.activeInRange)))}
${section(
  'agent',
  'Models, tools and commands',
  'What the agent was asked to do, and with what',
  card(4, 'Models', wording.models, shares(overview.models, 8)) +
    card(4, 'Tools', wording.tools, shares(overview.tools, 16)) +
    card(4, 'Built-in commands', wording.commands, shares(overview.slash, 16)),
)}
${section('totals', 'Totals', 'Everything counted in the range, all machines together', card(12, '', '', totals))}
${section(
  'setup',
  'Setup',
  'Machines active in the range, by what they reported last',
  card(12, 'Environment', '', `<div class="minis">${environment}</div>`) + card(12, 'Settings', '', settings),
)}

<footer>Only counts are kept: no addresses, no names, no text. Days older than the retention are deleted automatically.</footer>
</div>`

  return shell(`Usage - ${NAMES[product].tab} - ${range.days} days`, body)
}

/**
 * The page's styles. The palette is the validated default of the charting guide the page was built by:
 * its first three categorical slots (blue, orange, aqua - the order that passes the colour-blind checks
 * as a set), its one-blue sequential ramp for the retention grid, recessive grey chrome, and green and
 * red only for a figure's move, always beside an arrow.
 */
const STYLE = `
:root {
  color-scheme: light;
  --page: #f5f5f2; --surface: #ffffff; --sunk: #fafaf8;
  --ink: #141413; --ink-2: #52514e; --muted: #898781;
  --line: #eeede8; --axis: #d3d2ca; --ring: rgba(20,20,19,0.08);
  --shadow: 0 1px 2px rgba(20,20,19,0.04), 0 4px 14px rgba(20,20,19,0.04);
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a;
  --wash: rgba(42,120,214,0.09); --track: #f0efeb;
  --good: #006300; --good-bg: #e7f3e7; --bad: #c42f2f; --bad-bg: #fbeceb;
  --h0: #eef4fc; --h1: #cde2fb; --h2: #b7d3f6; --h3: #9ec5f4; --h4: #6da7ec; --h5: #3987e5; --h6: #256abf; --h7: #184f95; --h8: #0d366b;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
h1, h2, h3, h4 { margin: 0; }
button { font: inherit; cursor: pointer; }
.wrap { max-width: 1480px; margin: 0 auto; padding: 28px 32px 40px; }

.mark { width: 36px; height: 36px; flex: none; }
.mark > rect:first-child { fill: #141413; }
.mark .m1 { fill: var(--s3); } .mark .m2 { fill: var(--s2); } .mark .m3 { fill: #6da7ec; }

.top { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.title { display: flex; align-items: center; gap: 14px; min-width: 0; }
.top h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
.top p { margin: 2px 0 0; color: var(--ink-2); font-size: 13.5px; }
.ghost { white-space: nowrap; background: var(--surface); border: 1px solid var(--ring); color: var(--ink-2); padding: 7px 14px; border-radius: 9px; font-weight: 500; box-shadow: 0 1px 2px rgba(20,20,19,0.04); }
.ghost:hover { color: var(--ink); border-color: rgba(20,20,19,0.16); }

.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin: 22px 0 18px; }
.seg { display: inline-flex; padding: 3px; gap: 2px; background: #e9e8e3; border-radius: 11px; }
.seg a { padding: 6px 14px; border-radius: 8px; color: var(--ink-2); text-decoration: none; font-weight: 500; font-size: 13.5px; white-space: nowrap; }
.seg a:hover { color: var(--ink); background: rgba(255,255,255,0.55); }
.seg a.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgba(20,20,19,0.10), 0 0 0 1px rgba(20,20,19,0.04); }
.products { margin-right: 4px; }
.pill { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-2); background: var(--surface); border: 1px solid var(--ring); padding: 5px 11px; border-radius: 999px; cursor: help; }
.pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--s3); }

.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.tile { display: flex; flex-direction: column; min-width: 0; min-height: 138px; overflow: hidden; background: var(--surface); border: 1px solid var(--ring); border-radius: 14px; box-shadow: var(--shadow); padding: 16px 18px 14px; }
.tileLabel { font-size: 13px; font-weight: 500; color: var(--ink-2); }
.tileMain { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; }
.tileValue { font-size: 32px; font-weight: 650; letter-spacing: -0.025em; line-height: 1.15; }
.tileNote { font-size: 12.5px; color: var(--muted); line-height: 1.4; margin-top: 3px; }
.delta { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; cursor: help; }
.delta.up { color: var(--good); background: var(--good-bg); }
.delta.down { color: var(--bad); background: var(--bad-bg); }
.delta.same { color: var(--ink-2); background: var(--track); }
.spark { display: block; width: calc(100% + 36px); height: 42px; margin: auto -18px -14px; padding-top: 10px; }
.sparkLine { fill: none; stroke: var(--s1); stroke-width: 1.75; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.sparkArea { fill: var(--wash); }
.tiles.inner { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-bottom: 8px; }
.tiles.inner .tile { min-height: 0; background: var(--sunk); box-shadow: none; border-radius: 12px; padding: 12px 14px; }
.tiles.inner .tileValue { font-size: 24px; }

.block { margin-top: 38px; }
.blockHead { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; margin: 0 2px 14px; }
.blockHead h2 { font-size: 19px; font-weight: 650; letter-spacing: -0.015em; }
.blockHead p { margin: 0; color: var(--muted); font-size: 13.5px; }
.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; }
.span4 { grid-column: span 4; } .span6 { grid-column: span 6; } .span8 { grid-column: span 8; } .span12 { grid-column: 1 / -1; }
.card { min-width: 0; background: var(--surface); border: 1px solid var(--ring); border-radius: 14px; box-shadow: var(--shadow); padding: 18px 20px 16px; }
.card header { margin-bottom: 14px; }
.card h3 { font-size: 15px; font-weight: 600; letter-spacing: -0.005em; }
.card .sub { margin: 3px 0 0; color: var(--muted); font-size: 12.5px; line-height: 1.45; }
.card h4 { font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 12px; }
.card .tiles.inner + h4 { margin-top: 18px; }
.empty { color: var(--muted); font-size: 13px; margin: 6px 0; }

.s1 { --c: var(--s1); } .s2 { --c: var(--s2); } .s3 { --c: var(--s3); }
.viz { margin: 0; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: -4px 0 14px; font-size: 12.5px; color: var(--ink-2); }
.legend span { display: inline-flex; align-items: center; gap: 7px; }
.legend b { color: var(--ink); font-weight: 650; }
.legend .legendNote { color: var(--muted); }
.key { display: inline-block; flex: none; background: var(--c); }
.key.line, .tip .key { width: 14px; height: 3px; border-radius: 2px; }
.key.box { width: 10px; height: 10px; border-radius: 3px; }
.key.none { background: transparent; }
.plot { position: relative; margin: 8px 12px 0 34px; }
.plot.labelled { margin-right: 44px; }
.plot.capped { margin-top: 24px; }
.gls { position: absolute; inset: 0; pointer-events: none; }
.gl { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid var(--line); }
.gl.base { border-top-color: var(--axis); }
.gl span { position: absolute; right: calc(100% + 9px); top: -8px; font-size: 11px; line-height: 16px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.lines .line { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.lines .line.partial { stroke-dasharray: 2 5; }
.lines stop { stop-color: var(--c); }
.lines .top { stop-opacity: 0.2; } .lines .bottom { stop-opacity: 0; }
.dot { position: absolute; width: 10px; height: 10px; margin: 0 0 -5px -5px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 2px var(--surface); pointer-events: none; }
.endLabel { position: absolute; left: calc(100% + 10px); transform: translateY(50%); font-size: 12.5px; font-weight: 650; line-height: 1; color: var(--ink); white-space: nowrap; }
.hits { position: absolute; inset: 0; }
.hit { position: absolute; top: 0; bottom: 0; }
.hit .cross { position: absolute; top: 0; bottom: 0; left: var(--at); width: 1px; background: var(--axis); display: none; }
.hit .dot { left: var(--at); display: none; }
.hit:hover .cross, .hit:hover .dot { display: block; }
.tip { display: none; position: absolute; top: 0; left: var(--at, 50%); z-index: 5; transform: translateX(14px); min-width: 132px; padding: 8px 11px 7px; background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; box-shadow: 0 10px 28px rgba(20,20,19,0.13), 0 2px 6px rgba(20,20,19,0.06); font-size: 12.5px; white-space: nowrap; pointer-events: none; }
.tip.flip { transform: translateX(calc(-100% - 14px)); }
.hit:hover .tip, .col:hover .tip { display: block; }
.tipTitle { font-size: 11.5px; color: var(--muted); margin-bottom: 3px; }
.tipRow { display: flex; align-items: center; gap: 8px; line-height: 1.65; }
.tipRow b { font-weight: 650; color: var(--ink); font-variant-numeric: tabular-nums; }
.tipRow span { color: var(--ink-2); }

.cols { position: absolute; inset: 0; display: flex; }
.col { position: relative; flex: 1 1 0; min-width: 0; display: flex; justify-content: center; align-items: flex-end; --at: 50%; border-radius: 6px 6px 0 0; }
.col:hover { background: rgba(20,20,19,0.035); }
.stack { display: flex; flex-direction: column-reverse; gap: 2px; width: min(26px, 62%); border-radius: 5px 5px 0 0; overflow: hidden; }
.stack i { display: block; flex-basis: 0; min-height: 0; background: var(--c); }
.col:hover .stack { filter: brightness(1.07); }
.col.partial .stack { opacity: 0.45; }
.cols.dense .col { border-radius: 2px 2px 0 0; }
.cols.dense .stack { width: calc(100% - 1px); gap: 1px; border-radius: 2px 2px 0 0; }
.cap { position: absolute; left: 0; right: 0; margin-bottom: 5px; text-align: center; font-size: 12px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }

.xaxis { position: relative; height: 18px; margin: 7px 12px 0 34px; font-size: 11px; color: var(--muted); }
.plot.labelled + .xaxis { margin-right: 44px; }
.xaxis span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
.xaxis span.first { transform: none; } .xaxis span.last { transform: translateX(-100%); }
.xaxis.bins { display: flex; height: auto; }
.xaxis.bins span { position: static; transform: none; flex: 1 1 0; min-width: 0; padding: 0 3px; text-align: center; white-space: normal; line-height: 1.3; }

.tableView { margin-top: 10px; }
.tableView summary { width: max-content; list-style: none; cursor: pointer; font-size: 12px; color: var(--muted); padding: 2px 0; }
.tableView summary::-webkit-details-marker { display: none; }
.tableView summary::before { content: ''; display: inline-block; width: 0; height: 0; margin: 0 7px 1px 1px; border: 4px solid transparent; border-left: 5px solid currentColor; border-right: 0; transition: transform 0.15s; }
.tableView[open] summary::before { transform: rotate(90deg); }
.tableView summary:hover { color: var(--ink-2); }
.tableScroll { max-height: 280px; overflow: auto; margin-top: 8px; border: 1px solid var(--line); border-radius: 10px; }
.tableScroll table { font-size: 12.5px; }
.tableScroll th { position: sticky; top: 0; background: var(--sunk); font-weight: 500; color: var(--ink-2); text-align: left; padding: 7px 12px; border-bottom: 1px solid var(--line); }
.tableScroll td { padding: 5px 12px; border-bottom: 1px solid var(--line); }
.tableScroll tr:last-child td { border-bottom: 0; }

.bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 11px; }
.bars li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 5px 12px; font-size: 13px; }
.barLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.barFigure { font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.barFigure b { font-weight: 600; }
.barFigure span { color: var(--muted); }
.barTrack { grid-column: 1 / -1; height: 6px; border-radius: 3px; background: var(--track); overflow: hidden; }
.barFill { display: block; height: 100%; border-radius: 3px; background: var(--s1); }
.groups { columns: 3 320px; column-gap: 40px; }
.group { break-inside: avoid; padding-bottom: 24px; }
.minis { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 26px 40px; }

table { border-collapse: collapse; width: 100%; font-size: 13px; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.tableWrap { overflow-x: auto; }
.cohorts { border-collapse: separate; border-spacing: 3px; margin: 0 -3px; }
.cohorts th { font-weight: 500; font-size: 12px; color: var(--muted); text-align: left; padding: 2px 8px 4px; white-space: nowrap; }
.cohorts th.num { text-align: right; }
.cohorts td { padding: 8px; white-space: nowrap; }
.cohorts th:nth-child(-n+2), .cohorts td:nth-child(-n+2) { width: 1%; padding-right: 18px; }
.cohorts td:first-child { color: var(--ink-2); }
.cohorts .heat { min-width: 60px; text-align: center; font-variant-numeric: tabular-nums; font-size: 12.5px; border-radius: 7px; }
.heat.none { background: repeating-linear-gradient(-45deg, transparent 0 5px, var(--track) 5px 6px); }
.h0 { background: var(--h0); } .h1 { background: var(--h1); } .h2 { background: var(--h2); } .h3 { background: var(--h3); } .h4 { background: var(--h4); }
.h5 { background: var(--h5); color: #fff; } .h6 { background: var(--h6); color: #fff; } .h7 { background: var(--h7); color: #fff; } .h8 { background: var(--h8); color: #fff; }
.scale { display: flex; align-items: center; gap: 3px; margin-top: 12px; font-size: 11px; color: var(--muted); }
.scale i { width: 18px; height: 8px; border-radius: 2px; }
.scale span:first-child { margin-right: 4px; } .scale span:last-child { margin-left: 4px; }

.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); column-gap: 36px; }
.stats.single { grid-template-columns: 1fr; }
.stats div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.stats span { color: var(--ink-2); }
.stats b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

footer { margin-top: 36px; color: var(--muted); font-size: 12.5px; text-align: center; }

.login { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(1200px 600px at 50% -10%, #e8f0fb, transparent 60%), var(--page); }
.loginCard { width: min(360px, 100%); display: grid; gap: 8px; background: var(--surface); border: 1px solid var(--ring); border-radius: 16px; box-shadow: 0 12px 40px rgba(20,20,19,0.08); padding: 28px; }
.loginCard .mark { margin-bottom: 6px; }
.loginCard h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.loginCard p { margin: 0 0 10px; }
.muted { color: var(--ink-2); }
.loginCard label { font-size: 13px; font-weight: 500; color: var(--ink-2); }
.loginCard input { font: inherit; padding: 9px 11px; border-radius: 9px; border: 1px solid var(--axis); background: var(--surface); color: var(--ink); }
.loginCard input:focus { outline: 2px solid rgba(42,120,214,0.35); outline-offset: 1px; border-color: var(--s1); }
.loginCard button { margin-top: 10px; padding: 10px; border-radius: 9px; border: none; background: var(--ink); color: #fff; font-weight: 600; }
.loginCard button:hover { background: #2c2c2a; }
.error { color: var(--bad); font-size: 13px; }

@media (max-width: 1180px) {
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .span4 { grid-column: span 6; }
}
@media (max-width: 820px) {
  .wrap { padding: 20px 14px 32px; }
  .span4, .span6, .span8 { grid-column: 1 / -1; }
}
@media (max-width: 520px) {
  .tiles { gap: 10px; }
  .tile { min-height: 0; padding: 12px 13px 12px; }
  .tileValue { font-size: 24px; }
  .spark { width: calc(100% + 26px); margin: auto -13px -12px; height: 34px; }
  .top { align-items: flex-start; }
}
`
