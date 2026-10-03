import { describe, expect, it } from 'vitest'
import { addDays, overview } from './dashboard.js'
import type { Product } from './products.js'
import { readReport } from './report.js'
import { Store } from './store.js'

/**
 * The figures on the page, worked out of a few machines whose days are known by heart - so that a wrong
 * join or an off-by-one day shows up as a number that is plainly not the one written here.
 */

const NOW = Date.parse('2026-09-30T12:00:00Z')

const save = (
  store: Store,
  install: string,
  days: Record<string, unknown>[],
  settings: Record<string, unknown> = {},
  product?: Product,
) =>
  store.save(
    readReport({ product, install, env: { plugin: '0.14.0', ide: 'WS', os: 'mac', arch: 'arm64', lang: 'en' }, settings, days }, NOW)!,
    NOW,
  )

const A = 'machine-aaaaaaaaaaaaaaaa'
const B = 'machine-bbbbbbbbbbbbbbbb'
const C = 'machine-cccccccccccccccc'

const seeded = (): Store => {
  const store = new Store(':memory:')
  save(store, A, [
    { day: '2026-09-29', minutes: 100, prompts: 10, sittings: [60, 40], features: { voice: 3, search: 1 }, models: { Opus: 8, Sonnet: 2 } },
    { day: '2026-09-30', minutes: 30, prompts: 4, sittings: [30], features: { voice: 1 } },
  ], { remote: true, layout: 'bottom' })
  save(store, B, [{ day: '2026-09-29', minutes: 20, prompts: 2, sittings: [20], features: { search: 2 }, models: { Opus: 2 } }], {
    remote: false,
    layout: 'left',
  })
  // Reported, but nothing happened that day: not an active machine.
  save(store, C, [{ day: '2026-09-28', minutes: 0, prompts: 0 }])
  return store
}

