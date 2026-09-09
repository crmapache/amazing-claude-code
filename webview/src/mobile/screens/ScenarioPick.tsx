import { Sheet } from './Sheet'
import m from '../mobile.module.css'

/**
 * One of these, please: the phone's answer to the panel's little menus.
 *
 * A sheet rather than a `<select>`, which the browser draws in its own system panel - a full screen of
 * somebody else's app in the middle of this one. The same reason the desk has its own Picker.
 */
export const PickSheet = ({
  title,
  value,
  options,
  onPick,
  onClose,
}: {
  title: string
  value: string
  /** A row that cannot be chosen is still shown, greyed and with its reason under it - see the callers. */
  options: { id: string; label: string; hint?: string; disabled?: boolean }[]
  onPick: (id: string) => void
  onClose: () => void
}) => (
  <Sheet title={title} height="70%" onClose={onClose}>
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        className={`${m.sheetAction} ${option.id === value ? m.sheetActionOn : ''} ${option.disabled ? m.sheetActionOff : ''}`}
        disabled={option.disabled}
        onClick={() => onPick(option.id)}
      >
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{option.label}</span>
          {option.hint ? <span className={m.sheetActionHint}>{option.hint}</span> : null}
        </span>
        {option.id === value ? <span className={m.sheetActionTick}>✓</span> : null}
      </button>
    ))}
  </Sheet>
)
