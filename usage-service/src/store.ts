import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { COUNT_KINDS, DAY_FIELDS, type DayReport, type Report } from './report.js'

/**
 * Where the reports are kept: one SQLite file, three tables.
 *
 * - `installs` - one row per random identifier: the day it was first seen, the versions and settings it
 *   reported last. Nothing that could say whose it is: no address, no country, no time zone.
 * - `days` - one row per identifier per calendar day, the fixed counts of that day.
 * - `counts` - the named counts of a day: tools, models, commands, features.
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
   * A count added to DAY_FIELDS after the file was made gets its column here. CREATE TABLE IF NOT EXISTS
   * leaves an existing table alone, so without this the first report carrying the new count would fail
   * on a column that is not there - and every report after it, from every plugin on the new version.
   */
  private addMissingColumns(): void {
    const present = new Set(this.all<{ name: string }>('PRAGMA table_info(days)').map((row) => row.name))
    for (const field of DAY_FIELDS) {
      const name = column(field)
      if (!present.has(name)) this.db.exec(`ALTER TABLE days ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`)
    }
  }

  /** Keep a report: the identifier's latest versions and settings, and every day in it. */
  save(report: Report, now: number): void {
    this.transaction(() => {
      const firstDay = report.days.reduce((low, day) => (day.day < low ? day.day : low), report.days[0]!.day)

      this.run(
        `INSERT INTO installs (id, first_day, first_seen, last_seen, plugin, ide, ide_version, os, arch, cli, lang, settings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           first_day = min(first_day, excluded.first_day),
           last_seen = excluded.last_seen,
           plugin = excluded.plugin, ide = excluded.ide, ide_version = excluded.ide_version,
           os = excluded.os, arch = excluded.arch, cli = excluded.cli, lang = excluded.lang,
           settings = excluded.settings`,
        report.install,
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
    })
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
      `INSERT INTO days (install, day, plugin, ide, os, sittings, updated, ${columns.join(', ')})
       VALUES (?, ?, ?, ?, ?, ?, ?, ${columns.map(() => '?').join(', ')})
       ON CONFLICT(install, day) DO UPDATE SET
         plugin = excluded.plugin, ide = excluded.ide, os = excluded.os,
         sittings = excluded.sittings, updated = excluded.updated,
         ${columns.map((name) => `${name} = max(${name}, excluded.${name})`).join(', ')}`,
      report.install,
      day.day,
      report.env.plugin,
      report.env.ide,
      report.env.os,
      sittings,
      now,
      ...DAY_FIELDS.map((field) => day.counts[field]),
    )

    const insert = this.db.prepare(
      `INSERT INTO counts (install, day, kind, name, value) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(install, day, kind, name) DO UPDATE SET value = max(value, excluded.value)`,
    )
    for (const kind of COUNT_KINDS) {
      for (const [name, value] of Object.entries(day.maps[kind])) insert.run(report.install, day.day, kind, name, value)
    }
  }

  /** Everything ever kept under an identifier, gone - what turning the reports off asks for. */
  forget(install: string): number {
    let removed = 0
    this.transaction(() => {
      removed += Number(this.run('DELETE FROM counts WHERE install = ?', install).changes)
      removed += Number(this.run('DELETE FROM days WHERE install = ?', install).changes)
      removed += Number(this.run('DELETE FROM installs WHERE id = ?', install).changes)
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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS installs (
  id TEXT PRIMARY KEY,
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
  value INTEGER NOT NULL,
  PRIMARY KEY (install, day, kind, name)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS counts_by_day ON counts(day, kind);
`
