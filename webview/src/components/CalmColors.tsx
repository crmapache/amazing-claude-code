import { ContextMeter } from './Composer'
import { Ring } from './StatusBar'
import { CALM_VIVID_CALM, CALM_VIVID_FULL } from '../calmColors'
import { useT } from '../i18n'
import s from './sideMenu.module.css'

/**
 * One reading per step of the gauges' ladder - what the sample shows.
 *
 * The figures are the ones the steps genuinely begin at, so at full colour the four rings stand green,
 * sand, copper and red, exactly as they would over the input field. Dragged down, they fade together
 * towards one tone, and the row says the whole of what the slider does in a glance.
 */
const LADDER = [12, 58, 78, 94]

/**
 * What the sample bar reads. A window this full is the case people ask about the mode for - and it is
 * the top step of the ladder, so with the mode off the bar stands red, exactly as it would over the
 * field.
 */
const BAR = 87

/**
 * The no-stress colour mode: the gauges keep their reading and soften the verdict on it, by as much as
 * one asks them to.
 *
 * Both halves of the sample are the real components - the composer's own bar and the status row's own
 * ring - rather than pictures of them: a hand-drawn copy would be the one thing on this screen able to
 * lie about what the slider does. That is worth more here than it was under a switch, because the sample
 * now repaints under the finger and is the only way to pick a figure by looking rather than by guessing.
 * The bar is here because it is the gauge people notice first: it runs the width of the panel and turns
 * red under the sentence being typed.
 */
export const CalmColors = ({ vivid, onChange }: { vivid: number; onChange: (vivid: number) => void }) => {
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

      <div className={s.calmControl}>
        <div className={s.calmControlHead}>
          <span className={s.switchText}>
            <span className={s.switchLabel}>{t.calmColors.label}</span>
            <span className={s.switchHint}>{t.calmColors.hint}</span>
          </span>
          {/* The figure itself rather than a word for it: the two ends are named in the row of the
              settings list, and here what is wanted is the number the finger is standing on. */}
          <span className={s.percentChip}>{`${vivid}%`}</span>
        </div>

        <input
          type="range"
          className={s.slider}
          min={CALM_VIVID_CALM}
          max={CALM_VIVID_FULL}
          step={1}
          value={vivid}
          aria-label={t.calmColors.label}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>

      <span className={s.screenNote}>{t.calmColors.keeps}</span>
    </div>
  )
}
