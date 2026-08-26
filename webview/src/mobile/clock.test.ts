import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteClock } from './clock'

/**
 * The phone reading the IDE's clock instead of its own.
 *
 * What this guards is one visible symptom: the counter beside "Claude is thinking" opening a turn at a
 * negative number. It did that because the moment the turn began was stamped by the machine with the
 * IDE while "now" came off the device in someone's hand - see clock.ts.
 */

/** The phone's own clock, so a test can say what each side thinks the time is. */
const HERE = 1_700_000_000_000

afterEach(() => {
  vi.useRealTimers()
})

const at = (moment: number) => {
  vi.useFakeTimers()
  vi.setSystemTime(moment)
}

describe('the phone reading the IDE clock', () => {
  it('says its own time until it has heard anything', () => {
    at(HERE)
    expect(new RemoteClock().now()).toBe(HERE)
  })

  it('follows an IDE whose clock runs ahead', () => {
    at(HERE)
    const clock = new RemoteClock()
    // The machine with the IDE thinks it is five seconds later than this phone does.
    clock.observe(HERE + 5000)

    expect(clock.now()).toBe(HERE + 5000)
  })

  it('follows an IDE whose clock runs behind', () => {
    at(HERE)
    const clock = new RemoteClock()
    clock.observe(HERE - 5000)

    expect(clock.now()).toBe(HERE - 5000)
  })

  /**
   * The one thing that makes a turn count from a negative number: the difference has to be known before
   * the turn's own message is applied, and the estimate must not be dragged down by the slowest samples.
   */
  it('keeps a fresh turn out of the negative', () => {
    at(HERE)
    const clock = new RemoteClock()
    clock.observe(HERE + 5000)

    // A turn starting right now, stamped by the IDE.
    const turnStartedAt = clock.now()
    expect(clock.now() - turnStartedAt).toBeGreaterThanOrEqual(0)

    at(HERE + 1000)
    expect(clock.now() - turnStartedAt).toBe(1000)
  })

  /**
   * A sample is never early and always late - the wire and the relay both sit on the same side of it.
   * So the largest difference is the least delayed one, and the average would bake the delay in.
   */
  it('is not dragged down by the slow samples among fresh ones', () => {
    at(HERE)
    const clock = new RemoteClock()

    // Same true difference of five seconds, seen through delays of two seconds, none, and one.
    clock.observe(HERE + 3000)
    clock.observe(HERE + 5000)
    clock.observe(HERE + 4000)

    expect(clock.now()).toBe(HERE + 5000)
  })

  /**
   * A phone that crossed a timezone, an IDE whose clock was put right: the estimate has to be able to
   * come back down, which a best-ever-seen maximum could not.
   */
  it('lets go of a difference that stopped being true', () => {
    at(HERE)
    const clock = new RemoteClock()
    clock.observe(HERE + 60_000)
    expect(clock.now()).toBe(HERE + 60_000)

    // The window is sixteen samples wide; a couple of dozen agreeing on the new difference push the old
    // one out of it.
    for (let i = 0; i < 20; i += 1) clock.observe(HERE + 1000)

    expect(clock.now()).toBe(HERE + 1000)
  })

  /** Messages that are not kept carry no time - a zero would read as a clock half a century behind. */
  it('ignores a time that is not one', () => {
    at(HERE)
    const clock = new RemoteClock()
    clock.observe(0)
    clock.observe(Number.NaN)

    expect(clock.now()).toBe(HERE)
  })
})
