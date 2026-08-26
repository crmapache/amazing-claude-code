/**
 * The clock of the IDE this phone is watching.
 *
 * Every message kept in a conversation's journal carries the moment it happened - by the clock of the
 * machine the IDE runs on (see JournalMarks in protocol.ts), and that is the clock the feed's state is
 * built in on this side too: the phone hands that same moment to the reducer as "now" (see
 * applyMessage), so the moment a turn began and the moment each call started are all the IDE's time.
 *
 * A phone answering "how long has this been running" against its own Date.now() therefore subtracts one
 * machine's clock from another's, and two clocks agree only by luck. A couple of seconds of
 * disagreement is enough for the counter beside "Claude is thinking" to open a turn at a negative
 * number and count its way up to zero - which is exactly what it did. So the phone keeps an estimate of
 * the difference and asks it for the time instead of asking itself.
 *
 * What it is fed is the inventory - the list of conversations, which carries the moment it was sent
 * (see RemoteAgent.inventoryBody). The journal's own entries are not used for this, though they carry a
 * time too, because theirs says when something happened rather than what time it is now: a conversation
 * caught up from its journal arrives as a pile of moments hours old, and a clock set by them would be
 * hours slow. The inventory, meanwhile, is sent whenever a conversation changes state - the start of a
 * turn among them - and every half minute regardless (see the probe in link.ts), so what this knows is
 * never stale by more than that.
 *
 * The estimate is the LARGEST of the recent samples rather than the latest or their average, because a
 * sample is never early and always late: the message spent time on the wire and in the relay before it
 * was seen here, and every bit of that lands on one side - it makes the IDE's clock look further behind
 * than it is. The least delayed sample is the truest one, and the largest difference is the least
 * delayed one.
 *
 * A window of the recent ones rather than the best ever seen: a phone that flew across timezones, an
 * IDE whose clock was put right, a laptop back from a week of sleep - a lifetime maximum would hold on
 * to a difference that stopped being true and would never let go of it.
 */
const WINDOW = 16

export class RemoteClock {
  private readonly samples: number[] = []
  private shift = 0

  /**
   * Note when a message stamped with the IDE's time was seen here.
   *
   * `received` is a parameter only so a test can hand it both sides of the comparison; nothing calls it
   * with one.
   */
  observe(at: number, received: number = Date.now()): void {
    // An IDE older than this field sends no time at all, and a zero would read as a clock half a
    // century behind.
    if (!Number.isFinite(at) || at <= 0) return

    this.samples.push(at - received)
    if (this.samples.length > WINDOW) this.samples.shift()

    let largest = this.samples[0]!
    for (const sample of this.samples) if (sample > largest) largest = sample
    this.shift = largest
  }

  /**
   * What the IDE's clock says at this moment, as far as this phone can tell.
   *
   * An arrow function rather than a method so it can be handed over on its own - a screen is given the
   * reading of the clock, not the clock (see Thread.tsx).
   */
  now = (): number => Date.now() + this.shift
}
