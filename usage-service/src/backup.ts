import { existsSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/**
 * A consistent copy of the database, for the server's hourly backup.
 *
 * Run inside the service's own container, beside the process that is writing - the host has no sqlite3,
 * and copying the file from outside while it is being written (and while half of it sits in the WAL)
 * gives a copy that may not open. `VACUUM INTO` is SQLite's own way of taking a snapshot of a live
 * database: one transaction, a whole file out the other end.
 *
 *   node dist/backup.js /data/backup.sqlite
 */

const source = process.env.USAGE_DATABASE || 'data/usage.sqlite'
const target = process.argv[2]

if (!target) {
  process.stderr.write('usage: node dist/backup.js <target file>\n')
  process.exit(2)
}

if (!existsSync(source)) {
  process.stderr.write(`no database at ${source}\n`)
  process.exit(1)
}

// VACUUM INTO refuses a file that is already there.
rmSync(target, { force: true })

const db = new DatabaseSync(source, { readOnly: true })
db.prepare('VACUUM INTO ?').run(target)
db.close()

process.stdout.write(`${target}\n`)
