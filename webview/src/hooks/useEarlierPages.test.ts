import { describe, expect, it } from 'vitest'
import { MAX_EXTRA_PAGES, MIN_ROWS_PER_PRESS, shouldAskAgain } from './useEarlierPages'

/**
 * When one press of "load earlier" is over.
 *
 * A page is cut both to a number of messages and to a budget in characters, and a single outsized message
 * can spend the whole budget by itself (see ClaudeHistory.pageOf). The page then arrives in full and moves
 * the screen by one row or by none - which is what the press looked like from the outside. So the screen
 * asks again instead: a second page is a second budget.
 */
describe('whether a press of "load earlier" has more to fetch', () => {
  const arrived = (rows: number) => ({ lastPageRows: rows, reachedStart: false, oldestEventUuid: 'u1' })

  it('asks again when the page barely moved the screen', () => {
    expect(shouldAskAgain(arrived(1), 0)).toBe(true)
  })

  it('stops once the page brought enough to look at', () => {
    expect(shouldAskAgain(arrived(MIN_ROWS_PER_PRESS), 0)).toBe(false)
  })

  /** There is nothing above the beginning, and asking for it would fetch the same page forever. */
  it('stops at the beginning of the conversation', () => {
    expect(shouldAskAgain({ ...arrived(0), reachedStart: true }, 0)).toBe(false)
  })

  /** With no boundary there is nothing to anchor the request on - the answer would be the file's own end. */
  it('stops when there is nothing to anchor the request on', () => {
    expect(shouldAskAgain({ ...arrived(0), oldestEventUuid: undefined }, 0)).toBe(false)
  })

  /**
   * A conversation can genuinely hold one burst of calls weighing more than a page's whole budget, and
   * every page of it would then be one row. Bounded, so that one press cannot walk the entire transcript.
   */
  it('stops after its share of pages, however little each brought', () => {
    expect(shouldAskAgain(arrived(0), MAX_EXTRA_PAGES - 1)).toBe(true)
    expect(shouldAskAgain(arrived(0), MAX_EXTRA_PAGES)).toBe(false)
  })
})
