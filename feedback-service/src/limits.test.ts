import { describe, expect, it } from 'vitest'
import { Limits } from './limits.js'

/** The counting that keeps this from becoming somebody's way of filling a chat. */
describe('how often it may be asked', () => {
  const hour = 60 * 60 * 1000

  it('allows a sender their share and then stops them', () => {
    const limits = new Limits(2, 100)

    expect(limits.allow('1.2.3.4', 0)).toBe(true)
    expect(limits.allow('1.2.3.4', 0)).toBe(true)
    expect(limits.allow('1.2.3.4', 0)).toBe(false)
  })

  it('counts senders apart from one another', () => {
    const limits = new Limits(1, 100)

    expect(limits.allow('1.2.3.4', 0)).toBe(true)
    expect(limits.allow('5.6.7.8', 0)).toBe(true)
  })

  it('has an overall ceiling too - the quota it guards is shared', () => {
    const limits = new Limits(10, 2)

    expect(limits.allow('1.1.1.1', 0)).toBe(true)
    expect(limits.allow('2.2.2.2', 0)).toBe(true)
    expect(limits.allow('3.3.3.3', 0)).toBe(false)
  })

  it('forgets everything when the hour turns', () => {
    const limits = new Limits(1, 1)
    limits.allow('1.2.3.4', 0)

    expect(limits.allow('1.2.3.4', hour)).toBe(true)
  })

  it('gives a slot back when nothing was forwarded', () => {
    const limits = new Limits(1, 1)
    limits.allow('1.2.3.4', 0)
    limits.refund('1.2.3.4', 0)

    expect(limits.allow('1.2.3.4', 0)).toBe(true)
  })

  it('does not give back a slot from an hour that has passed', () => {
    const limits = new Limits(1, 5)
    limits.allow('1.2.3.4', 0)

    // The turn of the hour cleared the count already; refunding into the new one would hand out a slot
    // nobody spent.
    limits.refund('1.2.3.4', hour)
    limits.allow('1.2.3.4', hour)

    expect(limits.allow('1.2.3.4', hour)).toBe(false)
  })
})
