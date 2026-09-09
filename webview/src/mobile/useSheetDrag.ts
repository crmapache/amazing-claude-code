import { useEffect, type RefObject } from 'react'

/**
 * Pulling a sheet down closes it.
 *
 * The grab handle at the top of every sheet promises exactly this gesture - it is what the handle means
 * on every phone - and a sheet that draws the handle and ignores the pull reads as a sheet that is stuck.
 * The scrim tap and the cross stay; this is the third way out, and the one a thumb reaches for first.
 *
 * Two rules decide whether a touch is a pull or a scroll, and they are the whole of the hook. From the
 * handle or the header, a downward move is always a pull. From the body, it is a pull only while the
 * body stands at its top: anywhere else a downward move is the list scrolling back up, and taking it
 * would make a long list impossible to read. The decision is made on the first few pixels and holds for
 * the rest of the touch, so a pull that passes over the list on the way down does not turn into a
 * scroll halfway.
 *
 * Touch events rather than pointer events for the body: with pointer events the browser claims a
 * vertical move for its own scrolling and sends pointercancel, and the only way to keep it is
 * `touch-action: none` - which kills the scrolling the body exists for. A non-passive touchmove can say
 * "not this time" one move at a time. A mouse, which is the desktop browser this is debugged in, gets
 * the header only, through pointer events - there is no scroll to argue with there.
 */
export const useSheetDrag = (
  sheet: RefObject<HTMLElement | null>,
  body: RefObject<HTMLElement | null>,
  onClose: () => void,
): void => {
  useEffect(() => {
    const panel = sheet.current
    if (!panel) return undefined

    let startY = 0
    let startX = 0
    let startedAt = 0
    /** Whether this touch may become a pull at all - decided where it landed. */
    let allowed = false
    /** Whether it has become one. */
    let pulling = false
    let travelled = 0

    const fromBody = (target: EventTarget | null): boolean =>
      body.current !== null && target instanceof Node && body.current.contains(target)

    const begin = (x: number, y: number, target: EventTarget | null): void => {
      startX = x
      startY = y
      startedAt = performance.now()
      pulling = false
      travelled = 0
      // From the list, only at its top. A list scrolled into is a list being read.
      allowed = !fromBody(target) || (body.current?.scrollTop ?? 0) <= 0
    }

    /** Where the sheet stands during the pull - a translate, never a re-layout. */
    const follow = (dy: number): void => {
      travelled = Math.max(0, dy)
      panel.style.transition = 'none'
      panel.style.transform = `translateY(${travelled}px)`
    }

    const settle = (): void => {
      panel.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)'
      panel.style.transform = ''
    }

    const finish = (): void => {
      if (!pulling) return
      pulling = false

      const elapsed = Math.max(1, performance.now() - startedAt)
      const speed = travelled / elapsed
      // Far enough, or fast enough: a flick of forty pixels means the same as a slow drag of ninety.
      const dismiss = travelled > 90 || (speed > 0.45 && travelled > 30)

      if (dismiss) {
        panel.style.transition = 'transform 0.18s ease-in'
        panel.style.transform = 'translateY(110%)'
        // Closed once it is out of sight rather than at once: the sheet unmounts on close, and a sheet
        // that vanishes from under a moving thumb reads as a crash rather than as a gesture that landed.
        window.setTimeout(onClose, 160)
      } else {
        settle()
      }
    }

    const onTouchStart = (event: TouchEvent): void => {
      const touch = event.touches[0]
      if (!touch || event.touches.length > 1) return
      begin(touch.clientX, touch.clientY, event.target)
    }

    const onTouchMove = (event: TouchEvent): void => {
      const touch = event.touches[0]
      if (!touch || !allowed) return

      const dy = touch.clientY - startY
      const dx = touch.clientX - startX

      if (!pulling) {
        // Not decided yet: a few pixels are needed to tell a pull from a tap, and the move must be more
        // down than across. A move upwards is the list scrolling, and stays the list's.
        if (dy < 6 || Math.abs(dx) > dy) {
          if (dy < 0 || Math.abs(dx) > 8) allowed = false
          return
        }
        pulling = true
      }

      // Ours now: the browser must neither scroll the list under it nor bounce the page.
      if (event.cancelable) event.preventDefault()
      follow(dy)
    }

    const onTouchEnd = (): void => finish()

    // A mouse pulls by the header alone (see the note above).
    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || fromBody(event.target)) return
      begin(event.clientX, event.clientY, event.target)
      pulling = true

      const onMove = (move: PointerEvent): void => follow(move.clientY - startY)
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        finish()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    panel.addEventListener('touchstart', onTouchStart, { passive: true })
    panel.addEventListener('touchmove', onTouchMove, { passive: false })
    panel.addEventListener('touchend', onTouchEnd)
    panel.addEventListener('touchcancel', onTouchEnd)
    panel.addEventListener('pointerdown', onPointerDown)

    return () => {
      panel.removeEventListener('touchstart', onTouchStart)
      panel.removeEventListener('touchmove', onTouchMove)
      panel.removeEventListener('touchend', onTouchEnd)
      panel.removeEventListener('touchcancel', onTouchEnd)
      panel.removeEventListener('pointerdown', onPointerDown)
    }
  }, [sheet, body, onClose])
}
