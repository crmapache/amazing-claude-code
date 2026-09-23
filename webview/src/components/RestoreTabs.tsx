import type { Dict } from '../i18n/en'
import s from './sideMenu.module.css'

/**
 * Whether the tabs open when a project closed come back when it opens again - drafts and all (see
 * TabMemory on the plugin's side).
 *
 * One switch and two sentences. The first says what comes back, the second what it costs, and the second
 * is the one people ask about: ten tabs coming back does not mean ten agents starting, and a draft kept
 * on disk is kept on this machine only.
 */
export const RestoreTabs = ({ t, on, onToggle }: { t: Dict; on: boolean; onToggle: (on: boolean) => void }) => (
  <div className={s.screen}>
    <button type="button" className={s.switchRow} onClick={() => onToggle(!on)} aria-pressed={on}>
      <span className={s.switchText}>
        <span className={s.switchLabel}>{t.restoreTabs.label}</span>
        <span className={s.switchHint}>{t.restoreTabs.hint}</span>
      </span>
      <span className={`${s.switchTrack} ${on ? s.switchTrackOn : ''}`}>
        <span className={`${s.switchKnob} ${on ? s.switchKnobOn : ''}`} />
      </span>
    </button>

    <span className={s.screenNote}>{t.restoreTabs.note}</span>
  </div>
)
