import { useEffect, useMemo, useRef, useState } from 'react'
import type { StatisticsData } from '../../protocol'
import { HEAT_WEEKS, heatMap } from '../../stats/compute'
import { shortDate } from '../../stats/format'
import s from './stats.module.css'

/**
 * The calendar of working days: a column a week, a cell a day, the paint by how busy the day was.
 *
 * The grid fills from the right-hand edge (see .heatScroll): the newest week always stands against the
 * right side, and it is the oldest that leaves the view when the panel narrows - as far back as the
 * panel is wide, and no scrolling to reach this week.
 *
 * Which is why the number of columns is measured rather than fixed: a year of weeks is about nine hundred
 * pixels, and in a panel pulled wider than that a fixed year would end in the middle of the card with
 * blank space beside it. The card asks for as many weeks as its own width can hold, never fewer than a
 * year - a page-wide picture of this tab is drawn at nine hundred pixels whatever the panel's width (see
 * stats/poster.ts), and it is drawn from a clone of these very nodes.
 */

interface HeatmapProps {
  data: StatisticsData
}

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

/** The cell and the gap between cells as .heatGrid draws them - the column count is figured from both. */
const CELL_PX = 14
const GAP_PX = 4

export const Heatmap = ({ data }: HeatmapProps) => {
  const scroll = useRef<HTMLDivElement | null>(null)
  const [weeks, setWeeks] = useState(HEAT_WEEKS)

  useEffect(() => {
    const element = scroll.current
    if (!element) return

    // Rounded up rather than down: a column half a cell wide at the left edge is hidden under the mask
    // anyway, whereas a column short leaves bare card against the right one.
    const measure = () => {
      const fits = Math.ceil((element.clientWidth + GAP_PX) / (CELL_PX + GAP_PX))
      setWeeks(Math.max(HEAT_WEEKS, fits))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const heat = useMemo(() => heatMap(data, weeks), [data, weeks])

  return (
    <>
      <div className={s.heat}>
        <div className={s.heatDays}>
          {DAY_LABELS.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        <div className={s.heatScroll} ref={scroll}>
          <div className={s.heatGrid}>
            {heat.weeks.flatMap((week) =>
              week.map((cell) => (
                <span
                  key={cell.date}
                  className={`${s.heatCell} ${cell.ahead ? s.heatCellAhead : ''}`}
                  data-level={cell.ahead ? undefined : cell.level}
                  data-tooltip={
                    cell.ahead
                      ? undefined
                      : cell.minutes === 0
                        ? `${shortDate(cell.date)} · nothing that day`
                        : `${shortDate(cell.date)} · ${cell.minutes} min`
                  }
                />
              )),
            )}
          </div>
        </div>
      </div>
      <span className={s.sentence}>{heat.sentence}</span>
    </>
  )
}
