import m from '../mobile.module.css'
import { useT } from '../../i18n'

/**
 * The way back, drawn rather than typed, and without the word beside it.
 *
 * It used to be the character "‹", and at the size of a word that character is punctuation: every phone
 * draws its own back arrow tall and heavy, and this one came out as a stray mark. A path is the same
 * everywhere, at the weight it was drawn at.
 *
 * The word "Back" that used to stand beside it has gone with the header's second line. A title and the
 * project under it need the width, the arrow at the left edge of a header means one thing on every
 * phone ever made, and a label repeating what a shape already says is a label nobody reads.
 *
 * One component rather than the same nine lines on each of the eight screens that have one.
 */
export const Back = ({ onClick }: { onClick: () => void }) => {
  const t = useT()

  return (
    <button type="button" className={m.headerIcon} aria-label={t.common.back} onClick={onClick}>
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
    </button>
  )
}
