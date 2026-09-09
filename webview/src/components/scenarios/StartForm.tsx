import type { Scenario } from '../../protocol'
import { missingInputs } from '../../scenarios/rules'
import { useT } from '../../i18n'
import { Overlay } from './Overlay'
import { ScenarioInputs } from './ScenarioInputs'
import s from './scenarios.module.css'

/**
 * What the scenario asks before it starts: one field per question, and nothing else.
 *
 * On the overlay rather than wedged into the shelf it was pressed from. A form that opens inside the
 * list pushes the list down under the hand that opened it, and the row somebody was aiming at moves.
 */
export const StartForm = ({
  scenario,
  values,
  last,
  going,
  onChange,
  onStart,
  onCancel,
}: {
  scenario: Scenario
  values: Record<string, string>
  /** What the last run of this scenario was given - offered under each field, never as its value. */
  last?: Record<string, string>
  /** How many runs are already going over this working copy - said before the button, not after. */
  going: number
  onChange: (values: Record<string, string>) => void
  onStart: () => void
  onCancel: () => void
}) => {
  const t = useT()
  const missing = missingInputs(scenario, values)

  return (
    <Overlay
      title={t.scenarios.play}
      subtitle={scenario.name}
      onClose={onCancel}
      foot={
        <>
          {going > 0 ? <span className={s.overlayNote}>{t.scenarios.besideGoing(going)}</span> : <span />}
          <span className={s.overlayButtons}>
            <button type="button" className={s.button} onClick={onCancel}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              className={`${s.button} ${s.buttonMain}`}
              disabled={missing.length > 0}
              onClick={onStart}
            >
              {t.scenarios.play}
            </button>
          </span>
        </>
      }
    >
      <ScenarioInputs scenario={scenario} values={values} last={last} onChange={onChange} />
    </Overlay>
  )
}
