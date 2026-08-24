import { describe, expect, it } from 'vitest'
import { reconnectAfter } from './link'

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
