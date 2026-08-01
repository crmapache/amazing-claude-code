import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { UserToken } from '../feed/types'
import s from './composer.module.css'

export interface QueuedPrompt {
  id: string
  text: string
  attach: string
  /**
   * Само содержимое поля, каким его набрали. Текст выше — уже готовая строка для
   * агента, а вложения из неё не восстановить: по ним панель считает, сколько
   * картинок ушло в этой сессии, и без них нумерация следующих начиналась бы
   * заново, стоило сообщению уйти через очередь.
   */
  tokens: UserToken[]
  /** Картинки из буфера обмена, которые уйдут вместе с текстом при отправке. */
  images: { mediaType: string; data: string }[]
}

interface QueueProps {
  items: QueuedPrompt[]
  onReorder: (from: number, to: number) => void
  onRemove: (id: string) => void
}

export const Queue = ({ items, onReorder, onRemove }: QueueProps) => {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  /** Тот же индекс, что и dragOver, но без задержки на ре-рендер — onPointerUp читает его сразу. */
  const overIndexRef = useRef<number | null>(null)

  if (items.length === 0) return null

  /**
   * Ручка тащит по pointer-событиям, а не нативным HTML5 DnD: внутри JCEF
   * (встроенный в IDE браузер) dragstart/dragover молча не приходят — само
   * перетаскивание там не работало вообще. Pointer-события — это обычные
   * мышиные события, они одинаково доступны и в обычном браузере, и в JCEF.
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
          <span className={s.queueText}>{item.text}</span>
          {item.attach ? <span className={s.queueAttach}>{item.attach}</span> : null}
          <button type="button" className={s.iconButton} onClick={() => onRemove(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
