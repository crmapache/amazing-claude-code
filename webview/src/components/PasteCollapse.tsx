import { useEffect, useState } from 'react'
import { PASTE_COLLAPSE_NEVER } from '../feed/reference'
import type { Dict } from '../i18n/en'
import { PASTE_COLLAPSE_MAX, PASTE_COLLAPSE_MIN, clampPasteCollapse } from '../pasteCollapse'
import s from './sideMenu.module.css'

/**
 * From how many lines a paste folds into a chip - two answers, one of which carries a number.
 *
 * The number is typed rather than picked off a ladder of four steps (see pasteCollapse.ts). It lives in
 * the row it belongs to instead of standing under the list as a field of its own: what the row says and
 * what the field holds are one sentence, and split in two they read as two settings.
 *
 * "Never fold" leaves the field disabled rather than hiding it. A control that vanishes takes the value
 * with it, and coming back to the screen there would be nothing to say what the folding used to be set
 * to; greyed out, the number stays legible and the row above it is the way back.
 */
export const PasteCollapse = ({
  t,
  lines,
  last,
  onPick,
}: {
  t: Dict
  lines: number
  /** What the field shows while folding is off - see pasteCollapseLast in App. */
  last: number
  onPick: (lines: number) => void
}) => {
  const never = lines === PASTE_COLLAPSE_NEVER
  // What stands in the field, letter by letter, rather than the number already saved: "1" and an empty
  // field are both things a person passes through on the way to typing "12", and neither is an answer.
  const [typed, setTyped] = useState(() => String(never ? last : lines))

  // The setting can change from outside the screen - the IDE re-announcing what it has stored. Only a
  // real number is followed: while "never" is chosen the field keeps showing what folding would go back
  // to, which is exactly what it is there for.
  useEffect(() => {
    if (lines !== PASTE_COLLAPSE_NEVER) setTyped(String(lines))
  }, [lines])

  const save = (value: string) => {
    const chosen = clampPasteCollapse(value, never ? last : lines)
    setTyped(String(chosen))
    onPick(chosen)
  }

  return (
    <div className={`${s.screen} ${s.screenList}`}>
      <span className={`${s.screenNote} ${s.choiceNote}`}>{t.pasteCollapse.note}</span>

      <button
        type="button"
        className={`${s.choice} ${never ? s.choiceOn : ''}`}
        onClick={() => onPick(PASTE_COLLAPSE_NEVER)}
      >
        <span className={s.choiceTick}>{never ? '✓' : ''}</span>
        <span className={s.choiceBody}>
          <span className={s.choiceTop}>
            <span className={`${s.choiceLabel} ${never ? s.choiceLabelOn : ''}`}>{t.pasteCollapse.never}</span>
          </span>
          <span className={s.choiceSub}>{t.pasteCollapse.neverSub}</span>
        </span>
      </button>

      {/* A row rather than a button, because it holds a field: a control inside a control is neither
          clickable in the same way nor legal markup. The half that chooses is still a button of its
          own, and it covers everything but the number. */}
      <div className={`${s.choice} ${s.choiceField} ${never ? '' : s.choiceOn}`}>
        <button type="button" className={s.choiceHit} onClick={() => save(typed)}>
          <span className={s.choiceTick}>{never ? '' : '✓'}</span>
          <span className={s.choiceBody}>
            <span className={s.choiceTop}>
              <span className={`${s.choiceLabel} ${never ? '' : s.choiceLabelOn}`}>{t.pasteCollapse.foldLabel}</span>
            </span>
            <span className={s.choiceSub}>{t.pasteCollapse.foldSub(PASTE_COLLAPSE_MIN, PASTE_COLLAPSE_MAX)}</span>
          </span>
        </button>
        <input
          className={s.choiceNumber}
          type="text"
          inputMode="numeric"
          disabled={never}
          value={typed}
          aria-label={t.pasteCollapse.foldLabel}
          onChange={(event) => {
            // Digits only, and no clamping while the field is being written in: a number corrected under
            // the fingers - "5" jumping to "500" at the second keystroke - fights whoever is typing it.
            const digits = event.target.value.replace(/\D/g, '').slice(0, 3)
            setTyped(digits)

            const value = Number.parseInt(digits, 10)
            if (Number.isFinite(value) && value >= PASTE_COLLAPSE_MIN && value <= PASTE_COLLAPSE_MAX) onPick(value)
          }}
          // The bounds are applied on the way out: what was typed past them is taken as the nearest thing
          // it could have meant, and the field says so by showing the number it settled on.
          onBlur={() => save(typed)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </div>
    </div>
  )
}
