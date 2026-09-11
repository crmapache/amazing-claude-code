import type { Scenario } from '../../protocol'
import { useT } from '../../i18n'
import s from './scenarios.module.css'

/**
 * The questions a scenario asks, as a block of fields.
 *
 * One block for the two forms that ask them - the one in front of a run and the one in front of a
 * scheduled run - because they are the same question in both: what this round of work is being done
 * against. The two carried identical markup before, which was tolerable while they sat twelve lines
 * apart in one file and stopped being so the moment they moved into files of their own.
 *
 * The caption stands over the field rather than beside it. In a column of its own it took a third of an
 * overlay's width from the answer, and the answer is a ticket or a branch - the longest short thing on
 * the screen.
 */
export const ScenarioInputs = ({
  scenario,
  values,
  onChange,
}: {
  scenario: Scenario
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}) => {
  const t = useT()

  return (
    <>
      {scenario.inputs.map((input) => (
        <div key={input.id} className={s.field2Row}>
          <span className={s.fieldLabel}>
            {input.label || input.name}
            {input.required ? <span className={s.fieldRequired}>{t.scenarios.editor.required}</span> : null}
          </span>
          <input
            className={s.field}
            value={values[input.name] ?? ''}
            placeholder={input.placeholder}
            onChange={(event) => onChange({ ...values, [input.name]: event.target.value })}
          />
        </div>
      ))}
    </>
  )
}
