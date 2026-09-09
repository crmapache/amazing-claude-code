import type { ScenarioRepeat } from '../protocol'

/**
 * When an hour being set in the form would actually go off.
 *
 * Worked out on this side purely to be SAID: the IDE decides it for real and sends the answer back with
 * the arrangement (see ScheduleClock, which this mirrors). It is here because the form has to answer the
 * question while somebody is still choosing - an hour set at ten in the morning for eight is due
 * tomorrow, and a form that leaves that unsaid is a form people set wrongly and find out about the next
 * evening.
 *
 * The same walk as the IDE's, day by day: the first moment strictly after now that carries the hour, then
 * forward until it lands on a day the rhythm allows. Written as a loop rather than as arithmetic because
 * a day is not always twenty-four hours - a clock change makes it twenty-three or twenty-five, and the
 * hour somebody set is the hour they meant on the day it falls.
 */
export const nextDue = (
  hour: { at: number; repeat: ScenarioRepeat; weekday: number },
  from: number = Date.now(),
): number => {
  const minutes = Math.min(Math.max(Math.round(hour.at), 0), 24 * 60 - 1)

  const at = (day: Date): Date => {
    const moment = new Date(day)
    moment.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    return moment
  }

  const now = new Date(from)
  let day = at(now)
  if (day.getTime() <= from) day = at(new Date(day.getTime() + DAY_MS))

  // Monday is 1 and Sunday is 7, the way java.time numbers them and the way the wire carries it.
  const isoDay = (date: Date): number => date.getDay() || 7
  const wanted = Math.min(Math.max(Math.round(hour.weekday), 1), 7)

  for (let step = 0; step < 8; step += 1) {
    const number = isoDay(day)
    if (hour.repeat === 'weekdays' && number >= 6) day = at(new Date(day.getTime() + DAY_MS))
    else if (hour.repeat === 'weekly' && number !== wanted) day = at(new Date(day.getTime() + DAY_MS))
    else break
  }

  return day.getTime()
}

const DAY_MS = 24 * 60 * 60 * 1000
