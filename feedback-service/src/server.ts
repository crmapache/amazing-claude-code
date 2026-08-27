import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readTelegramKeys, SERVICE_VERSION, type Config } from './config.js'
import { Limits } from './limits.js'
import { boundaryOf, fieldOf, filesOf, parseMultipart } from './multipart.js'
import { Telegram, type Feedback } from './telegram.js'

/**
 * The service that takes a piece of feedback out of the plugin's panel and hands it to the author.
 *
 * It exists apart from the relay for a reason worth writing down: the relay is meant to be run by
 * anybody, under a licence that allows exactly that, and it can see nothing of what passes through it.
 * This one is the opposite in both respects - it reads what it is given and forwards it to one specific
 * chat. Bolting it onto the relay would leave every self-hosted copy of that server carrying a dead route
 * pointing at a stranger's bot.
 *
 * It keeps nothing. No database, no volume, no log of what was said: a message is read, forwarded and
 * forgotten, and the only state is a count of how many came this hour (see Limits).
 */

export interface Service {
  listen: (port: number) => Promise<number>
  close: () => void
}

/**
 * Where a message goes once it has been read. Telegram is the one that ships (see [Telegram]); it is a
 * parameter so that a test can raise the whole server and check what it forwards without a chat, a token
 * or the internet - the refusals are most of what this service does, and they are the part worth testing.
 */
export interface Sink {
  enabled: boolean
  send: (feedback: Feedback) => Promise<boolean>
}

export const createService = (
  config: Config,
  log: (line: string) => void,
  sink: Sink = new Telegram(readTelegramKeys(), log),
): Service => {
  const telegram = sink
  const limits = new Limits(config.perIpPerHour, config.perHour)

  /** How many bodies are being read right now. Each one may be the whole of [Config.maxBodyBytes]. */
  let reading = 0

  const http = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/'

    if (path === '/healthz') {
      reply(response, 200, 'ok')
      return
    }

    if (path === '/v1/info') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          serviceVersion: SERVICE_VERSION,
          maxBodyBytes: config.maxBodyBytes,
          maxFiles: config.maxFiles,
          telegram: telegram.enabled,
        }),
      )
      return
    }

    if (path !== '/v1/feedback') {
      reply(response, 404, 'not found')
      return
    }

    if (request.method !== 'POST') {
      reply(response, 405, 'post it')
      return
    }

    // The secret is checked before the body is read: a scanner should cost this service a header, not
    // twenty megabytes of memory.
    if (config.key && request.headers['x-acc-key'] !== config.key) {
      reply(response, 403, 'not for you')
      return
    }

    const boundary = boundaryOf(request.headers['content-type'])
    if (!boundary) {
      reply(response, 400, 'send it as multipart/form-data')
      return
    }

    const address = addressOf(request, config.trustedProxies)
    const now = Date.now()

    if (!limits.allow(address, now)) {
      log(`refused ${hint(address)}: too many this hour`)
      reply(response, 429, 'too many messages this hour')
      return
    }

    if (reading >= config.maxConcurrent) {
      limits.refund(address, now)
      log('refused one: too many bodies being read at once')
      reply(response, 429, 'busy - try again in a moment')
      return
    }

    reading += 1

    /**
     * Whether the ceiling was the reason the body did not arrive whole.
     *
     * It has to be told apart from a body that simply stopped coming - a dropped connection, a closed tab.
     * Both end the read with nothing, but the first has already been answered and refunded below, while
     * the second must be refunded here or the sender is charged for an attempt that never arrived. Five
     * such attempts on a bad line and they are told they have used up their hour.
     */
    let refused = false

    readBody(request, config.maxBodyBytes, () => {
      refused = true
      // Answered here rather than after the read, and then the socket is closed once the answer is out:
      // destroying it the moment the ceiling is passed leaves the sender with a dropped connection and no
      // idea why, which reads as "the service is broken" rather than "that was too big".
      limits.refund(address, now)
      reply(response, 413, 'that is too much to send at once')
      response.once('finish', () => request.destroy())
    })
      .then(async (body) => {
        if (body === null) {
          // The ceiling has been answered and refunded already; anything else means the request went away
          // mid-body, and an attempt that never arrived must not count against its sender.
          if (!refused) limits.refund(address, now)
          return
        }

        const parts = parseMultipart(body, boundary)
        const text = fieldOf(parts, 'text')

        if (!text) {
          limits.refund(address, now)
          reply(response, 400, 'there is nothing written in it')
          return
        }

        const files = filesOf(parts, 'file').slice(0, config.maxFiles)
        const report = parts.find((part) => part.name === 'report')?.bytes

        // Only sizes and counts, never a word of what was said - the whole point of a service that
        // forgets is that its log has nothing to forget.
        log(
          `feedback from ${hint(address)}: ${fieldOf(parts, 'kind') || 'unknown'}, ` +
            `${text.length} chars, ${files.length} file${files.length === 1 ? '' : 's'}, ` +
            `report ${report?.length ?? 0} B`,
        )

        const sent = await telegram.send({
          kind: fieldOf(parts, 'kind'),
          text,
          email: fieldOf(parts, 'email'),
          environment: fieldOf(parts, 'environment'),
          ...(report && report.length > 0 ? { report } : {}),
          files: files.map((file) => ({ filename: file.filename ?? 'file', bytes: file.bytes })),
        })

        if (!sent) {
          // Not forwarded, so it did not count: the person will try again, and being rate-limited for an
          // attempt that never arrived is the one refusal this service must not hand out.
          limits.refund(address, now)
          reply(response, 502, 'the message could not be delivered - please try again')
          return
        }

        response.writeHead(204).end()
      })
      .catch((error: unknown) => {
        limits.refund(address, now)
        log(`a request failed: ${(error as Error).message}`)
        reply(response, 500, 'something went wrong here')
      })
      .finally(() => {
        reading -= 1
      })
  })

  return {
    listen: (port: number) =>
      new Promise((resolve) => {
        http.listen(port, () => {
          const taken = http.address()
          resolve(typeof taken === 'object' && taken ? taken.port : port)
        })
      }),
    close: () => void (http as Server).close(),
  }
}

