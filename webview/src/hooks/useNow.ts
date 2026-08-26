import { createContext, useContext } from 'react'

/**
 * What "now" means to whoever is looking at the feed.
 *
 * Everything the feed measures time against was stamped by the machine the IDE runs on: when a turn
 * began, when a call started, when the next attempt after a failed request is due. At the desk that is
 * the same machine the panel is drawn on, so Date.now() answers correctly and this context is never
 * given a value.
 *
 * On a phone it is a different machine, and its clock is a different clock. Subtracting one from the
 * other showed a turn as having started in the future - the counter beside "Claude is thinking" opened
 * at a negative number and counted its way up to zero. So the phone measures the difference and hands
 * the IDE's reading down through here (see mobile/clock.ts and the provider in mobile/App.tsx).
 *
 * A context rather than a prop because the readers are leaves - a countdown inside one row of the feed -
 * and threading a clock through every component between here and there would put the phone's problem
 * into the signature of components that have nothing to do with it.
 */
export const ClockContext = createContext<() => number>(Date.now)

/** The current time on the clock the feed is measured against - see [ClockContext]. */
export const useNow = (): (() => number) => useContext(ClockContext)
