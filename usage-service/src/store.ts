import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { DEFAULT_PRODUCT, type Product } from './products.js'
import { COUNT_KINDS, DAY_FIELDS, type DayReport, type Report } from './report.js'

/**
 * Where the reports are kept: one SQLite file, three tables.
 *
 * - `installs` - one row per random identifier: the plugin it belongs to, the day it was first seen, the
 *   versions and settings it reported last. Nothing that could say whose it is: no address, no country,
 *   no time zone.
 * - `days` - one row per identifier per calendar day, the fixed counts of that day.
 * - `counts` - the named counts of a day: tools, models, commands, features.
 *
 * Every table carries the plugin (see products.ts), so the dashboard reads one plugin's figures straight
 * off the table it needs, without a join back to `installs` for every figure. An identifier belongs to one
 * plugin only: each plugin makes its own, and the first report under one decides whose it is. A report from
 * the other plugin under the same identifier is refused rather than kept (see [save]) - kept, its days
 * would land among the first plugin's figures, or the first plugin's past would move over to the second.
 *
 * A day is written over rather than added to. The plugin sends the running totals of a day every few
 * hours and once more after it ends, and two IDEs on one machine may both send it; each figure only ever
 * grows within a day, so of two reports of the same day the larger figure is simply the better informed
 * one (the same rule the plugin's own book merges by - see DayRecord.mergedWith). That makes a repeated
 * or late report harmless: it cannot count anything twice.
 *
 * SQLite from Node itself rather than a driver: nothing to compile inside an Alpine image, and a service
 * that takes a few thousand small writes a day has no use for a database server beside it.
 */
export class Store {
  private readonly db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec(SCHEMA)
    this.addMissingColumns()
  }

  /**
   * The columns added after the file was made, added to it. CREATE TABLE IF NOT EXISTS leaves an existing
   * table alone, so without this the first report carrying a new count would fail on a column that is
   * not there - and every report after it, from every plugin on the new version.
   *
   * Two kinds: a count added to DAY_FIELDS, and the plugin each row belongs to, which came with the second
   * plugin. Every row in a file from before then is ACC's - there was no other - and that is the default
   * the column is added with, so the figures already kept stay where they were, on ACC's tab, untouched.
   *
   * Only ever adds: nothing is rebuilt, copied or dropped, and a column already there is left alone, so a
   * start that runs it twice, or a start after one that stopped half-way, finds nothing more to do. All
   * of it in one transaction, so a file is either as it was or wholly brought up to date.
   */
  private addMissingColumns(): void {
    const wanted: { table: string; name: string; type: string }[] = [
      ...(['installs', 'days', 'counts'] as const).map((table) => ({ table, name: 'product', type: PRODUCT_COLUMN })),
      ...DAY_FIELDS.map((field) => ({ table: 'days', name: column(field), type: 'INTEGER NOT NULL DEFAULT 0' })),
    ]

    this.transaction(() => {
      const present = new Map<string, Set<string>>()
      for (const { table, name, type } of wanted) {
        const columns =
          present.get(table) ?? new Set(this.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name))
        present.set(table, columns)
        if (columns.has(name)) continue
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
        columns.add(name)
      }
      // After the columns, not in SCHEMA: on an older file the column these index is not there yet when
      // SCHEMA runs.
      this.db.exec(PRODUCT_INDEXES)
    })
  }

  /**
   * Keep a report: the identifier's latest versions and settings, and every day in it. False, with
   * nothing written, when the identifier already belongs to the other plugin.
   */
  save(report: Report, now: number): boolean {
    let kept = false
    this.transaction(() => {
      const owner = this.ownerOf(report.install)
      if (owner !== undefined && owner !== report.product) return

      const firstDay = report.days.reduce((low, day) => (day.day < low ? day.day : low), report.days[0]!.day)

      // The product is written once, with the first report, and never updated: it is whose the
      // identifier is, not something a later report may change.
      this.run(
        `INSERT INTO installs (id, product, first_day, first_seen, last_seen, plugin, ide, ide_version, os, arch, cli, lang, settings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           first_day = min(first_day, excluded.first_day),
           last_seen = excluded.last_seen,
           plugin = excluded.plugin, ide = excluded.ide, ide_version = excluded.ide_version,
           os = excluded.os, arch = excluded.arch, cli = excluded.cli, lang = excluded.lang,
           settings = excluded.settings`,
        report.install,
        report.product,
        firstDay,
        now,
        now,
        report.env.plugin,
        report.env.ide,
        report.env.ideVersion,
        report.env.os,
        report.env.arch,
        report.env.cli,
        report.env.lang,
        JSON.stringify(report.settings),
      )

      for (const day of report.days) this.saveDay(report, day, now)
      kept = true
    })
    return kept
  }

  /**
   * The plugin an identifier already belongs to, or undefined for one never seen. The days are asked too:
   * pruning forgets an identifier silent for the whole retention a little before the last of its days.
   */
  private ownerOf(install: string): Product | undefined {
    return this.get<{ product: Product }>(
      `SELECT product FROM installs WHERE id = ?
       UNION ALL SELECT product FROM days WHERE install = ?
       LIMIT 1`,
      install,
      install,
    )?.product
  }

  private saveDay(report: Report, day: DayReport, now: number): void {
    const known = this.db
      .prepare('SELECT minutes, sittings FROM days WHERE install = ? AND day = ?')
      .get(report.install, day.day) as { minutes: number; sittings: string } | undefined

    /*
     * The stretches of work are the one thing that cannot be merged figure by figure: two of them join
     * into one as the gap between them fills in. The report that saw more of the day saw the better list,
     * so the list travels with the larger count of minutes.
     */
    const sittings = known && known.minutes > day.counts.minutes ? known.sittings : JSON.stringify(day.sittings)

    const columns = DAY_FIELDS.map(column)
    this.run(
      `INSERT INTO days (install, day, product, plugin, ide, os, sittings, updated, ${columns.join(', ')})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${columns.map(() => '?').join(', ')})
       ON CONFLICT(install, day) DO UPDATE SET
         plugin = excluded.plugin, ide = excluded.ide, os = excluded.os,
         sittings = excluded.sittings, updated = excluded.updated,
         ${columns.map((name) => `${name} = max(${name}, excluded.${name})`).join(', ')}`,
      report.install,
      day.day,
      report.product,
      report.env.plugin,
      report.env.ide,
      report.env.os,
      sittings,
      now,
      ...DAY_FIELDS.map((field) => day.counts[field]),
    )

    const insert = this.db.prepare(
      `INSERT INTO counts (install, day, kind, name, product, value) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(install, day, kind, name) DO UPDATE SET value = max(value, excluded.value)`,
    )
    for (const kind of COUNT_KINDS) {
      for (const [name, value] of Object.entries(day.maps[kind])) {
        insert.run(report.install, day.day, kind, name, report.product, value)
      }
    }
  }

  /**
   * Everything ever kept under an identifier, gone - what turning the reports off asks for. Only within
   * the plugin that asks: the other plugin's request cannot reach into this one's figures, even with an
   * identifier it has somehow come to know.
   */
  forget(product: Product, install: string): number {
    let removed = 0
    this.transaction(() => {
      removed += Number(this.run('DELETE FROM counts WHERE install = ? AND product = ?', install, product).changes)
      removed += Number(this.run('DELETE FROM days WHERE install = ? AND product = ?', install, product).changes)
      removed += Number(this.run('DELETE FROM installs WHERE id = ? AND product = ?', install, product).changes)
    })
    return removed
  }

  /** Days older than the retention, and identifiers not heard from since, deleted. */
  prune(now: number, retentionDays: number): void {
    const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const silentSince = now - retentionDays * 24 * 60 * 60 * 1000

    this.transaction(() => {
      this.run('DELETE FROM counts WHERE day < ?', cutoff)
      this.run('DELETE FROM days WHERE day < ?', cutoff)
      this.run('DELETE FROM installs WHERE last_seen < ?', silentSince)
    })
  }

  /** A read for the dashboard. Parameters by position, rows as plain objects. */
  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }

  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined
  }

  close(): void {
    this.db.close()
  }

  private run(sql: string, ...params: SQLInputValue[]) {
    return this.db.prepare(sql).run(...params)
  }

  private transaction(block: () => void): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      block()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}

