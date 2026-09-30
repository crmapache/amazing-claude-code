/**
 * How often one address may ask for something within a window.
 *
 * Two uses: reports (a generous ceiling - an office behind one address is many machines) and attempts at
 * the admin password (a tight one - a person mistypes it twice, a script tries it thousands of times).
 *
 * Whole windows rather than a sliding one, as in the feedback service next door: a count and the window
 * it belongs to is all that is kept, and it is forgotten when the window turns. The addresses live in
 * memory only, never on disk - this service keeps no address of anybody anywhere.
 */
export class Limits {
  private window = 0

  private byAddress = new Map<string, number>()

  constructor(
    private readonly perWindow: number,
    private readonly windowMs: number,
  ) {}

  /** Whether this address may go ahead right now - and if so, count it. */
  allow(address: string, now: number): boolean {
    const window = Math.floor(now / this.windowMs)

    if (window !== this.window) {
      this.window = window
      this.byAddress = new Map()
    }

    const used = this.byAddress.get(address) ?? 0
    if (used >= this.perWindow) return false

    this.byAddress.set(address, used + 1)
    return true
  }
}
