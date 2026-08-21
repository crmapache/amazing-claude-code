import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Selection } from '../hooks/useSelection'
import { placeSelectionMenu, type Placement } from '../selectionPlacement'
import s from './shell.module.css'

interface SelectionMenuProps {
  selection: Selection
  onFork: () => void
  onQuote: () => void
}

/**
 * Pops up beside the selected piece of an answer - above it, or below when the top has no room. There are
 * two actions: take the conversation off to the side, or take the text into the input field as a quote -
 * copying a selection the browser already gives through the ordinary Ctrl+C, and a separate button for it
 * is not needed here.
 */
export const SelectionMenu = ({ selection, onFork, onQuote }: SelectionMenuProps) => {
  const menu = useRef<HTMLDivElement | null>(null)
  const [spot, setSpot] = useState<Placement | null>(null)

  /**
   * The size is measured rather than assumed: the width comes out of the buttons' text in the font the IDE
   * hands the panel, and a wrong guess is exactly what puts the menu on top of the selected line. In a
   * layout effect, before the paint, so that the menu is never seen at the previous place.
   */
  useLayoutEffect(() => {
    const element = menu.current
    if (!element) return

    const { width, height } = element.getBoundingClientRect()

    setSpot(
      placeSelectionMenu({
        head: selection.head,
        tail: selection.tail,
        pointer: selection.pointer,
        bounds: selection.bounds,
        menu: { width, height },
      }),
    )
  }, [selection])

  /*
   * Into the body rather than in place, next to the feed. The coordinates are the screen's, and a fixed
   * element counts them from the window only while no ancestor of it has a transform - and .content has
   * one, translateZ(0), to make JCEF repaint properly (see shell.module.css). Inside that the whole menu
   * slid down by the header's height, right onto the very line it had been placed above.
   */
  return createPortal(
    <div
      ref={menu}
      className={s.selection}
      data-selection-menu
      // Until it has been measured the menu is out of sight rather than at the corner: the first frame is
      // needed only for its size.
      style={spot ? { left: spot.x, top: spot.y } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      <button type="button" className={s.selectionButton} onMouseDown={guard(onQuote)}>
        Quote
      </button>
      <div className={s.selectionDivider} />
      <button
        type="button"
        className={`${s.selectionButton} ${s.selectionBranch}`}
        onMouseDown={guard(onFork)}
      >
        Fork from here
      </button>
    </div>,
    document.body,
  )
}

/** The press is handled before the selection is lost, which is why we hook onto mousedown. */
const guard = (action: () => void) => (event: React.MouseEvent) => {
  event.preventDefault()
  action()
}
