import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import s from './contextMenu.module.css'

export interface ContextMenuItem {
  id: string
  label: string
  onSelect: () => void
}

const EDGE_MARGIN = 6

/**
 * Lightweight right-click menu positioned at the pointer and clamped to the viewport.
 * Closes on outside pointer down, Escape, window blur, or scroll.
 */
export const ContextMenu = ({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN)
    const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN)
    setPos({
      left: Math.min(Math.max(EDGE_MARGIN, x), maxLeft),
      top: Math.min(Math.max(EDGE_MARGIN, y), maxTop),
    })
  }, [x, y])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    const onDismiss = () => onClose()

    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onDismiss)
    window.addEventListener('scroll', onDismiss, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onDismiss)
      window.removeEventListener('scroll', onDismiss, true)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      className={s.menu}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={s.item}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
            item.onSelect()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
