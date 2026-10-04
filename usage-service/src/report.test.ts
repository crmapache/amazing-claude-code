import { describe, expect, it } from 'vitest'
import { productOf, readReport } from './report.js'

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

    expect(read.product).toBe('acc')
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
            features: { 'fixed the login bug': 1, '/Users/max/secret': 3, voice: 2 },
            tools: { 'mcp__acme corp__deploy': 4, Read: 1 },
          }),
        ],
      }),
      NOW,
    )!

    expect(read.days[0]!.maps.features).toEqual({ voice: 2 })
    expect(read.days[0]!.maps.tools).toEqual({ Read: 1 })
  })

  it('drops free text from the environment and the settings', () => {
    const read = readReport(
      report({
        env: { plugin: 'my project name', ide: 'WebStorm', os: 'Darwin 25.6', arch: 'aarch64', lang: 'ru_RU', cli: '' },
        settings: { layout: 'a sentence with spaces', theme: 'x'.repeat(40), sendKey: 'enter', 'bad key': true },
      }),
      NOW,
    )!

    expect(read.env).toEqual({ plugin: '', ide: '', ideVersion: '', os: 'other', arch: 'other', cli: '', lang: 'en' })
    expect(read.settings).toEqual({ sendKey: 'enter' })
  })

  it('drops a setting its plugin does not state', () => {
    const read = readReport(report({ settings: { remote: true, projectName: 'acme', constructor: 'x', accounts: 3 } }), NOW)!
    expect(read.settings).toEqual({ remote: true, accounts: 3 })
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

describe('the plugin a report comes from', () => {
  it("is ACC's when the report does not say - as every version published before the fork sends it", () => {
    expect(readReport(report(), NOW)!.product).toBe('acc')
    expect(productOf(report())).toBe('acc')
  })

  it('is the one the report names', () => {
    expect(readReport(report({ product: 'acc' }), NOW)!.product).toBe('acc')
    expect(readReport(report({ product: 'acx' }), NOW)!.product).toBe('acx')
  })

  it('refuses the whole report when it names a plugin this service does not count', () => {
    for (const product of ['acz', 'ACX', '', null, 7]) {
      expect(productOf(report({ product })), String(product)).toBeNull()
      expect(readReport(report({ product }), NOW), String(product)).toBeNull()
    }
  })

  it("keeps the Codex CLI's version as it is sent", () => {
    const read = readReport(report({ product: 'acx', env: { plugin: '0.1.0', ide: 'IU', cli: '0.152.0' } }), NOW)!
    expect(read.env.cli).toBe('0.152.0')
  })
})

describe("holding a day's names to its plugin's lists", () => {
  const maps = (product: string, overrides: Record<string, unknown>) => readReport(report({ product, days: [day(overrides)] }), NOW)!.days[0]!.maps

  it("keeps only the features of the plugin that sent them", () => {
    const features = {
      voice: 1,
      stop_task: 2,
      design_login: 1,
      project_trust: 3,
      'screen:claudeConfig': 1,
      'screen:codexConfig': 1,
      'screen:newChatContext': 2,
      'setting:claude_config': 1,
      'setting:codex_config': 1,
      'setting:project_trust': 1,
      something_new: 5,
    }

    expect(maps('acc', { features }).features).toEqual({ voice: 1, stop_task: 2, design_login: 1, 'screen:claudeConfig': 1, 'setting:claude_config': 1 })
    expect(maps('acx', { features }).features).toEqual({
      voice: 1,
      project_trust: 3,
      'screen:codexConfig': 1,
      'screen:newChatContext': 2,
      'setting:codex_config': 1,
      'setting:project_trust': 1,
    })
  })

  it('folds commands of their own into custom, adding them up', () => {
    const slash = { compact: 1, review: 1, cost: 1, 'my-skill': 1, 'prompts:fix-the-login': 1, side: 1 }

    expect(maps('acc', { slash }).slash).toEqual({ compact: 1, review: 1, cost: 1, custom: 3 })
    expect(maps('acx', { slash }).slash).toEqual({ compact: 1, review: 1, side: 1, custom: 3 })
  })

  it("folds a model outside the plugin's catalogue into Other", () => {
    const models = { Opus: 4, 'claude-opus-5': 2, 'gpt-5.6-sol': 3, o3: 1, 'Acme-Internal': 5, Other: 1 }

    expect(maps('acc', { models }).models).toEqual({ Opus: 4, Other: 12 })
    expect(maps('acx', { models }).models).toEqual({ 'gpt-5.6-sol': 3, o3: 1, Other: 12 })
  })

  it('folds every MCP tool into one, whichever plugin sent it', () => {
    const tools = { Read: 5, MCP: 1, mcp__acme__deploy: 2, mcp__github__create_issue: 1, read_file: 4 }

    for (const product of ['acc', 'acx']) {
      expect(maps(product, { tools }).tools, product).toEqual({ Read: 5, MCP: 4, other: 4 })
    }
  })
})
