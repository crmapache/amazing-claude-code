/**
 * Everything that can be turned without touching the code.
 *
 * The defaults are what the author's own instance runs on, except for the two secrets, which have none:
 * without ADMIN_PASSWORD the page that shows the figures does not exist, and without USAGE_KEY every
 * caller is answered - right for somebody running this on their own machine, wrong for anything the
 * internet can reach, and said out loud at startup either way (see index.ts).
 */

const number = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (!raw) return fallback

  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface Config {
  port: number
  /** Where the SQLite file lives. On the public instance this is inside a volume that outlives the image. */
  database: string
  /**
   * The biggest report that will be read. A day of counts is a couple of kilobytes and a report carries
   * a fortnight at most, so this is generous by an order of magnitude - and still small enough that a
   * stranger filling it is not worth the trouble.
   */
  maxBodyBytes: number
  /**
   * How many reports one address may send in an hour. The plugin sends one every few hours per machine
   * (see UsageReporter), so this ceiling is about an office behind one address rather than about a person.
   */
  perIpPerHour: number
  /** How many hops in front of this service are ours - the same rule as the feedback service's. */
  trustedProxies: number
  /** The shared secret the plugin sends. A speed bump against scanners, not authentication. */
  key: string
  /** The password to the page with the figures. Empty means there is no such page. */
  adminPassword: string
  /**
   * Whether the admin cookie is marked Secure. On by default, because the public instance is only ever
   * reached over HTTPS; off for a run on localhost, where a Secure cookie is never sent back and the
   * login would seem to do nothing.
   */
  secureCookie: boolean
  /** How long a day's counts are kept before they are deleted, in days. */
  retentionDays: number
  logLevel: 'silent' | 'info'
}

export const readConfig = (): Config => ({
  port: number('PORT', 8080),
  database: process.env.USAGE_DATABASE || 'data/usage.sqlite',
  maxBodyBytes: number('USAGE_MAX_BODY_BYTES', 128 * 1024),
  perIpPerHour: number('USAGE_PER_IP_PER_HOUR', 120),
  // `number` refuses zero, and zero is the meaningful default here: trust nothing the caller writes.
  trustedProxies: Math.max(0, Math.trunc(Number(process.env.USAGE_TRUSTED_PROXIES ?? 0)) || 0),
  key: process.env.USAGE_KEY ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  secureCookie: process.env.USAGE_SECURE_COOKIE !== 'false',
  retentionDays: number('USAGE_RETENTION_DAYS', 730),
  logLevel: process.env.USAGE_LOG_LEVEL === 'silent' ? 'silent' : 'info',
})

export const SERVICE_VERSION = '0.2.0'
