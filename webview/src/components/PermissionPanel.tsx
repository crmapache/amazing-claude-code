import { useCallback, useMemo } from 'react'
import type { PermItem } from '../feed/types'
import { useDigitHotkey } from '../hooks/useDigitHotkey'
import s from './composer.module.css'

type Decision = 'once' | 'always' | 'deny'

/**
 * The order is the same as on the buttons - and so is the hotkey order: the digit on a button has to
 * match the one that presses it.
 */
const DECISIONS: { id: Decision; label: string; className: (styles: typeof s) => string }[] = [
  { id: 'once', label: 'Allow once', className: (styles) => `${styles.primary} ${styles.primaryWarn}` },
  { id: 'always', label: 'Always allow', className: (styles) => styles.secondary ?? '' },
  { id: 'deny', label: 'Deny', className: (styles) => `${styles.secondary} ${styles.secondaryDanger}` },
]

interface PermissionPanelProps {
  /** The call currently waiting for a permission decision - or nothing. */
  item: PermItem | undefined
  /** Whether the message field is empty: who gets a pressed digit depends on it. */
  composerEmpty: boolean
  onDecide: (itemId: string, decision: Decision) => void
}

/**
 * A pinned panel above the input field - after the pattern of TaskListPanel/AskPanel. The decision is
 * irreversible: the agent gets it at once and carries on working, so the panel disappears right after
 * the click rather than hanging there inactive.
 */
export const PermissionPanel = ({ item, composerEmpty, onDecide }: PermissionPanelProps) => {
  const itemId = item?.id
  /**
   * "Always allow" is not always shown: some questions are not waived by a rule (see
   * PermItem.rememberable). With the button gone the digits shift along with it: the number on a button
   * has to match the one that presses it.
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

  // A permission holds the turn most firmly of all, so the digits belong to it even when an unanswered
  // question from the agent hangs beside it (see AskPanel).
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

      {/* Who raised the question goes under the call itself: in the modes where no questions are
          expected, without this line the card looks like nagging from the panel. */}
      {item.reason && <div className={s.permReason}>{item.reason}</div>}

      <div className={s.permActions}>
        {decisions.map((decision, index) => (
          <button
            key={decision.id}
            type="button"
            className={decision.className(s)}
            onClick={() => onDecide(item.id, decision.id)}
          >
            {/* The digit sits right on the button: a hotkey nobody is told about does not exist -
                nobody will press it. */}
            <span className={s.actionKey}>{index + 1}</span>
            {decision.label}
          </button>
        ))}
      </div>
    </div>
  )
}
