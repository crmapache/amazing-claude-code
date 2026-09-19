import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { toolsDropped, type ToolsMeasure, type WritingTool } from '../composerFit'

/**
 * The marks the row's parts carry for the measurement, set in Composer. Attributes rather than classes: the
 * classes belong to the stylesheet, and what is measured should not move when a rule is renamed.
 *
 * - `square` - the paperclip, the one square that never leaves, measured for the width of all of them;
 * - `group` / `groups` - a group of squares and the block of groups, measured for their gaps;
 * - `spacer` - the stretch between the squares and the sending buttons, which absorbs what is to spare;
 * - `clip` - the part of a caption a sending button gives up when it narrows (see firstLetter).
 */
const FIT = 'data-fit'

export const fitMark = (part: 'square' | 'group' | 'groups' | 'spacer' | 'clip') => ({ [FIT]: part })

const part = (row: HTMLElement, name: string) => row.querySelector<HTMLElement>(`[${FIT}='${name}']`)

const gapOf = (element: HTMLElement | null) => (element ? parseFloat(getComputedStyle(element).columnGap) || 0 : 0)

/**
 * The row as it stands now, reduced to what toolsDropped needs - or null while it is not built yet.
 *
 * How short the row is gets added up from three places, and only one of them is ever non-zero for long:
 * what the spacer holds beyond its own minimum (room to spare), what the sending buttons have given up of
 * their captions (room already borrowed), and what sticks out past the row's far edge when even that was
 * not enough.
 */
const measureRow = (row: HTMLElement): ToolsMeasure | null => {
  const square = part(row, 'square')
  const spacer = part(row, 'spacer')
  const last = row.lastElementChild
  if (!square || !spacer || !last) return null

  const style = getComputedStyle(row)
  const edge = row.getBoundingClientRect().right - (parseFloat(style.paddingRight) || 0)
  const spare = spacer.getBoundingClientRect().width - (parseFloat(getComputedStyle(spacer).minWidth) || 0)
  const overflow = Math.max(0, last.getBoundingClientRect().right - edge)

  let given = 0
  row.querySelectorAll<HTMLElement>(`[${FIT}='clip']`).forEach((clip) => {
    given += Math.max(0, clip.scrollWidth - clip.clientWidth)
  })

  return {
    short: given + overflow - spare,
    square: square.getBoundingClientRect().width,
    inner: gapOf(part(row, 'group')),
    outer: gapOf(part(row, 'groups')),
  }
}

/**
 * How many of `droppable` the field's bottom row leaves out to fit the panel (see toolsDropped).
 *
 * `present` - the squares this panel has at all; `droppable` - the ones that may leave, in the order they
 * go (see droppableTools); `content` - anything else that changes what stands in the row (Stop appearing
 * for a turn, Queue leaving for a shell command, the language the captions are in), so the row is looked at
 * again when it changes rather than only when the panel is resized. `active` is false for the layouts whose
 * row never runs short (compact and the side rails stand in a column sized by their contents), and then
 * nothing is measured and nothing is left out.
 *
 * Measured before the paint, like the selectors (see useSelectorsFit): an answer that waited for the next
 * frame would show one frame of Send cut off by the panel's edge on every step of a drag.
 */
export const useToolsFit = (
  row: RefObject<HTMLElement | null>,
  present: ReadonlySet<WritingTool>,
  droppable: readonly WritingTool[],
  active: boolean,
  content: string,
): number => {
  const [dropped, setDropped] = useState(0)
  const current = useRef({ dropped, present, droppable })
  current.current = { dropped, present, droppable }

  const next = useCallback((): number | null => {
    const element = row.current
    const measure = element ? measureRow(element) : null
    if (!measure) return null

    const now = current.current
    return toolsDropped(now.present, now.droppable, now.dropped, measure)
  }, [row])

  // What stands in the row has changed - including the squares just left out or brought back, which is
  // how a step that was not enough is followed by the next one.
  useLayoutEffect(() => {
    if (!active) return
    const answer = next()
    if (answer !== null && answer !== dropped) setDropped(answer)
  }, [active, content, dropped, next])

  // The row has changed size, or something inside it has. The spacer and the clipped captions are
  // watched along with the row: they are what moves when a neighbour grows or shrinks.
  useLayoutEffect(() => {
    const element = row.current
    if (!active || !element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      const answer = next()
      if (answer !== null && answer !== current.current.dropped) flushSync(() => setDropped(answer))
    })
    observer.observe(element)
    element
      .querySelectorAll<HTMLElement>(`[${FIT}='spacer'], [${FIT}='clip']`)
      .forEach((node) => observer.observe(node))

    return () => observer.disconnect()
  }, [active, content, next, row])

  return active ? dropped : 0
}
