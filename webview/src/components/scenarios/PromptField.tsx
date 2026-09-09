import { useRef, type ReactNode } from 'react'
import s from './scenarios.module.css'

/**
 * The one field of the editor that is genuinely code, with the names in it lit up.
 *
 * A card's prompt is the only thing on this screen that reaches an agent, and the two kinds of name in it
 * - `{{ticket}}`, answered before the run, and `[[findings]]`, filled by the main thread - are the whole
 * of what makes a scenario more than a list of instructions. Written in plain text they are three
 * brackets somebody has to spot; lit up, a mistyped one is visible the moment it is typed.
 *
 * Drawn as a backdrop under a transparent textarea rather than as a rich editor: the field has to go on
 * being a textarea - the panel lends every plain field its own undo history, word delete and step forward
 * (see useFieldHistory), and a contenteditable would lose all three. The two boxes share one set of
 * metrics in the stylesheet, so what is painted underneath sits exactly under what is typed above; the
 * scroll is carried across, because a long prompt scrolls inside itself.
 */
export const PromptField = ({
  value,
  placeholder,
  onChange,
  onKeyDown,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) => {
  const backdrop = useRef<HTMLDivElement>(null)

  return (
    <div className={s.prompt}>
      <div className={s.promptBack} ref={backdrop} aria-hidden="true">
        {/* A trailing newline has no line of its own in a block box, so the backdrop would come up one
            line short of the textarea the moment somebody ends the prompt with a return. */}
        {lit(value)}
        {'\n'}
      </div>
      <textarea
        className={s.promptField}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          const back = backdrop.current
          if (!back) return
          back.scrollTop = event.currentTarget.scrollTop
          back.scrollLeft = event.currentTarget.scrollLeft
        }}
      />
    </div>
  )
}

/**
 * The text with its two kinds of name marked, and everything else left exactly as typed.
 *
 * The same two shapes the rules read (see scenarios/rules.ts) - deliberately loose about the spaces
 * inside, because that is what the rules accept too, and a name lit differently from the way it is read
 * would be worse than no light at all.
 */
const NAMES = /(\{\{\s*[a-zA-Z0-9_-]+\s*\}\}|\[\[\s*[a-zA-Z0-9_-]+\s*\]\])/g

const lit = (text: string): ReactNode[] =>
  text.split(NAMES).map((piece, at) =>
    at % 2 === 1 ? (
      <span key={at} className={piece.startsWith('{') ? s.promptInput : s.promptSlot}>
        {piece}
      </span>
    ) : (
      piece
    ),
  )
