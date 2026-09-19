import { useT } from '../i18n'
import type { Dict } from '../i18n/en'
import { INDICATORS, shows, type HiddenIndicators, type IndicatorId } from '../indicators'
import s from './sideMenu.module.css'

/** What each switch is called and what it explains, in the list's own order (see INDICATORS). */
const labelOf = (t: Dict, id: IndicatorId, modelLabel: string | undefined): { label: string; hint: string } => {
  const words = t.indicators
  switch (id) {
    case 'contextBar':
      return words.contextBar
    case 'contextFigure':
      return words.contextFigure
    case 'fiveHour':
      return words.fiveHour
    case 'week':
      return words.week
    case 'modelWeek':
      // Named by the model when the plan keeps such a week - "Fable weekly limit" is the ring a person is
      // deciding about; before the figures arrive, or on a plan without one, the general words.
      return { label: modelLabel ? words.modelWeek.named(modelLabel) : words.modelWeek.label, hint: words.modelWeek.hint }
    case 'tokens':
      return words.tokens
    case 'feedback':
      return words.feedback
    case 'thanks':
      return words.thanks
  }
}

/** The two readings above the field, then everything in the row with the usage - kept apart by a gap. */
const ABOVE: readonly IndicatorId[] = ['contextBar', 'contextFigure']

/**
 * Which of the indicators around the input field stay on the screen, one switch each.
 *
 * No sample, unlike the colours next door: the switches act on the panel itself, and the row under the
 * field is right there once the menu is closed - a copy of it here would only be a second thing to
 * compare. The words carry what the row cannot show: that the context figure lives only in the ordinary
 * layout, and that the model's week is a ring only on a plan that keeps one.
 */
export const Indicators = ({
  hidden,
  modelLabel,
  onToggle,
}: {
  hidden: HiddenIndicators
  /** The server's name for the model's own week (Fable), once the figures have said it. */
  modelLabel?: string
  onToggle: (id: IndicatorId) => void
}) => {
  const t = useT()

  const row = (id: IndicatorId) => {
    const on = shows(hidden, id)
    const { label, hint } = labelOf(t, id, modelLabel)

    return (
      <button key={id} type="button" className={s.switchRow} onClick={() => onToggle(id)} aria-pressed={on}>
        <span className={s.switchText}>
          <span className={s.switchLabel}>{label}</span>
          <span className={s.switchHint}>{hint}</span>
        </span>
        <span className={`${s.switchTrack} ${on ? s.switchTrackOn : ''}`}>
          <span className={`${s.switchKnob} ${on ? s.switchKnobOn : ''}`} />
        </span>
      </button>
    )
  }

  return (
    <div className={s.screen}>
      <div className={s.indicatorList}>{INDICATORS.filter((id) => ABOVE.includes(id)).map(row)}</div>
      <div className={s.indicatorList}>{INDICATORS.filter((id) => !ABOVE.includes(id)).map(row)}</div>
    </div>
  )
}
