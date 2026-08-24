import m from '../mobile.module.css'

/**
 * The way back, drawn rather than typed.
 *
 * It used to be the character "‹", and at the size of the word beside it that character is punctuation:
 * every phone draws its own back arrow tall and heavy, and this one came out as a stray mark. A path is
 * the same everywhere, at the weight it was drawn at.
 *
 * One component rather than the same nine lines on each of the five screens that have one.
 */
export const Back = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className={m.headerAction} onClick={onClick}>
    <svg className={m.backIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 4.5 7.5 12 15 19.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    Back
  </button>
)
