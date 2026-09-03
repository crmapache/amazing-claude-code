import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { readConfig } from './config.js'
import { createRelay, type Relay } from './server.js'
import { build, encodeAddress, FrameType, parse, WIRE_VERSION } from './wire/frame.js'

/**
 * A real relay on a real port, with real sockets.
 *
 * What is being tested is the routing and the refusals - exactly the parts a stubbed socket would
 * stub out. It is quick: the whole server is one process with a map in it.
 */

const address = (fill: number): Buffer => Buffer.alloc(16, fill)

const agent = address(0xa1)
const device = address(0xd1)

const sealed = (to: Buffer, from: Buffer, body: string): Buffer =>
  build({ type: FrameType.SEALED, to, from, counter: 1n, body: Buffer.from(body) })

/**
 * Frames are collected from the moment the socket opens rather than awaited one at a time.
 *
 * The relay hands over whatever was waiting the instant a side connects, and a listener attached after
 * that has already missed it - which is a race in the test rather than in the server, and exactly the
 * kind that reads as a flaky server.
 */
const inbox = new WeakMap<WebSocket, Buffer[]>()

const open = (port: number, path: string, id: Buffer): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}?id=${encodeAddress(id)}`)
    const frames: Buffer[] = []
    inbox.set(socket, frames)
    socket.on('message', (data) => frames.push(data as Buffer))
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })

const nextFrame = async (socket: WebSocket): Promise<Buffer> => {
  const frames = inbox.get(socket) ?? []

  for (let waited = 0; waited < 2000; waited += 20) {
    const frame = frames.shift()
    if (frame) return frame
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  throw new Error('no frame arrived')
}

const closedWith = (socket: WebSocket): Promise<number> =>
  new Promise((resolve) => socket.once('close', (code) => resolve(code)))

describe('the relay', () => {
  let relay: Relay
  let listening: number
  const opened: WebSocket[] = []

  beforeEach(async () => {
    relay = createRelay({ ...readConfig(), staticDir: '', logLevel: 'silent' }, () => {})
    // Port zero, so several test files can run at once without agreeing on numbers.
    listening = await relay.listen(0)
  })

  afterEach(() => {
    for (const socket of opened) socket.close()
    opened.length = 0
    relay.close()
  })

  it('passes a frame from one side to the other, byte for byte', async () => {
    const a = await open(listening, '/v1/agent', agent)
    const d = await open(listening, '/v1/device', device)
    opened.push(a, d)

    const frame = sealed(device, agent, 'sealed bytes')
    a.send(frame)

    const arrived = await nextFrame(d)
    expect(arrived.equals(frame)).toBe(true)
  })

  /**
   * The relay reads two offsets and forwards. It never learns what is inside, which is the whole claim
   * this server makes - so the body it hands over must be exactly the body it was given.
   */
  it('does not touch the body', async () => {
    const a = await open(listening, '/v1/agent', agent)
    const d = await open(listening, '/v1/device', device)
    opened.push(a, d)

    const body = 'a'.repeat(5000)
    a.send(sealed(device, agent, body))

    const frame = parse(await nextFrame(d), 256 * 1024)
    expect(frame.body.toString()).toEqual(body)
    expect(frame.version).toEqual(WIRE_VERSION)
  })

  /**
   * A device could otherwise address an agent it was never paired with by guessing an id, and the
   * agent would at least have to spend the work of failing to decrypt it.
   */
  it('drops a frame that claims to come from someone else', async () => {
    const a = await open(listening, '/v1/agent', agent)
    const d = await open(listening, '/v1/device', device)
    opened.push(a, d)

    // The device sends a frame claiming the agent's own address as its sender.
    d.send(sealed(agent, agent, 'forged'))

    await expect(nextFrame(a)).rejects.toThrow('no frame arrived')
  })

  it('holds a frame for a side that is not there, and hands it over on arrival', async () => {
    const a = await open(listening, '/v1/agent', agent)
    opened.push(a)

    a.send(sealed(device, agent, 'waiting'))

    const d = await open(listening, '/v1/device', device)
    opened.push(d)

    expect(parse(await nextFrame(d), 256 * 1024).body.toString()).toEqual('waiting')
  })

  /**
   * Two IDEs started from one configuration would otherwise fight over every frame, each taking half -
   * a failure that looks like a flaky network and is not.
   */
  it('lets a second connection for one address displace the first', async () => {
    const first = await open(listening, '/v1/agent', agent)
    const closing = closedWith(first)

    const second = await open(listening, '/v1/agent', agent)
    opened.push(second)

    expect(await closing).toEqual(4009)
  })

  it('refuses a connection whose address is not an address', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${listening}/v1/agent?id=nonsense`)
    opened.push(socket)

    expect(await closedWith(socket)).toEqual(4001)
  })

  it('refuses a text frame: every real one is binary', async () => {
    const a = await open(listening, '/v1/agent', agent)
    opened.push(a)

    a.send('hello?')

    expect(await closedWith(a)).toEqual(4002)
  })

  it('answers a liveness probe', async () => {

    const response = await fetch(`http://127.0.0.1:${listening}/healthz`)

    expect(response.status).toEqual(200)
    expect(await response.text()).toEqual('ok')
  })

  /** The plugin reads this before it connects, so it can say "update me" in words. */
  it('tells a caller what it speaks', async () => {

    const info = (await (await fetch(`http://127.0.0.1:${listening}/v1/info`)).json()) as {
      wireMin: number
      wireMax: number
      maxFrameBytes: number
    }

    expect(info.wireMin).toEqual(WIRE_VERSION)
    expect(info.wireMax).toEqual(WIRE_VERSION)
    expect(info.maxFrameBytes).toBeGreaterThan(0)
  })

  /**
   * A websocket ignores the same-origin policy, so without this any page anybody has open could dial
   * this server through their browser. The plugin sends no Origin at all and must not be caught by it -
   * every other test in this file relies on that, since the client here sends none either.
   */
  it('refuses a browser page from an origin it does not serve', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${listening}/v1/device?id=${encodeAddress(device)}`, {
      origin: 'https://somebody-elses-page.example',
    })
    opened.push(socket)

    await expect(
      new Promise((resolve, reject) => {
        socket.once('open', () => resolve('opened'))
        socket.once('error', reject)
      }),
    ).rejects.toThrow()
  })

  /**
   * The ceiling belongs to the transport, not to a check made afterwards: the library's own default is
   * a hundred megabytes and it holds all of them before anything here gets to measure.
   */
  it('closes a socket that sends more than a frame is allowed to be', async () => {
    const d = await open(listening, '/v1/device', device)
    opened.push(d)

    const closing = closedWith(d)
    d.send(Buffer.alloc(300 * 1024))

    expect(await closing).toEqual(1009)
  })

  describe('subscribing to be woken', () => {
    const subscribe = (body: unknown): Promise<Response> =>
      fetch(`http://127.0.0.1:${listening}/v1/push/subscribe`, {
        method: 'POST',
        body: JSON.stringify(body),
      })

    const real = {
      deviceId: encodeAddress(device),
      endpoint: 'https://web.push.apple.com/QWERTY',
      keys: { p256dh: 'a'.repeat(88), auth: 'b'.repeat(22) },
    }

    /**
     * The only thing this server can honestly ask of a stranger. It cannot know who is paired with
     * whom - that is the point of it - but a phone subscribing has its own line open at that moment,
     * and filling this map with invented devices then costs a socket apiece.
     */
    it('refuses an address nobody is holding a socket for', async () => {
      expect((await subscribe(real)).status).toEqual(403)
    })

    it('takes one from a device that is here', async () => {
      opened.push(await open(listening, '/v1/device', device))

      expect((await subscribe(real)).status).toEqual(204)
    })

    /** The endpoint is a URL this server will later post to, so an unknown one is one it declines. */
    it('refuses an endpoint that is not a push service', async () => {
      opened.push(await open(listening, '/v1/device', device))

      expect((await subscribe({ ...real, endpoint: 'http://169.254.169.254/latest/meta-data/' })).status).toEqual(400)
      expect((await subscribe({ ...real, endpoint: 'https://somewhere-else.example/x' })).status).toEqual(400)
    })

    it('refuses an id that is not an address', async () => {
      expect((await subscribe({ ...real, deviceId: '../../etc' })).status).toEqual(400)
    })

    /** A subscription is a few hundred bytes. Nothing else is a subscription. */
    it('stops reading a body that will not stop', async () => {
      const response = await fetch(`http://127.0.0.1:${listening}/v1/push/subscribe`, {
        method: 'POST',
        body: 'x'.repeat(64 * 1024),
      })

      expect(response.status).toEqual(413)
    })
  })
})
