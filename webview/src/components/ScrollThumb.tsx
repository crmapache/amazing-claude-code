import { useEffect, useRef, useState, type RefObject } from 'react'
import s from './scrollThumb.module.css'

interface ScrollThumbProps {
  /** The scrolling element itself - the thumb only draws over it rather than wrapping it. */
  targetRef: RefObject<HTMLElement | null>
}

const MIN_THUMB_PX = 24

/**
 * A scroll thumb over the content - as in WebStorm's own editor: it takes up no width and does not move
 * the content when it appears, it simply lies on top, and stays visible for as long as there is anything
 * to scroll (it does not fade after a pause - that too is the native editor's behaviour rather than the
 * macOS/Chrome overlay scrollbar).
 *
 * `overflow: overlay` does not suit this - since Chromium 121 the browser no longer supports it
 * (verified: the JCEF of this IDE version is Chromium 144), while an ordinary overflow:auto always
 * reserves width for the scrollbar. So the target element's native scrollbar is hidden in its own CSS
 * (::-webkit-scrollbar { display: none }), and this component draws its own over the content - position
 * and size only, without changing the parent's layout. The parent of targetRef itself needs
 * position:relative, or the floating thumb is positioned relative to something else entirely.
 */
export const ScrollThumb = ({ targetRef }: ScrollThumbProps) => {
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ startY: number; startScrollTop: number; trackHeight: number } | null>(null)

  const update = () => {
    const el = targetRef.current
    if (!el || el.scrollHeight <= el.clientHeight + 1) {
      setThumb(null)
      return
    }

    const height = Math.max(MIN_THUMB_PX, (el.clientHeight / el.scrollHeight) * el.clientHeight)
    const scrollable = el.scrollHeight - el.clientHeight
    const top = scrollable > 0 ? (el.scrollTop / scrollable) * (el.clientHeight - height) : 0
    setThumb({ top, height })
  }

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    update()
    el.addEventListener('scroll', update)
    // The content keeps growing after the first paint (diffs expand, fonts load) - without an observer
    // the thumb would stay the wrong size.
    const observer = new ResizeObserver(update)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [targetRef])

  // The listeners live on the window rather than on the thumb alone: if the mouse is released outside it
  // (or outside the window entirely), the drag still has to end - otherwise it sticks and later jerks the
  // scroll on the next accidental mouse move.
  useEffect(() => {
    if (!dragging) return

    const onMove = (event: PointerEvent) => {
      const el = targetRef.current
      const drag = dragState.current
      if (!el || !drag || drag.trackHeight <= 0) return

      const scrollable = el.scrollHeight - el.clientHeight
      const deltaY = event.clientY - drag.startY
      el.scrollTop = drag.startScrollTop + (deltaY / drag.trackHeight) * scrollable
    }

    const endDrag = () => {
      dragState.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [dragging, targetRef])

  if (!thumb) return null

  return (
    <div
      className={`${s.thumb} ${dragging ? s.thumbDragging : ''}`}
      style={{ top: thumb.top, height: thumb.height }}
      onPointerDown={(event) => {
        event.preventDefault()
        const el = targetRef.current
        if (!el) return

        dragState.current = {
          startY: event.clientY,
          startScrollTop: el.scrollTop,
          trackHeight: el.clientHeight - thumb.height,
        }
        setDragging(true)
      }}
    />
  )
}
