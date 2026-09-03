/**
 * Everything that can be turned without touching the code.
 *
 * The defaults are the ones the public instance runs on. They are deliberately modest: this server
 * holds other people's traffic in memory and nothing else, so every limit here is an answer to "how
 * much of that is it worth holding", and the answer is always "as little as still works".
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
   * The biggest envelope that will be passed on, and the same number the agent refuses above (see
   * RelayLink.MAX_FRAME_BYTES). It is handed to the websocket server as its own `maxPayload` rather
   * than only checked afterwards: a ceiling applied after the message has been assembled is a
   * ceiling on nothing, since the assembling is what costs the memory.
   */
  maxFrameBytes: number
  /** The biggest a push subscription may be. One is an id, a URL and two short keys - a few hundred
   *  bytes - so anything larger is not a subscription. */
  subscribeMaxBytes: number
  /** How many subscriptions are held at once. One per paired phone; the rest is somebody testing. */
  maxSubscriptions: number
  mailboxTtlMs: number
  mailboxMaxFrames: number
  mailboxMaxBytes: number
  /** Frames per minute per connection. A ceiling against a stuck loop, not a quota. */
  rateFramesPerMinute: number
  /**
   * Sockets from one address. Counted only when this server can see a real address: behind a proxy
   * that does not say who called, every caller looks like the proxy, and a limit that buckets the
   * whole world together is an outage rather than a limit (see `clientIp` in server.ts).
   */
  maxConnectionsPerIp: number
  /** Sockets in total. The one ceiling that holds whoever is in front of this server. */
  maxConnections: number
  /**
   * Which browser origins may open a socket. Empty means "the one this server serves the client
   * from", which is the whole of the normal case: the phone is served by its own relay. The plugin
   * sends no Origin at all - it is not a browser - and is never turned away by this.
   */
  allowedOrigins: string[]
  /**
   * Where the phone's own files live. Empty means "do not serve them" - for anyone who would rather
   * host the client somewhere else entirely.
   */
  staticDir: string
  logLevel: 'silent' | 'info'
}

export const readConfig = (): Config => ({
  // Railway and every other host of this kind name the port this way.
  port: number('PORT', 8080),
  maxFrameBytes: number('RELAY_MAX_FRAME_BYTES', 256 * 1024),
  subscribeMaxBytes: number('RELAY_SUBSCRIBE_MAX_BYTES', 8 * 1024),
  maxSubscriptions: number('RELAY_MAX_SUBSCRIPTIONS', 10_000),
  mailboxTtlMs: number('RELAY_MAILBOX_TTL_SECONDS', 120) * 1000,
  mailboxMaxFrames: number('RELAY_MAILBOX_MAX_FRAMES', 200),
  mailboxMaxBytes: number('RELAY_MAILBOX_MAX_BYTES', 4 * 1024 * 1024),
  rateFramesPerMinute: number('RELAY_RATE_FRAMES_PER_MINUTE', 6000),
  maxConnectionsPerIp: number('RELAY_MAX_CONNECTIONS_PER_IP', 32),
  maxConnections: number('RELAY_MAX_CONNECTIONS', 2000),
  allowedOrigins: (process.env.RELAY_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  staticDir: process.env.RELAY_STATIC_DIR ?? './public',
  logLevel: process.env.RELAY_LOG_LEVEL === 'silent' ? 'silent' : 'info',
})

/**
 * The relay's own version and what it speaks, for the plugin to read before it tries to connect. A
 * plugin that cannot make sense of this relay should be able to say so in words rather than fail at a
 * handshake with a number for a reason.
 */
export const RELAY_VERSION = '0.1.0'
