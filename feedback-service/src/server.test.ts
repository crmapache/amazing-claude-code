import { connect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { readConfig, type Config } from './config.js'
import { createService, type Service, type Sink } from './server.js'
import type { Feedback } from './telegram.js'

/**
 * A real service on a real port, answering real requests.
 *
 * What is being tested is almost entirely refusals - a body too big, a message with nothing in it, one
 * sender asking too often, a Telegram that did not answer - and those are exactly the paths that decide
 * whether somebody's bug report arrives or is quietly dropped. Where it goes afterwards is a stub: the
 * chat is not the part that can be wrong here.
 */

const carrier = () => {
  const sent: Feedback[] = []
  let works = true

  const sink: Sink = {
    enabled: true,
    send: async (feedback) => {
      if (!works) return false
      sent.push(feedback)
      return true
    },
  }

  return { sink, sent, fail: () => (works = false) }
}

let service: Service | undefined

const raise = async (sink: Sink, overrides: Partial<Config> = {}): Promise<number> => {
  const config = { ...readConfig(), logLevel: 'silent' as const, key: '', ...overrides }
  service = createService(config, () => {}, sink)
  return service.listen(0)
}

afterEach(() => {
  service?.close()
  service = undefined
})

const body = (parts: { name: string; filename?: string; value: string | Buffer }[], boundary = 'testboundary'): Buffer => {
  const chunks: Buffer[] = []

  for (const part of parts) {
    const disposition = part.filename
      ? `form-data; name="${part.name}"; filename="${part.filename}"`
      : `form-data; name="${part.name}"`

    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}\r\n\r\n`))
    chunks.push(typeof part.value === 'string' ? Buffer.from(part.value) : part.value)
    chunks.push(Buffer.from('\r\n'))
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return Buffer.concat(chunks)
}

const post = async (
  port: number,
  payload: Buffer,
  headers: Record<string, string> = {},
): Promise<Response> =>
  fetch(`http://127.0.0.1:${port}/v1/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=testboundary', ...headers },
    body: new Uint8Array(payload),
  })

describe('taking a piece of feedback', () => {
  it('accepts one and hands it on', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink)

    const response = await post(
      port,
      body([
        { name: 'kind', value: 'bug' },
        { name: 'text', value: 'the panel hangs on reopening a tab' },
        { name: 'email', value: 'you@example.com' },
        { name: 'environment', value: 'Amazing Claude Code GUI 0.8.1' },
        { name: 'report', filename: 'report.txt', value: 'WebStorm 2026.2' },
        { name: 'file', filename: 'shot.png', value: Buffer.from([1, 2, 3]) },
      ]),
    )

    expect(response.status).toBe(204)
    expect(post_office.sent).toHaveLength(1)
    expect(post_office.sent[0]?.text).toBe('the panel hangs on reopening a tab')
    expect(post_office.sent[0]?.files.map((file) => file.filename)).toEqual(['shot.png'])
    expect(post_office.sent[0]?.report?.toString()).toBe('WebStorm 2026.2')
  })

  it('refuses one with nothing written in it', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink)

    const response = await post(port, body([{ name: 'kind', value: 'bug' }]))

    expect(response.status).toBe(400)
    expect(post_office.sent).toHaveLength(0)
  })

  it('refuses a body over the ceiling without collecting it', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink, { maxBodyBytes: 2048 })

    const response = await post(
      port,
      body([
        { name: 'text', value: 'here is the recording' },
        { name: 'file', filename: 'big.bin', value: Buffer.alloc(8192) },
      ]),
    )

    expect(response.status).toBe(413)
    expect(post_office.sent).toHaveLength(0)
  })

  it('carries no more files than it allows, however many were sent', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink, { maxFiles: 2 })

    await post(
      port,
      body([
        { name: 'text', value: 'four files' },
        { name: 'file', filename: 'a', value: 'a' },
        { name: 'file', filename: 'b', value: 'b' },
        { name: 'file', filename: 'c', value: 'c' },
        { name: 'file', filename: 'd', value: 'd' },
      ]),
    )

    expect(post_office.sent[0]?.files).toHaveLength(2)
  })

  it('wants multipart, and says so', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink)

    const response = await fetch(`http://127.0.0.1:${port}/v1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"text":"hello"}',
    })

    expect(response.status).toBe(400)
  })

  it('answers nothing else', async () => {
    const port = await raise(carrier().sink)

    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(404)
    expect((await fetch(`http://127.0.0.1:${port}/v1/feedback`)).status).toBe(405)
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200)
  })
})

describe('the shared secret', () => {
  it('turns away a caller that does not know it, before reading anything', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink, { key: 'the-key' })

    const response = await post(port, body([{ name: 'text', value: 'hello' }]))

    expect(response.status).toBe(403)
    expect(post_office.sent).toHaveLength(0)
  })

  it('lets the plugin through', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink, { key: 'the-key' })

    const response = await post(port, body([{ name: 'text', value: 'hello' }]), { 'x-acc-key': 'the-key' })

    expect(response.status).toBe(204)
  })
})

describe('how often it may be asked', () => {
  it('stops one sender after their share of the hour', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink, { perIpPerHour: 2 })

    const first = await post(port, body([{ name: 'text', value: 'one' }]))
    const second = await post(port, body([{ name: 'text', value: 'two' }]))
    const third = await post(port, body([{ name: 'text', value: 'three' }]))

    expect([first.status, second.status]).toEqual([204, 204])
    expect(third.status).toBe(429)
    expect(post_office.sent).toHaveLength(2)
  })

  it('does not charge a sender for a message it failed to deliver', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink, { perIpPerHour: 1 })
    post_office.fail()

    const failed = await post(port, body([{ name: 'text', value: 'one' }]))

    expect(failed.status).toBe(502)

    // The attempt did not count, so the person may try again - which is the whole point of the refund.
    const retried = await post(port, body([{ name: 'text', value: 'one' }]))
    expect(retried.status).toBe(502)
  })
})

describe('a request that goes away mid-body', () => {
  it('does not count against the sender', async () => {
    const post_office = carrier()
    const port = await raise(post_office.sink, { perIpPerHour: 1 })

    // A promised body that never finishes arriving: the connection is destroyed halfway. This is what a
    // phone leaving a lift looks like from here.
    await new Promise<void>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write(
          'POST /v1/feedback HTTP/1.1\r\n' +
            'Host: 127.0.0.1\r\n' +
            'Content-Type: multipart/form-data; boundary=testboundary\r\n' +
            'Content-Length: 4096\r\n\r\n' +
            '--testboundary\r\nContent-Disposition: form-data; name="text"\r\n\r\nhalf a mes',
        )
        setTimeout(() => {
          socket.destroy()
          resolve()
        }, 50)
      })
      socket.on('error', () => resolve())
    })

    // Give the server a moment to notice the socket is gone.
    await new Promise((resolve) => setTimeout(resolve, 50))

    // The hour's one slot is still there, so the retry gets through.
    const retried = await post(port, body([{ name: 'text', value: 'the whole message this time' }]))

    expect(retried.status).toBe(204)
    expect(post_office.sent).toHaveLength(1)
  })
})
