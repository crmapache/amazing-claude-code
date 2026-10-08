import { useLayoutEffect, useRef, type RefObject, type UIEvent } from 'react'
import { placeShift, rowAtEdge, type FeedPlace } from '../../feed/place'

/**
 * Where a run's timeline stands: at what is happening when the run is opened, and where it was left when it
 * is come back to. The desk's run tab and the phone's run screen both scroll with it.
 *
 * Opened, the screen used to stand at its top - stages finished hours ago - while what anybody opens a run
 * for is further down: the card it is on and what the main thread just said to it. That was scrolled to by
 * hand every time. Now the screen opens on it (see RunOpening) and keeps to it while the run goes on, until
 * the person scrolls away - the way a chat feed keeps to its last message.
 *
 * Coming back is the other half, and the reason this is more than one scrollTop. A step's log takes the
 * whole tab on the desk and a screen of its own on the phone, and the timeline is built again behind it.
 * Opened afresh, it would throw away the step somebody went to read. So the place is remembered per run
 * while the page lives and put back on the way in, and forgotten only when the run is opened anew
 * (forgetRunPlace, from both openRun): opening is "show me the run", coming back is "where was I".
 *
 * The place is held by a row, as the chat's is (see feed/place.ts), not by a number of pixels: the run goes
 * on while a log is open, and a question appearing at the top would slide a remembered offset by its own
 * height. Rows carry `data-row`, their key in the timeline, and `data-ahead` when nothing has begun there.
 */
export const useRunPlace = (
  scroller: RefObject<HTMLElement | null>,
  /** Empty while the run has not arrived: there is nothing to stand anywhere yet. */
  runId: string,
  opening: RunOpening,
): ((event: UIEvent<HTMLElement>) => void) => {
  /**
   * Keeping to where the run is, as it moves - set when it is opened, dropped when the person scrolls away,
   * taken up again when they scroll back to it.
   */
  const following = useRef(false)
  /** What was last put in place - the same run on a new element is a timeline rebuilt after a log. */
  const shown = useRef<{ box: HTMLElement | null; runId: string }>({ box: null, runId: '' })
  const watch = useRef<{ box: HTMLElement; observer: ResizeObserver } | null>(null)
  const opens = useRef(opening)
  opens.current = opening

  useLayoutEffect(() => {
    const box = scroller.current

    /*
     * The timeline moves without a render as well: a long line folds itself once measured (see Glance), a
     * font arrives, the field under it grows a line. A render that adds a row is followed below; this is for
     * the rest - the scroller and every block in it, which between them are all the height there is.
     */
    if (watch.current?.box !== box) {
      watch.current?.observer.disconnect()
      watch.current = null
      if (box && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          if (following.current) box.scrollTop = targetOf(box, opens.current)
        })
        observer.observe(box)
        watch.current = { box, observer }
      }
    }
    if (!box || !runId) return
    for (const child of box.children) watch.current?.observer.observe(child)

    if (shown.current.box !== box || shown.current.runId !== runId) {
      shown.current = { box, runId }
      const place = places.get(runId)
      following.current = place?.stick ?? true
      if (place && !place.stick) putBack(box, place)
      else box.scrollTop = targetOf(box, opening)
      return
    }

    if (following.current) box.scrollTop = targetOf(box, opening)
  })

  useLayoutEffect(() => () => watch.current?.observer.disconnect(), [])

  /*
   * Written on every scroll rather than on the way out: by the time the timeline is taken off the screen its
   * rows are already gone, and the only honest measure is one taken while they stood. Scrolls made here fire
   * the event too, so a timeline that is following is remembered as following.
   */
  return (event) => {
    if (!runId) return
    const box = event.currentTarget
    following.current = Math.abs(box.scrollTop - targetOf(box, opening)) <= NEAR
    places.set(runId, measure(box, following.current))
  }
}

/**
 * Where a run's screen opens, by what stands where on it.
 *
 * - `present` - the last thing that happened: the last step that began and what was said after it. If all
 *   that is still ahead fits on the same screen under it, down to the foot - which is the common case, a
 *   run a card or two from its end. If it does not - a loop written out as five passes of plans - the
 *   present stands low on the screen with the start of what comes next under it, because the foot of
 *   such a timeline is rows nothing has happened in, and opening there is the same scroll by hand, upwards.
 * - `top` - something above the timeline has to be read first: the question the run is waiting on, or on
 *   the desk how a finished run ended and the two doors out of it.
 * - `foot` - the phone puts a finished run's ending under its last step.
 *
 * Followed as it changes: a question that comes while somebody is watching is brought into view, and so is
 * the present again once it has been answered.
 */
export type RunOpening = 'present' | 'top' | 'foot'

/** The next time this run is shown it is opened rather than returned to - see useRunPlace. */
export const forgetRunPlace = (runId: string) => {
  places.delete(runId)
}

/** Where every run's timeline was left, by run, for as long as the page lives. */
const places = new Map<string, FeedPlace>()

/**
 * How near the place it should be still counts as there. Not zero: the IDE at 90% on a retina screen reports
 * a scroll a fraction of a pixel off (see ROAD_SNAP in scenarios/roadmap.ts for the same fraction).
 */
const NEAR = 4

/** What is ahead of the present still goes on the same screen when it takes no more than this of it. */
const AHEAD_FITS = 0.6

/** Otherwise the present ends this far down the screen, and the rest is the start of what comes next. */
const PRESENT_AT = 0.75

const targetOf = (box: HTMLElement, opening: RunOpening): number => {
  const most = Math.max(0, box.scrollHeight - box.clientHeight)
  if (opening === 'top') return 0
  if (opening === 'foot') return most

  const begun = box.querySelectorAll<HTMLElement>('[data-row]:not([data-ahead])')
  const present = begun[begun.length - 1]
  // Nothing has begun yet - the main thread is still reading the brief: the plan from its first card.
  if (!present) return 0

  const end = present.getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop
  if (box.scrollHeight - end <= box.clientHeight * AHEAD_FITS) return most
  return Math.min(most, Math.max(0, end - box.clientHeight * PRESENT_AT))
}

const measure = (box: HTMLElement, stick: boolean): FeedPlace => {
  const edge = box.getBoundingClientRect().top
  const rows = box.querySelectorAll<HTMLElement>('[data-row]')
  const row = rows[rowAtEdge(rows.length, (index) => rows[index].getBoundingClientRect().bottom, edge)]
  return row
    ? { stick, row: row.dataset.row, offset: row.getBoundingClientRect().top - edge, top: box.scrollTop }
    : { stick, offset: 0, top: box.scrollTop }
}

const putBack = (box: HTMLElement, place: FeedPlace) => {
  const row = place.row ? box.querySelector<HTMLElement>(`[data-row="${CSS.escape(place.row)}"]`) : null
  if (row) box.scrollTop += placeShift(place, row.getBoundingClientRect().top, box.getBoundingClientRect().top)
  else box.scrollTop = place.top
}
