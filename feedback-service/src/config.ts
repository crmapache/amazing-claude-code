/**
 * Everything that can be turned without touching the code.
 *
 * The defaults are what the author's own instance runs on. Every limit here answers the same question -
 * how much of a stranger's traffic is it worth holding in memory before saying no - and the answer is
 * always "as little as still lets a bug report through with a screen recording attached".
 */

const number = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (!raw) return fallback

  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface Config {
  port: number
  /**
   * The biggest request that will be read. Deliberately a little over what the plugin itself allows
   * (ten files, twenty megabytes in total): the difference is the report, the fields and multipart's own
   * overhead, and a body refused for being a hundred kilobytes over its content would be a bug that only
   * showed up for the people with the most to report.
   */
  maxBodyBytes: number
  /** How many files one message may carry - the plugin's own ceiling, checked again here. */
  maxFiles: number
  /** How many messages one address may send in an hour. A person reporting a bug sends one, maybe three. */
  perIpPerHour: number
  /** And how many the service will forward in an hour, whoever sends them - the Telegram quota's guard. */
  perHour: number
  /** How many requests are read at the same time. Each one may be twenty megabytes of memory. */
  maxConcurrent: number
  /**
   * How many hops in front of this service are ours.
   *
   * Zero means "there are none": the sender is whoever the socket says, and x-forwarded-for is ignored
   * entirely. That is the only safe default, because the header is written by whoever is calling - and a
   * per-address ceiling that trusts it is not a ceiling at all: change the header each time and every
   * request is a new person.
   *
   * One is right behind a single reverse proxy, which is how the public instance runs. Then the address
   * to count by is the last entry in the chain - the one our own proxy saw - rather than the first, which
   * the caller can write anything into.
   */
  trustedProxies: number
  /**
   * The shared secret the plugin sends. Empty means "do not check" - which is right for someone running
   * this locally and wrong for anything reachable from the internet.
   */
  key: string
  logLevel: 'silent' | 'info'
}

export const readConfig = (): Config => ({
  port: number('PORT', 8080),
  maxBodyBytes: number('FEEDBACK_MAX_BODY_BYTES', 24 * 1024 * 1024),
  maxFiles: number('FEEDBACK_MAX_FILES', 10),
  perIpPerHour: number('FEEDBACK_PER_IP_PER_HOUR', 6),
  perHour: number('FEEDBACK_PER_HOUR', 120),
  maxConcurrent: number('FEEDBACK_MAX_CONCURRENT', 3),
  // `number` refuses zero and negatives, so this one is read on its own: zero is the default and the
  // meaningful "trust nothing".
  trustedProxies: Math.max(0, Math.trunc(Number(process.env.FEEDBACK_TRUSTED_PROXIES ?? 0)) || 0),
  key: process.env.FEEDBACK_KEY ?? '',
  logLevel: process.env.FEEDBACK_LOG_LEVEL === 'silent' ? 'silent' : 'info',
})

/** Where the messages go. Absent means the service runs and refuses to forward - see [Telegram]. */
export interface TelegramKeys {
  token: string
  chatId: string
}

export const readTelegramKeys = (): TelegramKeys | null => {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''
  const chatId = process.env.TELEGRAM_CHAT_ID ?? ''

  return token && chatId ? { token, chatId } : null
}

export const SERVICE_VERSION = '0.1.0'
