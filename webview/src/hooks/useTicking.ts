import { useEffect, useState } from 'react'
import { useNow } from './useNow'

/**
 * A clock that ticks once a second, and only while something is actually moving.
 *
 * Every screen that shows how long something has been going needs the same three lines - the machine's
 * own idea of now, a value in state, an interval with its cleanup - and there were three copies of them
 * before this: the run tab, the phone's run screen, and the form that waits for a model to write a
 * scenario. A fourth was about to be written for the list of live runs.
 *
 * Nothing ticks while `going` is false, which is not a saving but the point: a finished run measures
 * nothing at all - every duration on it is the difference between two stamps it already carries - and a
 * timer left going would redraw a page nobody is watching change.
 *
 * The value is taken afresh the moment `going` turns true, and that matters for anything counting from a
 * moment that has only just happened. Read once when the screen mounted and left alone until the first
 * tick, the first second of the count is measured from whenever the tab was opened rather than from when
 * the work began.
 *
 * The time comes from [useNow], so the phone measures against the clock of the machine that reported the
 * moment rather than against its own (see mobile/clock.ts).
 */
export const useTicking = (going: boolean): number => {
  const clock = useNow()
  const [now, setNow] = useState(() => clock())

  useEffect(() => {
    if (!going) return
    setNow(clock())
    const timer = setInterval(() => setNow(clock()), 1000)
    return () => clearInterval(timer)
  }, [going, clock])

  return now
}
