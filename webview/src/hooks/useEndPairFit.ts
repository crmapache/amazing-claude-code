import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { endPairFits } from '../composerFit'

const widthOf = (element: Element) => element.getBoundingClientRect().width

/**
 * Whether the bubble and the heart fit at the far end of the status row (see endPairFits).
 *
 * `row` - the status row, whose inner width is the line the far end stands on once it has stepped down;
 * `end` - the far end itself, whose children other than `pair` are the usage; `natural` - the pair drawn at
 * its natural width in a ruler (see StatusBar), which is what is compared rather than the pair itself: a
 * pair taken out of the row has no width to measure, and a pair measured only while shown would never know
 * when to come back. `active` is false while both buttons are switched off - there is nothing to fit.
 * `content` names what else stands in the far end (the usage block coming and going with its switches), so
 * a block that appears is watched too rather than only the ones that were there at first.
 *
 * Measured before the paint, like the selectors (see useSelectorsFit): a panel dragged narrow must not show
 * a frame of the heart cut in half by its edge. The usage is watched along with the row, because the rings
 * arrive seconds after the panel opens and change the answer without the panel changing width at all.
 */
export const useEndPairFit = (
  row: RefObject<HTMLElement | null>,
  end: RefObject<HTMLElement | null>,
  pair: RefObject<HTMLElement | null>,
  natural: RefObject<HTMLElement | null>,
  active: boolean,
  content: string,
): boolean => {
  const [fits, setFits] = useState(true)
  const shown = useRef(fits)
  shown.current = fits

  useLayoutEffect(() => {
    const line = row.current
    const far = end.current
    const ruler = natural.current
    if (!active || !line || !far || !ruler || typeof ResizeObserver === 'undefined') {
      setFits(true)
      return
    }

    const read = () => {
      const style = getComputedStyle(line)
      const room = line.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      const meters = Array.from(far.children)
        .filter((child) => child !== pair.current)
        .reduce((sum, child) => sum + widthOf(child), 0)
      const gap = parseFloat(getComputedStyle(far).columnGap) || 0

      return endPairFits(room, meters, widthOf(ruler), gap, shown.current)
    }

    setFits(read())

    const observer = new ResizeObserver(() => {
      const next = read()
      flushSync(() => setFits(next))
    })
    observer.observe(line)
    observer.observe(far)
    observer.observe(ruler)
    // The usage on its own as well: the far end is packed against the row's edge and grows to fill its
    // line, so a ring arriving inside it changes what it holds without changing its box.
    Array.from(far.children).forEach((child) => {
      if (child !== pair.current) observer.observe(child)
    })

    return () => observer.disconnect()
    // `content` is only a key: it says the far end holds other blocks now, which the lines above re-read.
  }, [row, end, pair, natural, active, content])

  return fits
}
