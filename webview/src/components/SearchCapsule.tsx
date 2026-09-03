import s from './search.module.css'
import { useT } from '../i18n'

/** What the feed is doing about the hit that was chosen - said by the capsule, and by the veil over the feed. */
export type CapsuleNote = 'none' | 'loading' | 'missing'

interface SearchCapsuleProps {
  /** Loading: the feed is still on its way to the hit. Missing: it cannot reach it. None: it is there. */
  note: CapsuleNote
  /** How many hits stand in this conversation, and which of them the feed is on - see chatHits. */
  count: number
  at: number
  /** One hit up or down the conversation - the arrows. */
  onStep: (direction: -1 | 1) => void
  /** The window again, with the same query and the same results. */
  onOpen: () => void
  onClose: () => void
}

/**
 * The search folded into the corner of the feed after a hit was chosen.
 *
 * Back into the window, the arrows, and done with the search. The arrows walk the hits of THIS
 * conversation only, in the order they stand in it, however wide the search was: a search across the
 * project finds hits in a dozen talks, and an arrow that leapt into another conversation would be the
 * list in the window, only worse. For the other talks there is the way back. The arrows wrap around, as
 * every find-next does, and stand only where there is somewhere to step to - a pair of arrows over one
 * hit is two buttons that do nothing.
 *
 * In the feed's corner rather than in the header: the header belongs to the tabs and the project, while
 * this is about the conversation on screen, and it goes with that conversation when the tabs change. The
 * same corner on a phone - the feed is the same component there (see Thread).
 *
 * While the feed is still on its way to the hit - a conversation being opened, pages above being fetched
 * - a veil stands over the feed with the capsule above it (see .veil in search.module.css). Without it
 * the feed opened at its end, stood there for the seconds the pages took and then leapt: a screen with
 * nothing of what was searched for on it, and no word about why. The capsule stays reachable through
 * the veil, so the jump can be given up from the same place it was asked for.
 */
export const SearchCapsule = ({ note, count, at, onStep, onOpen, onClose }: SearchCapsuleProps) => {
  const t = useT()

  return (
    <>
      <div className={`${s.veil} ${note === 'loading' ? s.veilOn : ''}`} aria-hidden={note !== 'loading'}>
        <span className={s.veilRing} aria-hidden="true" />
        <span className={s.veilText}>{t.search.capsule.loading}</span>
      </div>

      <div className={s.capsule} role="toolbar" aria-label={t.search.title}>
        <button type="button" className={s.capsuleBack} onClick={onOpen}>
          <Magnifier size={13} className={s.capsuleIcon} />
          <span className={s.capsuleText}>{t.search.capsule.reopen}</span>
          {note === 'missing' ? <span className={s.capsuleNote}>{t.search.capsule.missing}</span> : null}
        </button>
        {count > 1 ? (
          <>
            <span className={s.capsuleRule} aria-hidden="true" />
            {/* "2/5" and not a sentence: the arrows beside it say what is counted. */}
            <span className={s.capsuleCount}>
              {at + 1}/{count}
            </span>
            <button
              type="button"
              className={s.capsuleStep}
              onClick={() => onStep(-1)}
              aria-label={t.search.capsule.previous}
              data-tooltip={t.search.capsule.previous}
              data-tooltip-at="bottom"
            >
              <Chevron up />
            </button>
            <button
              type="button"
              className={s.capsuleStep}
              onClick={() => onStep(1)}
              aria-label={t.search.capsule.next}
              data-tooltip={t.search.capsule.next}
              data-tooltip-at="bottom"
            >
              <Chevron />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className={s.capsuleClose}
          onClick={onClose}
          aria-label={t.search.capsule.close}
          data-tooltip={t.search.capsule.close}
          data-tooltip-at="bottom"
        >
          ×
        </button>
      </div>
    </>
  )
}

/** The arrow on a step button - the same chevron the window's rows unfold with, pointing the way. */
const Chevron = ({ up = false }: { up?: boolean }) => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
  </svg>
)

/** The magnifier, drawn once for the capsule, the window's field and the composer's button. */
export const Magnifier = ({ size = 13, className }: { size?: number; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    width={size}
    height={size}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
  >
    <circle cx="6.8" cy="6.8" r="4.3" />
    <path d="M10.2 10.2 14 14" />
  </svg>
)
