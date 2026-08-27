import type { AchievementState } from '../protocol'
import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENT_COUNT,
  ACHIEVEMENT_GROUPS,
  ROMAN,
  TIER_COUNT,
  achievementValue,
  type AchievementSpec,
} from './catalogue'

/**
 * An achievement dressed for the screen: the tier decides how loudly it is drawn, the figure is put
 * into words, and the progress bar knows how far the next line is.
 */
export interface DressedAchievement {
  spec: AchievementSpec
  id: string
  name: string
  hint: string
  /** 0 is locked; the tier reached otherwise, up to [steps]. */
  tier: number
  /** How many lines this one has in all - as many pips as there are steps (see AchievementState.steps). */
  steps: number
  /** "III", "V" - or "locked". Empty for a ladder of one line, which has no tier worth naming. */
  tierMark: string
  earned: boolean
  /** How far along the next line the figure stands: 0 to 1. Full when there is no line left. */
  progress: number
  /** "23/30", "2h51/4h", "done" - the figure against its target. */
  value: string
  /** The raw figure and the next line, for whoever formats them differently. */
  rawValue: number
  target: number | undefined
  /** The line the standing tier was earned for - what it was given for, rather than where the figure is now. */
  line: number | undefined
  /** When each tier was reached, by tier. */
  earnedAt: Record<string, number>
}

export interface DressedGroup {
  id: string
  name: string
  note: string
  items: DressedAchievement[]
}

/** The tier ladder's paint: locked, mist, aquamarine, moon blue, iris, sand - as channel tokens. */
export const TIER_CHANNEL = [
  'var(--acc-ch-mist)',
  'var(--acc-ch-mist)',
  'var(--acc-ch-aqua)',
  'var(--acc-ch-moon)',
  'var(--acc-ch-iris)',
  'var(--acc-ch-sand)',
]

/** The text of a tier's mark, in the same ladder. */
export const TIER_TEXT = [
  'var(--acc-fg-ghost)',
  'var(--acc-fg-mono)',
  'var(--acc-c-aqua-3)',
  'var(--acc-c-moon-3)',
  'var(--acc-c-iris-3)',
  'var(--acc-c-sand-3)',
]

const clampTier = (tier: number): number => Math.max(0, Math.min(TIER_COUNT, Math.round(tier)))

/**
 * Which of the five paints a step wears, given how many steps its achievement has.
 *
 * The paints run from the first tier's to the top one's, and a ladder shorter than five stretches across
 * the same range rather than stopping in the middle of it: the last line of a ladder of two is the top of
 * that ladder, and standing on it should look as done as standing on any other top. Used for the pips and
 * the card's own paint, and for where a card sits in the tier spread - the three would otherwise disagree
 * about the same card.
 */
export const paintOf = (tier: number, steps: number): number =>
  tier <= 0 ? 0 : steps >= TIER_COUNT ? tier : Math.max(1, Math.min(TIER_COUNT, Math.round((tier / steps) * TIER_COUNT)))

/**
 * How far the figure stands between the line already crossed and the next one.
 *
 * From the line crossed rather than from nothing: on a ladder halfway up, a bar filled from zero is all
 * but full at every tier and says nothing about the climb left. Both lines come from the plugin's side
 * with the achievement (see Achievements.kt) - a message used to carry the next one only, which is why
 * this counted from zero. Without a line under it - nothing earned yet - zero is the line.
 */
export const progressOf = (value: number, target: number | undefined, line: number | undefined = 0): number => {
  if (target === undefined || target <= 0) return 1

  const from = line !== undefined && line > 0 && line < target ? line : 0

  return Math.max(0, Math.min(1, (value - from) / (target - from)))
}

export const dress = (state: AchievementState): DressedAchievement | null => {
  const spec = ACHIEVEMENT_BY_ID[state.id]
  if (!spec) return null

  // How many lines this one has: what the IDE says, or five, which is what an older one meant by saying
  // nothing. A milestone has one line whatever arrives - being a milestone is what makes it one.
  const steps = spec.milestone
    ? 1
    : Math.max(1, Math.min(TIER_COUNT, Math.round(state.steps ?? spec.steps ?? TIER_COUNT)))
  const tier = Math.min(clampTier(state.tier), steps)
  const earned = tier > 0
  const target = state.target === undefined || state.target <= 0 ? undefined : state.target
  const line = state.line === undefined || state.line <= 0 ? undefined : state.line

  return {
    spec,
    id: spec.id,
    name: spec.name,
    hint: spec.hint,
    tier,
    steps,
    // A ladder of a single line wears no tier mark: "I of I" says nothing the full bar does not, and the
    // figure below it says "done" once it is crossed.
    tierMark: !earned ? 'locked' : steps === 1 ? '' : (ROMAN[tier] ?? ''),
    earned,
    progress: progressOf(state.value, target, line),
    value: achievementValue(spec, state.value, target),
    rawValue: state.value,
    target,
    line,
    earnedAt: state.earned ?? {},
  }
}

/** Every achievement in its group, in the catalogue's order - unknown ids from a newer IDE are dropped. */
export const dressAll = (states: AchievementState[]): DressedGroup[] => {
  const byId = new Map<string, DressedAchievement>()
  for (const state of states) {
    const dressed = dress(state)
    if (dressed) byId.set(dressed.id, dressed)
  }

  return ACHIEVEMENT_GROUPS.map((group) => ({
    id: group.id,
    name: group.name,
    note: group.note,
    items: group.items.map((spec) => byId.get(spec.id) ?? locked(spec)),
  }))
}

