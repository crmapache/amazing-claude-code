import type { Scenario } from '../../protocol'
import { missingInputs } from '../../scenarios/rules'
import { useT } from '../../i18n'
import { Overlay } from './Overlay'
import { ScenarioInputs } from './ScenarioInputs'
import s from './scenarios.module.css'

/**
 * What a round of work is asked before it joins the queue: its own questions, and the one choice a queued
 * turn has - whether to wait for a clean ending or merely for an ending.
 *
 * A form of its own rather than the start form with a flag, because the two end in different buttons and
 * mean different things: Run is "start now, beside whatever is going", this is "start when the one before
 * it is out of the way". On a screen where that difference is a night of work, one shared form would be a
 * press away from doing the other thing.
 *
 * It opens even for a scenario that asks nothing, unlike the start form, which starts such a scenario on
 * the press. There is always something to decide here - the choice below the questions is the feature - so
 * the form is never a question about nothing.
 */
export const QueueForm = ({
  scenario,
  values,
  afterSuccess,
  waiting,
  behind,
  onChange,
  onAfterSuccess,
  onQueue,
  onCancel,
}: {
  scenario: Scenario
  values: Record<string, string>
  afterSuccess: boolean
  /** How many turns are already lined up - said before the button, so the place in the line is no surprise. */
  waiting: number
  /**
   * What a turn first in line would wait for: the run going right now, by name, whoever started it (see
   * queueBehind). Empty when nothing is going. The other half of the same promise: a turn that goes first
   * does not always start at once, and the one moment to say so is before the button is pressed.
   */
  behind: string
  onChange: (values: Record<string, string>) => void
  onAfterSuccess: (afterSuccess: boolean) => void
  onQueue: () => void
  onCancel: () => void
}) => {
  const t = useT()
  const missing = missingInputs(scenario, values)

  return (
    <Overlay
      title={t.scenarios.queue.add}
      subtitle={scenario.name}
      onClose={onCancel}
      foot={
        <>
          <span className={s.overlayNote}>
            {waiting > 0
              ? t.scenarios.queue.place(waiting)
              : behind
                ? t.scenarios.queue.placeBehind(behind)
                : t.scenarios.queue.placeFirst}
          </span>
          <span className={s.overlayButtons}>
            <button type="button" className={s.button} onClick={onCancel}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              className={`${s.button} ${s.buttonMain}`}
              disabled={missing.length > 0}
              onClick={onQueue}
            >
              {t.scenarios.queue.add}
            </button>
          </span>
        </>
      }
    >
      <ScenarioInputs scenario={scenario} values={values} onChange={onChange} />

      {/*
        The choice itself: two whole sentences rather than a checkbox with a label.

        What is being chosen is what happens to the REST of the night when this turn's predecessor falls
        over, and that does not fit in the words beside a tick box. Two rows, each saying what it does,
        and the careful one is on top and chosen.
      */}
      <div className={s.queueChoice}>
        <span className={s.queueChoiceLabel}>{t.scenarios.queue.startWhen}</span>

        <button
          type="button"
          className={`${s.queueOption} ${afterSuccess ? s.queueOptionOn : ''}`}
          aria-pressed={afterSuccess}
          onClick={() => onAfterSuccess(true)}
        >
          <span className={s.queueOptionName}>{t.scenarios.queue.afterSuccess}</span>
          <span className={s.queueOptionNote}>{t.scenarios.queue.afterSuccessNote}</span>
        </button>

        <button
          type="button"
          className={`${s.queueOption} ${afterSuccess ? '' : s.queueOptionOn}`}
          aria-pressed={!afterSuccess}
          onClick={() => onAfterSuccess(false)}
        >
          <span className={s.queueOptionName}>{t.scenarios.queue.afterAnything}</span>
          <span className={s.queueOptionNote}>{t.scenarios.queue.afterAnythingNote}</span>
        </button>
      </div>
    </Overlay>
  )
}
