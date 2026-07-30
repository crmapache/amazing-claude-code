import { useEffect, useRef, useState, type RefObject } from 'react'
import s from './scrollThumb.module.css'

interface ScrollThumbProps {
  /** Сам скроллящийся элемент — палец только рисует поверх него, не оборачивает. */
  targetRef: RefObject<HTMLElement | null>
}

const MIN_THUMB_PX = 24

/**
 * Палец прокрутки поверх содержимого — как в редакторе самой WebStorm: не
 * занимает ширину и не двигает контент при появлении, просто ложится сверху,
 * и виден постоянно, пока есть что прокручивать (не гаснет через паузу — это
 * тоже поведение нативного редактора, не оверлей-скроллбар macOS/Chrome).
 *
 * `overflow: overlay` для этого не подходит — начиная с Chromium 121 браузер
 * его больше не поддерживает (проверено: JCEF этой версии IDE — Chromium 144),
 * а обычный overflow:auto всегда резервирует под скроллбар ширину. Поэтому
 * нативный скроллбар у целевого элемента спрятан в его собственном CSS
 * (::-webkit-scrollbar { display: none }), а этот компонент рисует свой поверх
 * содержимого — только позиция и размер, без изменения раскладки родителя.
 * Родителю самого targetRef нужен position:relative — иначе плавающий палец
 * позиционируется от куда-то не того.
 */
export const ScrollThumb = ({ targetRef }: ScrollThumbProps) => {
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ startY: number; startScrollTop: number; trackHeight: number } | null>(null)

  const update = () => {
    const el = targetRef.current
    if (!el || el.scrollHeight <= el.clientHeight + 1) {
      setThumb(null)
      return
    }

    const height = Math.max(MIN_THUMB_PX, (el.clientHeight / el.scrollHeight) * el.clientHeight)
    const scrollable = el.scrollHeight - el.clientHeight
    const top = scrollable > 0 ? (el.scrollTop / scrollable) * (el.clientHeight - height) : 0
    setThumb({ top, height })
  }

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    update()
    el.addEventListener('scroll', update)
    // Контент дорастает после отрисовки (диффы разворачиваются, шрифты
    // подгружаются) — без наблюдателя палец остался бы неверного размера.
    const observer = new ResizeObserver(update)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [targetRef])

  // Слушатели на window, а не только на самом пальце: если отпустить мышь за
  // его пределами (или вовсе за пределами окна), drag обязан всё равно
  // закончиться — иначе он залипает и потом дёргает прокрутку от следующего
  // случайного движения мыши.
  useEffect(() => {
    if (!dragging) return

    const onMove = (event: PointerEvent) => {
      const el = targetRef.current
      const drag = dragState.current
      if (!el || !drag || drag.trackHeight <= 0) return

      const scrollable = el.scrollHeight - el.clientHeight
      const deltaY = event.clientY - drag.startY
      el.scrollTop = drag.startScrollTop + (deltaY / drag.trackHeight) * scrollable
    }

    const endDrag = () => {
      dragState.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [dragging, targetRef])

  if (!thumb) return null

  return (
    <div
      className={`${s.thumb} ${dragging ? s.thumbDragging : ''}`}
      style={{ top: thumb.top, height: thumb.height }}
      onPointerDown={(event) => {
        event.preventDefault()
        const el = targetRef.current
        if (!el) return

        dragState.current = {
          startY: event.clientY,
          startScrollTop: el.scrollTop,
          trackHeight: el.clientHeight - thumb.height,
        }
        setDragging(true)
      }}
    />
  )
}
