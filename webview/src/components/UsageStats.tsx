import { useT } from '../i18n'
import type { UsageStatsConsent } from '../protocol'
import c from './composer.module.css'
import s from './sideMenu.module.css'

/**
 * The anonymous usage report, as a person meets it: a card that asks once, a screen in the settings to
 * change the answer, and the report itself shown whole.
 *
 * Nothing is sent until the card is answered yes (see UsageReporter on the plugin's side) - the card is the
 * question, not an announcement of something already switched on. That is what JetBrains asks of a plugin
 * that counts anything (Marketplace approval guidelines, 2.2.d), and it is what makes "anonymous" worth
 * believing: a person who can read the whole report before allowing it does not have to take the word of
 * whoever wrote it.
 */

/** Where the full policy is published - built from PRIVACY.md and served by the relay. */
export const PRIVACY_URL = 'https://relay.mzpizote.com/privacy'

/**
 * The card above the input field that asks. Shown while the question has not been answered on this
 * machine, and gone the moment it is - in every window, since the answer is the machine's.
 *
 * Two buttons of different weight on purpose, and neither of them is a close cross: closing without
 * answering would leave the question to come back, and a question that keeps coming back is a nag.
 */
export const UsageConsentCard = ({
  onAnswer,
  onMore,
}: {
  onAnswer: (granted: boolean) => void
  /** Open the screen that says what is and is not sent. */
  onMore: () => void
}) => {
  const t = useT()

  return (
    <div className={c.usageCard} role="region" aria-label={t.usageStats.card.title}>
      <div className={c.usageHead}>
        <span className={c.usageLabel}>{t.usageStats.card.label}</span>
        <span className={c.usageTitle}>{t.usageStats.card.title}</span>
      </div>
      <p className={c.usageBody}>{t.usageStats.card.body}</p>
      <div className={c.usageActions}>
        <button type="button" className={c.primary} onClick={() => onAnswer(true)}>
          {t.usageStats.card.allow}
        </button>
        <button type="button" className={c.secondary} onClick={() => onAnswer(false)}>
          {t.usageStats.card.decline}
        </button>
        <div className={c.spacer} />
        <button type="button" className={c.usageMore} onClick={onMore}>
          {t.usageStats.card.more}
        </button>
      </div>
    </div>
  )
}

/**
 * The settings screen: the switch, what travels and what never does, and two ways to check - the report
 * itself, and the policy.
 */
export const UsageScreen = ({
  consent,
  lastSent,
  onToggle,
  onPreview,
  onOpenLink,
}: {
  consent: UsageStatsConsent
  lastSent: number
  onToggle: (granted: boolean) => void
  onPreview: () => void
  onOpenLink: (url: string) => void
}) => {
  const t = useT()
  const on = consent === 'granted'

  return (
    <div className={s.screen}>
      <button type="button" className={s.switchRow} onClick={() => onToggle(!on)} aria-pressed={on}>
        <span className={s.switchText}>
          <span className={s.switchLabel}>{t.usageStats.label}</span>
          <span className={s.switchHint}>{t.usageStats.hint}</span>
        </span>
        <span className={`${s.switchTrack} ${on ? s.switchTrackOn : ''}`}>
          <span className={`${s.switchKnob} ${on ? s.switchKnobOn : ''}`} />
        </span>
      </button>

      {on ? (
        <span className={s.screenNote}>{lastSent > 0 ? t.usageStats.lastSent(new Date(lastSent).toLocaleString()) : t.usageStats.notYet}</span>
      ) : null}

      <div className={s.aboutList}>
        <span className={s.screenLabel}>{t.usageStats.sentTitle}</span>
        {t.usageStats.sent.map((line) => (
          <div key={line} className={s.aboutItem}>
            <span className={s.aboutMarkOk}>✓</span>
            <span>{line}</span>
          </div>
        ))}
      </div>

      <div className={s.aboutList}>
        <span className={s.screenLabel}>{t.usageStats.neverTitle}</span>
        {t.usageStats.never.map((line) => (
          <div key={line} className={s.aboutItem}>
            <span className={s.aboutMarkNo}>✕</span>
            <span>{line}</span>
          </div>
        ))}
      </div>

      <p className={s.aboutProse}>{t.usageStats.offNote}</p>

      <button type="button" className={s.linkRow} onClick={onPreview}>
        {t.usageStats.seeReport}
      </button>
      <button type="button" className={s.linkRow} onClick={() => onOpenLink(PRIVACY_URL)}>
        {t.usageStats.privacy}
      </button>
    </div>
  )
}

/**
 * The report as it would go next, whole. The same stance as the feedback form's preview (see
 * FeedbackLog): plain text, nothing left out, no prettier rendering that would invite the question of
 * what it hid.
 */
export const UsageReportScreen = ({ text }: { text: string | null }) => {
  const t = useT()

  return (
    <div className={s.screen}>
      <span className={s.screenNote}>{t.usageStats.reportNote}</span>
      {text === null ? <div className={s.screenEmpty}>{t.usageStats.building}</div> : <pre className={s.logText}>{text}</pre>}
    </div>
  )
}
