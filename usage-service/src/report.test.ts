import { describe, expect, it } from 'vitest'
import { readReport } from './report.js'

/**
 * The second half of the promise the plugin makes: whatever arrives, only counts under identifiers are
 * kept. These are the ways a report could try to carry something else, and each is dropped.
 */

const NOW = Date.parse('2026-09-30T12:00:00Z')

const day = (overrides: Record<string, unknown> = {}) => ({
  day: '2026-09-29',
  minutes: 120,
  prompts: 14,
  turns: 13,
  sittings: [45, 60],
  tools: { Read: 30, Edit: 8 },
  models: { Opus: 13 },
  slash: { compact: 1 },
  features: { voice: 2, 'screen:history': 1 },
  ...overrides,
})

const report = (overrides: Record<string, unknown> = {}) => ({
  schema: 1,
  install: 'Rk3pD9xQ2mV7tL1aZ8bN4c',
  env: { plugin: '0.14.0', ide: 'WS', ideVersion: '2026.2', os: 'mac', arch: 'arm64', cli: '2.3.1', lang: 'ru' },
  settings: { remote: true, layout: 'bottom', accounts: 2 },
  days: [day()],
  ...overrides,
})

describe('reading a report', () => {
  it('keeps what a plugin sends', () => {
    const read = readReport(report(), NOW)!

    expect(read.install).toBe('Rk3pD9xQ2mV7tL1aZ8bN4c')
    expect(read.env).toEqual({ plugin: '0.14.0', ide: 'WS', ideVersion: '2026.2', os: 'mac', arch: 'arm64', cli: '2.3.1', lang: 'ru' })
    expect(read.settings).toEqual({ remote: true, layout: 'bottom', accounts: 2 })
    expect(read.days).toHaveLength(1)
    expect(read.days[0]!.counts.minutes).toBe(120)
    expect(read.days[0]!.counts.edits).toBe(0)
    expect(read.days[0]!.sittings).toEqual([45, 60])
    expect(read.days[0]!.maps.features).toEqual({ voice: 2, 'screen:history': 1 })
  })

  it('refuses one without an identifier that could be ours', () => {
    expect(readReport(report({ install: 'short' }), NOW)).toBeNull()
    expect(readReport(report({ install: 'has spaces in it and more' }), NOW)).toBeNull()
    expect(readReport(report({ install: undefined }), NOW)).toBeNull()
    expect(readReport('nonsense', NOW)).toBeNull()
  })

  it('refuses one with no believable day', () => {
    expect(readReport(report({ days: [] }), NOW)).toBeNull()
    expect(readReport(report({ days: [day({ day: '2026-02-30' })] }), NOW)).toBeNull()
    expect(readReport(report({ days: [day({ day: '2025-01-01' })] }), NOW)).toBeNull()
    expect(readReport(report({ days: [day({ day: '2026-10-09' })] }), NOW)).toBeNull()
  })

  it('drops names that are not identifiers - a sentence, a path, a server name with spaces', () => {
    const read = readReport(
      report({
        days: [
          day({
            features: { 'fixed the login bug': 1, '/Users/max/secret': 3, ok_one: 2 },
            tools: { 'mcp__acme corp__deploy': 4, Read: 1 },
          }),
        ],
      }),
      NOW,
    )!

    expect(read.days[0]!.maps.features).toEqual({ ok_one: 2 })
    expect(read.days[0]!.maps.tools).toEqual({ Read: 1 })
  })

  it('drops free text from the environment and the settings', () => {
    const read = readReport(
      report({
        env: { plugin: 'my project name', ide: 'WebStorm', os: 'Darwin 25.6', arch: 'aarch64', lang: 'ru_RU', cli: '' },
        settings: { layout: 'a sentence with spaces', note: 'x'.repeat(40), ok: 'bottom', 'bad key': true },
      }),
      NOW,
    )!

    expect(read.env).toEqual({ plugin: '', ide: '', ideVersion: '', os: 'other', arch: 'other', cli: '', lang: 'en' })
    expect(read.settings).toEqual({ ok: 'bottom' })
  })

  it('holds numbers to small whole counts', () => {
    const read = readReport(report({ days: [day({ minutes: 5000, prompts: -3, turns: 2.7, edits: 'many', sittings: [0, 30, 99999, 'x'] })] }), NOW)!
    const counts = read.days[0]!.counts

    expect(counts.minutes).toBe(1440)
    expect(counts.prompts).toBe(0)
    expect(counts.turns).toBe(2)
    expect(counts.edits).toBe(0)
    expect(read.days[0]!.sittings).toEqual([30, 1440])
  })

  it('takes the later of two entries for the same day', () => {
    const read = readReport(report({ days: [day({ prompts: 1 }), day({ prompts: 9 })] }), NOW)!
    expect(read.days).toHaveLength(1)
    expect(read.days[0]!.counts.prompts).toBe(9)
  })
})
