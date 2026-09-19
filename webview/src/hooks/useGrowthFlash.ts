import { useEffect, useRef, useState } from 'react'

/** How long a flash stays lit - a little longer than the animation that draws it, which is in the CSS. */
export const FLASH_MS = 1400

/**
 * Whether a count has just gone up: a number other than 0 for as long as the flash plays, and a new one
 * each time, so that given as a `key` it starts the animation over when the count grows again mid-flash.
 *
 * Made for the queue's count on the scenarios screen. A turn is put on the queue from the shelf, and the
 * shelf stays where it is so the next one can be queued straight after; the count on the Queue tab is then
 * the press's only answer, and a digit going from 2 to 3 is not one anybody sees.
 *
 * Lit for a while and then off, rather than a class left on: whatever draws the count is mounted again
 * whenever the screen comes back to it - from the editor, for one - and a class left on would play the
 * flash for a turn queued minutes ago.
 *
 * `null` is "not known yet" rather than zero, and growing out of it is not growth: the queue arriving
 * from the IDE a moment after the screen opened would otherwise light the count on every visit.
 */
export const useGrowthFlash = (count: number | null): number => {
  const [lit, setLit] = useState(0)
  const was = useRef(count)
  const flashes = useRef(0)

  useEffect(() => {
    const grew = count !== null && was.current !== null && count > was.current
    was.current = count
    if (!grew) return
    flashes.current += 1
    setLit(flashes.current)
  }, [count])

  // Its own effect, so that the count moving again - down, say, as the queue starts its first turn - does
  // not clear the timer and leave the flash lit for good.
  useEffect(() => {
    if (!lit) return
    const off = window.setTimeout(() => setLit(0), FLASH_MS)
    return () => window.clearTimeout(off)
  }, [lit])

  return lit
}
