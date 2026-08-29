/**
 * The chevron, drawn once for the whole plugin.
 *
 * Everywhere something folds away or drops down there used to stand a typographic triangle - ▲ and ▼.
 * That is a character rather than a drawing: it carries the font's own weight, sits on the font's
 * baseline instead of in the middle of its box, and at eight or nine pixels turns into a solid smudge
 * that reads as a rendering fault. A stroke with round ends keeps its shape at any size, takes the colour
 * of whatever it stands in and can be turned rather than swapped for its mirror twin - so a fold and an
 * unfold are the same drawing at two angles, and the turn can be animated where that is worth doing.
 *
 * It points down, the way the caret of a dropdown does. Up is `rotate(180deg)` on the consumer's side:
 * the rotation belongs where the transition and the sizing already live.
 */
export const Chevron = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 10 6"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 1.4 5 5 9 1.4" />
  </svg>
)
