import type { HeatMap } from '../../stats/compute'
import { shortDate } from '../../stats/format'
import s from './stats.module.css'

/**
 * The calendar of working days: a column a week, a cell a day, the paint by how busy the day was.
 *
 * The grid fills from the right-hand edge (see .heatScroll): the newest week always stands against the
 * right side, and it is the oldest that leaves the view when the panel narrows - as far back as the
 * panel is wide, and no scrolling to reach this week.
 */

interface HeatmapProps {
  heat: HeatMap
}

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

export const Heatmap = ({ heat }: HeatmapProps) => (
  <>
    <div className={s.heat}>
      <div className={s.heatDays}>
        {DAY_LABELS.map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
      <div className={s.heatScroll}>
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
