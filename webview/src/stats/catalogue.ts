import { compactNumber, duration, durationTight, groupThousands } from './format'

/**
 * The fifty-one achievements as a person reads them: the name, the hint under it, the group it sits in and
 * how its figure is put into words.
 *
 * The rules - which figure, and where the five lines are - live on the IDE's side (see Achievements.kt),
 * keyed by the same ids; the tab is handed each achievement's tier, figure and next line ready-made and
 * only dresses them. A test on either side fails if the two lists part ways.
 */

export type AchievementUnit = 'count' | 'days' | 'minutes' | 'lines'

export interface AchievementSpec {
  id: string
  name: string
  hint: string
  unit: AchievementUnit
  /**
   * What the figure is called once the top tier is reached and there is no target left to write it
   * against: "4 weeks", "3 times", "done". Absent means the figure itself, in its unit.
   */
  done?: (value: number) => string
  /** The words for "earned lately": what the tier was earned for, in a short line. */
  note: (value: number) => string
  /** A milestone: one line to cross, all five tiers lit at once. Drawn as "done" rather than as a tier. */
  milestone?: boolean
}

export interface AchievementGroup {
  id: string
  name: string
  note: string
  items: AchievementSpec[]
}

const times = (value: number): string => (value === 1 ? 'once' : `${value} times`)

const plural = (value: number, one: string, many: string): string => `${groupThousands(value)} ${value === 1 ? one : many}`

