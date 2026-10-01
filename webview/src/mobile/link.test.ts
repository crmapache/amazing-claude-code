import { describe, expect, it } from 'vitest'
import { cutInParts, FRAME_BODY_BYTES, handshakeBudget, PART_BYTES, reconnectAfter } from './link'

/**
 * When to connect again after the line dropped.
 *
 * A rule worth a test of its own because every wrong answer to it is a loop rather than a delay, and a
 * loop here is invisible from the code: it needs two copies of the app, a relay and a phone in hand to
 * see. Both of the cases below have been shipped wrong once.
 */
describe('deciding when to reconnect', () => {
  /**
   * The relay keeps one connection per device. A copy in the background that reconnects takes the line
   * from the copy in front of somebody's eyes - and that one takes it straight back, forever.
   */
  it('leaves the line alone when another copy took it and this one is not being looked at', () => {
    expect(reconnectAfter(4009, false, 1)).toBeNull()
  })

  /** The copy being looked at is the one that should hold the line - after a pause, not instantly. */
  it('takes the line back when this copy is the one in use', () => {
    expect(reconnectAfter(4009, true, 1)).toBeGreaterThan(0)
  })

  /** An ordinary break is the opposite case: always come back, and give up ground slowly. */
  it('always comes back from an ordinary break', () => {
    expect(reconnectAfter(1006, false, 1)).toBeGreaterThan(0)
    expect(reconnectAfter(1000, true, 1)).toBeGreaterThan(0)
  })

  it('backs off as attempts pile up, and stops at half a minute', () => {
    const first = reconnectAfter(1006, true, 1) ?? 0
    const later = reconnectAfter(1006, true, 4) ?? 0

    expect(later).toBeGreaterThan(first)
    expect(reconnectAfter(1006, true, 99)).toBe(30_000)
  })
})

/**
 * Two frames ask this phone to throw its keys away and start again - the relay's "there was a break"
 * and the agent's "your keys are stale" - and neither can be sealed, because both are about not having
 * keys. So anything carrying frames can send either, at any rate it likes.
 */
describe('how often an unsealed frame may start a handshake', () => {
  it('lets a genuine run of them through', () => {
    let asked: number[] = []

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const next = handshakeBudget(asked, 1_000 + attempt * 100)
      expect(next).not.toBeNull()
      asked = next as number[]
    }
  })

  it('stops a stream of them', () => {
    const asked = [1, 2, 3, 4, 5, 6].map((at) => at * 100)

    expect(handshakeBudget(asked, 1_000)).toBeNull()
  })

  it('forgets the old ones, so a phone off all morning still reconnects', () => {
    const asked = [1, 2, 3, 4, 5, 6].map((at) => at * 100)

    expect(handshakeBudget(asked, 10 * 60_000)).toEqual([10 * 60_000])
  })
})

/**
 * A message too big for one relay frame, cut into the frames that carry it (see RemoteParts in the plugin).
 *
 * What has to hold: the IDE joins the slices back into exactly the text that was cut, and no part ever
 * comes out over the relay's ceiling - a frame over it closes the phone's connection rather than failing
 * on its own.
 */
describe('cutting a message into parts', () => {
  const weight = (part: Record<string, unknown>): number => new TextEncoder().encode(JSON.stringify(part)).length
  const joined = (parts: Record<string, unknown>[]): string => parts.map((part) => part.d as string).join('')

  it('gives back the message whole when the slices are joined', () => {
    const message = JSON.stringify({ k: 'cmd', b: { type: 'prompt', text: 'привет', images: [{ data: 'A'.repeat(500_000) }] } })

    const parts = cutInParts(message, 'p-1')

    expect(parts.length).toBeGreaterThan(1)
    expect(joined(parts)).toBe(message)
    parts.forEach((part, index) => {
      expect(part).toMatchObject({ k: 'part', id: 'p-1', i: index, n: parts.length })
    })
  })

  it('keeps every part inside a frame, whatever the text is made of', () => {
    // Quotes are written out as two bytes and Cyrillic letters take two as well: cut by characters alone,
    // a slice of these would weigh twice the limit.
    const message = '"ж\\'.repeat(200_000) + 'B'.repeat(300_000)

    const parts = cutInParts(message, 'p-1')

    expect(joined(parts)).toBe(message)
    for (const part of parts) {
      expect(weight({ d: part.d })).toBeLessThanOrEqual(PART_BYTES + 16)
      expect(weight(part)).toBeLessThanOrEqual(FRAME_BODY_BYTES)
    }
  })

  it('never cuts a character in half', () => {
    // An emoji is two halves in the text; a cut between them leaves each slice holding half a character.
    const message = '😀'.repeat(50)

    const parts = cutInParts(message, 'p-1', 21)

    expect(joined(parts)).toBe(message)
    for (const part of parts) expect(JSON.stringify(part.d)).not.toMatch(/\\u[dD][89abAB]/)
  })
})
