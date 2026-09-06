import s from '../feed.module.css'

/**
 * The three dots that open everything else a message can do.
 *
 * Only ever handed in by the phone. At the desk the same actions are elsewhere and are better there: a
 * quote is made by selecting the words it should be, a fork is a slash command, copying and pinning are
 * the buttons standing right beside this one. On a touchscreen none of those exist - there is no
 * selection menu under a thumb and no field to type a command into without losing the draft - so the
 * one affordance a phone has for "what else can I do with this" is a button that says so.
 */
export const MoreButton = ({ className, label, onClick }: { className?: string; label: string; onClick: () => void }) => (
  <button
    type="button"
    className={className ?? s.textAction}
    aria-label={label}
    data-tooltip={label}
    onClick={onClick}
  >
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="3" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="13" cy="8" r="1.4" fill="currentColor" />
    </svg>
  </button>
)
