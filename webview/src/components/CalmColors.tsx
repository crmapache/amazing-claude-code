import { ContextMeter } from './Composer'
import { Ring } from './StatusBar'
import { useT } from '../i18n'
import s from './sideMenu.module.css'

/**
 * One reading per step of the gauges' ladder - what the sample shows.
 *
 * The figures are the ones the steps genuinely begin at, so with the mode off the four rings stand
 * green, sand, copper and red, exactly as they would over the input field. Switched on, all four are one
 * tone and the row says the whole of what the setting does in a glance.
 */
const LADDER = [12, 58, 78, 94]

/**
 * What the sample bar reads. A window this full is the case people ask about the mode for - and it is
 * the top step of the ladder, so with the mode off the bar stands red, exactly as it would over the
 * field.
 */
const BAR = 87

/**
 * The no-stress colour mode: the gauges keep their reading and drop the verdict on it.
 *
 * Both halves of the sample are the real components - the composer's own bar and the status row's own
 * ring - rather than pictures of them: a hand-drawn copy would be the one thing on this screen able to
 * lie about what the switch does. The bar is here because it is the gauge people notice first: it runs
 * the width of the panel and turns red under the sentence being typed.
 */
export const CalmColors = ({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) => {
  const t = useT()

  return (
    <div className={s.screen}>
      {/* No paragraph over the sample: the sample says what the switch does, and a description of the
          four steps said it again in words, above the very thing it was describing. */}
      <div className={s.calmSample}>
        <span className={s.screenLabel}>{t.calmColors.sample}</span>
        {/* The bar wears the padding the composer's field needs; inside a card that has its own, it
            would stand lower and further in than the rings under it. */}
        <ContextMeter percent={BAR} className={s.calmBarRow} />
        <div className={s.calmLadder}>
          {LADDER.map((percent, step) => (
            <span key={percent} className={s.calmStep}>
              <Ring percent={percent} color={`var(--acc-gauge-${step + 1})`} />
              <span className={s.calmStepValue} style={{ color: `var(--acc-gauge-${step + 1})` }}>
                {percent}%
              </span>
            </span>
          ))}
        </div>
      </div>

      <button type="button" className={s.switchRow} onClick={() => onToggle(!on)} aria-pressed={on}>
        <span className={s.switchText}>
          <span className={s.switchLabel}>{t.calmColors.label}</span>
          <span className={s.switchHint}>{t.calmColors.hint}</span>
        </span>
        <span className={`${s.switchTrack} ${on ? s.switchTrackOn : ''}`}>
          <span className={`${s.switchKnob} ${on ? s.switchKnobOn : ''}`} />
        </span>
      </button>

      <span className={s.screenNote}>{t.calmColors.keeps}</span>
    </div>
  )
}
