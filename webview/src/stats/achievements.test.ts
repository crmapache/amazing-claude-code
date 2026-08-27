import { describe, expect, it } from 'vitest'
import type { AchievementState } from '../protocol'
import { closest, dress, dressAll, filterGroups, recentlyEarned, summarize } from './achievements'
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT, ACHIEVEMENT_GROUPS, achievementValue } from './catalogue'

const state = (
  id: string,
  tier: number,
  value: number,
  target?: number,
  earned: Record<string, number> = {},
  steps?: number,
): AchievementState => ({
  id,
  tier,
  value,
  ...(steps === undefined ? {} : { steps }),
  ...(target === undefined ? {} : { target }),
  earned,
})

describe('the catalogue', () => {
  it('holds forty-six achievements in five groups, every id unique', () => {
    expect(ACHIEVEMENT_COUNT).toBe(46)
    expect(ACHIEVEMENT_GROUPS.map((group) => group.items.length)).toEqual([11, 7, 8, 10, 10])
    expect(new Set(ACHIEVEMENTS.map((spec) => spec.id)).size).toBe(46)
  })

  it('writes a figure against its target in the unit it is measured in', () => {
    const steady = ACHIEVEMENTS.find((spec) => spec.id === 'steady-hand')!
    expect(achievementValue(steady, 23, 30)).toBe('23/30')
    expect(achievementValue(steady, 60, undefined)).toBe('60 days')

    const marathon = ACHIEVEMENTS.find((spec) => spec.id === 'marathon')!
    expect(achievementValue(marathon, 171, 240)).toBe('2.9h/4h')

    const lines = ACHIEVEMENTS.find((spec) => spec.id === 'lines-written')!
    expect(achievementValue(lines, 18_430, 100_000)).toBe('18.4k/100k')
    expect(achievementValue(lines, 100_000, undefined)).toBe('done')

    const forked = ACHIEVEMENTS.find((spec) => spec.id === 'forked')!
    expect(achievementValue(forked, 1, undefined)).toBe('done')
    expect(achievementValue(forked, 0, 1)).toBe('0/1')
  })
})

describe('dressing', () => {
  it('reads the tier off the state and puts the figure into words', () => {
    const dressed = dress(state('big-diff', 4, 918, 900))!
    expect(dressed.tierMark).toBe('IV')
    expect(dressed.earned).toBe(true)
    expect(dressed.value).toBe('918/900')
  })

  it('draws a milestone with no tier mark at all, and "done" for its figure', () => {
    const reached = dress(state('remote', 5, 1))!
    expect(reached.tierMark).toBe('')
    expect(reached.value).toBe('done')
    expect(dress(state('remote', 0, 0, 1))!.tierMark).toBe('locked')
  })

  it('gives a ladder of two lines two steps, and stops the tier at the last of them', () => {
    // Two ways to say thanks, so two lines - and a card that draws two pips rather than five.
    const both = dress(state('thanks', 2, 2, undefined, {}, 2))!
    expect(both.steps).toBe(2)
    expect(both.tierMark).toBe('II')
    expect(both.value).toBe('done')

    const half = dress(state('thanks', 1, 1, 2, {}, 2))!
    expect(half.steps).toBe(2)
    expect(half.tierMark).toBe('I')
    expect(half.value).toBe('1/2')
  })

  it('takes the step count from the catalogue when an older IDE does not send one', () => {
    expect(dress(state('thanks', 1, 1, 2))!.steps).toBe(2)
    expect(dress(state('reader', 2, 300, 1000))!.steps).toBe(5)
  })

  it('drops an id it does not know - a newer IDE may have more', () => {
    expect(dress(state('time-travel', 5, 1))).toBeNull()
  })

  it('lists every achievement of the catalogue, locked when the IDE said nothing', () => {
    const groups = dressAll([state('reader', 2, 300, 1000)])
    const all = groups.flatMap((group) => group.items)
    expect(all).toHaveLength(46)
    expect(all.find((item) => item.id === 'reader')!.tier).toBe(2)
    expect(all.find((item) => item.id === 'shell')!.tierMark).toBe('locked')
  })
})

describe('the summary', () => {
  it('counts the earned, the tiers and the spread', () => {
    const groups = dressAll([state('reader', 2, 300, 1000), state('forked', 5, 1), state('shell', 0, 3, 25)])
    const summary = summarize(groups)
    expect(summary.earned).toBe(2)
    // Finished, not merely started: forked is a milestone and its one line is crossed; reader stands on
    // the second of five.
    expect(summary.completed).toBe(1)
    expect(summary.total).toBe(46)
    // As many steps as each has: reader's two, forked's one, nothing for shell - against 41 ladders of
    // five, four milestones of one and the two lines of thanks.
    expect(summary.tiers).toBe(3)
    expect(summary.tiersTotal).toBe(211)
    expect(summary.spread[0]).toBe(44)
    expect(summary.spread[2]).toBe(1)
    expect(summary.spread[5]).toBe(1)
  })
})

describe('the filters', () => {
  it('keeps the earned, or the ones begun and not done, and drops empty groups', () => {
    const groups = dressAll([state('reader', 2, 300, 1000), state('forked', 5, 1), state('shell', 0, 3, 25)])
    const earned = filterGroups(groups, 'earned').flatMap((group) => group.items)
    expect(earned.map((item) => item.id)).toEqual(['reader', 'forked'])

    // Not the finished fork, and not the forty-eight that have not moved at all: only what is under way.
    const inProgress = filterGroups(groups, 'progress').flatMap((group) => group.items)
    expect(inProgress.map((item) => item.id)).toEqual(['reader', 'shell'])
  })
})

describe('earned lately', () => {
  it('lists the newest first, one card per achievement, in its own words', () => {
    const groups = dressAll([
      state('big-diff', 2, 300, 500, { '1': 100, '2': 400 }),
      state('remote', 5, 1, undefined, { '5': 300 }),
      state('reader', 3, 1200, 2500, { '1': 50, '2': 200, '3': 500 }),
      state('shell', 1, 30, 100, { '1': 20 }),
      state('writer', 1, 6, 25, { '1': 10 }),
    ])
    const recent = recentlyEarned(groups)

    expect(recent.map((entry) => `${entry.item.id}:${entry.tier}`)).toEqual(['reader:3', 'big-diff:2', 'remote:5', 'shell:1'])
    expect(recent[0]!.note).toBe('1 200 files read')
    expect(recent[2]!.note).toBe('a phone paired with the panel')
  })
})

describe('the closest one', () => {
  it('picks the achievement furthest along its next line, and says what is left', () => {
    const groups = dressAll([
      state('steady-hand', 3, 23, 30),
      state('lines-written', 0, 18_430, 100_000),
      state('marathon', 2, 100, 120),
    ])
    const nearest = closest(groups)!
    expect(nearest.item.id).toBe('marathon')
    expect(nearest.remaining).toBe('20m to go')
    expect(nearest.standing).toBe('1h 40m of 2h')
  })

  it('has nothing to say before anything has moved', () => {
    expect(closest(dressAll([state('steady-hand', 0, 0, 3)]))).toBeNull()
  })
})
