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
  /** The biggest envelope that will be passed on. Bigger than the agent's own ceiling, on purpose:
   *  this side does not need to understand a frame to forward it, so it can afford to be lenient. */
  maxFrameBytes: number
  mailboxTtlMs: number
  mailboxMaxFrames: number
  mailboxMaxBytes: number
  /** Frames per minute per connection. A ceiling against a stuck loop, not a quota. */
  rateFramesPerMinute: number
  maxConnectionsPerIp: number
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
  mailboxTtlMs: number('RELAY_MAILBOX_TTL_SECONDS', 120) * 1000,
  mailboxMaxFrames: number('RELAY_MAILBOX_MAX_FRAMES', 200),
  mailboxMaxBytes: number('RELAY_MAILBOX_MAX_BYTES', 4 * 1024 * 1024),
  rateFramesPerMinute: number('RELAY_RATE_FRAMES_PER_MINUTE', 6000),
  maxConnectionsPerIp: number('RELAY_MAX_CONNECTIONS_PER_IP', 32),
  staticDir: process.env.RELAY_STATIC_DIR ?? './public',
  logLevel: process.env.RELAY_LOG_LEVEL === 'silent' ? 'silent' : 'info',
})

/**
 * The relay's own version and what it speaks, for the plugin to read before it tries to connect. A
 * plugin that cannot make sense of this relay should be able to say so in words rather than fail at a
 * handshake with a number for a reason.
 */
export const RELAY_VERSION = '0.1.0'
