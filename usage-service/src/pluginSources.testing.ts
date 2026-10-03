import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Product } from './products.js'

/**
 * The plugins' own lists, read out of their Kotlin sources - for the tests that hold this service's lists
 * to them (features.test.ts, products.test.ts). Not part of the service: tsconfig leaves it out of the build.
 *
 * ACC is this repository, so its files are always there, and one gone missing is a failure. ACX, the Codex
 * fork, is a repository of its own, expected beside this one (or wherever AMAZING_CODEX_DIR points). On a
 * machine without it, or before its usage code is written, its checks are skipped with a note saying
 * which file they wait for - and the day the file appears they run, and fail on the first difference.
 */

const DIRECTORIES: Record<Product, string> = {
  acc: fileURLToPath(new URL('../../src/main/kotlin/io/github/crmapache/amazingclaudecode/usage/', import.meta.url)),
  acx: resolve(
    process.env.AMAZING_CODEX_DIR ?? fileURLToPath(new URL('../../../amazing-codex/', import.meta.url)),
    'src/main/kotlin/io/github/crmapache/amazingcodex/usage/',
  ),
}

export interface PluginSource {
  path: string
  /** The file's text, or null for a fork that has not got the file (yet). Never null for ACC. */
  text: string | null
}

export const pluginSource = (product: Product, file: string): PluginSource => {
  const path = resolve(DIRECTORIES[product], file)
  if (product === 'acc' || existsSync(path)) return { path, text: readFileSync(path, 'utf8') }
  return { path, text: null }
}

/** Why a check of the fork did not run - the reporter prints it beside the skipped test. */
export const waitingFor = (source: PluginSource): string =>
  `the Codex fork's ${source.path} is not there yet; this check runs and holds the lists together once it is`

/**
 * A failure that says which ids to move, and where - rather than two lists for somebody to compare by eye.
 * Empty when the two agree.
 */
export const disagreement = (
  what: string,
  source: PluginSource,
  ours: string,
  { missingHere, notInPlugin }: { missingHere: string[]; notInPlugin: string[] },
): string => {
  if (missingHere.length === 0 && notInPlugin.length === 0) return ''
  return [
    `${what}: ${source.path} and ${ours} in this service disagree.`,
    ...(missingHere.length ? [`  named by the plugin, unknown to the service: ${missingHere.join(', ')}`] : []),
    ...(notInPlugin.length ? [`  known to the service, not named by the plugin: ${notInPlugin.join(', ')}`] : []),
    '  One of the two lists has to change until they agree: the plugin would otherwise count what this',
    '  service drops on arrival, or the service would word what the plugin never sends.',
  ].join('\n')
}

/**
 * The strings of a set assigned to a name: `val NAMED: Set<String> = setOf("a", "b")` -> ["a", "b"].
 * Null when the file has no such set - a list moved or renamed, which the test should say rather than
 * read as an empty list.
 */
export const kotlinSet = (text: string, name: string): string[] | null => {
  const match = new RegExp(`\\bval\\s+${name}\\b[^=]*=\\s*setOf\\(([^)]*)\\)`).exec(text)
  return match ? [...match[1]!.matchAll(/"([^"]*)"/g)].map((found) => found[1]!) : null
}

/**
 * The keys of the map a function builds out of `"name" to value` pairs - UsageFacts.settings, where every
 * setting a report states is one such line. Null when there is no such function.
 */
export const kotlinMapKeys = (text: string, signature: string): string[] | null => {
  const start = text.indexOf(signature)
  if (start === -1) return null
  // The function ends where the next line closes a block at its own indent.
  const end = text.indexOf('\n    }\n', start)
  const body = text.slice(start, end === -1 ? undefined : end)
  return [...body.matchAll(/"([A-Za-z][A-Za-z0-9]*)" to /g)].map((found) => found[1]!)
}

/** What one list has that the other has not, both ways - so a failure names the ids rather than a count. */
export const difference = (plugin: Iterable<string>, service: Iterable<string>) => {
  const theirs = new Set(plugin)
  const ours = new Set(service)
  return {
    missingHere: [...theirs].filter((id) => !ours.has(id)).sort(),
    notInPlugin: [...ours].filter((id) => !theirs.has(id)).sort(),
  }
}
