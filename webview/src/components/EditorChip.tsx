import type { EditorRef } from '../protocol'
import { editorLabel } from '../feed/editorContext'
import { useT } from '../i18n'
import { fitMark } from '../hooks/useToolsFit'
import s from './composer.module.css'

/**
 * A page with a band of lines picked out on it - the file in the editor, and a selection in it.
 *
 * A drawing rather than the terminal's "⧉": that sign is not in the panel's font and falls through to
 * whatever the system has, at a size and weight of its own beside a name set in ours (the same reason the
 * arrow on a message's card is drawn - see ReuseArrow).
 */
export const EditorIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    viewBox="0 0 16 16"
    aria-hidden="true"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4.2 2.4h5.2l2.8 2.8v8a.8.8 0 01-.8.8H4.2a.8.8 0 01-.8-.8V3.2a.8.8 0 01.8-.8z" />
    <path d="M5.6 7.4h4.8M5.6 10.2h3.2" />
  </svg>
)

/**
 * What the editor shows, in the field's bottom row - it goes with the message (see EditorContext.kt).
 *
 * Beside the paperclip on purpose: it is an attachment, one the panel makes by itself, and the hand that
 * attaches things is already there. A press leaves it out of this one message and a second press brings
 * it back; the switch for good is in the settings, where the hover over this chip does not need to say so.
 *
 * It gives way first when the row runs short: the name steps out whole and the drawing stays, before any
 * of the squares beside it leave (see droppableTools). The whole place stays in the hover.
 */
export const EditorChip = ({
  editor,
  on,
  bare = false,
  nameGone = false,
  onToggle,
}: {
  editor: EditorRef
  on: boolean
  /** The drawing alone, beside a narrow field - see .editorChipBare. */
  bare?: boolean
  /**
   * The row ran short and the name stepped out of it (see droppableTools). Kept in the chip at no width
   * rather than taken out: its width is what tells the row when there is room for it again.
   */
  nameGone?: boolean
  onToggle: () => void
}) => {
  const t = useT()
  const place = editorLabel({ ...editor, name: editor.path })

  return (
    <button
      type="button"
      className={`${s.editorChip} ${on ? '' : s.editorChipOff} ${bare ? s.editorChipBare : ''}`}
      aria-pressed={on}
      aria-label={on ? t.composer.editor.on(place) : t.composer.editor.off(place)}
      data-tooltip={on ? t.composer.editor.on(place) : t.composer.editor.off(place)}
      data-tooltip-at="top"
      // Like the other buttons in the row: the press must not pull the caret out of the field.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <EditorIcon />
      {bare ? null : (
        <span className={`${s.editorChipText} ${nameGone ? s.editorChipNameGone : ''}`} {...fitMark('name')}>
          {editorLabel(editor)}
        </span>
      )}
    </button>
  )
}
