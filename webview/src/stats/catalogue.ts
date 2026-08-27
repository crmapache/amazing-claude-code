import { compactNumber, duration, durationTight, groupThousands } from './format'

/**
 * The fifty-two achievements as a person reads them: the name, the hint under it, the group it sits in and
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
  /**
   * A milestone: one line to cross rather than five. Drawn as a single bar and as "done" rather than as a
   * tier - a first fork is not a thing that comes in fifths, and five pips promised four steps behind it
   * that do not exist.
   */
  milestone?: boolean
  /**
   * How many lines the ladder has, when it is not five.
   *
   * The lines themselves live on the IDE's side and travel with each achievement (see
   * AchievementState.steps); this is what the harness draws from and what an older IDE's silence falls
   * back to. A test reads the rules file and fails if the two disagree.
   */
  steps?: number
}

export interface AchievementGroup {
  id: string
  name: string
  note: string
  items: AchievementSpec[]
}

/*
 * A name is a name, and a hint is what is measured. Neither says the line it is measured against.
 *
 * The card carries that line already - the figure against its target underneath ("2/30", "7h52/8h") and the
 * tier beside the name - so a hint that repeated it said the same thing twice ("30 active days without a
 * gap" over "2/30"), and a name that was the line itself read as a claim that had not come true: "10 hours"
 * over "7h52/8h" is the fifth line standing above the third. The chains measuring one and the same figure -
 * the hours in the panel, the lines written - are told apart by a title of their own rather than by the
 * number they end at.
 *
 * Where a figure does belong in a hint it says what the measure means rather than what it wants - "Replies
 * before 8:00", "Replies that ran past 10 minutes". Such a figure is written out in full, with a no-break
 * space between the groups of three (see groupThousands in format.ts), because a hint wraps to two lines
 * inside a card and "1" on one line over "000 000" on the next reads as two figures.
 */

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
        hint: 'The longest run of days in a row.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => `${value} days in a row`,
      },
      {
        id: 'month-straight',
        name: 'Month straight',
        hint: 'Thirty days in a row, without missing one.',
        unit: 'days',
        milestone: true,
        note: () => '30 days without a gap',
      },
      {
        id: 'quarter',
        name: 'Quarter',
        hint: 'Days you worked in the panel.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => `${value} days at work`,
      },
      {
        id: 'weekend-crew',
        name: 'Weekend crew',
        hint: 'Saturdays and Sundays you worked.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => plural(value, 'weekend day', 'weekend days'),
      },
      {
        id: 'early-riser',
        name: 'Early riser',
        hint: 'Messages you sent before 8:00.',
        unit: 'count',
        note: (value) => `${value} replies before 8:00`,
      },
      {
        id: 'night-shift',
        name: 'Night shift',
        hint: 'Messages you sent after midnight.',
        unit: 'count',
        note: (value) => `${value} replies after midnight`,
      },
      {
        id: 'full-week',
        name: 'Full week',
        hint: 'Weeks where you worked all seven days.',
        unit: 'count',
        done: (value) => plural(value, 'week', 'weeks'),
        note: (value) => plural(value, 'full week', 'full weeks'),
      },
      {
        id: 'second-wind',
        name: 'Second wind',
        hint: 'Times you came back after a week away.',
        unit: 'count',
        done: times,
        note: () => 'came back after a week off',
      },
      {
        id: 'two-hundred',
        name: 'Sessions',
        hint: 'Conversations you have opened.',
        unit: 'count',
        note: (value) => `${value} sessions started`,
      },
      {
        id: 'a-year-in',
        name: 'A year in',
        hint: 'Days since your very first message here.',
        unit: 'days',
        done: (value) => `${value} days`,
        note: (value) => `${value} days since the first reply`,
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
        id: 'hours-in-panel',
        name: 'Old timer',
        hint: 'Time in the panel, up to 10\u00a0000 hours.',
        unit: 'minutes',
        done: () => 'done',
        note: (value) => `${duration(value)} in the panel`,
      },
      {
        id: 'deep-work',
        name: 'Deep work',
        hint: 'The longest unbroken stretch in one chat.',
        unit: 'minutes',
        note: (value) => `${duration(value)} without leaving a tab`,
      },
      {
        id: 'marathon',
        name: 'Marathon',
        hint: 'The most time spent in a single chat.',
        unit: 'minutes',
        note: (value) => `a ${durationTight(value)} single session`,
      },
      {
        id: 'full-day',
        name: 'Full day',
        hint: 'The most time in the panel in one day.',
        unit: 'minutes',
        note: (value) => `${duration(value)} in one day`,
      },
      {
        id: 'sprint',
        name: 'Sprint',
        hint: 'The most answers finished within one hour.',
        unit: 'count',
        done: (value) => `${value} in an hour`,
        note: (value) => `${value} replies inside one hour`,
      },
      {
        id: 'quick-turn',
        name: 'Quick reply',
        hint: 'Answers that took under 30 seconds.',
        unit: 'count',
        note: (value) => `${value} replies under 30 seconds`,
      },
      {
        id: 'long-haul',
        name: 'Long haul',
        hint: 'Answers that took more than 10 minutes.',
        unit: 'count',
        note: (value) => plural(value, 'reply past 10 minutes', 'replies past 10 minutes'),
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
        hint: 'Your first change to a file.',
        unit: 'count',
        milestone: true,
        note: () => 'the first edit landed',
      },
      {
        id: 'lines-written',
        name: 'Library',
        hint: 'Lines the agent wrote, up to 100\u00a0000\u00a0000.',
        unit: 'lines',
        done: () => 'done',
        note: (value) => `${compactNumber(value)} lines written`,
      },
      {
        id: 'big-diff',
        name: 'Big diff',
        hint: 'The most lines changed in one edit.',
        unit: 'lines',
        done: (value) => groupThousands(value),
        note: (value) => `${groupThousands(value)} lines accepted whole`,
      },
      {
        id: 'surgeon',
        name: 'Surgeon',
        hint: 'Edits that changed one line only.',
        unit: 'count',
        note: (value) => `${value} single-line fixes`,
      },
      {
        id: 'refactor',
        name: 'Refactor',
        hint: 'The most files changed in one answer.',
        unit: 'count',
        done: (value) => `${value} files`,
        note: (value) => `${value} files inside one reply`,
      },
      {
        id: 'housekeeper',
        name: 'Housekeeper',
        hint: 'Lines the agent deleted.',
        unit: 'lines',
        note: (value) => `${compactNumber(value)} lines deleted`,
      },
      {
        id: 'test-first',
        name: 'Test first',
        hint: 'Answers that changed a test file.',
        unit: 'count',
        note: (value) => `${value} replies touched a test`,
      },
      {
        id: 'rollback',
        name: 'Rollback',
        hint: 'Edits you refused when asked for permission.',
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
        hint: 'Searches the agent ran through the files.',
        unit: 'count',
        note: (value) => `${groupThousands(value)} searches`,
      },
      {
        id: 'shell',
        name: 'Shell',
        hint: 'Shell commands the agent ran.',
        unit: 'count',
        note: (value) => `${groupThousands(value)} commands run`,
      },
      {
        id: 'writer',
        name: 'Writer',
        hint: 'New files the agent created.',
        unit: 'count',
        note: (value) => `${groupThousands(value)} files created`,
      },
      {
        id: 'todo-keeper',
        name: 'Todo keeper',
        hint: 'Task lists the agent finished to the last item.',
        unit: 'count',
        note: (value) => `${value} task lists carried to the end`,
      },
      {
        id: 'planner',
        name: 'Planner',
        hint: 'Plans you approved without changes.',
        unit: 'count',
        note: (value) => plural(value, 'plan approved', 'plans approved'),
      },
      {
        id: 'mcp',
        name: 'MCP',
        hint: 'MCP servers connected at the same time.',
        unit: 'count',
        done: (value) => `${value} at once`,
        note: (value) => plural(value, 'server connected at once', 'servers connected at once'),
      },
      {
        id: 'plugin-shelf',
        name: 'Plugin shelf',
        hint: 'Plugins you have installed.',
        unit: 'count',
        note: (value) => plural(value, 'plugin installed', 'plugins installed'),
      },
      {
        id: 'slash',
        name: 'Slash',
        hint: 'Different built-in commands you have tried.',
        unit: 'count',
        note: (value) => `${value} built-in commands tried`,
      },
      {
        id: 'attachment',
        name: 'Attachment',
        hint: 'Files and images you added to a message.',
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
        hint: 'Your first fork of a conversation.',
        unit: 'count',
        milestone: true,
        note: () => 'the first fork of a reply',
      },
      {
        id: 'fork-master',
        name: 'Fork master',
        hint: 'The most forks in one conversation.',
        unit: 'count',
        note: (value) => `${value} forks in one tree`,
      },
      {
        id: 'deep-tree',
        name: 'Deep tree',
        hint: 'The deepest chain of forks.',
        unit: 'count',
        done: (value) => `depth ${value}`,
        note: (value) => `a fork ${value} deep`,
      },
      {
        id: 'quoted',
        name: 'Quoted',
        hint: 'Quotes you carried into a message.',
        unit: 'count',
        note: (value) => `${value} selections carried in`,
      },
      {
        id: 'historian',
        name: 'Historian',
        hint: 'Conversations you reopened a month later.',
        unit: 'count',
        done: times,
        note: () => 'reopened a month-old thread',
      },
      {
        id: 'remote',
        name: 'Remote',
        hint: 'A phone paired with this IDE.',
        unit: 'count',
        milestone: true,
        note: () => 'a phone paired with the panel',
      },
      {
        id: 'on-the-road',
        name: 'On the road',
        hint: 'Messages you sent from a phone.',
        unit: 'count',
        note: (value) => `${value} replies from the phone`,
      },
      {
        id: 'watched',
        name: 'Watched',
        hint: 'Times a phone connected to watch the work.',
        unit: 'count',
        done: times,
        note: () => 'someone looked in on a project',
      },
      {
        id: 'ceiling',
        name: 'Ceiling',
        hint: 'Times the five-hour limit ran out.',
        unit: 'count',
        done: times,
        note: (value) => `the five-hour window run out ${times(value)}`,
      },
      {
        id: 'thanks',
        name: 'Thanks',
        hint: 'A star on GitHub, a review on the plugin page.',
        unit: 'count',
        // Two ways to say it, so two lines - see the ladder of the same name in Achievements.kt.
        steps: 2,
        done: () => 'done',
        note: (value) => (value >= 2 ? 'said thanks both ways' : 'said thanks'),
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
