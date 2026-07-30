import { useState } from 'react'
import s from './composer.module.css'

export interface QueuedPrompt {
  id: string
  text: string
  attach: string
  /** Картинки из буфера обмена, которые уйдут вместе с текстом при отправке. */
  images: { mediaType: string; data: string }[]
}

interface QueueProps {
  items: QueuedPrompt[]
  onReorder: (from: number, to: number) => void
  onSendNow: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
}

export const Queue = ({ items, onReorder, onSendNow, onRemove, onClear }: QueueProps) => {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  if (items.length === 0) return null

  return (
    <div className={s.queue}>
      <div className={s.queueHead}>
        <span className={s.queueLabel}>QUEUED</span>
        <span className={s.queueHint}>
          {items.length} will fire in order when the run finishes · drag to reorder
        </span>
        <div className={s.spacer} />
        <button type="button" className={s.queueClear} onClick={onClear}>
          clear all
        </button>
      </div>

      {items.map((item, index) => (
        <div
          key={item.id}
          draggable
          className={`${s.queueRow} ${dragOver === index ? s.queueRowOver : ''} ${
            dragFrom === index ? s.queueRowDragging : ''
          }`}
          onDragStart={() => setDragFrom(index)}
          onDragOver={(event) => {
            event.preventDefault()
            if (dragOver !== index) setDragOver(index)
          }}
          onDrop={(event) => {
            event.preventDefault()
            if (dragFrom !== null && dragFrom !== index) onReorder(dragFrom, index)
            setDragFrom(null)
            setDragOver(null)
          }}
          onDragEnd={() => {
            setDragFrom(null)
            setDragOver(null)
          }}
        >
          <span className={s.grip}>⠿</span>
          <span className={s.queueNum}>{index + 1}</span>
          <span className={s.queueText}>{item.text}</span>
          {item.attach ? <span className={s.queueAttach}>{item.attach}</span> : null}
          <button type="button" className={s.queueSend} onClick={() => onSendNow(item.id)}>
            send next
          </button>
          <button type="button" className={s.iconButton} onClick={() => onRemove(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
