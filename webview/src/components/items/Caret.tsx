import s from '../feed.module.css'

/**
 * The disclosure arrow in the head of a card - a call, a group of calls, a thought.
 *
 * Drawn rather than typed. A glyph (▶) is only as centred as the font decides: the panel's mono face has
 * no triangle of its own, a phone falls back to a system one, and the shape it hands over sits off the
 * middle of its own box. Turning that box by ninety degrees therefore swung the arrow out on an arc and
 * put it down somewhere else instead of turning it in place. A path in a square viewBox has its middle
 * exactly where we put it - on every platform, and in both states.
 */
export const Caret = ({ open }: { open: boolean }) => (
  <span className={`${s.caret} ${open ? s.caretOpen : ''}`} aria-hidden="true">
    <svg viewBox="0 0 12 12" focusable="false">
      {/* Symmetrical about the centre of the box (6, 6): that centre is what the turn happens about. */}
      <path
        d="M3.95 2.9 8.05 6 3.95 9.1Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  </span>
)
