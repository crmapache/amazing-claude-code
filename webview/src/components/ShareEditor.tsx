import type { Dict } from '../i18n/en'
import s from './sideMenu.module.css'

/**
 * Whether a message sent from the panel carries what the editor shows - the open file, and the lines
 * selected in it (see EditorContext on the plugin's side).
 *
 * One switch and a note. The note answers the two questions this raises: whether a phone's message carries
 * it too (it does not - there is no editor beside a phone), and how to send a single message without it
 * while leaving the switch alone (the chip in the field).
 */
export const ShareEditor = ({ t, on, onToggle }: { t: Dict; on: boolean; onToggle: (on: boolean) => void }) => (
  <div className={s.screen}>
    <button type="button" className={s.switchRow} onClick={() => onToggle(!on)} aria-pressed={on}>
      <span className={s.switchText}>
        <span className={s.switchLabel}>{t.shareEditor.label}</span>
        <span className={s.switchHint}>{t.shareEditor.hint}</span>
      </span>
      <span className={`${s.switchTrack} ${on ? s.switchTrackOn : ''}`}>
        <span className={`${s.switchKnob} ${on ? s.switchKnobOn : ''}`} />
      </span>
    </button>

    <span className={s.screenNote}>{t.shareEditor.note}</span>
  </div>
)
