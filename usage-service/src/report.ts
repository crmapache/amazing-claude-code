import { isKnownFeature } from './features.js'
import { commandName, modelName, owns, readProduct, REPORTED_SETTINGS, toolName, type Product } from './products.js'

/**
 * What a report from a plugin may contain, and the reading of one that holds it to that.
 *
 * The plugin is the side that promises what leaves a machine: it builds the report out of a whitelist of
 * counts (see UsageReport.kt) and never puts a word of anybody's work into it. This file is the second
 * half of the same promise - the part that holds even against a report the plugin did not write. Every
 * field is read by name, every name in a map has to look like an identifier, every value has to be a
 * small whole number, and anything else is dropped rather than stored. A string that could carry a
 * sentence, a path or a project's name has nowhere to go in here.
 *
 * The names in the maps are held to the lists of the plugin that sent them (see products.ts and
 * features.ts): a feature, a screen or a setting not on its plugin's list is dropped, a command of one's
 * own becomes "custom", a model outside the plugin's catalogue "Other", and an MCP tool "MCP" - the same
 * folding the plugin does before sending, done again so that it holds when a plugin forgets.
 *
 * Dropped rather than refused, on purpose: a plugin a version ahead of this service sends a field this
 * service has never heard of, and losing that person's whole day over it would be the wrong trade. The one
 * exception is the product, which is not a field but the address (see products.ts).
 */

/** The fixed counts of a day, in the order the dashboard reads them. Each is a whole number, zero or more. */
export const DAY_FIELDS = [
  /** Minutes of the day something was going on in the panel. */
  'minutes',
  /** Conversations that came to life that day. */
  'conversations',
  'prompts',
  'turns',
  /** How long the agent worked, summed over the turns. */
  'turnSeconds',
  'phonePrompts',
  /**
   * Everything a person did from a paired phone - messages, answers, approvals, stops. Absent from plugins
   * before 0.13.11, where a phone's use shows only through its messages and its watching.
   */
  'phoneActions',
  'forks',
  'edits',
  'linesAdded',
  'linesRemoved',
  'filesEdited',
  'permissionsAsked',
  'permissionsDenied',
  'plansApproved',
  'todosDone',
  'attachments',
  'quotes',
  'ranOutFiveHour',
  'watched',
  /** High-water marks rather than counts: the most at once that day. */
  'mcpConnected',
  'plugins',
  /** The longest a single conversation ran that day, in active minutes. */
  'longestConversation',
] as const

export type DayField = (typeof DAY_FIELDS)[number]

/** The maps of a day: a name and how many times. */
export const COUNT_KINDS = ['tools', 'models', 'slash', 'features'] as const

export type CountKind = (typeof COUNT_KINDS)[number]

export interface DayReport {
  day: string
  counts: Record<DayField, number>
  /** How long each stretch of work lasted, in minutes - see UsageReport.sittings on the plugin's side. */
  sittings: number[]
  maps: Record<CountKind, Record<string, number>>
}

export interface Environment {
  plugin: string
  ide: string
  ideVersion: string
  os: string
  arch: string
  cli: string
  lang: string
}

export interface Report {
  /** Which plugin sent it. Absent from the reports of ACC versions written before there were two. */
  product: Product
  install: string
  env: Environment
  settings: Record<string, string | number | boolean>
  days: DayReport[]
}

/** A random identifier the plugin made up - long enough that nobody guesses somebody else's. */
const INSTALL = /^[A-Za-z0-9_-]{16,64}$/

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A name in one of the maps: a tool, a model, a command, a feature. Never a sentence. */
const NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,47}$/

/** A setting's value when it is a word: "bottom", "modEnter", "dark". */
const WORD = /^[A-Za-z0-9._-]{0,32}$/

const VERSION = /^[0-9A-Za-z.+-]{1,40}$/

const OS = new Set(['mac', 'windows', 'linux', 'other'])

const ARCH = new Set(['arm64', 'x64', 'other'])

/** The panel's ten languages - and "en" for anything else, so no locale string travels as it is. */
const LANGS = new Set(['en', 'ru', 'uk', 'de', 'fr', 'es', 'pt', 'ja', 'ko', 'zh'])

/** A JetBrains product code: WS, IU, IC, PY, GO, AI for Android Studio. */
const IDE_CODE = /^[A-Z]{2,4}$/

const IDE_VERSION = /^\d{4}\.\d{1,2}$/

/** How far a count may go. A figure past this is a broken counter, not a busy day. */
const MAX_COUNT = 10_000_000

const MAX_DAYS = 31

const MAX_NAMES = 200

const MAX_SITTINGS = 96

const MAX_SETTINGS = 48

const MINUTES_PER_DAY = 1440

/** How far from today a day may be. Behind: a week of retries plus a slack; ahead: time zones. */
const DAYS_BACK = 45

const DAYS_AHEAD = 2

const DAY_MS = 24 * 60 * 60 * 1000

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const count = (value: unknown, ceiling = MAX_COUNT): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.min(Math.trunc(value), ceiling)
}

