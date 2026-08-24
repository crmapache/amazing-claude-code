import { useEffect, type RefObject } from 'react'

/**
 * Hover that survives a fast hand.
 *
 * Moved across two neighbouring buttons quickly, the highlight in the IDE stayed on the one the hand had
 * left. What fixed it in the end was a short transition on the hovered colours (see sideMenu.module.css):
 * this browser draws offscreen and repaints when something asks it to, and an instant colour swap asks
 * once - a request that can be missed - while a transition asks over several frames. This hook was the
 * other half of that attempt and is kept because it costs nothing and covers the other possible cause:
 * `:hover` is a state recomputed from pointer positions, and positions can be dropped, while `mouseover`
 * is an event that still arrives.
 *
 * It is applied once for a whole panel rather than per button: the element the event lands on is marked
 * with `data-hover`, and the styles answer to that beside `:hover` - so a browser where `:hover` works
 * loses nothing. The mark is put on directly rather than through React state: this fires on every pointer
 * move across the panel, and a re-render of the whole menu per move is a price with nothing to show for
 * it (the dropdown menu keeps its own highlight in state for the same reason - see Menu).
 */
export const useHoverTarget = (container: RefObject<HTMLElement | null>, selector = 'button') => {
  useEffect(() => {
    const element = container.current
    if (!element) return

    let marked: Element | null = null

    const mark = (next: Element | null) => {
      if (next === marked) return
      marked?.removeAttribute('data-hover')
      next?.setAttribute('data-hover', '')
      marked = next
    }

    const onOver = (event: MouseEvent) => {
      const target = event.target
      mark(target instanceof Element ? target.closest(selector) : null)
    }

    // The pointer left the panel altogether - `mouseout` on the way out carries no new target.
    const onLeave = () => mark(null)

    element.addEventListener('mouseover', onOver)
    element.addEventListener('mouseleave', onLeave)

    return () => {
      element.removeEventListener('mouseover', onOver)
      element.removeEventListener('mouseleave', onLeave)
      mark(null)
    }
  }, [container, selector])
}
