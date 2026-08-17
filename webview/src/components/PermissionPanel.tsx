import { useCallback, useMemo } from 'react'
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
  /**
   * «Always allow» показываем не всегда: часть вопросов правилом не снимается
   * (см. PermItem.rememberable). Кнопки нет — и цифры сдвигаются вместе с ней:
   * номер на кнопке обязан совпадать с тем, что её нажимает.
   */
  const decisions = useMemo(
    () => (item?.rememberable === false ? DECISIONS.filter((decision) => decision.id !== 'always') : DECISIONS),
    [item?.rememberable],
  )
  const pick = useCallback(
    (index: number) => {
      const decision = decisions[index]
      if (itemId && decision) onDecide(itemId, decision.id)
    },
    [decisions, itemId, onDecide],
  )

  // Разрешение держит ход жёстче всего, поэтому цифры принадлежат ему, даже
  // если рядом висит неотвеченный вопрос агента (см. AskPanel).
  useDigitHotkey(decisions.length, pick, { enabled: Boolean(item), composerEmpty })

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

      {/* Кто поднял вопрос — под самим вызовом: в режимах, где вопросов не ждут,
          без этой строки карточка выглядит приставучестью панели. */}
      {item.reason && <div className={s.permReason}>{item.reason}</div>}

      <div className={s.permActions}>
        {decisions.map((decision, index) => (
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
