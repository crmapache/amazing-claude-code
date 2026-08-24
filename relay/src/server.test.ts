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
})
