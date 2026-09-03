import { describe, expect, it } from 'vitest'
import { FrameType, parse } from '../wire/frame.js'
import { Mailboxes } from './mailbox.js'

const address = (fill: number): Buffer => Buffer.alloc(16, fill)
const key = address(1).toString('base64url')
const sender = address(2)

const boxes = (over: Partial<{ ttlMs: number; maxFrames: number; maxBytes: number }> = {}) =>
  new Mailboxes({ ttlMs: 120_000, maxFrames: 200, maxBytes: 4 * 1024 * 1024, ...over })

const frame = (size = 10): Buffer => Buffer.alloc(size, 0x11)

describe('what is held for a side that blinked', () => {
  it('comes back in the order it arrived', () => {
    const held = boxes()
    held.hold(key, sender, Buffer.from('first'), 0)
    held.hold(key, sender, Buffer.from('second'), 1)

    expect(held.take(key, 2).map((buffer) => buffer.toString())).toEqual(['first', 'second'])
  })

  it('is handed over once and then gone', () => {
    const held = boxes()
    held.hold(key, sender, frame(), 0)

    held.take(key, 1)

    expect(held.take(key, 2)).toEqual([])
  })

  /**
   * The short life is the point: the agent keeps a journal and every client resumes by number, so this
   * only has to bridge a lift or a tunnel. Holding a night's traffic would be holding someone else's
   * conversation for a night, to no end.
   */
  it('expires rather than waits forever', () => {
    const held = boxes({ ttlMs: 1_000 })
    held.hold(key, sender, frame(), 0)

    const taken = held.take(key, 5_000)

    // What comes back is the relay's own note rather than the stale frame: the receiver is told to ask
    // the agent again instead of being handed part of a feed.
    expect(taken).toHaveLength(1)
    expect(parse(taken[0]!, 4096).type).toEqual(FrameType.CONTROL)
  })

  /**
   * Dropping the oldest silently would hand the receiver a feed with a hole nothing could notice. The
   * box goes instead and the receiver is told - the agent's journal has all of it anyway.
   */
  it('a box that overflows is replaced by a note, not by a shorter box', () => {
    const held = boxes({ maxFrames: 2 })
    held.hold(key, sender, Buffer.from('a'), 0)
    held.hold(key, sender, Buffer.from('b'), 0)
    held.hold(key, sender, Buffer.from('c'), 0)

    const taken = held.take(key, 1)

    expect(taken).toHaveLength(1)
    expect(parse(taken[0]!, 4096).type).toEqual(FrameType.CONTROL)
  })

  it('overflows by weight as well as by count', () => {
    const held = boxes({ maxBytes: 100 })
    held.hold(key, sender, frame(60), 0)
    held.hold(key, sender, frame(60), 0)

    const taken = held.take(key, 1)

    expect(taken).toHaveLength(1)
    expect(parse(taken[0]!, 4096).type).toEqual(FrameType.CONTROL)
  })

  it('sweeps what nobody came back for', () => {
    const held = boxes({ ttlMs: 1_000 })
    held.hold(key, sender, frame(), 0)

    held.sweep(5_000)

    expect(held.size()).toEqual(0)
  })

  it('leaves fresh frames alone when it sweeps', () => {
    const held = boxes({ ttlMs: 10_000 })
    held.hold(key, sender, frame(), 0)

    held.sweep(1_000)

    expect(held.size()).toEqual(1)
  })
})

/**
 * The note left when a box breaks.
 *
 * It is the one thing here that used to have no end: written when a buffer overflows or times out,
 * cleared only when that address comes back - and an address that never comes back is exactly what a
 * frame sent to nobody leaves behind.
 */
describe('the note that a box broke', () => {
  const overflowing = () => boxes({ maxFrames: 1, ttlMs: 1_000 })

  it('is forgotten if nobody ever comes for it', () => {
    const held = overflowing()
    held.hold(key, sender, frame(), 0)
    held.hold(key, sender, frame(), 0)

    expect(held.notes()).toEqual(1)

    held.sweep(60_000)

    expect(held.notes()).toEqual(0)
  })

  it('is still there for somebody who comes back in time', () => {
    const held = overflowing()
    held.hold(key, sender, frame(), 0)
    held.hold(key, sender, frame(), 0)

    held.sweep(2_000)

    expect(parse(held.take(key, 2_000)[0] as Buffer, 1024).type).toEqual(FrameType.CONTROL)
  })

  /**
   * Sixteen bytes must cost sixteen bytes. `parse` hands out views into the frame it read, so keeping
   * one as it arrived keeps the whole envelope it came in alive for as long as the note lives.
   */
  it('keeps a copy of the address rather than the frame it arrived in', () => {
    const held = overflowing()
    const envelope = Buffer.alloc(4096, 0x22)
    const from = envelope.subarray(18, 34)

    held.hold(key, from, envelope, 0)
    held.hold(key, from, envelope, 0)

    const note = (held as unknown as { broken: Map<string, { from: Buffer }> }).broken.get(key)

    // Not the same memory: a view would hold the 4 KB envelope (and up to a whole frame in life) for
    // as long as the note lives, which is what the note's own lifetime is there to bound.
    expect(note?.from.buffer).not.toBe(envelope.buffer)
    expect(note?.from).toEqual(from)
  })
})
