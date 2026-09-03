import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'
import { RELAY_VERSION, type Config } from './config.js'
import { readBody } from './http/body.js'
import { serveStatic } from './http/static.js'
import { Pushes, readPushKeys } from './push/push.js'
import { CLOSE_BAD_ADDRESS, CLOSE_BAD_VERSION, Hub, type Kind } from './routing/hub.js'
import { Mailboxes } from './routing/mailbox.js'
import { addressHint, decodeAddress, encodeAddress, FrameError, FrameType, parse, WIRE_VERSION } from './wire/frame.js'

/**
 * A relay for Amazing Claude Code GUI: it introduces an IDE to a phone and passes sealed envelopes between
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

/** The answer when this server cannot honestly say who called - see [clientIp]. */
const ANONYMOUS = ''

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * Whether a browser page at this origin may open a socket here.
 *
 * Three things pass. A request with no Origin at all: that is the plugin, which is not a browser and
 * has none to send - and a program that wanted to lie could send anything anyway, so the header is
 * only ever evidence about a browser. A page served by this very server, which is the whole of the
 * normal case: the relay hosts the phone's client. And anything named in RELAY_ALLOWED_ORIGINS, for
 * whoever hosts that client somewhere else.
 */
export const originAllowed = (request: IncomingMessage, allowed: string[]): boolean => {
  const origin = request.headers.origin
  if (!origin) return true

  let host: string
  let hostname: string
  try {
    const url = new URL(origin)
    host = url.host
    hostname = url.hostname.toLowerCase()
  } catch {
    return false
  }

  if (allowed.includes(origin)) return true
  if (host === request.headers.host) return true

  // Developing the client against a relay on the same machine: two ports, one host, and the pair is
  // reachable from nowhere else. Without this the documented dev setup would be the one thing this
  // check turned away.
  const served = String(request.headers.host ?? '').split(':')[0]?.toLowerCase() ?? ''
  return LOOPBACK.has(hostname) && LOOPBACK.has(served)
}

/**
 * Who is calling, as far as this server can tell.
 *
 * A proxy in front rewrites the peer address to its own, so the forwarded header is read first and the
 * entry the nearest proxy appended - the last one - is the one taken; everything to the left of it was
 * written by whoever called and is a claim rather than a fact.
 *
 * When what is left is an address off the local network, the honest answer is "no idea": that is a
 * proxy which did not say who it spoke for, and counting every caller into one bucket would refuse the
 * thirty-third person on earth rather than the thirty-third socket of one. Those keep only the ceiling
 * on the total, which holds regardless of who is in front.
 */
