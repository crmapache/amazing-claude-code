import type { PermItem } from '../feed/types'
import s from './composer.module.css'

interface PermissionPanelProps {
  /** Вызов, который сейчас ждёт решения по разрешению — или ничего. */
  item: PermItem | undefined
  onDecide: (itemId: string, decision: 'once' | 'always' | 'deny') => void
}

/**
 * Закреплённая панель над полем ввода — по образцу TaskListPanel/AskPanel.
 * Решение необратимо: агент получает его сразу и продолжает работу, поэтому
 * панель пропадает сразу после клика, не остаётся висеть неактивной.
 */
export const PermissionPanel = ({ item, onDecide }: PermissionPanelProps) => {
  if (!item) return null

  return (
    <div className={s.perm}>
      <div className={s.permHead}>
        <span className={s.permLabel}>PERMISSION</span>
        <span className={s.permTarget}>{item.target}</span>
        <div className={s.spacer} />
        <span className={s.askMeta}>{item.meta}</span>
      </div>

      <div className={s.permCmd}>{item.command}</div>

      <div className={s.permActions}>
        <button
          type="button"
          className={`${s.primary} ${s.primaryWarn}`}
          onClick={() => onDecide(item.id, 'once')}
        >
          Allow once
        </button>
        <button type="button" className={s.secondary} onClick={() => onDecide(item.id, 'always')}>
          Always allow
        </button>
        <button
          type="button"
          className={`${s.secondary} ${s.secondaryDanger}`}
          onClick={() => onDecide(item.id, 'deny')}
        >
          Deny
        </button>
      </div>
    </div>
  )
}
