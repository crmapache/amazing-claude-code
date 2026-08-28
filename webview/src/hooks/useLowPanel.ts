import { useEffect, useState } from 'react'

import { LOW_PANEL_QUERY } from '../composerLayout'

/**
 * Whether the panel has too little height left for the ordinary layout.
 *
 * The panel is a page of its own inside the embedded browser, so the window's height IS the panel's
 * height - a media query answers this without a ResizeObserver and without a re-render on every pixel of
 * a drag. The dock side is not asked about: a panel can be left low at the bottom edge, at the top one,
 * or in a floating window pulled down to a strip, and the feed disappears in all three the same way.
 *
 * It has to be watched rather than read once: the height changes under the mouse while the panel is
 * dragged from one edge to another, and a panel that read it at mount would keep the answer from
 * whichever edge it happened to open at.
 */
export const useLowPanel = (): boolean => {
  const [low, setLow] = useState(() => window.matchMedia(LOW_PANEL_QUERY).matches)

  useEffect(() => {
    const query = window.matchMedia(LOW_PANEL_QUERY)
    const update = () => setLow(query.matches)

    update()
    query.addEventListener('change', update)

    return () => query.removeEventListener('change', update)
  }, [])

  return low
}
