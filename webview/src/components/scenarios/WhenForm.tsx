import type { Scenario } from '../../protocol'
import { missingInputs } from '../../scenarios/rules'
import { HOURS, MINUTES, pad2, WEEKDAYS, weekdayName, whenLabel } from '../../scenarios/schedule'
import { countdown } from '../../scenarios/timetable'
import { nextDue } from '../../scenarios/due'
import { useLocale, useT } from '../../i18n'
import { Overlay } from './Overlay'
import { Picker } from './Picker'
import { ScenarioInputs } from './ScenarioInputs'
import type { ScheduledHour } from './view'
import s from './scenarios.module.css'

/**
 * The form for a scheduled run: when, how often, and the scenario's own questions.
 *
 * The questions are here because at the hour there is nobody at the keyboard to answer them - an
 * arrangement without them would be an alarm that rings and then asks something of an empty chair. The
 * same fields as the start form, from the same block, and the same rule: nothing may be set while a
 * required one is empty.
 *
 * It says at the top whether it is adding one or changing one, because from here on those are two
 * different things: a scenario carries as many arrangements as somebody wants, so "save" either makes a
 * fourth or edits the third.
 */
export const WhenForm = ({
  scenario,
  editing,
  hour,
  values,
  onHour,
  onValues,
  onSet,
  onCancel,
}: {
  scenario: Scenario
  /** Whether an arrangement is being changed rather than added. */
  editing: boolean
  hour: ScheduledHour
  values: Record<string, string>
  onHour: (hour: ScheduledHour) => void
  onValues: (values: Record<string, string>) => void
  onSet: () => void
  onCancel: () => void
}) => {
  const t = useT()
  const locale = useLocale()
  const missing = missingInputs(scenario, values)

  // When this arrangement would actually go off, worked out on this side purely to be said out loud: the
  // IDE decides it for real (see ScheduleClock), and an hour set at ten in the morning for eight is due
  // tomorrow rather than in the past.
  const due = nextDue(hour)

  return (
    <Overlay
      title={t.scenarios.when.another}
      subtitle={`${scenario.name} · ${editing ? t.scenarios.when.editTitle : t.scenarios.when.newTitle}`}
      onClose={onCancel}
      foot={
        <>
          <span className={s.overlayNote}>{t.scenarios.when.needsIde}</span>
          <span className={s.overlayButtons}>
            <button type="button" className={s.button} onClick={onCancel}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              className={`${s.button} ${s.buttonMain}`}
              disabled={missing.length > 0}
              onClick={onSet}
            >
              {t.scenarios.when.save}
            </button>
          </span>
        </>
      }
    >
      <div className={s.field2Row}>
        <span className={s.fieldLabel}>{t.scenarios.when.at}</span>
        {/*
          Two of the panel's own menus rather than a time field: the browser inside the IDE draws that
          one in a white system panel of its own, which is a piece of Chromium sitting in the middle of
          this form and the only control on the screen that does not belong to the plugin.
        */}
        <span className={s.timeRow}>
          <Picker
            label=""
            title={t.scenarios.when.hours}
            value={String(Math.floor(hour.at / 60))}
            options={HOURS.map((one) => ({ id: String(one), label: pad2(one) }))}
            width={104}
            onPick={(id) => onHour({ ...hour, at: Number(id) * 60 + (hour.at % 60) })}
          />
          <span className={s.timeColon}>:</span>
          <Picker
            label=""
            title={t.scenarios.when.minutes}
            value={String(hour.at % 60)}
            options={MINUTES.map((one) => ({ id: String(one), label: pad2(one) }))}
            width={104}
            onPick={(id) => onHour({ ...hour, at: Math.floor(hour.at / 60) * 60 + Number(id) })}
          />
          {/* When that lands, in the same words a row of the timetable uses - so the form and the row it
              makes read as one thing rather than as two clocks. */}
          <span className={s.timeDue}>
            {`${t.scenarios.when.next(whenLabel(due, locale))}, ${t.scenarios.when.inTime(countdown(due - Date.now()))}`}
          </span>
        </span>
      </div>

      <div className={s.field2Row}>
        <span className={s.fieldLabel}>{t.scenarios.when.repeat}</span>
        <span className={s.segmented}>
          {(['once', 'daily', 'weekdays', 'weekly'] as const).map((repeat) => (
            <button
              key={repeat}
              type="button"
              className={`${s.segment} ${hour.repeat === repeat ? s.segmentOn : ''}`}
              onClick={() => onHour({ ...hour, repeat })}
            >
              {t.scenarios.when.repeats[repeat]}
            </button>
          ))}
        </span>
      </div>

      {hour.repeat === 'weekly' ? (
        <div className={s.field2Row}>
          <span className={s.fieldLabel}>{t.scenarios.when.onDay}</span>
          <span className={s.segmented}>
            {WEEKDAYS.map((weekday) => (
              <button
                key={weekday}
                type="button"
                className={`${s.segment} ${hour.weekday === weekday ? s.segmentOn : ''}`}
                onClick={() => onHour({ ...hour, weekday })}
              >
                {weekdayName(weekday, locale)}
              </button>
            ))}
          </span>
        </div>
      ) : null}

      {scenario.inputs.length > 0 ? (
        <>
          <div className={s.overlayLabel}>{t.scenarios.when.itAsksFor}</div>
          <ScenarioInputs scenario={scenario} values={values} onChange={onValues} />
          <p className={s.overlayHint}>{t.scenarios.when.answeredNow}</p>
        </>
      ) : null}
    </Overlay>
  )
}
