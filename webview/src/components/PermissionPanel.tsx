import { useCallback } from 'react'
import type { PermItem } from '../feed/types'
import { useDigitHotkey } from '../hooks/useDigitHotkey'
import s from './composer.module.css'

type Decision = 'once' | 'always' | 'deny'

/**
 * Порядок тот же, что и на кнопках, — он же и порядок хоткеев: цифра на кнопке
 * обязана совпадать с той, что её нажимает.
 */
const DECISIONS: { id: Decision; label: string; className: (styles: typeof s) => string }[] = [
  { id: 'once', label: 'Allow once', className: (styles) => `${styles.primary} ${styles.primaryWarn}` },
  { id: 'always', label: 'Always allow', className: (styles) => styles.secondary ?? '' },
  { id: 'deny', label: 'Deny', className: (styles) => `${styles.secondary} ${styles.secondaryDanger}` },
]

interface PermissionPanelProps {
  /** Вызов, который сейчас ждёт решения по разрешению — или ничего. */
  item: PermItem | undefined
  /** Пусто ли поле сообщения: от этого зависит, кому достаётся нажатая цифра. */
  composerEmpty: boolean
  onDecide: (itemId: string, decision: Decision) => void
}

/**
 * Закреплённая панель над полем ввода — по образцу TaskListPanel/AskPanel.
 * Решение необратимо: агент получает его сразу и продолжает работу, поэтому
 * панель пропадает сразу после клика, не остаётся висеть неактивной.
 */
export const PermissionPanel = ({ item, composerEmpty, onDecide }: PermissionPanelProps) => {
  const itemId = item?.id
  const pick = useCallback(
    (index: number) => {
      const decision = DECISIONS[index]
      if (itemId && decision) onDecide(itemId, decision.id)
    },
    [itemId, onDecide],
  )

  // Разрешение держит ход жёстче всего, поэтому цифры принадлежат ему, даже
  // если рядом висит неотвеченный вопрос агента (см. AskPanel).
  useDigitHotkey(DECISIONS.length, pick, { enabled: Boolean(item), composerEmpty })

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
        {DECISIONS.map((decision, index) => (
          <button
            key={decision.id}
            type="button"
            className={decision.className(s)}
            onClick={() => onDecide(item.id, decision.id)}
          >
            {/* Цифра прямо на кнопке: хоткей, о котором нигде не сказано, не
                существует — его никто не нажмёт. */}
            <span className={s.actionKey}>{index + 1}</span>
            {decision.label}
          </button>
        ))}
      </div>
    </div>
  )
}
