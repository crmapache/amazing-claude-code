import { controlFrame } from '../wire/frame.js'

/**
 * What is held for a side that is not connected at this moment.
 *
 * Short-lived on purpose. The agent keeps a journal of its own and every client resumes by number, so
 * this only has to bridge a flicker - a lift, a tunnel, a laptop lid - rather than a night. A long
 * buffer here would be a pile of other people's traffic sitting in memory to no end, and the one thing
 * this server should hold as little of as possible is other people's traffic.
 *
 * Nothing is written to disk, ever. A restart of the relay loses every mailbox, both sides reconnect
 * and catch up from the agent's journal. That is not a shortcoming to apologise for: it is why there
 * is nothing on this server's disk to leak.
 */

export interface MailboxLimits {
  ttlMs: number
  maxFrames: number
  maxBytes: number
}

interface Held {
  frame: Buffer
  at: number
  /** Who it came from - needed to compose the "resynchronise" note if this overflows. */
  from: Buffer
}

export class Mailboxes {
  private readonly boxes = new Map<string, Held[]>()

  /** Addresses whose buffer overflowed or expired: they get told, once, on reconnect. */
  private readonly broken = new Map<string, Buffer>()

  constructor(private readonly limits: MailboxLimits) {}

  hold(address: string, from: Buffer, frame: Buffer, now: number): void {
    const box = this.boxes.get(address) ?? []
    box.push({ frame, at: now, from })

    const bytes = box.reduce((total, held) => total + held.frame.length, 0)

    if (box.length > this.limits.maxFrames || bytes > this.limits.maxBytes) {
      // Dropping the oldest and saying nothing would hand the receiver a feed with a hole in it, which
      // it has no way of noticing. The whole box goes instead, and the receiver is told to ask again -
      // the agent's journal has everything, and asking is cheap.
      this.boxes.delete(address)
      this.broken.set(address, from)
      return
    }

    this.boxes.set(address, box)
  }

  /** Everything held for this address, oldest first, and the box is emptied. */
  take(address: string, now: number): Buffer[] {
    const parted = this.broken.get(address)
    this.broken.delete(address)

    const box = this.boxes.get(address) ?? []
    this.boxes.delete(address)

    const fresh = box.filter((held) => now - held.at <= this.limits.ttlMs)
    const expired = fresh.length < box.length

    const frames = fresh.map((held) => held.frame)

    // Either the box overflowed while they were away, or part of it timed out. Both mean the same
    // thing to the receiver: what you have is not the whole of it, ask for the rest.
    const from = parted ?? (expired ? box[0]?.from : undefined)
    if (from) frames.unshift(controlFrame(Buffer.from(address, 'base64url'), from))

    return frames
  }

  /** Old frames nobody came back for. Called on a timer; costs nothing when the map is empty. */
  sweep(now: number): void {
    for (const [address, box] of this.boxes) {
      const fresh = box.filter((held) => now - held.at <= this.limits.ttlMs)

      if (fresh.length === 0) {
        this.boxes.delete(address)
        const from = box[0]?.from
        if (from) this.broken.set(address, from)
        continue
      }

      if (fresh.length !== box.length) {
        this.boxes.set(address, fresh)
        const from = box[0]?.from
        if (from) this.broken.set(address, from)
      }
    }
  }

  size(): number {
    return this.boxes.size
  }
}
