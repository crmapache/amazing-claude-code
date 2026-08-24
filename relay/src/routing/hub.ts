import type { WebSocket } from 'ws'
import { addressHint, encodeAddress, type Frame } from '../wire/frame.js'
import { Mailboxes } from './mailbox.js'

/**
 * Who is connected, and where a frame goes next.
 *
 * The whole of the relay's knowledge is here: a map from an opaque address to an open socket. No
 * accounts, no pairs, no idea which agent belongs to which person - there is nothing of the sort to
 * know, because the plugin and the phone establish that between themselves and tell this server
 * nothing about it (see the plan's §3.5).
 *
 * A consequence worth naming: the relay cannot tell a pairing frame from a feed frame. It has no code
 * about pairing at all - so there is nothing there to leak, get wrong, or be trusted with.
 */

export type Kind = 'agent' | 'device'

interface Connection {
  socket: WebSocket
  kind: Kind
  address: Buffer
  since: number
}

export class Hub {
  private readonly connections = new Map<string, Connection>()

  constructor(
    private readonly mailboxes: Mailboxes,
    private readonly log: (line: string) => void,
  ) {}

  /**
   * Take a connection for an address. One live connection per address: a second IDE started from the
   * same config would otherwise fight the first over every frame, each taking half.
   *
   * The one being displaced is closed with a code of its own rather than silently, so it can say why
   * it stopped instead of reconnecting forever.
   */
  open(address: Buffer, kind: Kind, socket: WebSocket, now: number): void {
    const key = encodeAddress(address)
    const existing = this.connections.get(key)

    if (existing) {
      this.log(`displacing an earlier connection for ${addressHint(address)}`)
      existing.socket.close(CLOSE_DISPLACED, 'another connection took this address')
    }

    this.connections.set(key, { socket, kind, address, since: now })

    // Whatever arrived while they were away, in the order it arrived.
    for (const frame of this.mailboxes.take(key, now)) {
      socket.send(frame)
    }
  }

  close(address: Buffer, socket: WebSocket): void {
    const key = encodeAddress(address)
    // Only if it is still ours: a displaced connection closing later must not take the new one with it.
    if (this.connections.get(key)?.socket === socket) this.connections.delete(key)
  }

  /**
   * Pass a frame on. Byte for byte: what arrives is what leaves, and nothing in between looks at the
   * body.
   */
  route(frame: Frame, raw: Buffer, now: number): void {
    const key = encodeAddress(frame.to)
    const target = this.connections.get(key)

    if (target) {
      target.socket.send(raw)
      return
    }

    this.mailboxes.hold(key, frame.from, raw, now)
  }

  /** Whether an address is connected right now - the one fact a paired device may ask about. */
  present(address: Buffer): boolean {
    return this.connections.has(encodeAddress(address))
  }

  count(): number {
    return this.connections.size
  }
}

/** The connection was taken over by another one for the same address. */
export const CLOSE_DISPLACED = 4009

/** The wire version is not one this relay speaks. */
export const CLOSE_BAD_VERSION = 4002

/** The address in the URL was not an address. */
export const CLOSE_BAD_ADDRESS = 4001
