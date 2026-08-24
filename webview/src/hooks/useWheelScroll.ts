import { useEffect, type RefObject } from 'react'

/**
 * How far one notch of the wheel travels. A wheel does not always measure in pixels: it may report lines
 * or whole pages, and the same trick already stands over the tab strip (see StreamSwitcher.wheelStep).
 */
const LINE_PX = 40

const step = (event: WheelEvent, element: HTMLElement): number => {
  // A line is worth what Chromium itself pays for one - three of them make the ~120px a notch of a mouse
  // wheel is expected to travel. The tab strip uses a smaller figure because it steps sideways between
  // tabs; here the same figure would crawl.
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * LINE_PX
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * element.clientHeight * 0.9
  return event.deltaY
}

/**
 * Scrolling a panel by the wheel, done by hand rather than left to the browser.
 *
 * In the IDE the menu scrolled a hair at a time, to the point of feeling broken. The cause was the unit:
 * this browser reports the wheel in lines rather than pixels, and a line is not sixteen pixels - Chromium
 * itself pays forty for one, which is what makes a notch travel the ~120px a hand expects. Left to the
 * browser the same distance would be scrolled, but only if it picked this element to scroll: the panel is
 * two absolutely positioned layers with volume sliders in them, and the wheel does not always land where
 * the eye is.
 *
 * Hence one listener, one target, always the same one. `preventDefault` keeps it to one - without it the
 * browser would scroll something as well and the panel would move twice as far.
 *
 * A trackpad reports pixels and is applied one to one, so the gesture feels as it did.
 */
export const useWheelScroll = (element: RefObject<HTMLElement | null>, enabled = true) => {
  useEffect(() => {
    const target = element.current
    if (!target || !enabled) return

    const onWheel = (event: WheelEvent) => {
      // A horizontal gesture is not ours: there is nothing to scroll sideways here, and swallowing it
      // would take the gesture away from whoever does.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

      const room = target.scrollHeight - target.clientHeight
      if (room <= 0) return

      const next = Math.min(room, Math.max(0, target.scrollTop + step(event, target)))
      // At either end there is nothing left to do - and holding the event back there would stop the
      // wheel from reaching whatever lies behind the menu.
      if (next === target.scrollTop) return

      event.preventDefault()
      target.scrollTop = next
    }

    target.addEventListener('wheel', onWheel, { passive: false })
    return () => target.removeEventListener('wheel', onWheel)
  }, [element, enabled])
}
