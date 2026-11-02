import type { RefObject } from 'react'
import { useTouchSelection } from '../useTouchSelection'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

interface SelectionQuoteProps {
  /** The box the feed scrolls in: a selection anywhere else - the field, the header - is not this button's. */
  container: RefObject<HTMLElement | null>
  /** Off while the screen shows a subagent's own stream rather than the conversation, as at the desk. */
  on: boolean
  onQuote: (text: string) => void
}

/**
 * Quote the words selected in an answer - the desk's selection menu, as one button a thumb can reach.
 *
 * Not beside the selection, where the desk hangs its menu: there the phone's own bar already stands (copy,
 * look up, share), and the handles sit at both ends. Over the bottom of the feed instead, centred, on the
 * line of the jump-down button at its right - out of the way of both, and nearest the field the quote goes
 * above (see the quote list in Composer); at the top when the words are down there (see placeOf). Over the
 * feed rather than in the column under it, so it moves nothing while the handles are being dragged.
 *
 * The whole message is still quoted from the sheet behind its three dots (see MessageSheet); this is for a
 * piece of one, which is how the desk quotes.
 */
export const SelectionQuote = ({ container, on, onQuote }: SelectionQuoteProps) => {
  const t = useT()
  const selection = useTouchSelection(container, on)

  const text = selection.text
  if (!text) return null

  return (
    <button
      type="button"
      className={`${m.selectionQuote} ${selection.place === 'top' ? m.selectionQuoteTop : ''}`}
      onPointerDown={selection.hold}
      onPointerUp={selection.release}
      onPointerCancel={selection.release}
      onClick={() => {
        onQuote(text)
        selection.take()
      }}
    >
      <span className={m.selectionQuoteGlyph} aria-hidden="true">
        ❝
      </span>
      <span className={m.selectionQuoteText}>{t.chrome.selection.quote}</span>
    </button>
  )
}
