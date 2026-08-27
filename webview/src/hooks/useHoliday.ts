import { useEffect, useState } from 'react'

import { holidayOn, msUntilNextDay } from '../holiday'

/**
 * Whether the panel is decorated, kept true across the turn of the day.
 *
 * A tool window is opened once and left there: a panel that read the calendar at mount and never again
 * would spend the night of the 23rd undecorated and wake up on the 24th still undecorated. So the answer
 * is recomputed on the day boundary rather than on a poll - one timer per panel, sleeping until local
 * midnight and rearming itself (the same shape as the limit counter in items/Rows.tsx, which reschedules
 * itself rather than ticking).
 */
export const useHoliday = (): boolean => {
  const [holiday, setHoliday] = useState(() => holidayOn(new Date()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const schedule = () => {
      const now = new Date()
      setHoliday(holidayOn(now))
      timer = setTimeout(schedule, msUntilNextDay(now))
    }

    schedule()

    return () => clearTimeout(timer)
  }, [])

  return holiday
}
