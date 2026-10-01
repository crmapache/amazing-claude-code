import { describe, expect, it } from 'vitest'
import { addDays, overview } from './dashboard.js'
import { readReport } from './report.js'
import { Store } from './store.js'

/**
 * The figures on the page, worked out of a few machines whose days are known by heart - so that a wrong
 * join or an off-by-one day shows up as a number that is plainly not the one written here.
 */

const NOW = Date.parse('2026-09-30T12:00:00Z')

const save = (store: Store, install: string, days: Record<string, unknown>[], settings: Record<string, unknown> = {}) =>
  store.save(readReport({ install, env: { plugin: '0.14.0', ide: 'WS', os: 'mac', arch: 'arm64', lang: 'en' }, settings, days }, NOW)!, NOW)

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
    const result = overview(seeded(), 7, NOW)

    expect(result.range).toEqual({ days: 7, from: '2026-09-24', to: '2026-09-30' })
    expect(result.kpi.activeYesterday).toBe(2)
    expect(result.kpi.active7).toBe(2)
    expect(result.kpi.activeInRange).toBe(2)
    expect(result.kpi.installsEver).toBe(3)
    expect(result.series.find((point) => point.day === '2026-09-29')?.active).toBe(2)
    expect(result.series.find((point) => point.day === '2026-09-28')?.active).toBe(0)
    expect(result.series).toHaveLength(7)
  })

  it('counts a machine that used a feature once, however many times it used it', () => {
    const result = overview(seeded(), 7, NOW)
    const voice = result.features.find((row) => row.id === 'voice')!
    const search = result.features.find((row) => row.id === 'search')!

    expect(voice).toMatchObject({ users: 1, uses: 4, share: 0.5, label: 'Dictate by voice', group: 'voice' })
    expect(search).toMatchObject({ users: 2, uses: 3, share: 1 })
    // Ranked by how many machines, not by how many presses.
    expect(result.features[0]!.id).toBe('search')
  })

  it('shares models by answers', () => {
    const result = overview(seeded(), 7, NOW)
    expect(result.models).toEqual([
      { value: 'Opus', count: 10, share: 10 / 12 },
      { value: 'Sonnet', count: 2, share: 2 / 12 },
    ])
  })

  it('bins the sittings', () => {
    const result = overview(seeded(), 7, NOW)
    const bins = Object.fromEntries(result.sittingLengths.map((bin) => [bin.value, bin.count]))

    expect(bins['15-30 min']).toBe(2)
    expect(bins['30-60 min']).toBe(2)
    expect(result.kpi.medianSitting).toBe(35)
    expect(result.kpi.avgSittings).toBeCloseTo(4 / 3)
  })

  it('tallies settings among the active machines only', () => {
    const result = overview(seeded(), 7, NOW)
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

    const result = overview(store, 30, NOW)
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

    const remote = overview(store, 7, NOW).remote

    expect(remote.switchedOn).toBe(2)
    expect(remote.paired).toBe(2)
    expect(remote.used).toBe(2)
    expect(remote.messageShare).toBeCloseTo(2 / 20)
    expect(remote.actions).toBe(8)
    expect(remote.daysPerUser).toBe(1.5)
    expect(remote.series.find((point) => point.day === '2026-09-29')?.machines).toBe(2)
    expect(remote.series.find((point) => point.day === '2026-09-28')?.machines).toBe(1)
  })
})
