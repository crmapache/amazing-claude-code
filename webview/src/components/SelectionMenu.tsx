import type { Selection } from '../hooks/useSelection'
import s from './shell.module.css'

interface SelectionMenuProps {
  selection: Selection
  onFork: () => void
  onQuote: () => void
  onCopy: () => void
}

/**
 * Всплывает прямо над выделенным куском ответа. Действий три: увести разговор в
 * сторону, забрать текст себе цитатой в поле ввода, или просто скопировать.
 */
export const SelectionMenu = ({ selection, onFork, onQuote, onCopy }: SelectionMenuProps) => (
  <div className={s.selection} style={{ left: selection.x, top: selection.y }}>
    <button
      type="button"
      className={`${s.selectionButton} ${s.selectionBranch}`}
      onMouseDown={guard(onFork)}
    >
      Fork from here
    </button>
    <div className={s.selectionDivider} />
    <button type="button" className={s.selectionButton} onMouseDown={guard(onQuote)}>
      Quote
    </button>
    <div className={s.selectionDivider} />
    <button type="button" className={s.selectionButton} onMouseDown={guard(onCopy)}>
      Copy
    </button>
  </div>
)

/** Нажатие обрабатываем до потери выделения, поэтому вешаемся на mousedown. */
const guard = (action: () => void) => (event: React.MouseEvent) => {
  event.preventDefault()
  action()
}
