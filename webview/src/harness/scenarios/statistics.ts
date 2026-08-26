import type { AchievementState, StatisticsDay } from '../../protocol'
import { ACHIEVEMENTS } from '../../stats/catalogue'
import { addDays, dayOf, weekday } from '../../stats/dates'
import { bootstrap, checkpoint, scenario, shell } from '../events'
import type { Scenario, ScenarioStep } from '../types'

/**
 * The statistics tab with a summer's worth of figures behind it - enough of them for every tile, the
 * chart, the calendar and the achievements screen to have something to show.
 *
 * The figures are made up, deliberately and repeatably: the same noise every run, so a screenshot of a
 * checkpoint today matches one from tomorrow. The dates are counted back from today, so the calendar
 * always ends on this week and the chart's last point is the present.
 */

/** The same "random" every time - a hash rather than Math.random, so a run is repeatable. */
const noise = (seed: number): number => {
  let h = (seed * 2654435761) % 4294967296
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

const DAYS = 130

const today = dayOf(Date.now())

const hoursOf = (minutes: number, seed: number): number[] => {
  const hours = Array.from({ length: 24 }, () => 0)
  let left = minutes
  // Work lands late in the morning and again after lunch, with a little at the edges.
  const spread = [9, 10, 11, 12, 14, 15, 16, 17, 10, 11, 15, 21, 22]
  let index = 0
  while (left > 0) {
    const hour = spread[Math.floor(noise(seed + index) * spread.length)]!
    const chunk = Math.min(left, 60 - hours[hour]!)
    if (chunk <= 0) {
      index++
      if (index > 200) break
      continue
    }
    hours[hour] = hours[hour]! + chunk
    left -= chunk
    index++
  }
  return hours
}

const day = (offset: number): StatisticsDay | null => {
  const date = addDays(today, -offset)
  const weekend = weekday(date) >= 5
  const r = noise(offset + 17)
  // Two quiet days a fortnight, and most weekends off.
  if (r < (weekend ? 0.7 : 0.14)) return null

  const minutes = Math.round((weekend ? 20 : 45) + noise(offset + 31) * (weekend ? 60 : 210))
  const turns = Math.max(1, Math.round(minutes / 4 + noise(offset + 5) * 10))
  const edits = Math.round(turns * (0.6 + noise(offset + 7)))
  const added = Math.round(edits * (8 + noise(offset + 9) * 40))
  const removed = Math.round(added * (0.2 + noise(offset + 11) * 0.3))

  return {
    date,
    minutes,
    hours: hoursOf(minutes, offset * 7),
    turns,
    prompts: turns,
    sessions: 1 + Math.round(noise(offset + 3) * 3),
    forks: noise(offset + 13) > 0.7 ? 1 : 0,
    earlyPrompts: noise(offset + 19) > 0.8 ? 2 : 0,
    latePrompts: noise(offset + 23) > 0.9 ? 1 : 0,
    turnMillis: turns * (25_000 + Math.round(noise(offset + 29) * 60_000)),
    longestTurnMillis: 400_000 + Math.round(noise(offset + 37) * 500_000),
    quickTurns: Math.round(turns * 0.4),
    longTurns: noise(offset + 41) > 0.8 ? 1 : 0,
    maxTurnsInHour: 4 + Math.round(noise(offset + 43) * 9),
    tools: {
      Read: Math.round(turns * 3.2),
      Edit: edits,
      Bash: Math.round(turns * 1.2),
      Grep: Math.round(turns * 0.9),
      Write: Math.round(edits * 0.15),
      Task: noise(offset + 47) > 0.6 ? 2 : 0,
    },
    edits,
    linesAdded: added,
    linesRemoved: removed,
    biggestEdit: 40 + Math.round(noise(offset + 53) * 200),
    singleLineEdits: Math.round(edits * 0.2),
    maxFilesInTurn: 2 + Math.round(noise(offset + 59) * 6),
    testTurns: Math.round(turns * 0.25),
    filesTouched: 3 + Math.round(noise(offset + 61) * 14),
    permissionsAsked: Math.round(turns * 0.5),
    permissionsAllowed: Math.round(turns * 0.48),
    permissionsDenied: Math.round(turns * 0.02),
    editsRefused: noise(offset + 67) > 0.85 ? 1 : 0,
    plansApproved: noise(offset + 71) > 0.8 ? 1 : 0,
    todosDone: noise(offset + 73) > 0.6 ? 1 : 0,
    tokensIn: turns * 4_000,
    tokensOut: turns * 900,
    tokensCacheRead: turns * 60_000,
    tokensCacheWrite: turns * 3_000,
    cost: turns * 0.55,
    models: { Sonnet: Math.round(turns * 0.78), Opus: Math.round(turns * 0.22) },
    mcpConnected: 4,
    plugins: 6,
    longestSession: 40 + Math.round(noise(offset + 97) * 130),
    longestStretch: 20 + Math.round(noise(offset + 101) * 70),
    maxForksInTree: noise(offset + 103) > 0.9 ? 3 : 1,
    maxDepth: noise(offset + 107) > 0.95 ? 3 : 1,
  }
}

const days = Array.from({ length: DAYS }, (_, offset) => day(offset)).filter((entry): entry is StatisticsDay => entry !== null)

const OTHER_PROJECTS = [
  { key: 'p-relay', name: 'relay', share: 0.55 },
  { key: 'p-sandbox', name: 'sandbox-project', share: 0.33 },
  { key: 'p-gym', name: 'gym-app', share: 0.22 },
  { key: 'p-dotfiles', name: 'dotfiles', share: 0.09 },
  { key: 'p-notes', name: 'notes', share: 0.05 },
  { key: 'p-blog', name: 'blog', share: 0.04 },
  { key: 'p-bot', name: 'telegram-bot', share: 0.03 },
  { key: 'p-scripts', name: 'scripts', share: 0.02 },
]

const projects = [
  { key: 'p-this', name: 'amazing-claude-code', minutes: Object.fromEntries(days.map((entry) => [entry.date, entry.minutes])) },
  ...OTHER_PROJECTS.map((project, index) => ({
    key: project.key,
    name: project.name,
    minutes: Object.fromEntries(
      days
        .filter((_, offset) => noise(offset * 3 + index * 101) > 0.3)
        .map((entry, offset) => [entry.date, Math.round(entry.minutes * project.share * (0.5 + noise(offset + index * 7)))]),
    ),
  })),
]

/** [tier, value, target] per achievement, in the catalogue's order - roughly the design's picture. */
const PICTURE: Record<string, [number, number, number | undefined]> = {
  'steady-hand': [3, 23, 30],
  'month-straight': [0, 23, 30],
  quarter: [3, 71, 90],
  'weekend-crew': [3, 14, 25],
  'early-riser': [3, 62, 100],
  'night-shift': [2, 28, 50],
  'full-week': [3, 4, 8],
  'second-wind': [3, 3, 5],
  'two-hundred': [3, 96, 200],
  'a-year-in': [4, 341, 365],
  'home-for-the-holidays': [2, 2, 5],
  'first-hour': [5, 60, undefined],
  'ten-hours': [5, 600, undefined],
  'hundred-hours': [5, 6765, undefined],
  'five-hundred': [1, 6765, 12000],
  'deep-work': [4, 105, 120],
  marathon: [3, 171, 240],
  'full-day': [3, 260, 360],
  sprint: [3, 13, 15],
  'quick-turn': [3, 210, 250],
  'long-haul': [3, 14, 25],
  'first-diff': [5, 1, undefined],
  'thousand-lines': [5, 1000, undefined],
  'ten-thousand': [5, 10000, undefined],
  'hundred-thousand': [0, 18430, 20000],
  'big-diff': [5, 918, undefined],
  surgeon: [3, 34, 50],
  refactor: [3, 7, 8],
  housekeeper: [3, 5962, 5000 + 5000],
  'test-first': [3, 88, 100],
  rollback: [4, 34, 50],
  reader: [4, 3902, 5000],
  'grep-hound': [4, 1210, 2500],
  shell: [4, 1480, 2500],
  writer: [4, 318, 500],
  'todo-keeper': [4, 52, 100],
  planner: [3, 18, 25],
  mcp: [4, 4, 5],
  'plugin-shelf': [4, 6, 10],
  slash: [4, 5, 7],
  attachment: [3, 47, 60],
  forked: [5, 1, undefined],
  'fork-master': [4, 34, 50],
  'deep-tree': [3, 3, 4],
  quoted: [3, 58, 60],
  historian: [3, 6, 10],
  remote: [5, 1, undefined],
  'on-the-road': [2, 21, 25],
  watched: [2, 3, 5],
  ceiling: [2, 2, 5],
  thanks: [3, 7, 10],
}

const achievements: AchievementState[] = ACHIEVEMENTS.map((spec, index) => {
  const [tier, value, target] = PICTURE[spec.id] ?? [0, 0, 1]
  const earned: Record<string, number> = {}
  if (spec.milestone) {
    if (tier > 0) earned['5'] = Date.now() - (index + 1) * 36 * 60 * 60 * 1000
  } else {
    for (let step = 1; step <= tier; step++) {
      earned[String(step)] = Date.now() - (tier - step + 1) * (index + 2) * 9 * 60 * 60 * 1000
    }
  }
  return { id: spec.id, tier, value, ...(target === undefined ? {} : { target }), earned }
})

const figures: ScenarioStep = shell({
  type: 'statistics',
  now: Date.now(),
  since: Date.now() - DAYS * 24 * 60 * 60 * 1000,
  today,
  devicesPaired: 1,
  project: { key: 'p-this', name: 'amazing-claude-code' },
  projects,
  days,
  achievements,
})

/** The same tab on a fresh install: a day and a half of figures and nearly nothing earned. */
const fresh: ScenarioStep = shell({
  type: 'statistics',
  now: Date.now(),
  since: Date.now() - 30 * 60 * 60 * 1000,
  today,
  devicesPaired: 0,
  project: { key: 'p-this', name: 'amazing-claude-code' },
  projects: [{ key: 'p-this', name: 'amazing-claude-code', minutes: { [today]: 42, [addDays(today, -1)]: 18 } }],
  days: [
    {
      date: addDays(today, -1),
      minutes: 18,
      hours: hoursOf(18, 3),
      turns: 3,
      prompts: 3,
      sessions: 1,
      tools: { Read: 12, Edit: 2, Bash: 3 },
      edits: 2,
      linesAdded: 41,
      linesRemoved: 6,
      biggestEdit: 30,
      filesTouched: 2,
      permissionsAsked: 2,
      permissionsAllowed: 2,
      models: { Sonnet: 3 },
      turnMillis: 90_000,
      tokensIn: 9_000,
      tokensOut: 2_100,
      tokensCacheRead: 120_000,
      cost: 1.2,
    },
    {
      date: today,
      minutes: 42,
      hours: hoursOf(42, 5),
      turns: 7,
      prompts: 7,
      sessions: 2,
      tools: { Read: 30, Edit: 9, Bash: 6, Grep: 4 },
      edits: 9,
      linesAdded: 212,
      linesRemoved: 40,
      biggestEdit: 80,
      filesTouched: 5,
      permissionsAsked: 5,
      permissionsAllowed: 4,
      permissionsDenied: 1,
      models: { Sonnet: 7 },
      turnMillis: 400_000,
      tokensIn: 30_000,
      tokensOut: 6_000,
      tokensCacheRead: 500_000,
      cost: 4.1,
    },
  ],
  achievements: ACHIEVEMENTS.map((spec): AchievementState => {
    const done = spec.id === 'first-hour' ? [5, 60, undefined] : spec.id === 'first-diff' ? [5, 1, undefined] : null
    if (done) return { id: spec.id, tier: 5, value: done[1] as number, earned: { '5': Date.now() - 3_600_000 } }
    if (spec.id === 'reader') return { id: spec.id, tier: 0, value: 42, target: 50, earned: {} }
    if (spec.id === 'shell') return { id: spec.id, tier: 0, value: 9, target: 25, earned: {} }
    return { id: spec.id, tier: 0, value: 0, target: 1, earned: {} }
  }),
})

export const scenariosStatistics: Scenario[] = [
  scenario('statistics-summer', 'Statistics: a summer of work', 'system', [
    checkpoint('The figures arrive and the tab opens', [...bootstrap, figures, { kind: 'openStatistics' }]),
    checkpoint('The achievements screen', [{ kind: 'openStatistics', view: 'achievements' }]),
  ]),
  scenario('statistics-fresh', 'Statistics: the second day', 'system', [
    checkpoint('A fresh install with a day and a half behind it', [...bootstrap, fresh, { kind: 'openStatistics' }]),
    checkpoint('Its achievements, nearly all locked', [{ kind: 'openStatistics', view: 'achievements' }]),
  ]),
]
