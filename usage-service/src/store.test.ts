import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { overview } from './dashboard.js'
import type { Product } from './products.js'
import { readReport, type Report } from './report.js'
import { Store } from './store.js'

const NOW = Date.parse('2026-09-30T12:00:00Z')

const reportOf = (
  install: string,
  days: Record<string, unknown>[],
  settings: Record<string, unknown> = {},
  product?: Product,
): Report =>
  readReport({ product, install, env: { plugin: '0.14.0', ide: 'WS', os: 'mac', arch: 'arm64', lang: 'en' }, settings, days }, NOW)!

const INSTALL = 'Rk3pD9xQ2mV7tL1aZ8bN4c'

const CODEX_INSTALL = 'Cx7pQ2mV9tL4aZ1bN8kD3r'

/** A file as the service before the second plugin left it: no product anywhere, and two indexes. */
const SCHEMA_0_1 = `
CREATE TABLE installs (
  id TEXT PRIMARY KEY, first_day TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  plugin TEXT NOT NULL DEFAULT '', ide TEXT NOT NULL DEFAULT '', ide_version TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '', arch TEXT NOT NULL DEFAULT '', cli TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT '', settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE days (
  install TEXT NOT NULL, day TEXT NOT NULL, plugin TEXT NOT NULL DEFAULT '', ide TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '', sittings TEXT NOT NULL DEFAULT '[]', updated INTEGER NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0, prompts INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (install, day)
) WITHOUT ROWID;
CREATE INDEX days_by_day ON days(day);
CREATE TABLE counts (
  install TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, value INTEGER NOT NULL,
  PRIMARY KEY (install, day, kind, name)
) WITHOUT ROWID;
CREATE INDEX counts_by_day ON counts(day, kind);
`

let dirs: string[] = []

/** Where a database file may go, in a directory of its own that the test cleans up after. */
const emptyPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-usage-'))
  dirs.push(dir)
  return join(dir, 'usage.sqlite')
}

const fresh = (): { store: Store; path: string } => {
  const path = emptyPath()
  return { store: new Store(path), path }
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
})

