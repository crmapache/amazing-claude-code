import { describe, expect, it } from 'vitest'
import {
  addressHint,
  build,
  controlFrame,
  decodeAddress,
  encodeAddress,
  FrameError,
  FrameType,
  HEADER_BYTES,
  parse,
  WIRE_VERSION,
} from './frame.js'

const address = (fill: number): Buffer => Buffer.alloc(16, fill)

const MAX = 256 * 1024

describe('the envelope', () => {
  it('comes back out exactly as it went in', () => {
    const raw = build({
      type: FrameType.SEALED,
      to: address(1),
      from: address(2),
      counter: 42n,
      body: Buffer.from('sealed bytes'),
    })

    const frame = parse(raw, MAX)

    expect(frame.version).toEqual(WIRE_VERSION)
    expect(frame.type).toEqual(FrameType.SEALED)
    expect(frame.to.equals(address(1))).toBe(true)
    expect(frame.from.equals(address(2))).toBe(true)
    expect(frame.counter).toEqual(42n)
    expect(frame.body.toString()).toEqual('sealed bytes')
  })

  /** The counter becomes part of a nonce in phase 3, so it has to survive the full 64-bit range. */
  it('carries a counter far past what fits in a number', () => {
    const counter = 2n ** 60n + 7n
    const raw = build({ type: FrameType.SEALED, to: address(1), from: address(2), counter, body: Buffer.alloc(0) })

    expect(parse(raw, MAX).counter).toEqual(counter)
  })

  it('refuses something shorter than a header', () => {
    expect(() => parse(Buffer.alloc(HEADER_BYTES - 1), MAX)).toThrow(FrameError)
  })

  it('refuses something over the size limit', () => {
    const raw = build({
      type: FrameType.SEALED,
      to: address(1),
      from: address(2),
      counter: 0n,
      body: Buffer.alloc(100),
    })

    expect(() => parse(raw, 50)).toThrow(FrameError)
  })

  it('refuses a version it does not know', () => {
    const raw = build({ type: FrameType.SEALED, to: address(1), from: address(2), counter: 0n, body: Buffer.alloc(0) })
    raw.writeUInt8(99, 0)

    expect(() => parse(raw, MAX)).toThrow(/wire version/)
  })

  it('refuses a frame type it does not know', () => {
    const raw = build({ type: FrameType.SEALED, to: address(1), from: address(2), counter: 0n, body: Buffer.alloc(0) })
    raw.writeUInt8(0x7f, 1)

    expect(() => parse(raw, MAX)).toThrow(/frame type/)
  })

  it('refuses an address that is not sixteen bytes', () => {
    expect(() =>
      build({ type: FrameType.SEALED, to: Buffer.alloc(8), from: address(2), counter: 0n, body: Buffer.alloc(0) }),
    ).toThrow(FrameError)

    expect(() => decodeAddress('too-short')).toThrow(FrameError)
  })

  it('writes an address as twenty-two characters and reads it back', () => {
    const text = encodeAddress(address(7))

    expect(text).toHaveLength(22)
    expect(decodeAddress(text).equals(address(7))).toBe(true)
  })

  /** A log line gets four bytes and never more: the address is the one thing this server does keep. */
  it('gives a log only the first four bytes of an address', () => {
    expect(addressHint(address(0xab))).toEqual('abababab')
  })

  /**
   * The relay's own note has a type of its own so that it can never be taken for something an agent
   * said - the receiver treats it as advice to resynchronise and never as content.
   */
  it('marks its own note as a different kind of frame', () => {
    const frame = parse(controlFrame(address(1), address(2)), MAX)

    expect(frame.type).toEqual(FrameType.CONTROL)
    expect(frame.body).toHaveLength(0)
  })
})
