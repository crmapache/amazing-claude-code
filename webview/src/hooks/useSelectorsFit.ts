import { type RefObject, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'

import { selectorsFit, type SelectorsFit } from '../composerFit'

/**
 * How much of the three selectors the status row can afford right now (see selectorsFit).
 *
 * `room` is the selectors' own block: on a line of its own it is as wide as the row, beside the usage it
 * is exactly as wide as the three need. `ruler` holds the same three drawn twice at their natural width,
 * with the captions and without them (see StatusBar) - that is what the room is compared with.
 *
 * Measured before the paint rather than after it: the observer's answer is applied synchronously, so a
 * panel being dragged narrow never shows a frame of selectors pushed past its edge. Comparing against the
 * ruler rather than the row itself is what keeps that from looping - the ruler does not change when the
 * captions come and go, so the answer after the change is the answer before it.
 */
export const useSelectorsFit = (
  room: RefObject<HTMLElement | null>,
  ruler: RefObject<HTMLElement | null>,
): SelectorsFit => {
  const [fit, setFit] = useState<SelectorsFit>('full')

  useLayoutEffect(() => {
    const block = room.current
    const [full, terse] = Array.from(ruler.current?.children ?? []) as HTMLElement[]
    if (!block || !full || !terse || typeof ResizeObserver === 'undefined') return

    const read = () =>
      selectorsFit(
        block.getBoundingClientRect().width,
        full.getBoundingClientRect().width,
        terse.getBoundingClientRect().width,
      )

    setFit(read())

    // The ruler is watched along with the room: a new language, a model list that brings a longer name,
    // the IDE's font - all of them change what the three need without the panel changing width at all.
    const observer = new ResizeObserver(() => {
      const next = read()
      flushSync(() => setFit(next))
    })
    observer.observe(block)
    observer.observe(full)
    observer.observe(terse)

    return () => observer.disconnect()
  }, [room, ruler])

  return fit
}
