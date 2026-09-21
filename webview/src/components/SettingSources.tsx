import type { Dict } from '../i18n/en'
import { type SettingSources as Sources, settingSourcesOptions } from '../settingSources'
import s from './sideMenu.module.css'

/**
 * Which of Claude Code's settings layers this project loads - the three answers, and what the repository
 * is setting right now.
 *
 * A screen of its own rather than a plain ChoiceList, and the difference is the card at the foot: the
 * choice is impossible to make well without knowing what is in the repository's files. Somebody opening
 * this screen has a conversation that talks to the wrong gateway or does not answer at all, and the
 * names below say in one line whether that is what happened. They are names only - what stands in that
 * block is a key, and the panel is a screen somebody else can be looking at.
 *
 * The card is drawn whatever is chosen, including while those layers are already switched off: then it
 * reads as "this is what would come back", which is the other half of the same question.
 */
export const SettingSources = ({
  t,
  value,
  repository,
  supported,
  onPick,
}: {
  t: Dict
  value: Sources
  /** What the repository's settings files set of what decides the account and the address. */
  repository: string[]
  /**
   * Whether this Claude Code knows the flag at all. Undefined means nobody has answered yet - drawn as
   * nothing rather than as a warning: a screen that accuses the CLI while the question is still in
   * flight would flash that accusation on every opening.
   */
  supported?: boolean
  onPick: (value: string) => void
}) => (
  <div className={`${s.screen} ${s.screenList}`}>
    <span className={`${s.screenNote} ${s.choiceNote}`}>{t.settingSources.note}</span>

    {settingSourcesOptions(t).map((option) => {
      const on = option.id === value

      return (
        <button
          key={option.id}
          type="button"
          className={`${s.choice} ${on ? s.choiceOn : ''}`}
          onClick={() => onPick(option.id)}
        >
          <span className={s.choiceTick}>{on ? '✓' : ''}</span>
          <span className={s.choiceBody}>
            <span className={s.choiceTop}>
              <span className={`${s.choiceLabel} ${on ? s.choiceLabelOn : ''}`}>{option.label}</span>
            </span>
            {option.sub ? <span className={s.choiceSub}>{option.sub}</span> : null}
          </span>
        </button>
      )
    })}

    <div className={`${s.screen} ${s.screenFoot}`}>
      {repository.length > 0 ? (
        <div className={`${s.card} ${s.cardWarn}`}>
          <div className={s.cardTop}>
            <span className={`${s.cardDot} ${s.cardDotWarn}`} />
            <span className={s.cardName}>{t.settingSources.repositorySets}</span>
          </div>
          {/* The names in the panel's monospace, one line: they are identifiers, and a person is
              matching them against their own settings file rather than reading them as words. */}
          <span className={s.cardNames}>{repository.join(', ')}</span>
          <span className={s.screenNote}>{t.settingSources.repositoryMeans}</span>
        </div>
      ) : (
        <span className={s.screenNote}>{t.settingSources.repositoryQuiet}</span>
      )}

      {supported === false ? <span className={s.attachNote}>{t.settingSources.needsNewer}</span> : null}
    </div>
  </div>
)
