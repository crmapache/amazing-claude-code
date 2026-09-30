import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { readReport, type Report } from './report.js'
import { Store } from './store.js'

const NOW = Date.parse('2026-09-30T12:00:00Z')

const reportOf = (install: string, days: Record<string, unknown>[], settings: Record<string, unknown> = {}): Report =>
  readReport({ install, env: { plugin: '0.14.0', ide: 'WS', os: 'mac', arch: 'arm64', lang: 'en' }, settings, days }, NOW)!

const INSTALL = 'Rk3pD9xQ2mV7tL1aZ8bN4c'

let dirs: string[] = []

const fresh = (): { store: Store; path: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-usage-'))
  dirs.push(dir)
  const path = join(dir, 'usage.sqlite')
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

    expect(store.forget(INSTALL)).toBeGreaterThan(0)

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
})
