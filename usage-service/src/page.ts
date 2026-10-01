import { columnChart, formatNumber, formatShare, lineChart, shortDay, type Point } from './charts.js'
import { GROUPS } from './features.js'
import { RANGES, type EnvironmentField, type FeatureRow, type Overview, type RemoteUse, type Share } from './dashboard.js'
import type { DayField } from './report.js'

/**
 * The two pages a person sees: the password, and the figures behind it.
 *
 * Plain HTML written on the server, styles inside the page and no script anywhere (see charts.ts for
 * why). Every piece of text that came from a report - a version, a feature id, a setting's value - is
 * escaped on the way in, even though the report was already held to identifiers on arrival: the page is
 * the last door, and it does not lean on the one before it.
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
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`

export const loginPage = (error: string | null): string =>
  shell(
    'Usage - Amazing Claude Code GUI',
    `<main class="login">
  <form method="post" action="/admin/login" class="loginCard">
    <h1>Usage</h1>
    <p class="muted">Amazing Claude Code GUI</p>
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
    `<main class="login"><div class="loginCard"><h1>Not configured</h1>
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

const ENVIRONMENT_TITLES: Record<EnvironmentField, string> = {
  plugin: 'Plugin version',
  ide: 'IDE',
  ide_version: 'IDE version',
  os: 'Operating system',
  arch: 'Processor',
  cli: 'Claude Code version',
  lang: 'Panel language',
}

const environmentValue = (field: EnvironmentField, value: string): string => {
  if (field === 'ide') return IDE_NAMES[value] ? `${IDE_NAMES[value]} (${value})` : value
  if (field === 'os') return OS_NAMES[value] ?? value
  return value
}

/** What each setting in the report means - the plugin sends the short name (see UsageReport.settings). */
const SETTING_TITLES: Record<string, string> = {
  remote: 'Remote access on',
  voice: 'Voice input on',
  layout: 'Composer layout',
  sendKey: 'Send key',
  restoreTabs: 'Tabs come back on start',
  shareEditor: 'Editor goes along with messages',
  calmColors: 'Gauge colour (0-100)',
  hiddenIndicators: 'Indicators switched off',
  customModels: 'Custom models added',
  improveCustom: 'Own improve-prompt text',
  theme: 'Theme',
  textSize: 'Own text size',
  language: 'Language chosen by hand',
  pasteCollapse: 'Paste folds from (lines)',
  accounts: 'Claude accounts',
  soundsMuted: 'Sound alerts muted',
  newChatModel: 'New chats pinned to a model',
  newChatEffort: 'New chats pinned to an effort',
  newChatMode: 'New chats start in mode',
  pairedDevices: 'Phones paired',
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

const MEDIANS: { field: DayField; label: string; unit: string }[] = [
  { field: 'minutes', label: 'Active time', unit: 'min' },
  { field: 'prompts', label: 'Messages', unit: '' },
  { field: 'turnSeconds', label: 'Agent working time', unit: 's' },
  { field: 'longestConversation', label: 'Longest conversation', unit: 'min' },
  { field: 'mcpConnected', label: 'MCP servers connected', unit: '' },
  { field: 'plugins', label: 'Claude Code plugins installed', unit: '' },
]

const minutes = (value: number): string => {
  if (value < 60) return `${Math.round(value)} min`
  const hours = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

const tile = (label: string, value: string, note = ''): string =>
  `<div class="tile"><div class="tileLabel">${escape(label)}</div><div class="tileValue">${escape(value)}</div>${note ? `<div class="tileNote">${escape(note)}</div>` : ''}</div>`

const card = (title: string, subtitle: string, body: string, wide = false): string =>
  `<section class="card${wide ? ' wide' : ''}"><h2>${escape(title)}</h2>${subtitle ? `<p class="sub">${escape(subtitle)}</p>` : ''}${body}</section>`

/**
 * A ranked list with a bar beside each row: a chart and its own table at once. The figure is printed on
 * every row, so the bar is there for the eye and never the only way to read the number.
 *
 * The bar is the share on a scale of the whole, not of the longest row: a feature used by one machine in
 * ten must look like one in ten, and stretching the top row to the full width would make it look like
 * everybody's.
 */
const barList = (rows: { label: string; share: number; figure: string }[], empty = 'Nothing yet'): string => {
  if (rows.length === 0) return `<p class="empty">${escape(empty)}</p>`
  return `<ul class="bars">${rows
    .map(
      (row) =>
        `<li><span class="barLabel">${escape(row.label)}</span>` +
        `<span class="barTrack"><span class="barFill" style="width:${(Math.min(1, row.share) * 100).toFixed(1)}%"></span></span>` +
        `<span class="barFigure">${escape(row.figure)}</span></li>`,
    )
    .join('')}</ul>`
}

const shares = (list: Share[], limit: number, label: (value: string) => string = (value) => value): string =>
  barList(
    list.slice(0, limit).map((row) => ({ label: label(row.value), share: row.share, figure: `${formatShare(row.share)} · ${formatNumber(row.count)}` })),
  )

const featureSection = (features: FeatureRow[]): string => {
  if (features.length === 0) return '<p class="empty">No feature has been counted in this range yet.</p>'

  const groups = new Map<string, FeatureRow[]>()
  for (const feature of features) groups.set(feature.group, [...(groups.get(feature.group) ?? []), feature])

  // Groups by their most used feature, so the section reads from what matters most to what matters least.
  const ordered = [...groups.entries()].sort(
    (a, b) => Math.max(...b[1].map((row) => row.share)) - Math.max(...a[1].map((row) => row.share)),
  )

  return ordered
    .map(
      ([group, rows]) =>
        `<h3>${escape(GROUPS[group] ?? group)}</h3>` +
        barList(
          rows.map((row) => ({
            label: row.label,
            share: row.share,
            figure: `${formatShare(row.share)} · ${formatNumber(row.users)} machines · ${formatNumber(row.uses)} uses`,
          })),
        ),
    )
    .join('')
}

/**
 * Remote access in one card: switched on, a phone paired, actually used - three numbers that tell apart
 * people who tried the feature from people who live on it - and the machines using a phone day by day.
 */
const remoteSection = (remote: RemoteUse, activeInRange: number): string => {
  const share = (count: number): string => (activeInRange === 0 ? '' : `${formatShare(count / activeInRange)} of active machines`)
  const points: Point[] = remote.series.map((point) => ({
    label: shortDay(point.day),
    value: point.machines,
    tip: `${shortDay(point.day)}: ${point.machines} machines used a phone`,
  }))

  return (
    `<div class="tiles inner">` +
    tile('Remote access on', formatNumber(remote.switchedOn), share(remote.switchedOn)) +
    tile('A phone paired', formatNumber(remote.paired), share(remote.paired)) +
    tile('Used from a phone', formatNumber(remote.used), share(remote.used)) +
    tile('Days with the phone', remote.daysPerUser.toFixed(1), 'average, per machine that used it') +
    tile('Messages from a phone', formatShare(remote.messageShare), 'of all messages in the range') +
    tile('Presses from a phone', formatNumber(remote.actions), 'messages, answers, approvals, stops') +
    `</div>` +
    `<h3>Machines that used a phone, per day</h3>` +
    lineChart(points, 'Machines that used a phone per day')
  )
}

/** Shades for the retention grid: nine steps of one blue, light for few and dark for many. */
const heatStep = (share: number): number => Math.min(8, Math.max(0, Math.round(share * 8)))

const cohortTable = (overview: Overview): string => {
  const weeks = overview.cohorts[0]?.weeks.length ?? 0
  const head = `<tr><th>First seen week of</th><th>Machines</th>${Array.from({ length: weeks }, (_, i) => `<th>Week ${i + 1}</th>`).join('')}</tr>`
  const body = overview.cohorts
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
  return `<div class="tableWrap"><table class="cohorts">${head}${body}</table></div>`
}

const rangeNav = (current: number): string =>
  `<nav class="ranges" aria-label="Range">${RANGES.map(
    (days) =>
      `<a href="/admin?days=${days}"${days === current ? ' aria-current="page" class="on"' : ''}>${days === 365 ? 'Year' : `${days} days`}</a>`,
  ).join('')}</nav>`

export const dashboardPage = (overview: Overview): string => {
  const { kpi, series, range } = overview

  const activePoints: Point[] = series.map((point) => ({
    label: shortDay(point.day),
    value: point.active,
    tip: `${shortDay(point.day)}: ${point.active} active machines`,
  }))
  const freshPoints: Point[] = series.map((point) => ({
    label: shortDay(point.day),
    value: point.fresh,
    tip: `${shortDay(point.day)}: ${point.fresh} new machines`,
  }))
  const minutePoints: Point[] = series.map((point) => ({
    label: shortDay(point.day),
    value: point.medianMinutes,
    tip: `${shortDay(point.day)}: median ${minutes(point.medianMinutes)} active`,
  }))
  const promptPoints: Point[] = series.map((point) => ({
    label: shortDay(point.day),
    value: point.prompts,
    tip: `${shortDay(point.day)}: ${point.prompts} messages`,
  }))

  const histogram = (list: Share[], noun: string): Point[] =>
    list.map((bin) => ({ label: bin.value, value: bin.count, tip: `${bin.value}: ${bin.count} ${noun} (${formatShare(bin.share)})` }))

  const totalsTable =
    `<table class="plain"><tbody>${TOTALS.map(
      (row) => `<tr><td>${escape(row.label)}</td><td class="num">${formatNumber(overview.totals[row.field])}</td></tr>`,
    ).join('')}</tbody></table>`

  const mediansTable =
    `<table class="plain"><tbody>${MEDIANS.map((row) => {
      const value = overview.medians[row.field]
      const text = row.unit === 'min' ? minutes(value) : row.unit === 's' ? minutes(value / 60) : formatNumber(value)
      return `<tr><td>${escape(row.label)}</td><td class="num">${escape(text)}</td></tr>`
    }).join('')}</tbody></table>`

  const environment = (Object.keys(ENVIRONMENT_TITLES) as EnvironmentField[])
    .map(
      (field) =>
        `<div class="mini"><h3>${escape(ENVIRONMENT_TITLES[field])}</h3>${shares(overview.environment[field], 8, (value) => environmentValue(field, value))}</div>`,
    )
    .join('')

  const settings = overview.settings.length
    ? overview.settings
        .map(
          (setting) =>
            `<div class="mini"><h3>${escape(SETTING_TITLES[setting.key] ?? setting.key)}</h3>${shares(setting.values, 6)}</div>`,
        )
        .join('')
    : '<p class="empty">No settings reported in this range yet.</p>'

  const body = `
<header class="top">
  <div>
    <h1>Usage</h1>
    <p class="muted">Amazing Claude Code GUI · ${escape(shortDay(range.from))} - ${escape(shortDay(range.to))} · machines that allowed the anonymous report</p>
  </div>
  <form method="post" action="/admin/logout"><button type="submit" class="ghost">Sign out</button></form>
</header>
${rangeNav(range.days)}

<div class="tiles">
  ${tile('Active yesterday', formatNumber(kpi.activeYesterday))}
  ${tile('Active, last 7 days', formatNumber(kpi.active7))}
  ${tile('Active, last 30 days', formatNumber(kpi.active30))}
  ${tile('New in range', formatNumber(kpi.newInRange), `${formatNumber(kpi.installsEver)} machines ever`)}
  ${tile('Active time per day', minutes(kpi.medianMinutes), 'median, per active machine-day')}
  ${tile('Sittings per day', kpi.avgSittings.toFixed(1), `median sitting ${minutes(kpi.medianSitting)}`)}
  ${tile('Messages per day', kpi.avgPrompts.toFixed(1), 'average, per active machine-day')}
  ${tile('Stickiness', formatShare(kpi.stickiness), 'average day against the whole range')}
</div>

<div class="grid">
  ${card('Active machines per day', 'A machine is active on a day something happened in the panel', lineChart(activePoints, 'Active machines per day'), true)}
  ${card('New machines per day', 'The first day a machine reported', columnChart(freshPoints, 'New machines per day'))}
  ${card('Messages per day', 'All machines together', columnChart(promptPoints, 'Messages per day'))}
  ${card('Active time per machine-day', 'Median minutes with something going on in the panel', lineChart(minutePoints, 'Median active minutes per machine-day'), true)}
  ${card('How long a sitting lasts', 'A sitting is a stretch of work with no gap longer than 30 minutes', columnChart(histogram(overview.sittingLengths, 'sittings'), 'Sitting length', { capLabels: true, compact: true }))}
  ${card('Sittings in a day', 'Per active machine-day', columnChart(histogram(overview.sittingsPerDay, 'machine-days'), 'Sittings per day', { capLabels: true, compact: true }))}
  ${card('Days active in the range', 'Per machine: one-off visits against daily use', columnChart(histogram(overview.activeDaysPerInstall, 'machines'), 'Active days per machine', { capLabels: true, compact: true }))}
  ${card('Retention', 'Of the machines first seen in a week, the share active in each week after', cohortTable(overview), true)}
  ${card('Features', `Share of the ${formatNumber(kpi.activeInRange)} machines active in the range that used each at least once`, featureSection(overview.features), true)}
  ${card('Remote access', 'Switched on and paired are what the last report said; used means at least one day with a message, a press or watching from a phone', remoteSection(overview.remote, kpi.activeInRange), true)}
  ${card('Models', 'Share of answers', shares(overview.models, 8))}
  ${card('Tools', 'Share of tool calls; every MCP tool counts as MCP', shares(overview.tools, 16))}
  ${card('Built-in commands', 'Share of machines that used each; commands of their own count as custom', shares(overview.slash, 16))}
  ${card('Totals in the range', '', totalsTable)}
  ${card('A typical day', 'Median per active machine-day', mediansTable)}
  ${card('Environment', 'Machines active in the range, by what they reported last', `<div class="minis">${environment}</div>`, true)}
  ${card('Settings', 'Machines active in the range, by what they reported last', `<div class="minis">${settings}</div>`, true)}
</div>

<footer class="muted">Only counts are kept: no addresses, no names, no text. Days older than the retention are deleted automatically.</footer>`

  return shell(`Usage - ${range.days} days`, body)
}

/**
 * The page's styles. The palette is the validated default of the charting guide the page was built by:
 * one blue for every series, recessive grey chrome, a light and a dark set chosen separately rather than
 * one inverted from the other.
 */
const STYLE = `
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10); --series: #2a78d6; --wash: rgba(42,120,214,0.10);
  --track: #eeeeea; --bad: #d03b3b;
  --h0: #eef4fc; --h1: #cde2fb; --h2: #b7d3f6; --h3: #9ec5f4; --h4: #6da7ec; --h5: #3987e5; --h6: #256abf; --h7: #184f95; --h8: #0d366b;
  --h-ink-light: #0b0b0b; --h-ink-dark: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10); --series: #3987e5; --wash: rgba(57,135,229,0.12);
    --track: #262624; --bad: #e66767;
    --h0: #1f2733; --h1: #0d366b; --h2: #104281; --h3: #184f95; --h4: #1c5cab; --h5: #256abf; --h6: #3987e5; --h7: #6da7ec; --h8: #9ec5f4;
    --h-ink-light: #ffffff; --h-ink-dark: #0b0b0b;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { font-size: 22px; margin: 0; font-weight: 650; }
h2 { font-size: 15px; margin: 0; font-weight: 600; }
h3 { font-size: 12px; margin: 14px 0 6px; font-weight: 600; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.04em; }
.muted, .sub, footer { color: var(--ink-2); }
.sub { margin: 2px 0 10px; font-size: 12.5px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 24px 28px 8px; }
.top p { margin: 4px 0 0; font-size: 13px; }
.ranges { display: flex; gap: 6px; padding: 8px 28px 16px; }
.ranges a { padding: 5px 12px; border-radius: 8px; color: var(--ink-2); text-decoration: none; border: 1px solid var(--ring); background: var(--surface); }
.ranges a:hover { color: var(--ink); }
.ranges a.on { color: var(--ink); font-weight: 600; border-color: var(--series); }
button { font: inherit; cursor: pointer; }
.ghost { background: none; border: 1px solid var(--ring); color: var(--ink-2); padding: 6px 12px; border-radius: 8px; }
.ghost:hover { color: var(--ink); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; padding: 0 28px 16px; }
.tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 14px 16px; }
.tiles.inner { padding: 4px 0 8px; }
.tiles.inner .tile { background: var(--page); }
.tileLabel { font-size: 12.5px; color: var(--ink-2); }
.tileValue { font-size: 28px; font-weight: 600; margin-top: 4px; }
.tileNote { font-size: 12px; color: var(--muted); margin-top: 2px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 12px; padding: 0 28px 24px; }
.card { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 16px 18px; min-width: 0; }
.card.wide { grid-column: 1 / -1; }
.chart { width: 100%; height: auto; display: block; overflow: visible; }
.chart text { font: 11px system-ui, -apple-system, "Segoe UI", sans-serif; }
.chart .tick { fill: var(--muted); font-variant-numeric: tabular-nums; }
.chart .grid { stroke: var(--grid); stroke-width: 1; }
.chart .baseline { stroke: var(--axis); stroke-width: 1; }
.chart .line { fill: none; stroke: var(--series); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.chart .area { fill: var(--wash); stroke: none; }
.chart .end { fill: var(--series); stroke: var(--surface); stroke-width: 2; }
.chart .endLabel, .chart .capLabel { fill: var(--ink); font-weight: 600; }
.chart .hit rect, .chart .barHit { fill: transparent; }
.chart .cross { stroke: var(--axis); stroke-width: 1; opacity: 0; }
.chart .dot { fill: var(--series); stroke: var(--surface); stroke-width: 2; opacity: 0; }
.chart .hit:hover .cross, .chart .hit:hover .dot { opacity: 1; }
.chart .column { fill: var(--series); }
.chart .bar:hover .column { opacity: 0.8; }
.bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.bars li { display: grid; grid-template-columns: minmax(120px, 34%) 1fr auto; align-items: center; gap: 10px; font-size: 13px; }
.barLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.barTrack { height: 8px; background: var(--track); border-radius: 4px; overflow: hidden; }
.barFill { display: block; height: 100%; background: var(--series); border-radius: 0 4px 4px 0; }
.barFigure { color: var(--ink-2); font-variant-numeric: tabular-nums; font-size: 12.5px; white-space: nowrap; }
.minis { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 4px 24px; }
.mini h3 { margin-top: 10px; }
.empty { color: var(--muted); font-size: 13px; margin: 6px 0; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
.plain td { padding: 5px 0; border-bottom: 1px solid var(--grid); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.tableWrap { overflow-x: auto; }
.cohorts th { font-weight: 500; color: var(--ink-2); text-align: left; padding: 4px 6px; font-size: 12px; white-space: nowrap; }
.cohorts td { padding: 6px; white-space: nowrap; }
.cohorts .heat { text-align: center; font-variant-numeric: tabular-nums; border: 2px solid var(--surface); border-radius: 6px; }
.heat.none { background: transparent; }
.h0 { background: var(--h0); color: var(--h-ink-light); } .h1 { background: var(--h1); color: var(--h-ink-light); }
.h2 { background: var(--h2); color: var(--h-ink-light); } .h3 { background: var(--h3); color: var(--h-ink-light); }
.h4 { background: var(--h4); color: var(--h-ink-light); } .h5 { background: var(--h5); color: var(--h-ink-dark); }
.h6 { background: var(--h6); color: var(--h-ink-dark); } .h7 { background: var(--h7); color: var(--h-ink-dark); }
.h8 { background: var(--h8); color: var(--h-ink-dark); }
footer { padding: 0 28px 32px; font-size: 12.5px; }
.login { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.loginCard { width: min(340px, 100%); background: var(--surface); border: 1px solid var(--ring); border-radius: 14px; padding: 24px; display: grid; gap: 8px; }
.loginCard p { margin: 0 0 8px; }
.loginCard label { font-size: 13px; color: var(--ink-2); }
.loginCard input { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--axis); background: var(--page); color: var(--ink); }
.loginCard button { margin-top: 8px; padding: 9px; border-radius: 8px; border: none; background: var(--series); color: #fff; font-weight: 600; }
.error { color: var(--bad); font-size: 13px; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; padding: 0 12px 16px; } .tiles, .ranges, .top { padding-left: 12px; padding-right: 12px; } }
`
