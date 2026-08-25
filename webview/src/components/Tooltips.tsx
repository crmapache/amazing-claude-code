import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { placeTooltip, readTooltipAt } from '../tooltipPlacement'
import s from './tooltip.module.css'

/**
 * The hover hints of the whole panel, drawn by one element instead of the native title: the native one
 * has a delay of its own and the look of someone else's OS, while a hint has to look the same as on the
 * IDE's own icons.
 *
 * It used to be a ::after grown out of each marked element, and that drawing could not know where the
 * window ends: a hint pinned by the markup to the left edge of a meter standing near the panel's right
 * edge unfolded straight off the screen. So the markup keeps only the preference - `data-tooltip` for the
 * text and `data-tooltip-at` for the direction it reads best in - while whether the preference fits is
 * decided here against the window, with the measured hint in hand (see tooltipPlacement.ts). At the edges
 * the hint flips to the other side or is pressed inside; nothing of it is ever cut off.
 *
 * One element for all the hints rather than one per marked element: only one can be under the pointer at
 * a time anyway, and a single element in the body escapes every overflow and every transform on the way
 * up - .content has a translateZ(0) for JCEF's sake, inside which a fixed element counts from the wrong
 * box (the same reason SelectionMenu goes to the body).
 *
 * The element is driven directly rather than through React state, as useHoverTarget drives its mark:
 * this fires on every pass of the pointer across the panel, and a render per pass is a price with
 * nothing to show for it.
 */
export const Tooltips = () => {
  const tip = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = tip.current
    if (!element) return

    // A screen without hover has nothing to unfold a hint with - and a tap must not conjure one either.
    if (!window.matchMedia('(hover: hover)').matches) return

    /** The element the hint belongs to right now; none means the hint is folded away. */
    let anchor: HTMLElement | null = null
    let frame = 0
    /** What is shown and where it stands - so that a frame that changes nothing writes nothing: a write
        dirties the style and turns the next frame's measuring into a forced layout. */
    let shown = ''
    let spot = ''

    const place = () => {
      if (!anchor) return

      const text = anchor.dataset.tooltip ?? ''
      if (text !== shown) {
        element.textContent = text
        shown = text
      }

      const { width, height } = element.getBoundingClientRect()
      const placed = placeTooltip({
        anchor: anchor.getBoundingClientRect(),
        tip: { width, height },
        viewport: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
        ...readTooltipAt(anchor.dataset.tooltipAt),
      })

      const next = `${placed.x},${placed.y},${placed.side}`
      if (next !== spot) {
        element.style.left = `${placed.x}px`
        element.style.top = `${placed.y}px`
        element.dataset.side = placed.side
        spot = next
      }
    }

    /**
     * While the hint hangs there it keeps up with its element: the row shifts when a Stop appears, the
     * side menu scrolls under the pointer, the anchor leaves altogether - none of which sends a mouse
     * event. A frame with nothing changed costs two rectangle reads and no writes.
     */
    const follow = () => {
      if (!anchor || !anchor.isConnected || !anchor.dataset.tooltip) {
        hide()
        return
      }

      place()
      frame = requestAnimationFrame(follow)
    }

    const show = (next: HTMLElement) => {
      anchor = next
      shown = ''
      spot = ''

      // The kind travels before the measuring: it sets the width the text wraps at (see the module).
      const kind = next.dataset.tooltipKind
      if (kind) element.dataset.kind = kind
      else delete element.dataset.kind

      place()
      element.dataset.open = ''

      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(follow)
    }

    const hide = () => {
      if (!anchor) return
      anchor = null
      cancelAnimationFrame(frame)
      delete element.dataset.open
    }

    /**
     * `mouseover` rather than per-element `mouseenter`: an event that bubbles is caught once for the
     * whole document - portals, menus and all - and it is an event rather than a recomputed state, which
     * is the same reliability point useHoverTarget makes.
     */
    const onOver = (event: MouseEvent) => {
      const target = event.target
      const next = target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null

      if (!next || !next.dataset.tooltip) {
        hide()
        return
      }

      if (next !== anchor) show(next)
    }

    // The pointer left the panel altogether, or the window did - `mouseover` for somewhere else to go
    // never comes then.
    const onGone = () => hide()

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseleave', onGone)
    window.addEventListener('blur', onGone)

    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseleave', onGone)
      window.removeEventListener('blur', onGone)
      hide()
    }
  }, [])

  // Presentation only: every marked control carries its own aria-label with the same words.
  return createPortal(<div ref={tip} className={s.tip} aria-hidden="true" />, document.body)
}
