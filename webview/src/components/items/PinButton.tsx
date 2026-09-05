import { useT } from '../../i18n'
import s from '../feed.module.css'

/**
 * A pushpin, drawn rather than typed.
 *
 * The same reason the reuse arrow beside it is drawn (see ReuseArrow in UserCard): 📌 and ⚲ are not in
 * the panel's font and fall through to whatever the system has, at a size and a weight of their own.
 *
 * Filled when the message is pinned and hollow when it is not: the one glyph says both what the button
 * does and what state it is in, which is what lets the very same shape stand in the strip above the feed
 * and be recognised there as "this is what that button made".
 */
export const PinIcon = ({ filled = false, size = 12, className }: { filled?: boolean; size?: number; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </svg>
)

interface PinButtonProps {
  pinned: boolean
  /**
   * Whether the strip is already full (see PIN_LIMIT). Then this button goes dead for everything not
   * already pinned, and its hint asks for a pin to be taken off first.
   *
   * Dead rather than pushing the oldest pin out: a pin is a mark somebody put there on purpose, and
   * silently dropping one of three to make room throws away exactly that. Dead rather than gone, too - a
   * button that disappears takes with it the one line that says what to do about it.
   */
  full: boolean
  className: string
  onPin: () => void
}

/** The pin button in the corner of a card - one component for a message of one's own and for an answer. */
export const PinButton = ({ pinned, full, className, onPin }: PinButtonProps) => {
  const t = useT()
  const crowded = full && !pinned
  const hint = pinned ? t.feed.pin.remove : crowded ? t.feed.pin.crowded : t.feed.pin.add

  return (
    <button
      type="button"
      className={`${className} ${pinned ? s.pinOn : ''} ${crowded ? s.pinDead : ''}`}
      aria-label={hint}
      aria-pressed={pinned}
      /*
       * `aria-disabled` and a handler that is simply not there, rather than the real `disabled` attribute.
       * A disabled control gets no pointer events at all in Chromium, so the hover hint - the only thing
       * that says why the button is dead and what to do about it - would never appear on the one button
       * that needs it.
       */
      aria-disabled={crowded || undefined}
      data-tooltip={hint}
      onClick={crowded ? undefined : onPin}
    >
      <PinIcon filled={pinned} />
    </button>
  )
}