const text = (value: unknown, pattern: RegExp): string =>
  typeof value === 'string' && pattern.test(value) ? value : ''

const oneOf = (value: unknown, allowed: Set<string>, fallback: string): string =>
  typeof value === 'string' && allowed.has(value) ? value : fallback

/**
 * A map of names and counts, each name first held to the shape of an identifier and then put through the
 * plugin's own list: [rename] gives the name it is kept under - several may fold into one, and their
 * counts add up, the way the plugin adds them - or null for a name that is not kept at all.
 */
const counts = (value: unknown, rename: (name: string) => string | null): Record<string, number> => {
  const out: Record<string, number> = {}
  if (!isObject(value)) return out

  for (const [name, raw] of Object.entries(value).slice(0, MAX_NAMES)) {
    if (!NAME.test(name)) continue
    const kept = rename(name)
    const figure = count(raw)
    if (kept === null || figure === 0) continue
    out[kept] = Math.min((owns(out, kept) ? out[kept]! : 0) + figure, MAX_COUNT)
  }
  return out
}

/** How each map's names are kept, for one plugin. */
const renames = (product: Product): Record<CountKind, (name: string) => string | null> => ({
  tools: toolName,
  models: (name) => modelName(product, name),
  slash: (name) => commandName(product, name),
  features: (name) => (isKnownFeature(product, name) ? name : null),
})

/** Whether a calendar day is a real one and near enough to today to be believed. */
const plausibleDay = (day: string, now: number): boolean => {
  if (!DAY.test(day)) return false

  const at = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== day) return false

  return at >= now - DAYS_BACK * DAY_MS && at <= now + DAYS_AHEAD * DAY_MS
}

const readDay = (value: unknown, now: number, product: Product): DayReport | null => {
  if (!isObject(value)) return null

  const day = typeof value.day === 'string' ? value.day : ''
  if (!plausibleDay(day, now)) return null

  const figures = {} as Record<DayField, number>
  for (const field of DAY_FIELDS) figures[field] = count(value[field])
  figures.minutes = Math.min(figures.minutes, MINUTES_PER_DAY)
  figures.longestConversation = Math.min(figures.longestConversation, MINUTES_PER_DAY)

  const sittings = Array.isArray(value.sittings)
    ? value.sittings
        .slice(0, MAX_SITTINGS)
        .map((length) => count(length, MINUTES_PER_DAY))
        .filter((length) => length > 0)
    : []

  const rename = renames(product)
  const maps = {} as Record<CountKind, Record<string, number>>
  for (const kind of COUNT_KINDS) maps[kind] = counts(value[kind], rename[kind])

  return { day, counts: figures, sittings, maps }
}

const readSettings = (value: unknown, product: Product): Record<string, string | number | boolean> => {
  const out: Record<string, string | number | boolean> = {}
  if (!isObject(value)) return out

  for (const [name, raw] of Object.entries(value).slice(0, MAX_SETTINGS)) {
    if (!owns(REPORTED_SETTINGS[product], name)) continue
    if (typeof raw === 'boolean') out[name] = raw
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[name] = Math.max(0, Math.min(Math.trunc(raw), 1000))
    else if (typeof raw === 'string' && WORD.test(raw)) out[name] = raw
  }
  return out
}

/**
 * The plugin a report says it came from: ACC when it says nothing, null when it names one this service
 * does not count - which the caller refuses rather than reads (see products.ts).
 */
export const productOf = (body: unknown): Product | null => readProduct(isObject(body) ? body.product : undefined)

/**
 * The report, read - or null when there is nothing in it worth keeping: a product this service does not
 * count, no identifier that could be one, or not a single believable day.
 */
export const readReport = (body: unknown, now: number = Date.now()): Report | null => {
  if (!isObject(body)) return null

  const product = productOf(body)
  if (!product) return null

  const install = text(body.install, INSTALL)
  if (!install) return null

  const env = isObject(body.env) ? body.env : {}
  const days = (Array.isArray(body.days) ? body.days : [])
    .slice(0, MAX_DAYS)
    .map((day) => readDay(day, now, product))
    .filter((day): day is DayReport => day !== null)

  // Two entries for the same day in one report: the later one wins, the way a later report would.
  const byDay = new Map(days.map((day) => [day.day, day]))
  if (byDay.size === 0) return null

  return {
    product,
    install,
    env: {
      plugin: text(env.plugin, VERSION),
      ide: text(env.ide, IDE_CODE),
      ideVersion: text(env.ideVersion, IDE_VERSION),
      os: oneOf(env.os, OS, 'other'),
      arch: oneOf(env.arch, ARCH, 'other'),
      // The agent's own version: Claude Code's for ACC, Codex CLI's for ACX ("0.152.0", without the
      // "codex-cli" the CLI prints before it).
      cli: text(env.cli, VERSION),
      lang: oneOf(env.lang, LANGS, 'en'),
    },
    settings: readSettings(body.settings, product),
    days: [...byDay.values()],
  }
}

/** Whether a string is an identifier the plugin could have made - for the "forget me" request. */
export const isInstallId = (value: string): boolean => INSTALL.test(value)