export const ACHIEVEMENT_GROUPS: AchievementGroup[] = [
  {
    id: 'habit',
    name: 'HABIT',
    note: 'coming back is the whole trick',
    items: [
      {
        id: 'steady-hand',
        name: 'Steady hand',
        hint: 'Days in a row. Tier V wants 60.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => `${value} days in a row`,
      },
      {
        id: 'month-straight',
        name: 'Month straight',
        hint: '30 active days without a gap.',
        unit: 'days',
        milestone: true,
        note: () => 'thirty days without a gap',
      },
      {
        id: 'quarter',
        name: 'Quarter',
        hint: '90 days with the panel open.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => `${value} days at work`,
      },
      {
        id: 'weekend-crew',
        name: 'Weekend crew',
        hint: 'Saturdays and Sundays worked.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => plural(value, 'weekend day', 'weekend days'),
      },
      {
        id: 'early-riser',
        name: 'Early riser',
        hint: 'Turns started before 8:00.',
        unit: 'count',
        note: (value) => `${value} turns before 8:00`,
      },
      {
        id: 'night-shift',
        name: 'Night shift',
        hint: 'Turns after midnight.',
        unit: 'count',
        note: (value) => `${value} turns after midnight`,
      },
      {
        id: 'full-week',
        name: 'Full week',
        hint: 'All seven days of one week.',
        unit: 'count',
        done: (value) => plural(value, 'week', 'weeks'),
        note: (value) => plural(value, 'full week', 'full weeks'),
      },
      {
        id: 'second-wind',
        name: 'Second wind',
        hint: 'Came back after a week away.',
        unit: 'count',
        done: times,
        note: () => 'came back after a week off',
      },
      {
        id: 'two-hundred',
        name: 'Two hundred',
        hint: 'Sessions started, ever.',
        unit: 'count',
        note: (value) => `${value} sessions started`,
      },
      {
        id: 'a-year-in',
        name: 'A year in',
        hint: 'Calendar days since the first turn.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => `${value} days since the first turn`,
      },
      {
        id: 'home-for-the-holidays',
        name: 'Home for the holidays',
        hint: 'Dec 24 to Jan 1 with the panel shut. It can wait.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => plural(value, 'holiday day away from the panel', 'holiday days away from the panel'),
      },
    ],
  },
  {
    id: 'hours',
    name: 'HOURS',
    note: 'time the agent carried instead of you',
    items: [
      {
        id: 'first-hour',
        name: 'First hour',
        hint: 'One hour in the panel.',
        unit: 'minutes',
        done: () => 'done',
        note: () => 'an hour in the panel',
      },
      {
        id: 'ten-hours',
        name: 'Ten hours',
        hint: 'Ten hours in the panel.',
        unit: 'minutes',
        done: () => 'done',
        note: (value) => `${duration(value)} in the panel`,
      },
      {
        id: 'hundred-hours',
        name: 'Hundred hours',
        hint: 'A hundred hours, all projects.',
        unit: 'minutes',
        done: () => 'done',
        note: (value) => `${duration(value)} across every project`,
      },
      {
        id: 'five-hundred',
        name: 'Five hundred',
        hint: 'Five hundred hours, all projects.',
        unit: 'minutes',
        done: () => 'done',
        note: (value) => `${duration(value)} across every project`,
      },
      {
        id: 'deep-work',
        name: 'Deep work',
        hint: 'Two hours without leaving a tab.',
        unit: 'minutes',
        note: (value) => `${duration(value)} without leaving a tab`,
      },
      {
        id: 'marathon',
        name: 'Marathon',
        hint: 'A four-hour single session.',
        unit: 'minutes',
        note: (value) => `a ${durationTight(value)} single session`,
      },
      {
        id: 'full-day',
        name: 'Full day',
        hint: 'Eight hours in one calendar day.',
        unit: 'minutes',
        note: (value) => `${duration(value)} in one day`,
      },
      {
        id: 'sprint',
        name: 'Sprint',
        hint: 'Twenty turns inside one hour.',
        unit: 'count',
        done: (value) => `${value} in an hour`,
        note: (value) => `${value} turns inside one hour`,
      },
      {
        id: 'quick-turn',
        name: 'Quick turn',
        hint: 'Turns done in under 30 seconds.',
        unit: 'count',
        note: (value) => `${value} turns under thirty seconds`,
      },
      {
        id: 'long-haul',
        name: 'Long haul',
        hint: 'Turns that ran past ten minutes.',
        unit: 'count',
        note: (value) => plural(value, 'turn past ten minutes', 'turns past ten minutes'),
      },
    ],
  },
  {
    id: 'code',
    name: 'CODE',
    note: 'what actually landed in the files',
    items: [
      {
        id: 'first-diff',
        name: 'First diff',
        hint: 'One edit accepted.',
        unit: 'count',
        milestone: true,
        note: () => 'the first edit landed',
      },
      {
        id: 'thousand-lines',
        name: 'Thousand lines',
        hint: 'A thousand lines written.',
        unit: 'lines',
        done: () => 'done',
        note: (value) => `${compactNumber(value)} lines written`,
      },
      {
        id: 'ten-thousand',
        name: 'Ten thousand',
        hint: 'Ten thousand lines written.',
        unit: 'lines',
        done: () => 'done',
        note: (value) => `${compactNumber(value)} lines written`,
      },
      {
        id: 'hundred-thousand',
        name: 'Hundred thousand',
        hint: 'Six figures of written lines.',
        unit: 'lines',
        done: () => 'done',
        note: (value) => `${compactNumber(value)} lines written`,
      },
      {
        id: 'big-diff',
        name: 'Big diff',
        hint: 'A 900-line edit accepted whole.',
        unit: 'lines',
        done: (value) => groupThousands(value),
        note: (value) => `${groupThousands(value)} lines accepted whole`,
      },
      {
        id: 'surgeon',
        name: 'Surgeon',
        hint: 'Single-line fixes accepted.',
        unit: 'count',
        note: (value) => `${value} single-line fixes`,
      },
      {
        id: 'refactor',
        name: 'Refactor',
        hint: 'Ten files inside one turn.',
        unit: 'count',
        done: (value) => `${value} files`,
        note: (value) => `${value} files inside one turn`,
      },
      {
        id: 'housekeeper',
        name: 'Housekeeper',
        hint: 'Lines deleted, not added.',
        unit: 'lines',
        note: (value) => `${compactNumber(value)} lines deleted`,
      },
      {
        id: 'test-first',
        name: 'Test first',
        hint: 'Turns that touched a test file.',
        unit: 'count',
        note: (value) => `${value} turns touched a test`,
      },
      {
        id: 'rollback',
        name: 'Rollback',
        hint: 'Edits you turned down at the door.',
        unit: 'count',
        note: (value) => `${value} edits turned down`,
      },
    ],
  },
  {
    id: 'tools',
    name: 'TOOLS',
    note: 'the panel has more of them than one remembers',
    items: [
      {
        id: 'reader',
        name: 'Reader',
        hint: 'Files read by the agent.',
        unit: 'count',
        note: (value) => `${groupThousands(value)} files read`,
      },
      {
        id: 'grep-hound',
        name: 'Grep hound',
        hint: 'Searches across the tree.',
        unit: 'count',
        note: (value) => `${groupThousands(value)} searches`,
      },
      {
        id: 'shell',
        name: 'Shell',
        hint: 'Commands run from a turn.',
        unit: 'count',
        note: (value) => `${groupThousands(value)} commands run`,
      },
      {
        id: 'writer',
        name: 'Writer',
        hint: 'Files created from nothing.',
        unit: 'count',
        note: (value) => `${groupThousands(value)} files created`,
      },
      {
        id: 'todo-keeper',
        name: 'Todo keeper',
        hint: 'Task lists carried to the end.',
        unit: 'count',
        note: (value) => `${value} task lists carried to the end`,
      },
      {
        id: 'planner',
        name: 'Planner',
        hint: 'Plans accepted as written.',
        unit: 'count',
        note: (value) => plural(value, 'plan approved', 'plans approved'),
      },
      {
        id: 'mcp',
        name: 'MCP',
        hint: 'Servers connected at once.',
        unit: 'count',
        done: (value) => `${value} at once`,
        note: (value) => plural(value, 'server connected at once', 'servers connected at once'),
      },
      {
        id: 'plugin-shelf',
        name: 'Plugin shelf',
        hint: 'Plugins installed.',
        unit: 'count',
        note: (value) => plural(value, 'plugin installed', 'plugins installed'),
      },
      {
        id: 'slash',
        name: 'Slash',
        hint: 'Built-in commands used at least once.',
        unit: 'count',
        note: (value) => `${value} built-in commands tried`,
      },
      {
        id: 'attachment',
        name: 'Attachment',
        hint: 'Files and images dropped in.',
        unit: 'count',
        note: (value) => `${value} files and images dropped in`,
      },
    ],
  },
  {
    id: 'around',
    name: 'AROUND THE PANEL',
    note: 'forks, history, the phone, the ceiling',
    items: [
      {
        id: 'forked',
        name: 'Forked',
        hint: 'Your first branch of a reply.',
        unit: 'count',
        milestone: true,
        note: () => 'the first fork of a reply',
      },
      {
        id: 'fork-master',
        name: 'Fork master',
        hint: 'Forks in one conversation tree.',
        unit: 'count',
        note: (value) => `${value} forks in one tree`,
      },
      {
        id: 'deep-tree',
        name: 'Deep tree',
        hint: 'A fork of a fork of a fork.',
        unit: 'count',
        done: (value) => `depth ${value}`,
        note: (value) => `a fork ${value} deep`,
      },
      {
        id: 'quoted',
        name: 'Quoted',
        hint: 'Selections carried into a message.',
        unit: 'count',
        note: (value) => `${value} selections carried in`,
      },
      {
        id: 'historian',
        name: 'Historian',
        hint: 'Reopened a month-old conversation.',
        unit: 'count',
        done: times,
        note: () => 'reopened a month-old thread',
      },
      {
        id: 'remote',
        name: 'Remote',
        hint: 'A phone paired with the panel.',
        unit: 'count',
        milestone: true,
        note: () => 'a phone paired with the panel',
      },
      {
        id: 'on-the-road',
        name: 'On the road',
        hint: 'Turns answered from the phone.',
        unit: 'count',
        note: (value) => `${value} turns from the phone`,
      },
      {
        id: 'watched',
        name: 'Watched',
        hint: 'Someone else looked in on a project.',
        unit: 'count',
        done: times,
        note: () => 'someone looked in on a project',
      },
      {
        id: 'ceiling',
        name: 'Ceiling',
        hint: 'Five-hour window run to the end.',
        unit: 'count',
        done: times,
        note: (value) => `the five-hour window run out ${times(value)}`,
      },
      {
        id: 'thanks',
        name: 'Thanks',
        hint: 'Times you pressed the heart.',
        unit: 'count',
        done: times,
        note: (value) => `the heart pressed ${times(value)}`,
      },
    ],
  },
]

export const ACHIEVEMENTS: AchievementSpec[] = ACHIEVEMENT_GROUPS.flatMap((group) => group.items)

export const ACHIEVEMENT_BY_ID: Record<string, AchievementSpec> = Object.fromEntries(
  ACHIEVEMENTS.map((spec) => [spec.id, spec]),
)

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length

export const TIER_COUNT = 5

/** "I" to "V"; the empty string for locked. */
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V']

/**
 * The figure against its target, in the achievement's own words: "23/30", "2h51/4h", "18k/100k", and
 * once the top is reached, whatever the achievement calls being done.
 */
export const achievementValue = (spec: AchievementSpec, value: number, target: number | undefined): string => {
  if (target === undefined) {
    if (spec.done) return spec.done(value)
    if (spec.milestone) return 'done'
    return figure(spec.unit, value)
  }

  if (spec.unit === 'minutes') return `${durationTight(value)}/${durationTight(target)}`
  return `${figure(spec.unit, value)}/${figure(spec.unit, target)}`
}

const figure = (unit: AchievementUnit, value: number): string =>
  unit === 'minutes' ? duration(value) : unit === 'lines' ? compactNumber(value) : groupThousands(value)
