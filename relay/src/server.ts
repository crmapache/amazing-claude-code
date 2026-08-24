import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { RELAY_VERSION, type Config } from './config.js'
import { serveStatic } from './http/static.js'
import { Pushes, readPushKeys } from './push/push.js'
import { CLOSE_BAD_ADDRESS, CLOSE_BAD_VERSION, Hub, type Kind } from './routing/hub.js'
import { Mailboxes } from './routing/mailbox.js'
import { addressHint, decodeAddress, encodeAddress, FrameError, FrameType, parse, WIRE_VERSION } from './wire/frame.js'

/**
 * A relay for Amazing Claude Code: it introduces an IDE to a phone and passes sealed envelopes between
 * them.
 *
 * What it can see, in full: two opaque 16-byte addresses, a counter, how big each envelope is, and
 * when it went by. What it cannot see: anything inside one - your code, your files, the commands that
 * ran, what you asked for, what was answered, the names of your projects, or which agent belongs to
 * which person. Not because it promises not to look, but because there is no code here that could.
 *
 * It keeps nothing on disk. Its whole state is a map of live sockets and a short-lived buffer for a
 * side that blinked; a restart empties both, and the two ends catch up from the agent's own journal.
 *
 * Run your own: see README.md. That is the point of it being open at all - a plugin that asks people
 * to pass their code through someone else's server, without letting them read that server or replace
 * it, would deserve the suspicion it got.
 */

export interface Relay {
  /** Starts listening and answers with the port actually taken - zero asks for any free one. */
  listen: (port: number) => Promise<number>
  close: () => void
  /** For tests: how many sockets are live right now. */
  connections: () => number
}

/**
 * Build a relay over a configuration. Kept apart from starting one so that a test can raise it on an
 * ephemeral port and take it down again - a server that starts on import cannot be tested at all.
 */
export const createRelay = (config: Config, log: (line: string) => void): Relay => {
  const mailboxes = new Mailboxes({
  ttlMs: config.mailboxTtlMs,
  maxFrames: config.mailboxMaxFrames,
  maxBytes: config.mailboxMaxBytes,
  })

  const hub = new Hub(mailboxes, log)

  /**
   * Waking phones that are not connected. Off entirely when no VAPID keys are configured - a relay
   * without them still does its whole job, it just cannot ring anybody.
   */
  const pushes = new Pushes(readPushKeys(), log)

  const http = createServer((request: IncomingMessage, response: ServerResponse) => {
  const path = (request.url ?? '/').split('?')[0] ?? '/'

  if (path === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ok')
    return
  }

  if (path === '/v1/push/key') {
    response.writeHead(200, { 'content-type': 'application/json' })
    // Read from the relay rather than built into the client: one built for the public relay has to
    // work against somebody's own copy too.
    response.end(JSON.stringify({ enabled: pushes.enabled, publicKey: pushes.publicKey() }))
    return
  }

  if (path === '/v1/push/subscribe' && request.method === 'POST') {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(chunk as Buffer))
    request.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          deviceId?: string
          endpoint?: string
          keys?: { p256dh?: string; auth?: string }
        }

        if (!body.deviceId || !body.endpoint || !body.keys?.p256dh || !body.keys.auth) {
          response.writeHead(400).end('incomplete')
          return
        }

        pushes.remember({
          deviceId: body.deviceId,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        })

        log(`push subscription for ${body.deviceId.slice(0, 8)} (${pushes.count()} held)`)
        response.writeHead(204).end()
      } catch {
        response.writeHead(400).end('malformed')
      }
    })
    return
  }

  if (path === '/v1/info') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        relayVersion: RELAY_VERSION,
        wireMin: WIRE_VERSION,
        wireMax: WIRE_VERSION,
        maxFrameBytes: config.maxFrameBytes,
        mailboxTtlSeconds: Math.round(config.mailboxTtlMs / 1000),
      }),
    )
    return
  }

  serveStatic(config.staticDir, path, response)
  })

  const sockets = new WebSocketServer({ noServer: true })

  http.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://relay')
  const kind: Kind | null =
    url.pathname === '/v1/agent' ? 'agent' : url.pathname === '/v1/device' ? 'device' : null

  if (!kind) {
    socket.destroy()
    return
  }

  sockets.handleUpgrade(request, socket, head, (connection) => {
    accept(connection, kind, url.searchParams.get('id') ?? '')
  })
  })

  const accept = (connection: WebSocket, kind: Kind, id: string): void => {
  let address: Buffer

  try {
    address = decodeAddress(id)
  } catch {
    connection.close(CLOSE_BAD_ADDRESS, 'the address in the url is not an address')
    return
  }

  hub.open(address, kind, connection, Date.now())
  log(`${kind} ${addressHint(address)} connected (${hub.count()} live)`)

  let frames = 0
  const window = setInterval(() => {
    frames = 0
  }, 60_000)

  connection.on('message', (data, isBinary) => {
    if (!isBinary) {
      // Every real frame is binary. A text one means the other side is speaking a language this relay
      // does not, and guessing at it would be worse than saying so.
      connection.close(CLOSE_BAD_VERSION, 'frames are binary')
      return
    }

    frames += 1
    if (frames > config.rateFramesPerMinute) {
      log(`${addressHint(address)} is over its rate - closing`)
      connection.close(CLOSE_BAD_VERSION, 'too many frames')
      return
    }

    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)

    try {
      const frame = parse(raw, config.maxFrameBytes)

      // A frame's sender has to be the address it connected as. Without this check a device could
      // address an agent it was never paired with by guessing an id - and the agent would at least
      // have to spend the work of failing to decrypt it.
      if (!frame.from.equals(address)) {
        log(`${addressHint(address)} sent a frame from someone else - dropped`)
        return
      }

      if (frame.type === FrameType.PUSH) {
        // "Wake this device". The body is sealed like any other and this server never opens it - what
        // it does is hand the same bytes to a push service, which cannot open it either.
        void pushes.send(encodeAddress(frame.to), frame.body)
        return
      }

      hub.route(frame, raw, Date.now())
    } catch (error) {
      // The reason, never the frame. A malformed envelope is the one case where attaching the bytes
      // "just to see" is most tempting and least acceptable.
      log(`${addressHint(address)} sent a frame we could not read: ${(error as FrameError).message}`)
    }
  })

  connection.on('close', () => {
    clearInterval(window)
    hub.close(address, connection)
    log(`${kind} ${addressHint(address)} left (${hub.count()} live)`)
  })

  connection.on('error', () => {
    // A socket falling over is an ordinary end, not an event: the other side reconnects and catches up.
  })
  }

  const sweeping = setInterval(() => mailboxes.sweep(Date.now()), 30_000)
  sweeping.unref()

  return {
    listen: (port) =>
      new Promise((resolve) => {
        http.listen(port, () => {
          const taken = http.address()
          resolve(typeof taken === 'object' && taken ? taken.port : port)
        })
      }),
    close: () => {
      clearInterval(sweeping)
      sockets.close()
      http.close()
    },
    connections: () => hub.count(),
  }
}
