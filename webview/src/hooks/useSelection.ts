import { useCallback, useEffect, useState, type RefObject } from 'react'

export interface Selection {
  text: string
  x: number
  y: number
}

/** Ниже этого порога выделение считаем случайным кликом и меню не показываем. */
const MIN_LENGTH = 3

/**
 * Метка на настоящем тексте ответа (TextCard) — меню годится только над ним, а
 * не над техническими логами инструментов или интерфейсными подписями вроде
 * заголовков карточек: форкнуть разговор оттуда бессмысленно.
 */
const SELECTABLE_ATTR = 'data-copyable'

/**
 * Следит за выделением внутри ленты и считает, где показать всплывающее меню.
 *
 * Координаты — экранные, от края окна. Считать их внутри прокручиваемой ленты
 * нельзя: к позиции добавляется прокрутка, и меню уезжает вниз тем дальше, чем
 * ниже пролистан разговор.
 */
export const useSelection = (container: RefObject<HTMLElement | null>): [Selection | null, () => void] => {
  const [selection, setSelection] = useState<Selection | null>(null)

  useEffect(() => {
    const onMouseUp = () => {
      const element = container.current
      const active = window.getSelection()

      if (!element || !active || active.isCollapsed) {
        setSelection(null)
        return
      }

      const text = active.toString().trim()
      const range = active.getRangeAt(0)

      if (text.length < MIN_LENGTH || !element.contains(range.commonAncestorContainer)) {
        setSelection(null)
        return
      }

      const anchor =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as Element)
          : range.commonAncestorContainer.parentElement

      if (!anchor?.closest(`[${SELECTABLE_ATTR}]`)) {
        setSelection(null)
        return
      }

      const rect = range.getBoundingClientRect()

      setSelection({
        text,
        x: Math.max(8, Math.min(rect.left + rect.width / 2 - 150, window.innerWidth - 320)),
        // Над выделением, а если места сверху нет — под ним.
        y: rect.top > 46 ? rect.top - 38 : rect.bottom + 8,
      })
    }

    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [container])

  // Не новая функция на каждый рендер: она уезжает в ленту, а там от постоянства
  // ссылок зависит, перерисовывать ли карточки заново (см. Feed).
  const clear = useCallback(() => setSelection(null), [])

  return [selection, clear]
}