export const clientIp = (request: IncomingMessage, socket: { remoteAddress?: string }): string => {
  const forwarded = String(request.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  const claimed = forwarded[forwarded.length - 1]
  const peer = (socket.remoteAddress ?? '').replace(/^::ffff:/, '')
  const address = (claimed ?? peer).replace(/^::ffff:/, '').toLowerCase()

  if (!address) return ANONYMOUS
  if (!claimed && !routable(address)) return ANONYMOUS

  // One person's IPv6 is a whole network of addresses, so it is counted by its network rather than by
  // the address: otherwise the limit is decorative for exactly the callers who have the most room.
  if (address.includes(':')) return address.split(':').slice(0, 4).join(':')

  return address
}

/** Whether an address could have come from outside this machine's own network. */
const routable = (address: string): boolean => {
  if (address === '::1' || address.startsWith('127.') || address.startsWith('fc') || address.startsWith('fd')) return false
  if (address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.')) return false

  const second = Number(address.split('.')[1] ?? -1)
  return !(address.startsWith('172.') && second >= 16 && second <= 31)
}

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
  const pushes = new Pushes(readPushKeys(), log, config.maxSubscriptions)

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
    // What the sender says about the size, answered before a byte of it is read. Not sufficient on its
    // own - a chunked body makes no such claim - but a scanner should cost this server a header.
    const declared = Number(request.headers['content-length'] ?? 0)
    if (Number.isFinite(declared) && declared > config.subscribeMaxBytes) {
      response.writeHead(413).end('too big')
      return
    }

    void readBody(request, config.subscribeMaxBytes, () => response.writeHead(413).end('too big')).then((raw) => {
      if (raw === null) return

      try {
        const body = JSON.parse(raw.toString()) as {
          deviceId?: string
          endpoint?: string
          keys?: { p256dh?: string; auth?: string }
        }

        if (!body.deviceId || !body.endpoint || !body.keys?.p256dh || !body.keys.auth) {
          response.writeHead(400).end('incomplete')
          return
        }

        // Through the same door as every other address on this server, and stored in the same spelling
        // the PUSH branch below will look it up by. Anything that is not an address is not a device.
        let device: Buffer
        try {
          device = decodeAddress(body.deviceId)
        } catch {
          response.writeHead(400).end('not an address')
          return
        }

        if (body.keys.p256dh.length > 128 || body.keys.auth.length > 64) {
          response.writeHead(400).end('not a subscription')
          return
        }

        // The only thing this server can honestly ask of a stranger: hold the socket for the address
        // you are subscribing. It cannot know who is paired with whom - that is the point of it - but
        // a phone always has its own line open at the moment it subscribes, and somebody filling this
        // map with invented devices has to hold a socket for each one.
        if (!hub.present(device)) {
          response.writeHead(403).end('that address is not here')
          return
        }

        // Refused rather than kept: an endpoint is a URL this server will later post to, so one it
        // does not recognise is one it declines to be pointed at (see isPushEndpoint).
        const held = pushes.remember({
          deviceId: encodeAddress(device),
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        })

        if (!held) {
          response.writeHead(400).end('not somewhere this relay sends')
          return
        }

        log(`push subscription for ${addressHint(device)} (${pushes.count()} held)`)
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

  // The ceiling is the transport's own, not a check made afterwards: the library's default is a
  // hundred megabytes, and it holds every one of them before this code is handed the message to
  // measure. A frame over the limit now closes the socket instead of being read and dropped.
  const sockets = new WebSocketServer({ noServer: true, maxPayload: config.maxFrameBytes })

  /** Sockets held per caller, and in total - see `clientIp` for what "per caller" can honestly mean. */
  const perCaller = new Map<string, number>()
  let live = 0

  http.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://relay')
  const kind: Kind | null =
    url.pathname === '/v1/agent' ? 'agent' : url.pathname === '/v1/device' ? 'device' : null

  if (!kind) {
    socket.destroy()
    return
  }

  // A websocket is not bound by the same-origin policy, so without this any page open in anybody's
  // browser could dial this server through them. The plugin is not a browser and sends no Origin at
  // all, which is why a missing one passes: what is being turned away is a page, not a program.
  if (!originAllowed(request, config.allowedOrigins)) {
    log('an upgrade came from an origin this relay does not serve - refused')
    socket.destroy()
    return
  }

  const caller = clientIp(request, socket as Socket)
  const held = perCaller.get(caller) ?? 0

  if (live >= config.maxConnections || (caller !== ANONYMOUS && held >= config.maxConnectionsPerIp)) {
    // No address in the line: a log that names who was refused is a log that records who connects.
    log('a caller is at its ceiling of open sockets - refused')
    socket.destroy()
    return
  }

  live += 1
  perCaller.set(caller, held + 1)

  // On the raw socket rather than on the websocket: an upgrade that never completes has no websocket
  // to close, and its slot would then be held until the process restarts.
  socket.on('close', () => {
    live -= 1
    const rest = (perCaller.get(caller) ?? 1) - 1
    if (rest <= 0) perCaller.delete(caller)
    else perCaller.set(caller, rest)
  })

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
        //
        // The whole frame travels, header and all, because the header is what the seal was made over:
        // the worker on the phone reads its own copy of those 42 bytes back as the additional data and
        // would find nothing to check them against if only the body arrived.
        void pushes.send(encodeAddress(frame.to), raw)
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
