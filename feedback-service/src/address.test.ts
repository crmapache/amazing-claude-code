import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { addressOf } from './server.js'

/**
 * Who a request is counted as coming from.
 *
 * This is the whole of the per-address ceiling: get it wrong and the ceiling is decoration, because the
 * header it reads is written by the caller. The rule is that only as many hops as we actually own are
 * believed, and they are counted from our end of the chain - not from the caller's.
 */
const asking = (header: string | undefined, socket = '203.0.113.9'): IncomingMessage =>
  ({
    headers: header === undefined ? {} : { 'x-forwarded-for': header },
    socket: { remoteAddress: socket },
  }) as unknown as IncomingMessage

describe('with no trusted proxy', () => {
  it('ignores the header completely', () => {
    expect(addressOf(asking('1.2.3.4'), 0)).toBe('203.0.113.9')
  })

  it('unwraps an IPv4 address the socket reported as IPv6', () => {
    expect(addressOf(asking(undefined, '::ffff:198.51.100.7'), 0)).toBe('198.51.100.7')
  })
})

describe('behind one proxy of ours', () => {
  it('takes the entry our own proxy added, which is the last one', () => {
    expect(addressOf(asking('198.51.100.7'), 1)).toBe('198.51.100.7')
  })

  it('cannot be walked past by writing entries into the header', () => {
    // Whatever the caller puts in front, the last entry is still what our proxy saw.
    const forged = addressOf(asking('9.9.9.9, 8.8.8.8, 198.51.100.7'), 1)

    expect(forged).toBe('198.51.100.7')
  })

  it('falls back to the socket when the header is not there at all', () => {
    expect(addressOf(asking(undefined), 1)).toBe('203.0.113.9')
  })
})

describe('behind two proxies of ours', () => {
  it('steps back two entries', () => {
    expect(addressOf(asking('1.2.3.4, 198.51.100.7, 10.0.0.1'), 2)).toBe('198.51.100.7')
  })

  it('uses the socket when the chain is shorter than the hops we own', () => {
    // Somebody reached us past a hop; the header cannot be placed, so it is not believed.
    expect(addressOf(asking('1.2.3.4'), 2)).toBe('203.0.113.9')
  })
})
