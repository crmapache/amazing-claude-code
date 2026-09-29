import { useEffect, useRef, useState } from 'react'

/**
 * Whether something that moves by itself should hold still: nobody's hand has been in the panel for
 * `restAfterMs`.
 *
 * The panel renders offscreen (see WebviewHost): every frame of an animation is drawn in the browser's
 * process and carried to the IDE as a picture, whether anybody looks or not. Something that goes on moving
 * until it is answered - a tab calling a person who has gone to lunch - would draw an hour of frames for
 * nobody. So it moves while there is somebody to see it: for `restAfterMs` after a pointer movement or a key
 * in the panel, and after `stir` changes - the news the movement is about. The person is called to a tab
 * by a sound, and looks at the strip from wherever they were, the mouse nowhere near the panel.
 *
 * With `enabled` off there are no listeners at all: nothing is moving, so there is nothing to rest.
 */
export const useResting = (restAfterMs: number, stir: unknown, enabled: boolean): boolean => {
  const [resting, setResting] = useState(false)
  const stirredAt = useRef(0)
  /** The same value as the state, for the listeners: a pointer moves far more often than the state changes. */
  const restingNow = useRef(false)

  const wake = () => {
    stirredAt.current = Date.now()
    if (!restingNow.current) return

    restingNow.current = false
    setResting(false)
  }

  // The news is the whole dependency: wake itself reads nothing but refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(wake, [stir])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('pointermove', wake, { passive: true })
    window.addEventListener('keydown', wake)
    return () => {
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    if (!enabled || resting) return

    let timer = 0
    const check = () => {
      const left = stirredAt.current + restAfterMs - Date.now()
      if (left > 0) {
        timer = window.setTimeout(check, left)
        return
      }

      restingNow.current = true
      setResting(true)
    }

    check()
    return () => window.clearTimeout(timer)
  }, [enabled, resting, restAfterMs])

  return resting
}