/**
 * Read the whole body, or nothing at all if it grows past the ceiling.
 *
 * The count is kept as it arrives rather than read off content-length: a header is what the sender says,
 * and the thing worth bounding is what actually turns up. Once the ceiling is passed nothing more is
 * held - the caller is told at once (through [onCeiling]) so it can answer while the connection is still
 * open, and whatever else arrives is dropped on the floor rather than collected for a body that has
 * already been refused.
 */
export const readBody = (
  request: IncomingMessage,
  ceiling: number,
  onCeiling: () => void,
): Promise<Buffer | null> =>
  new Promise((resolve) => {
    let chunks: Buffer[] | null = []
    let held = 0

    request.on('data', (chunk: Buffer) => {
      if (chunks === null) return

      held += chunk.length

      if (held > ceiling) {
        chunks = null
        resolve(null)
        onCeiling()
        return
      }

      chunks.push(chunk)
    })

    request.on('end', () => resolve(chunks === null ? null : Buffer.concat(chunks)))
    // A sender that goes away mid-body is not an error worth a stack trace: there is simply nothing to
    // forward, and the refusal - if one was already sent - has been sent.
    request.on('error', () => resolve(null))
    request.on('aborted', () => resolve(null))
  })

const reply = (response: ServerResponse, status: number, text: string): void => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(text)
}

/**
 * Who is asking, for the counting.
 *
 * The header is read only as far as our own proxies reach (see Config.trustedProxies), and from the end
 * of the chain rather than the start. x-forwarded-for grows left to right - each hop appends the address
 * it saw - so the entries at the far left are whatever the caller wrote there, and the entry our own
 * proxy added is the last one. Taking the first entry, as this used to, means the per-address ceiling can
 * be walked straight past by sending a different header every time.
 *
 * With no trusted proxy configured the header is ignored altogether and the socket answers.
 */
export const addressOf = (request: IncomingMessage, trustedProxies: number): string => {
  // The socket's own address comes IPv4-mapped when the listener is on IPv6 ("::ffff:1.2.3.4"), and the
  // prefix is the same for everybody - kept, it would be the whole of every hint in the log.
  const socket = request.socket.remoteAddress?.replace(/^::ffff:/, '') ?? ''

  if (trustedProxies <= 0) return socket || 'unknown'

  const header = request.headers['x-forwarded-for']
  const chain = (Array.isArray(header) ? header.join(',') : header ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  // Shorter chain than expected: somebody reached us past a hop, so the header cannot be placed and the
  // socket is the only honest answer.
  const taken = chain.length >= trustedProxies ? chain[chain.length - trustedProxies] : undefined

  return taken || socket || 'unknown'
}

/** An address in the log, cut short: enough to see one sender from another, not enough to be a record. */
const hint = (address: string): string => address.slice(0, 7) + '…'
