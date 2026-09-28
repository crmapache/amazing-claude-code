import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { beginsMidway } from '../feed/build'
import type { PanelState } from '../feed/panelState'

/**
 * How long to wait for a page of earlier messages before letting the mark be pressed again.
 *
 * Generous on purpose: on a phone the request goes to a machine across the city and back, and unlocking
 * early invites a second request for a page that is already on its way.
 */
const EARLIER_TIMEOUT_MS = 15_000

/**
 * How many rows a press has to put on screen before it counts as having done something.
 *
 * Not one: a page that adds a single folded row of tool calls is indistinguishable from a press that was
 * ignored, which is the whole complaint this exists to answer.
 */
export const MIN_ROWS_PER_PRESS = 5

/**
 * And how many further pages one press may fetch by itself. Bounded rather than "until enough": a
 * conversation can genuinely hold one burst of calls weighing more than a whole page's budget, and asking
 * forever would turn one press into a walk down the entire transcript.
 */
export const MAX_EXTRA_PAGES = 3

/**
 * Whether the page that just arrived leaves the press unfinished.
 *
 * A page is cut to a number of messages and to a budget in characters, and the budget can be spent by a
 * single outsized one (see ClaudeHistory.pageOf) - the page then arrives in full and moves the screen by
 * one row or by none. Rather than making the budget lie, the screen simply asks for the next page: a
 * second page is a second budget.
 *
 * Kept apart from the hook so it can be checked without a React tree.
 */
export const shouldAskAgain = (
  state: Pick<PanelState, 'lastPageRows' | 'reachedStart' | 'oldestEventUuid'>,
  fetched: number,
): boolean =>
  state.lastPageRows < MIN_ROWS_PER_PRESS &&
  !state.reachedStart &&
  state.oldestEventUuid !== undefined &&
  fetched < MAX_EXTRA_PAGES

/**
 * Whether there is anything above this feed to ask for.
 *
 * Either something on screen can be named for the request, or the feed says it begins partway through
 * and has nothing to name - it then asks for the newest page on disk (see beginsMidway). It used to wait
 * for something it could name, and a phone opening a tab full of a fleet's progress never got one: the
 * mark over the feed stood there as a caption for good.
 */
export const mayAskEarlier = (state: Pick<PanelState, 'oldestEventUuid' | 'reachedStart' | 'items'>): boolean =>
  !state.reachedStart && (state.oldestEventUuid !== undefined || beginsMidway(state.items))

/**
 * The mark over the feed that fetches the conversation above what is on screen.
 *
 * One hook for the panel and for the phone, because it is one behaviour: a tab opens a past conversation
 * with its end rather than the whole of it (see ClaudeHistory.opening), and this is how the rest arrives,
 * a page at a time. Duplicating it per screen is how the two would drift apart - the phone already had a
 * "loading" state of its own that the panel never got.
 *
 * [request] is how this screen asks; it is read at the moment of asking rather than captured, so an
 * inline arrow at the call site does not restart anything.
 *
 * The returned handler is undefined while there is nothing to fetch, which leaves the mark a plain
 * caption rather than a button: either the beginning is already on screen, or the feed is the whole
 * conversation, or an answer is still on its way (see mayAskEarlier).
 */
export const useEarlierPages = (
  state: Pick<PanelState, 'lastPageRows' | 'reachedStart' | 'oldestEventUuid' | 'earlierPages' | 'items'>,
  conversation: string,
  request: (before: string | undefined) => void,
): { loadEarlier?: () => void; loading: boolean } => {
  const [loading, setLoading] = useState(false)
  const fetched = useRef(0)

  /**
   * Which conversation the press belongs to, if any is under way.
   *
   * A tab switched while an answer is in flight is the reason this is not simply [loading]: the answer
   * counter belongs to whichever conversation is on screen, so the new one's count arrives looking exactly
   * like an answer to the old one's press - and the screen would fetch a page nobody asked for.
   */
  const awaiting = useRef<string | undefined>(undefined)

  const ask = useRef(request)
  ask.current = request

  /** What the answer will be measured against - read in the effect, which must not depend on it. */
  const latest = useRef(state)
  latest.current = state

  const settle = () => {
    awaiting.current = undefined
    setLoading(false)
  }

  /*
   * Another conversation, another history: neither the counter nor the wait carries over to it. Declared
   * before the effect below on purpose - within one commit effects run in the order they are written, and
   * this one has to disown the press before that one can mistake the new count for an answer to it.
   */
  useEffect(settle, [conversation])

  /*
   * An answer has arrived - see PanelState.earlierPages, which counts answers rather than cards: an
   * answer that adds nothing is an answer all the same (the beginning was reached, or the page did not
   * answer the boundary on screen), and waiting for cards that are never coming left the mark dead for
   * the rest of the session.
   *
   * Here that same fact decides whether the press is over: too few rows and there is more to ask for.
   */
  useEffect(() => {
    if (awaiting.current !== conversation) return

    const now = latest.current
    if (!shouldAskAgain(now, fetched.current) || now.oldestEventUuid === undefined) {
      settle()
      return
    }

    fetched.current += 1
    ask.current(now.oldestEventUuid)
  }, [state.earlierPages])

  /*
   * And a way out when no answer arrives at all. A page travels to a phone in one frame, and a frame over
   * the size limit is dropped between there and the IDE without a word to either end (see
   * ClaudeHistory.pageOf, which is what keeps pages under it). Left alone, the first such miss would lock
   * the mark for good.
   */
  useEffect(() => {
    if (!loading) return
    const timeout = setTimeout(settle, EARLIER_TIMEOUT_MS)
    return () => clearTimeout(timeout)
  }, [loading, state.earlierPages])

  const before = state.oldestEventUuid
  const askable = useMemo(
    () => mayAskEarlier({ oldestEventUuid: before, reachedStart: state.reachedStart, items: state.items }),
    [before, state.reachedStart, state.items],
  )
  const ready = askable && !loading

  const loadEarlier = useCallback(() => {
    fetched.current = 0
    awaiting.current = conversation
    setLoading(true)
    ask.current(before)
  }, [before, conversation])

  return { loadEarlier: ready ? loadEarlier : undefined, loading }
}
