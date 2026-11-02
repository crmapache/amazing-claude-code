import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { selectedIn } from '../hooks/useSelection'

/**
 * How long a press on the button keeps the selection it was shown for, when the press did not end in a
 * tap. Long enough for the tap's click to arrive after the finger lifts; a finger slid off the button
 * lets go of it after this.
 */
const PRESS_HOLD_MS = 400

/**
 * The strip at the bottom of the feed the button takes: its offset from the edge, a fingertip's height (see
 * --acc-hit) and a little air above it. Words selected in it would be under the button.
 */
const BUTTON_ROOM = 16 + 44 + 12

/** Where the button stands over the feed - see [placeOf]. */
export type QuotePlace = 'bottom' | 'top'

export interface TouchSelection {
  /** The words selected in an answer, or null while nothing a quote can be made of is selected. */
  text: string | null
  place: QuotePlace
  /** A finger is on the button: keep what it was shown for, whatever the tap does to the selection. */
  hold: () => void
  /** The finger left without a tap: go by the selection again. */
  release: () => void
  /** The words were used: unmark them and put the button away. */
  take: () => void
}

/**
 * At the bottom of the feed, unless that is where the selected words are.
 *
 * Words selected in the last lines on screen - the answer just written, which is the usual thing to quote -
 * would have the button standing on them and on the handle that widens them. The top then, unless the
 * selection fills the screen from there too: then nowhere is clear, and the bottom is nearest the field.
 */
export const placeOf = (selected: { top: number; bottom: number }, feed: { top: number; bottom: number }): QuotePlace =>
  selected.bottom > feed.bottom - BUTTON_ROOM && selected.top > feed.top + BUTTON_ROOM ? 'top' : 'bottom'

/**
 * The words selected in an answer on a phone - what the button over the feed quotes.
 *
 * The desk reads its selection on the mouse's release and hangs a menu beside it (see useSelection). Neither
 * exists under a thumb: a long press selects a word, the handles widen it, and not one of those steps is a
 * mouse event the page hears - so this follows the selection itself, a frame at a time, and the scrolling of
 * the feed under it. Which words count is the desk's own rule (see selectedIn): the text of an answer, more
 * than a stray tap's worth.
 *
 * The button has to outlive its own tap. A tap anywhere unmarks the text, on iOS and Android alike, and a
 * button that went with the selection would be gone before its click arrived - so a finger on it holds what
 * it was shown for until the click, or until the finger is lifted elsewhere.
 */
export const useTouchSelection = (container: RefObject<HTMLElement | null>, on: boolean): TouchSelection => {
  const [shown, setShown] = useState<{ text: string; place: QuotePlace } | null>(null)
  const held = useRef(false)
  const letGo = useRef(0)

  const look = useCallback(() => {
    if (held.current) return

    const box = container.current
    const selected = selectedIn(box)
    const next =
      box && selected
        ? { text: selected.text, place: placeOf(selected.range.getBoundingClientRect(), box.getBoundingClientRect()) }
        : null

    // The same words in the same place are no news - and this runs on every frame of a scroll.
    setShown((current) =>
      current?.text === next?.text && current?.place === next?.place ? current : next,
    )
  }, [container])

  useEffect(() => {
    if (!on) {
      setShown(null)
      return
    }

    // A frame at a time: dragging a handle changes the selection on every pixel it travels.
    let frame = 0
    const onChange = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          look()
        })
      }
    }

    look()
    document.addEventListener('selectionchange', onChange)
    // Capture: the feed scrolls inside its own box, and that event does not travel up to the document.
    document.addEventListener('scroll', onChange, true)
    window.addEventListener('resize', onChange)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', onChange)
      document.removeEventListener('scroll', onChange, true)
      window.removeEventListener('resize', onChange)
    }
  }, [on, look])

  useEffect(() => () => window.clearTimeout(letGo.current), [])

  const hold = useCallback(() => {
    window.clearTimeout(letGo.current)
    held.current = true
  }, [])

  const release = useCallback(() => {
    window.clearTimeout(letGo.current)
    // Later rather than now: the finger lifting comes before the tap's click, and the button looked up
    // again at this moment - its selection already taken by the tap - would be gone before the click.
    letGo.current = window.setTimeout(() => {
      held.current = false
      look()
    }, PRESS_HOLD_MS)
  }, [look])

  const take = useCallback(() => {
    window.clearTimeout(letGo.current)
    held.current = false
    window.getSelection()?.removeAllRanges()
    setShown(null)
  }, [])

  return { text: shown?.text ?? null, place: shown?.place ?? 'bottom', hold, release, take }
}
