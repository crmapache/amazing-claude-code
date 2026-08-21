import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { edgeLines, type Box } from '../selectionPlacement'

export interface Selection {
  text: string
  /** The selection's first line - see selectionPlacement, the menu is put together out of these. */
  head: Box
  /** The selection's last line. */
  tail: Box
  /** Where the mouse was released. */
  pointer: { x: number; y: number }
  /** The feed's visible part at the moment of the reading. */
  bounds: Box
}

/** Below this threshold a selection counts as an accidental click and no menu is shown. */
const MIN_LENGTH = 3

/**
 * The mark on the real text of an answer (TextCard) - the menu suits only that, not the tools' technical
 * logs or interface captions such as card titles: forking a conversation out of those is meaningless.
 */
const SELECTABLE_ATTR = 'data-copyable'

/** The mark on the menu itself (see SelectionMenu): a press on it must not be taken for a press past it. */
const MENU_ATTR = 'data-selection-menu'

/**
 * Watches the selection inside the feed and gathers everything the menu needs in order to place itself.
 *
 * The coordinates are screen ones, from the window's edge. Computing them inside the scrollable feed is
 * not an option: the scroll is added to the position, and the menu drifts further down the further the
 * conversation has been scrolled. The reading is repeated on every scroll instead, so that the menu keeps
 * to its text rather than hanging where the text used to be.
 */
export const useSelection = (container: RefObject<HTMLElement | null>): [Selection | null, () => void] => {
  const [selection, setSelection] = useState<Selection | null>(null)
  /** A mirror of the state for the listeners: they live outside the render and see no fresh value. */
  const current = useRef<Selection | null>(null)

  const show = useCallback((next: Selection | null) => {
    current.current = next
    setSelection(next)
  }, [])

  useEffect(() => {
    /**
     * Any press whatever takes the menu off at once - past the text, into the empty part of the feed, at
     * the start of a fresh selection. Waiting for the selection to answer for it is not enough: a click on
     * an empty spot unmarks the text without the browser reporting anything, and the menu stayed on for
     * seconds afterwards, until some unrelated event happened to shake the panel.
     *
     * Whatever comes next decides whether a menu appears again: the mouseup below reads the selection anew.
     */
    let pressed = { x: 0, y: 0, text: '' }

    const onMouseDown = (event: MouseEvent) => {
      pressed = { x: event.clientX, y: event.clientY, text: window.getSelection()?.toString().trim() ?? '' }

      if (!current.current) return
      // A press on the menu is its own business - it holds the selection on purpose (see SelectionMenu).
      if ((event.target as Element | null)?.closest?.(`[${MENU_ATTR}]`)) return

      show(null)
    }

    const onMouseUp = (event: MouseEvent) => {
      const next = read(container.current, { x: event.clientX, y: event.clientY })
      const dragged = Math.abs(event.clientX - pressed.x) > 3 || Math.abs(event.clientY - pressed.y) > 3

      /*
       * A press that neither travelled anywhere nor changed what is marked is a click past the text, not a
       * gesture of selecting it. The browser inside the IDE leaves the old mark in place for a click on an
       * empty spot below the conversation, and without this the menu, just taken off by the press, would
       * spring straight back on. A double click passes: it does change what is marked.
       */
      if (next && !dragged && next.text === pressed.text) {
        show(null)
        return
      }

      show(next)
    }

    let frame = 0
    /**
     * The feed scrolls by itself while an answer is being typed, and the panel is resized by dragging the
     * IDE's edge. The menu is re-placed from the same selection; once the selection has left the visible
     * part of the feed the reading returns nothing and the menu goes away with it.
     */
    const onMove = () => {
      if (!current.current || frame) return

      frame = requestAnimationFrame(() => {
        frame = 0
        const shown = current.current
        if (shown) show(read(container.current, shown.pointer))
      })
    }

    /**
     * The selection itself is watched as well, and not only the mouse: a click into the IDE's editor or
     * into a tool window takes the mark off the text without the panel ever seeing a mouseup, and the menu
     * used to hang over the text it no longer belonged to. Only hides, never shows: while the text is
     * being dragged over, the menu has to keep out of the way until the button is released.
     */
    const onSelect = () => {
      const shown = current.current
      if (!shown) return

      const next = read(container.current, shown.pointer)
      if (!next || next.text !== shown.text) show(null)
    }

    // The panel has been left for another window of the IDE: whatever is selected here is no longer what
    // the person is busy with.
    const onBlur = () => show(null)

    // Capture: a press is heard even where the panel's own handlers stop it from travelling further.
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('selectionchange', onSelect)
    // Capture: the scroll happens inside the feed, and such an event does not travel up to the document.
    document.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('blur', onBlur)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('selectionchange', onSelect)
      document.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('blur', onBlur)
    }
  }, [container, show])

  // Not a new function on every render: it travels into the feed, and there whether the cards are
  // redrawn afresh depends on the stability of the references (see Feed).
  const clear = useCallback(() => show(null), [show])

  return [selection, clear]
}

/** The current selection as the menu sees it, or nothing at all when there is nothing to show a menu for. */
const read = (container: HTMLElement | null, pointer: { x: number; y: number }): Selection | null => {
  const active = window.getSelection()

  if (!container || !active || active.isCollapsed || active.rangeCount === 0) return null

  const text = active.toString().trim()
  const range = active.getRangeAt(0)

  if (text.length < MIN_LENGTH || !container.contains(range.commonAncestorContainer)) return null

  const anchor =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement

  if (!anchor?.closest(`[${SELECTABLE_ATTR}]`)) return null

  const lines = edgeLines(Array.from(range.getClientRects()))
  if (!lines) return null

  const bounds = container.getBoundingClientRect()
  // Scrolled clean out of the feed's visible part: there is no longer any text to hang the menu on.
  if (lines.tail.bottom < bounds.top || lines.head.top > bounds.bottom) return null

  return { text, head: lines.head, tail: lines.tail, pointer, bounds }
}
