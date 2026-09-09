import type { Scenario, ScenarioSchedule } from '../../protocol'
import { clockLabel, weekdayName } from '../../scenarios/schedule'
import { countdown, timetableOf, type TimetableRow } from '../../scenarios/timetable'
import { useTicking } from '../../hooks/useTicking'
import { useLocale, useT } from '../../i18n'
import { CrossIcon } from './icons'
import s from './scenarios.module.css'

/**
 * A timetable rather than a list: the days as headings, the hour in a gutter, and what will run beside it.
 *
 * Three arrangements of one scenario used to be three rows that read alike - same name, same shape, one
 * of them at nine tomorrow and one on Fridays - and the only way to tell them apart was to read all three.
 * With the hour pulled into a gutter of its own and the days named above them, the question "when" is
 * answered before anything is read.
 *
 * The answers a scheduled run carries are drawn as chips, because at that hour there is nobody at the
 * keyboard: a ticket queued for tonight is legible without opening the form it was typed into.
 */
export const ScheduleBand = ({
  schedules,
  scenarios,
  unread,
  onEdit,
  onRemove,
  onRunNow,
}: {
  schedules: ScenarioSchedule[]
  scenarios: Scenario[]
  /** The file could not be read at all, which is a different thing from having no arrangements in it. */
  unread: boolean
  onEdit: (schedule: ScenarioSchedule) => void
  onRemove: (schedule: ScenarioSchedule) => void
  /** The one thing to do with an hour nobody was here for: run it now, since it is never run late. */
  onRunNow: (schedule: ScenarioSchedule) => void
}) => {
  const t = useT()
  const locale = useLocale()
  // The gutter says how far off each hour is, so it goes stale the way a clock does.
  const now = useTicking(schedules.length > 0)

  /*
   * Said rather than left as an empty screen. An unreadable file draws exactly what no arrangements
   * draws - nothing at all - so somebody whose file was damaged reads it as "my mornings are gone" and
   * sets them all up again; and those do not save either, because nothing writes over a list it could
   * not read.
   */
  if (unread) {
    return (
      <div className={s.section}>
        <div className={s.emptyShelf}>
          <span className={s.emptyTitle}>{t.scenarios.when.unread}</span>
        </div>
      </div>
    )
  }

  const table = timetableOf(schedules, scenarios, now)

  if (table.count === 0) {
    return (
      <div className={s.section}>
        <div className={s.emptyShelf}>
          <span className={s.emptyTitle}>{t.scenarios.when.nothing}</span>
        </div>
      </div>
    )
  }

  return (
    <>
      {/*
        The hours that came and went with nobody here stand first, above the days.

        Nothing is ever started late, so a one-off whose hour passed leaves no other trace anywhere: not a
        run in the list, not a next hour of its own. The row itself says so - "missed" in the gutter, and
        the button on it runs the thing now - and it stays until somebody does that or deletes it.
      */}
      {table.missed.length > 0 ? (
        <div className={s.section}>
          <div className={s.hourRows}>
            {table.missed.map((row) => (
              <HourRow
                key={row.schedule.id}
                row={row}
                now={now}
                onEdit={() => onEdit(row.schedule)}
                onRemove={() => onRemove(row.schedule)}
                onRunNow={() => onRunNow(row.schedule)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {table.days.map((day) => (
        <div key={day.key} className={s.section}>
          <div className={s.label}>
            {day.awayInDays === 0
              ? t.scenarios.when.today
              : day.awayInDays === 1
                ? t.scenarios.when.tomorrow
                : ''}
            <span className={s.labelNote}>
              {new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
                .format(new Date(day.at))
                .toUpperCase()}
            </span>
            <span className={s.labelLine} />
          </div>

          <div className={s.hourRows}>
            {day.rows.map((row) => (
              <HourRow
                key={row.schedule.id}
                row={row}
                now={now}
                onEdit={() => onEdit(row.schedule)}
                onRemove={() => onRemove(row.schedule)}
                onRunNow={() => onRunNow(row.schedule)}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

const HourRow = ({
  row,
  now,
  onEdit,
  onRemove,
  onRunNow,
}: {
  row: TimetableRow
  now: number
  onEdit: () => void
  onRemove: () => void
  onRunNow: () => void
}) => {
  const t = useT()
  const locale = useLocale()
  const { schedule, scenario, missed } = row

  const rhythm =
    schedule.repeat === 'weekly'
      ? t.scenarios.when.weeklyOn(weekdayName(schedule.weekday, locale, 'long'))
      : t.scenarios.when.repeats[schedule.repeat]

  const answers = Object.entries(schedule.inputs).filter(([, value]) => value.trim().length > 0)

  return (
    <div className={`${s.hourRow} ${missed ? s.hourMissed : ''}`}>
      {/* The hour in a gutter of its own, with one word under it about the hour rather than about the
          scenario: missed, or how far off it is. */}
      <span className={s.hourGutter}>
        <span className={s.hourClock}>{clockLabel(missed ? minutesOf(row.at) : schedule.at)}</span>
        <span className={s.hourAway}>
          {missed
            ? t.scenarios.when.missedShort
            : schedule.repeat === 'once'
              ? t.scenarios.when.repeats.once.toLowerCase()
              : t.scenarios.when.inTime(countdown(row.at - now))}
        </span>
      </span>

      <button type="button" className={s.hourText} onClick={onEdit} data-tooltip={t.scenarios.when.change}>
        <span className={s.hourName}>{scenario?.name ?? t.scenarios.when.orphan}</span>
        <span className={s.hourFacts}>
          <span>{rhythm}</span>
          {answers.length === 0 ? (
            <>
              <span className={s.factDot}>·</span>
              <span className={s.hourNoAnswers}>{t.scenarios.when.noAnswers}</span>
            </>
          ) : (
            answers.map(([name, value]) => (
              <span key={name} className={s.factChip}>{`${name}: ${value}`}</span>
            ))
          )}
        </span>
      </button>

      <span className={s.hourActions}>
        {missed ? (
          <button type="button" className={`${s.button} ${s.buttonWarn}`} onClick={onRunNow}>
            {t.scenarios.when.runNow}
          </button>
        ) : (
          <button type="button" className={s.button} onClick={onEdit}>
            {t.scenarios.when.changeShort}
          </button>
        )}
        <button
          type="button"
          className={`${s.iconButton} ${s.iconDanger}`}
          data-tooltip={t.scenarios.when.clear}
          aria-label={t.scenarios.when.clear}
          onClick={onRemove}
        >
          <CrossIcon />
        </button>
      </span>
    </div>
  )
}

/**
 * The hour of a moment, as minutes from midnight - what the clock in the gutter is written from.
 *
 * A missed hour is placed by the moment it was missed rather than by the arrangement's own setting: a
 * one-off moved after its hour went by would otherwise say it was missed at the new time.
 */
const minutesOf = (at: number): number => {
  const date = new Date(at)
  return date.getHours() * 60 + date.getMinutes()
}
