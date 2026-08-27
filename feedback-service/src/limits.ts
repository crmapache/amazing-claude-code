/**
 * How often this may be asked.
 *
 * The endpoint is public by construction: its address is compiled into a plugin anybody can download, so
 * the shared secret beside it is a speed bump rather than a lock (see FeedbackSender). What actually
 * keeps this service from becoming somebody's way of filling a chat is the counting here.
 *
 * Two ceilings, because they answer different worries. Per address: one person, or one script pretending
 * to be one. Overall: everybody at once - which is the one that matters, since the thing being protected
 * is a Telegram quota shared by every message the bot sends.
 *
 * Whole hours rather than a sliding window, on purpose. A sliding window means keeping a timestamp per
 * request per address; an hour means keeping a count and the hour it belongs to. The difference in
 * fairness is a few messages at an hour's boundary, and the difference in what this server holds about
 * the people using it is everything.
 */
export class Limits {
  private hour = 0

  private overall = 0

  private byAddress = new Map<string, number>()

  constructor(
    private readonly perIpPerHour: number,
    private readonly perHour: number,
  ) {}

  /** Whether this address may send one right now - and if so, count it. */
  allow(address: string, now: number): boolean {
    const hour = Math.floor(now / HOUR)

    if (hour !== this.hour) {
      this.hour = hour
      this.overall = 0
      this.byAddress = new Map()
    }

    if (this.overall >= this.perHour) return false

    const sent = this.byAddress.get(address) ?? 0
    if (sent >= this.perIpPerHour) return false

    this.overall += 1
    this.byAddress.set(address, sent + 1)
    return true
  }

  /**
   * Give a slot back, when a message turned out not to be forwarded after all. A person whose report
   * failed on Telegram's side will press the button again, and being told "too many messages" for the
   * first attempt that never arrived is the worst answer this service could give.
   */
  refund(address: string, now: number): void {
    if (Math.floor(now / HOUR) !== this.hour) return

    this.overall = Math.max(0, this.overall - 1)
    const sent = this.byAddress.get(address) ?? 0
    if (sent > 0) this.byAddress.set(address, sent - 1)
  }
}

const HOUR = 60 * 60 * 1000