describe('the overview', () => {
  it('counts active machines by day and over windows', () => {
    const result = overview(seeded(), 'acc', 7, NOW)

    // The first report of all is C's, on 28 September: the range is counted from there.
    expect(result.range).toEqual({ days: 7, from: '2026-09-24', to: '2026-09-30', since: '2026-09-28' })
    expect(result.kpi.activeYesterday).toBe(2)
    expect(result.kpi.active7).toBe(2)
    expect(result.kpi.activeInRange).toBe(2)
    expect(result.kpi.installsEver).toBe(3)
    expect(result.series.find((point) => point.day === '2026-09-29')?.active).toBe(2)
    expect(result.series.find((point) => point.day === '2026-09-28')?.active).toBe(0)
    expect(result.series.map((point) => point.day)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
  })

  it('starts the range at the first report rather than drawing the days before it as nobody', () => {
    const result = overview(seeded(), 'acc', 30, NOW)

    expect(result.range.from).toBe('2026-09-01')
    expect(result.range.since).toBe('2026-09-28')
    expect(result.series).toHaveLength(3)
    // Three machine-days over the three days counted, two machines: half the machines on an average day,
    // not the 5% a month of empty days before the first report made of it.
    expect(result.kpi.stickiness).toBeCloseTo(3 / 3 / 2)
  })

  it('keeps the whole range once the first report is older than it', () => {
    const store = seeded()
    save(store, 'machine-dddddddddddddddd', [{ day: '2026-09-02', minutes: 5 }])

    const result = overview(store, 'acc', 7, NOW)

    expect(result.range.since).toBe('2026-09-24')
    expect(result.series).toHaveLength(7)
  })

  it('tells new machines from returning ones, and counts distinct machines over 7 and 30 days', () => {
    const store = new Store(':memory:')
    // A: first seen 1 September, back on the 25th and the 29th. B: first seen on the 29th.
    save(store, A, [{ day: '2026-09-01', minutes: 5 }, { day: '2026-09-25', minutes: 5 }, { day: '2026-09-29', minutes: 5 }])
    save(store, B, [{ day: '2026-09-29', minutes: 5 }, { day: '2026-09-30', minutes: 5 }])

    const result = overview(store, 'acc', 7, NOW)
    const on = (day: string) => result.series.find((point) => point.day === day)!

    expect(on('2026-09-29')).toMatchObject({ active: 2, newActive: 1 })
    expect(on('2026-09-30')).toMatchObject({ active: 1, newActive: 0 })
    // The 7 days up to the 24th reach back to the 18th: nobody. Up to the 30th: both, A once for two days.
    // The 30 days up to the 24th reach A's day on 1 September, from before the range.
    expect(on('2026-09-24')).toMatchObject({ weekly: 0, monthly: 1 })
    expect(on('2026-09-25')).toMatchObject({ weekly: 1, monthly: 1 })
    expect(on('2026-09-30')).toMatchObject({ weekly: 2, monthly: 2 })
  })

  it('sets the headline against the window before it, and only when that window was counted whole', () => {
    const store = new Store(':memory:')
    // Counted since 1 September: the 7 days before the last 7 are there to compare with, the 30 before
    // the last 30 are not.
    save(store, A, [{ day: '2026-09-01', minutes: 5 }, { day: '2026-09-20', minutes: 10, prompts: 4 }, { day: '2026-09-28', minutes: 30, prompts: 2 }])
    save(store, B, [{ day: '2026-09-29', minutes: 20, prompts: 6 }])

    const result = overview(store, 'acc', 7, NOW)

    expect(result.previous.activeYesterday).toBe(1)
    expect(result.previous.active7).toBe(1)
    expect(result.previous.active30).toBeUndefined()
    // The range before this one, 17 to 23 September: A on the 20th.
    expect(result.previous.newInRange).toBe(0)
    expect(result.previous.medianMinutes).toBe(10)
    expect(result.previous.avgPrompts).toBe(4)
    expect(result.previous.stickiness).toBeCloseTo(1 / 7)

    // A month of range reaches back past the first report: nothing to compare it with.
    const month = overview(store, 'acc', 30, NOW)
    expect(month.previous.newInRange).toBeUndefined()
    expect(month.previous.medianMinutes).toBeUndefined()
  })

  it('counts a machine that used a feature once, however many times it used it', () => {
    const result = overview(seeded(), 'acc', 7, NOW)
    const voice = result.features.find((row) => row.id === 'voice')!
    const search = result.features.find((row) => row.id === 'search')!

    expect(voice).toMatchObject({ users: 1, uses: 4, share: 0.5, label: 'Dictate by voice', group: 'voice' })
    expect(search).toMatchObject({ users: 2, uses: 3, share: 1 })
    // Ranked by how many machines, not by how many presses.
    expect(result.features[0]!.id).toBe('search')
  })

  it('shares models by answers', () => {
    const result = overview(seeded(), 'acc', 7, NOW)
    expect(result.models).toEqual([
      { value: 'Opus', count: 10, share: 10 / 12 },
      { value: 'Sonnet', count: 2, share: 2 / 12 },
    ])
  })

  it('bins the sittings', () => {
    const result = overview(seeded(), 'acc', 7, NOW)
    const bins = Object.fromEntries(result.sittingLengths.map((bin) => [bin.value, bin.count]))

    expect(bins['15-30 min']).toBe(2)
    expect(bins['30-60 min']).toBe(2)
    expect(result.kpi.medianSitting).toBe(35)
    expect(result.kpi.avgSittings).toBeCloseTo(4 / 3)
  })

  it('tallies settings among the active machines only', () => {
    const result = overview(seeded(), 'acc', 7, NOW)
    const layout = result.settings.find((setting) => setting.key === 'layout')!

    expect(layout.values.map((value) => [value.value, value.count])).toEqual([
      ['bottom', 1],
      ['left', 1],
    ])
  })

  it('follows a weekly cohort into the weeks after it', () => {
    const store = new Store(':memory:')
    // Two machines first seen in the week of Monday 14 September; one of them came back the week after.
    save(store, A, [{ day: '2026-09-14', minutes: 5 }, { day: '2026-09-22', minutes: 5 }])
    save(store, B, [{ day: '2026-09-15', minutes: 5 }])

    const result = overview(store, 'acc', 30, NOW)
    const cohort = result.cohorts.find((row) => row.week === '2026-09-14')!

    expect(cohort.size).toBe(2)
    expect(cohort.weeks[0]).toBe(0.5)
    expect(cohort.weeks[1]).toBe(0)
    // The week of 5 October has not come yet.
    expect(cohort.weeks[3]).toBeNull()
  })

  it('walks days across a month end', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('tells machines that use a phone from those that only switched remote access on', () => {
    const store = new Store(':memory:')
    // On, paired, and used: a message one day, only approvals another.
    save(store, A, [
      { day: '2026-09-28', minutes: 30, prompts: 10, phonePrompts: 2, phoneActions: 5 },
      { day: '2026-09-29', minutes: 20, prompts: 4, phoneActions: 3 },
    ], { remote: true, pairedDevices: 1 })
    // On and paired, never used in the range.
    save(store, B, [{ day: '2026-09-29', minutes: 40, prompts: 6 }], { remote: true, pairedDevices: 2 })
    // An older plugin: no presses reported, but the phone watched a conversation.
    save(store, C, [{ day: '2026-09-29', minutes: 10, prompts: 0, watched: 1 }], { remote: false, pairedDevices: 0 })

    const remote = overview(store, 'acc', 7, NOW).remote

    expect(remote.switchedOn).toBe(2)
    expect(remote.paired).toBe(2)
    expect(remote.used).toBe(2)
    expect(remote.messageShare).toBeCloseTo(2 / 20)
    expect(remote.actions).toBe(8)
    expect(remote.daysPerUser).toBe(1.5)
    expect(remote.series.find((point) => point.day === '2026-09-29')?.machines).toBe(2)
    expect(remote.series.find((point) => point.day === '2026-09-28')?.machines).toBe(1)
  })

  it("counts each plugin's machines on its own tab only", () => {
    const store = seeded()
    const X = 'codex-xxxxxxxxxxxxxxxx'
    const Y = 'codex-yyyyyyyyyyyyyyyy'
    save(store, X, [
      { day: '2026-09-29', minutes: 300, prompts: 40, sittings: [300], features: { voice: 9, project_trust: 1 }, models: { 'gpt-5.6-sol': 30, o3: 5 }, slash: { review: 1 }, tools: { Read: 7 }, phonePrompts: 4, watched: 1 },
      { day: '2026-09-30', minutes: 10, prompts: 1, sittings: [10] },
    ], { remote: true, pairedDevices: 1, accounts: 2 }, 'acx')
    save(store, Y, [{ day: '2026-09-25', minutes: 15, prompts: 3, sittings: [15], features: { search_ai: 1 } }], { remote: false }, 'acx')

    const codex = overview(store, 'acx', 7, NOW)
    const claude = overview(store, 'acc', 7, NOW)

    // The Codex tab: its two machines, none of Claude Code's three.
    expect(codex.product).toBe('acx')
    expect(codex.kpi).toMatchObject({ activeYesterday: 1, active7: 2, activeInRange: 2, newInRange: 2, installsEver: 2 })
    expect(codex.series.find((point) => point.day === '2026-09-29')).toMatchObject({ active: 1, prompts: 40, fresh: 1 })
    expect(codex.totals.prompts).toBe(44)
    expect(codex.medians.minutes).toBe(15)
    // One machine each, then by uses.
    expect(codex.features.map((row) => [row.id, row.users, row.label])).toEqual([
      ['voice', 1, 'Dictate by voice'],
      ['project_trust', 1, 'Trust a project with its Codex settings'],
      ['search_ai', 1, 'AI search'],
    ])
    expect(codex.models.map((row) => row.value)).toEqual(['gpt-5.6-sol', 'o3'])
    expect(codex.slash.map((row) => row.value)).toEqual(['review'])
    expect(codex.tools.map((row) => row.value)).toEqual(['Read'])
    expect(codex.remote).toMatchObject({ switchedOn: 1, paired: 1, used: 1, actions: 0 })
    expect(codex.settings.find((setting) => setting.key === 'accounts')!.values).toEqual([{ value: '2', count: 1, share: 0.5 }])
    expect(codex.cohorts.reduce((sum, cohort) => sum + cohort.size, 0)).toBe(2)

    // The Claude Code tab: exactly what it showed before the Codex machines arrived.
    expect(claude).toEqual(overview(seeded(), 'acc', 7, NOW))
    expect(claude.kpi.installsEver).toBe(3)
    expect(claude.models.map((row) => row.value)).toEqual(['Opus', 'Sonnet'])
  })
})