describe('the store', () => {
  it('takes the larger of every figure when the same day comes again', () => {
    const { store } = fresh()

    store.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 90, prompts: 10, features: { voice: 3 }, sittings: [30, 40] }]), NOW)
    // A second IDE on the same machine, a step behind on some figures and ahead on others.
    store.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 120, prompts: 6, features: { voice: 1, search: 2 }, sittings: [100] }]), NOW)

    const row = store.get<{ minutes: number; prompts: number; sittings: string }>(
      'SELECT minutes, prompts, sittings FROM days WHERE install = ?',
      INSTALL,
    )!
    expect(row.minutes).toBe(120)
    expect(row.prompts).toBe(10)
    // The list of sittings belongs to the report that saw more of the day.
    expect(JSON.parse(row.sittings)).toEqual([100])

    const features = store.all<{ name: string; value: number }>(
      "SELECT name, value FROM counts WHERE kind = 'features' ORDER BY name",
    )
    expect(features).toEqual([
      { name: 'search', value: 2 },
      { name: 'voice', value: 3 },
    ])
  })

  it('remembers the earliest day an identifier reported as its first', () => {
    const { store } = fresh()
    store.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 1 }]), NOW)
    store.save(reportOf(INSTALL, [{ day: '2026-09-27', minutes: 1 }]), NOW)
    store.save(reportOf(INSTALL, [{ day: '2026-09-30', minutes: 1 }]), NOW)

    expect(store.get<{ first_day: string }>('SELECT first_day FROM installs')!.first_day).toBe('2026-09-27')
  })

  it('forgets everything under an identifier and nothing under another', () => {
    const { store } = fresh()
    store.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 5, features: { voice: 1 } }]), NOW)
    store.save(reportOf('another-machine-id-000', [{ day: '2026-09-29', minutes: 5, features: { voice: 1 } }]), NOW)

    expect(store.forget('acc', INSTALL)).toBeGreaterThan(0)

    expect(store.all('SELECT * FROM installs WHERE id = ?', INSTALL)).toHaveLength(0)
    expect(store.all('SELECT * FROM days WHERE install = ?', INSTALL)).toHaveLength(0)
    expect(store.all('SELECT * FROM counts WHERE install = ?', INSTALL)).toHaveLength(0)
    expect(store.all('SELECT * FROM installs')).toHaveLength(1)
  })

  it('prunes days past the retention', () => {
    const { store } = fresh()
    store.save(reportOf(INSTALL, [{ day: '2026-09-20', minutes: 5 }, { day: '2026-09-29', minutes: 5 }]), NOW)

    store.prune(NOW, 5)

    expect(store.all<{ day: string }>('SELECT day FROM days').map((row) => row.day)).toEqual(['2026-09-29'])
  })

  it('adds the column of a count that did not exist when the file was made', () => {
    const { store, path } = fresh()
    store.close()

    // A file from an older service: the days table without one of today's counts.
    const old = new DatabaseSync(path)
    old.exec('ALTER TABLE days DROP COLUMN longest_conversation')
    old.close()

    const reopened = new Store(path)
    reopened.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 5, longestConversation: 42 }]), NOW)
    expect(reopened.get<{ n: number }>('SELECT longest_conversation AS n FROM days')!.n).toBe(42)
    reopened.close()
  })

  it('writes the plugin a report came from into every row of it', () => {
    const { store } = fresh()
    store.save(reportOf(CODEX_INSTALL, [{ day: '2026-09-29', minutes: 5, features: { voice: 1 }, models: { o3: 2 } }], {}, 'acx'), NOW)
    store.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 5, features: { voice: 1 } }]), NOW)

    for (const table of ['installs', 'days', 'counts']) {
      const products = store.all<{ product: string }>(`SELECT DISTINCT product FROM ${table} ORDER BY product`)
      expect(products.map((row) => row.product), table).toEqual(['acc', 'acx'])
    }
    expect(store.get<{ product: string }>('SELECT product FROM installs WHERE id = ?', CODEX_INSTALL)!.product).toBe('acx')
  })

  it("forgets an identifier only within the plugin that asks, never the other's", () => {
    const { store } = fresh()
    store.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 5, features: { voice: 1 } }]), NOW)
    store.save(reportOf(CODEX_INSTALL, [{ day: '2026-09-29', minutes: 5, features: { voice: 1 } }], {}, 'acx'), NOW)

    // Each plugin asking about the other's identifier: nothing goes.
    expect(store.forget('acx', INSTALL)).toBe(0)
    expect(store.forget('acc', CODEX_INSTALL)).toBe(0)
    expect(store.all('SELECT * FROM days')).toHaveLength(2)

    expect(store.forget('acx', CODEX_INSTALL)).toBeGreaterThan(0)
    expect(store.all('SELECT * FROM installs WHERE id = ?', CODEX_INSTALL)).toHaveLength(0)
    expect(store.all('SELECT * FROM counts WHERE install = ?', CODEX_INSTALL)).toHaveLength(0)
    expect(store.all('SELECT * FROM days WHERE install = ?', INSTALL)).toHaveLength(1)
    expect(store.all('SELECT * FROM counts WHERE install = ?', INSTALL)).toHaveLength(1)
  })

  it("refuses a report under an identifier that is the other plugin's, and changes nothing", () => {
    const { store } = fresh()
    expect(store.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 5, prompts: 2 }]), NOW)).toBe(true)

    expect(store.save(reportOf(INSTALL, [{ day: '2026-09-29', minutes: 50, prompts: 20 }, { day: '2026-09-30', minutes: 1 }], {}, 'acx'), NOW)).toBe(false)

    expect(store.get<{ product: string }>('SELECT product FROM installs')!.product).toBe('acc')
    expect(store.all<{ day: string; minutes: number; product: string }>('SELECT day, minutes, product FROM days')).toEqual([
      { day: '2026-09-29', minutes: 5, product: 'acc' },
    ])
    // Its own plugin goes on as before.
    expect(store.save(reportOf(INSTALL, [{ day: '2026-09-30', minutes: 1 }]), NOW)).toBe(true)
  })

  it('brings a file from before the second plugin up to date, keeping every row as ACC\'s', () => {
    const path = emptyPath()
    const old = new DatabaseSync(path)
    old.exec(SCHEMA_0_1)
    old.exec(`INSERT INTO installs (id, first_day, first_seen, last_seen, plugin, settings)
              VALUES ('${INSTALL}', '2026-09-28', 1, 1, '0.13.16', '{"remote":true}')`)
    old.exec(`INSERT INTO days (install, day, updated, minutes, prompts, turns) VALUES ('${INSTALL}', '2026-09-29', 1, 40, 6, 5)`)
    old.exec(`INSERT INTO counts (install, day, kind, name, value) VALUES ('${INSTALL}', '2026-09-29', 'features', 'voice', 2)`)
    old.close()

    // Twice: the second start finds nothing left to do, and must not fail or change anything.
    new Store(path).close()
    const store = new Store(path)

    for (const table of ['installs', 'days', 'counts']) {
      const columns = store.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name)
      expect(columns.filter((name) => name === 'product'), table).toEqual(['product'])
      expect(store.all<{ product: string }>(`SELECT product FROM ${table}`).map((row) => row.product), table).toEqual(['acc'])
    }
    const indexes = store.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name").map((row) => row.name)
    expect(indexes).toEqual(expect.arrayContaining(['counts_by_day', 'counts_by_product', 'days_by_day', 'days_by_product', 'installs_by_product']))

    // Nothing lost: the old figures are where they were, on ACC's tab, and the Codex tab is empty.
    const row = store.get<Record<string, unknown>>('SELECT minutes, prompts, turns, longest_conversation FROM days')!
    expect(row).toEqual({ minutes: 40, prompts: 6, turns: 5, longest_conversation: 0 })
    expect(store.get<{ settings: string }>('SELECT settings FROM installs')!.settings).toBe('{"remote":true}')
    expect(overview(store, 'acc', 7, NOW).kpi.activeInRange).toBe(1)
    expect(overview(store, 'acc', 7, NOW).features[0]).toMatchObject({ id: 'voice', users: 1, uses: 2 })
    expect(overview(store, 'acx', 7, NOW).kpi.installsEver).toBe(0)

    // And it takes both plugins' reports from here on.
    expect(store.save(reportOf(INSTALL, [{ day: '2026-09-30', minutes: 5 }]), NOW)).toBe(true)
    expect(store.save(reportOf(CODEX_INSTALL, [{ day: '2026-09-30', minutes: 5 }], {}, 'acx'), NOW)).toBe(true)
    expect(overview(store, 'acx', 7, NOW).kpi.installsEver).toBe(1)
    store.close()
  })
})