/** An achievement the IDE said nothing about - drawn locked, with nothing behind it. */
const locked = (spec: AchievementSpec): DressedAchievement => ({
  spec,
  id: spec.id,
  name: spec.name,
  hint: spec.hint,
  tier: 0,
  steps: spec.milestone ? 1 : (spec.steps ?? TIER_COUNT),
  tierMark: 'locked',
  earned: false,
  progress: 0,
  value: '',
  rawValue: 0,
  target: undefined,
  line: undefined,
  earnedAt: {},
})

export type AchievementFilter = 'all' | 'earned' | 'progress'

/**
 * The groups with only the achievements the filter keeps - and without the groups that come out empty.
 *
 * "In progress" is what has moved and is not done: a figure still at zero has not been started, and a
 * list of everything one has not begun is the "All" list with the earned ones taken out, not progress.
 */
export const filterGroups = (groups: DressedGroup[], filter: AchievementFilter): DressedGroup[] =>
  groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        filter === 'all' ? true : filter === 'earned' ? item.earned : item.rawValue > 0 && item.tier < item.steps,
      ),
    }))
    .filter((group) => group.items.length > 0)

export interface AchievementSummary {
  /** Achievements with at least one line crossed. */
  earned: number
  /**
   * Achievements with every line crossed - the count the screen leads with.
   *
   * "Earned" counts a card that has moved at all, which on a screen of ladders is nearly all of them
   * within a month and says less every week; what is worth knowing is how many are finished.
   */
  completed: number
  total: number
  /** Steps climbed, summed over every achievement, against however many each of them has. */
  tiers: number
  tiersTotal: number
  /** How many achievements stand on each tier: index 1 to 5; index 0 is the locked ones. */
  spread: number[]
}

export const summarize = (groups: DressedGroup[]): AchievementSummary => {
  const items = groups.flatMap((group) => group.items)
  const spread = Array.from({ length: TIER_COUNT + 1 }, () => 0)
  let tiers = 0
  let tiersTotal = 0

  for (const item of items) {
    // Where the card sits is where it looks: a ladder of two, finished, is a card in the top tier's paint
    // and belongs in that column rather than in the second (see paintOf).
    const column = paintOf(item.tier, item.steps)
    spread[column] = (spread[column] ?? 0) + 1
    // Steps rather than five apiece: a milestone is one of one and the ladder of thanks is two of two,
    // and counting every card as five put steps into the total that nobody can climb.
    tiers += item.tier
    tiersTotal += item.steps
  }

  return {
    earned: items.filter((item) => item.earned).length,
    completed: items.filter((item) => item.tier >= item.steps).length,
    total: ACHIEVEMENT_COUNT,
    tiers,
    tiersTotal,
    spread,
  }
}

/** One tier of one achievement, earned at a moment - what "earned lately" lists. */
export interface EarnedTier {
  item: DressedAchievement
  tier: number
  at: number
  /**
   * What it was earned for, in the achievement's words - the line the tier stands on rather than the
   * figure as it stands now. The two are not the same thing: a third tier earned at six hours read as
   * "7h 23m" says nothing about what was crossed to earn it (see Achievements.Definition.lineOf).
   */
  note: string
}

/**
 * The last tiers earned, newest first - one per achievement, its latest. An achievement that climbed
 * two tiers in a week is one thing that happened, not two cards in a row of four.
 */
export const recentlyEarned = (groups: DressedGroup[], limit = 4): EarnedTier[] => {
  const out: EarnedTier[] = []

  for (const item of groups.flatMap((group) => group.items)) {
    let latest: { tier: number; at: number } | null = null
    for (const [key, at] of Object.entries(item.earnedAt)) {
      const tier = Number(key)
      if (!Number.isFinite(tier) || tier < 1 || tier > TIER_COUNT) continue
      if (latest === null || at > latest.at || (at === latest.at && tier > latest.tier)) latest = { tier, at }
    }
    if (latest) out.push({ item, tier: latest.tier, at: latest.at, note: item.spec.note(item.line ?? item.rawValue) })
  }

  return out.sort((a, b) => b.at - a.at || b.tier - a.tier).slice(0, limit)
}

export interface ClosestAchievement {
  item: DressedAchievement
  /** "7 to go", "18m to go" - what is left to the next line, in the achievement's unit. */
  remaining: string
  /** "23 of 30 days" - where the figure stands against the line. */
  standing: string
}

/**
 * The achievement nearest its next line - the one worth reaching for. By how far along it is rather
 * than by how little is left: ten lines short of a hundred thousand is not close, while two days short
 * of thirty is.
 */
export const closest = (groups: DressedGroup[]): ClosestAchievement | null => {
  let best: DressedAchievement | null = null

  for (const item of groups.flatMap((group) => group.items)) {
    if (item.target === undefined) continue
    if (item.rawValue <= 0) continue
    if (best === null || item.progress > best.progress) best = item
  }

  if (best === null || best.target === undefined) return null

  const left = Math.max(0, best.target - best.rawValue)
  return {
    item: best,
    remaining: `${figureOf(best, left)} to go`,
    standing: `${figureOf(best, best.rawValue)} of ${figureOf(best, best.target)} ${unitWord(best)}`.trim(),
  }
}

const figureOf = (item: DressedAchievement, value: number): string => {
  if (item.spec.unit === 'minutes') {
    const hours = Math.floor(value / 60)
    const rest = Math.round(value % 60)
    if (hours === 0) return `${rest}m`
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
  }
  return String(Math.round(value))
}

const unitWord = (item: DressedAchievement): string => {
  if (item.spec.unit === 'days') return 'days'
  if (item.spec.unit === 'lines') return 'lines'
  return ''
}
