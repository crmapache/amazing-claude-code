import type { DayHours, HourBar } from '../../stats/compute'
import { clock, duration } from '../../stats/format'
import s from './stats.module.css'

/**
 * The hours of a single day: a bar an hour, midnight on the left, the height the minutes worked in it.
 *
 * This is what the chart card shows when the range is one day - the line of days has nothing to draw
 * with a single point, whereas the hours say when the work actually happened. The scale is a whole
 * hour, so a bar reaching the top means the hour was spent in the panel end to end.
 */

interface DayChartProps {
  hours: DayHours
}

const HOUR = 60
/** The lines across the plot, in minutes - the whole hour, the half and the floor. */
const LINES = [1, 0.5, 0]
const TICK_EVERY = 6

/**
 * "09:00 · 1h 00m · busiest hour of the day".
 *
 * The last part is there because the lit bar is the one thing on this card nothing explains. Two hours
 * both spent end to end stand at exactly the same height, one of them glowing, and from the picture alone
 * the light reads as a state of its own rather than as "this is the most there was" - so hovering says
 * which it is. The note over the card names the same hours; this is for the one under the pointer.
 */
const hourTip = (bar: HourBar, peaks: number[]): string => {
  const spent = bar.minutes > 0 ? duration(bar.minutes) : 'quiet'
  const top = peaks.includes(bar.hour) ? (peaks.length > 1 ? ' · among the busiest' : ' · busiest hour of the day') : ''

  return `${clock(bar.hour)} · ${spent}${top}`
}

export const DayChart = ({ hours }: DayChartProps) => {
  const top = Math.max(HOUR, hours.peak?.minutes ?? 0)

  return (
    <div className={s.day}>
      <div className={s.dayPlot}>
        {LINES.map((share) => (
          <span key={share} className={`${s.dayLine} ${share === 0 ? s.dayFloor : ''}`} style={{ bottom: `${share * 100}%` }}>
            <span className={s.dayScale}>{Math.round(top * share)}m</span>
          </span>
        ))}

        <div className={s.dayBars}>
          {hours.bars.map((bar) => (
            <span
              key={bar.hour}
              className={s.dayBar}
              data-tooltip={hourTip(bar, hours.peaks)}
            >
              <span
                className={`${s.dayBarFill} ${bar.minutes === 0 ? s.dayBarEmpty : ''}`}
                data-peak={hours.peaks.includes(bar.hour) ? '' : undefined}
                style={{ height: bar.minutes > 0 ? `${Math.max(3, (bar.minutes / top) * 100)}%` : undefined }}
              />
            </span>
          ))}
        </div>
      </div>

      <div className={s.dayTicks}>
        {hours.bars
          .filter((bar) => bar.hour % TICK_EVERY === 0)
          .map((bar) => (
            <span
              key={bar.hour}
              className={s.dayTick}
              style={{ gridColumn: bar.hour + 1, justifySelf: bar.hour === 0 ? 'start' : 'center' }}
            >
              {clock(bar.hour)}
            </span>
          ))}
      </div>
    </div>
  )
}