/** A day field as a column: "linesAdded" -> "lines_added". The names are ours, never the caller's. */
export const column = (field: string): string => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

/**
 * The plugin a row belongs to. The default is there for the rows from before there were two plugins (see
 * [Store.addMissingColumns]); every row written since names its plugin itself.
 */
const PRODUCT_COLUMN = `TEXT NOT NULL DEFAULT '${DEFAULT_PRODUCT}'`

const SCHEMA = `
CREATE TABLE IF NOT EXISTS installs (
  id TEXT PRIMARY KEY,
  product ${PRODUCT_COLUMN},
  first_day TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  plugin TEXT NOT NULL DEFAULT '',
  ide TEXT NOT NULL DEFAULT '',
  ide_version TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  arch TEXT NOT NULL DEFAULT '',
  cli TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS days (
  install TEXT NOT NULL,
  day TEXT NOT NULL,
  product ${PRODUCT_COLUMN},
  plugin TEXT NOT NULL DEFAULT '',
  ide TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  sittings TEXT NOT NULL DEFAULT '[]',
  updated INTEGER NOT NULL,
  ${DAY_FIELDS.map((field) => `${column(field)} INTEGER NOT NULL DEFAULT 0`).join(',\n  ')},
  PRIMARY KEY (install, day)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS days_by_day ON days(day);

CREATE TABLE IF NOT EXISTS counts (
  install TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  product ${PRODUCT_COLUMN},
  value INTEGER NOT NULL,
  PRIMARY KEY (install, day, kind, name)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS counts_by_day ON counts(day, kind);
`

/** Every figure on the dashboard is one plugin's over a range of days. */
const PRODUCT_INDEXES = `
CREATE INDEX IF NOT EXISTS installs_by_product ON installs(product, first_day);
CREATE INDEX IF NOT EXISTS days_by_product ON days(product, day);
CREATE INDEX IF NOT EXISTS counts_by_product ON counts(product, kind, day);
`
