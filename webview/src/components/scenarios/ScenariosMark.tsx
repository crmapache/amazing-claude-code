/**
 * The mark on the scenarios button: three steps down a rail, which is what a scenario is.
 *
 * Drawn rather than borrowed from a set, like the magnifier beside it: the panel has no icon font, and a
 * glyph out of the text font would sit at its own weight next to two strokes drawn at 1.7.
 *
 * The rail is what makes it read as an order rather than as a list: the steps of a scenario happen one
 * after another, and the one at the top has already happened by the time the one at the bottom starts.
 */
export const ScenariosMark = ({ size = 14, className }: { size?: number; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    width={size}
    height={size}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M3.2 3.4v9.2" />
    <circle cx="3.2" cy="3.4" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="3.2" cy="8" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="3.2" cy="12.6" r="1.15" fill="currentColor" stroke="none" />
    <path d="M6.6 3.4h6.4M6.6 8h6.4M6.6 12.6h4" />
  </svg>
)
