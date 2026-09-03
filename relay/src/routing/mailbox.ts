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

/** A note that a box broke, and when - see [Mailboxes.note]. */
interface Broken {
  /** A copy of the sixteen address bytes, never the view they arrived in. */
  from: Buffer
  at: number
}

/**
 * How long a "you missed some" note is worth keeping, as a multiple of the frames' own life.
 *
 * The note is only ever read at the moment that address next connects, and anyone away longer than
 * the mailbox itself has nothing left to collect: the frames it would have explained expired long
 * before. Ten times over is generous for the case this exists for - a lift, a tunnel - and it is a
 * bound rather than "forever", which is what the map had before.
 */
const BROKEN_TTL_FACTOR = 10

/**
 * And how many such notes at once. The timer cannot answer this on its own: frames addressed to
 * nobody make notes that nobody ever comes for, and they arrive as fast as somebody cares to send
 * them.
 */
const MAX_BROKEN = 50_000

export class Mailboxes {
  private readonly boxes = new Map<string, Held[]>()

  /** Addresses whose buffer overflowed or expired: they get told, once, on reconnect. */
  private readonly broken = new Map<string, Broken>()

  constructor(private readonly limits: MailboxLimits) {}

  /**
   * Write down that this address missed something.
   *
   * The copy is the load-bearing part. `parse` hands out views into the frame it read rather than
   * copies, so keeping the sixteen bytes of an address as they arrived keeps the whole envelope they
   * came in - up to the frame ceiling - alive for as long as the note lives. Sixteen bytes must cost
   * sixteen bytes.
   */
  private note(address: string, from: Buffer, now: number): void {
    // Re-inserted rather than overwritten, so the map's own order stays the order of `at` - which is
    // what makes dropping from the front of it below mean "the oldest".
    this.broken.delete(address)
    this.broken.set(address, { from: Buffer.from(from), at: now })

    while (this.broken.size > MAX_BROKEN) {
      const oldest = this.broken.keys().next().value
      if (oldest === undefined) break
      this.broken.delete(oldest)
    }
  }

  hold(address: string, from: Buffer, frame: Buffer, now: number): void {
    const box = this.boxes.get(address) ?? []
    box.push({ frame, at: now, from })

    const bytes = box.reduce((total, held) => total + held.frame.length, 0)

    if (box.length > this.limits.maxFrames || bytes > this.limits.maxBytes) {
      // Dropping the oldest and saying nothing would hand the receiver a feed with a hole in it, which
      // it has no way of noticing. The whole box goes instead, and the receiver is told to ask again -
      // the agent's journal has everything, and asking is cheap.
      this.boxes.delete(address)
      this.note(address, from, now)
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
    const from = parted?.from ?? (expired ? box[0]?.from : undefined)
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
        if (from) this.note(address, from, now)
        continue
      }

      if (fresh.length !== box.length) {
        this.boxes.set(address, fresh)
        const from = box[0]?.from
        if (from) this.note(address, from, now)
      }
    }

    // The notes themselves. Without this the map only ever grew: a note is cleared when its address
    // comes back, and an address that never comes back is exactly what a frame sent to nobody leaves
    // behind. The loop above writes notes at `now`, so nothing it just wrote is caught here.
    const stale = this.limits.ttlMs * BROKEN_TTL_FACTOR
    for (const [address, note] of this.broken) {
      if (now - note.at > stale) this.broken.delete(address)
    }
  }

  size(): number {
    return this.boxes.size
  }

  /** How many "you missed some" notes are held. For tests, and for a log line worth having. */
  notes(): number {
    return this.broken.size
  }
}
