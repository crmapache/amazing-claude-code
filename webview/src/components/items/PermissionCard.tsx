import type { PermItem } from '../../feed/types'
import s from '../feed.module.css'

interface PermissionCardProps {
  item: PermItem
  decision: PermItem['decision']
  onDecide: (decision: NonNullable<PermItem['decision']>) => void
}

const DECISION_LABEL: Record<NonNullable<PermItem['decision']>, string> = {
  once: 'ALLOWED ONCE',
  always: 'ALLOWED · RULE ADDED',
  deny: 'DENIED',
}

const DECISION_NOTE: Record<NonNullable<PermItem['decision']>, string> = {
  once: 'ran once, still asks next time.',
  always: 'rule added to the project settings.',
  deny: 'Claude was told to stop and explain instead.',
}

/** Решение необратимо: агент получает его сразу и продолжает работу. */
export const PermissionCard = ({ item, decision, onDecide }: PermissionCardProps) => (
  <div className={s.perm}>
    <div className={s.permHead}>
      <span className={s.permLabel}>PERMISSION</span>
      <span className={s.permTarget}>{item.target}</span>
      <div className={s.spacer} />
      <span className={s.planHint}>{item.meta}</span>
    </div>

    <div className={s.permCmd}>{item.command}</div>

    {decision ? (
      <div className={s.permActions}>
        <span
          className={`${s.permDecision} ${decision === 'deny' ? s.permDecisionBad : s.permDecisionOk}`}
        >
          {DECISION_LABEL[decision]}
        </span>
        <span className={s.compactText}>{DECISION_NOTE[decision]}</span>
        <div className={s.spacer} />
      </div>
    ) : (
      <div className={s.permActions}>
        <button type="button" className={`${s.primary} ${s.primaryWarn}`} onClick={() => onDecide('once')}>
          Allow once
        </button>
        <button type="button" className={s.secondary} onClick={() => onDecide('always')}>
          Always allow
        </button>
        <button
          type="button"
          className={`${s.secondary} ${s.secondaryDanger}`}
          onClick={() => onDecide('deny')}
        >
          Deny
        </button>
      </div>
    )}
  </div>
)
