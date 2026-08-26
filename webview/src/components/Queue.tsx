import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { withoutShellText } from '../feed/bash'
import type { QueuedMessage } from '../protocol'
import s from './composer.module.css'

interface QueueProps {
  /**
   * The list as the IDE holds it - see QueuedMessage. What the message was typed with and the bytes of
   * anything attached to it stay there: this is a row, and a row needs the text, the count beside it, and
   * a name to take it back out by.
   */
  items: QueuedMessage[]
  onReorder: (from: number, to: number) => void
  onRemove: (id: string) => void
}

export const Queue = ({ items, onReorder, onRemove }: QueueProps) => {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  /** The same index as dragOver, but without waiting for a re-render - onPointerUp reads it at once. */
  const overIndexRef = useRef<number | null>(null)

  if (items.length === 0) return null

  /**
   * The handle drags by pointer events rather than native HTML5 DnD: inside JCEF (the IDE's embedded
   * browser) dragstart/dragover silently never arrive - dragging simply did not work there at all.
   * Pointer events are ordinary mouse events, equally available in a plain browser and in JCEF.
   */
  const startDrag = (from: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    overIndexRef.current = from
    setDragFrom(from)
    setDragOver(from)

    const handleMove = (moveEvent: PointerEvent) => {
      const index = rowRefs.current.findIndex((row) => {
        if (!row) return false
        const rect = row.getBoundingClientRect()
        return moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom
      })
      if (index === -1 || index === overIndexRef.current) return
      overIndexRef.current = index
      setDragOver(index)
    }

    const stopDrag = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stopDrag)
      if (overIndexRef.current !== null && overIndexRef.current !== from) onReorder(from, overIndexRef.current)
      overIndexRef.current = null
      setDragFrom(null)
      setDragOver(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stopDrag)
  }

  return (
    <div className={s.queue}>
      <div className={s.queueHead}>
        <span className={s.queueLabel}>QUEUED</span>
        <span className={s.queueHint}>
          {items.length} will fire in order when the run finishes · drag to reorder
        </span>
        <div className={s.spacer} />
      </div>

      {items.map((item, index) => (
        <div
          key={item.id}
          ref={(row) => {
            rowRefs.current[index] = row
          }}
          className={`${s.queueRow} ${dragOver === index ? s.queueRowOver : ''} ${
            dragFrom === index ? s.queueRowDragging : ''
          }`}
        >
          <span className={s.grip} onPointerDown={startDrag(index)}>
            ⠿
          </span>
          <span className={s.queueNum}>{index + 1}</span>
          <span className={s.queueText}>{withoutShellText(item.text)}</span>
          {item.attach ? <span className={s.queueAttach}>{item.attach}</span> : null}
          <button type="button" className={s.iconButton} onClick={() => onRemove(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
