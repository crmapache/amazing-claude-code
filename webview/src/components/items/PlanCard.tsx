import type { PlanItem } from '../../feed/types'
import s from '../feed.module.css'

interface PlanCardProps {
  item: PlanItem
  approved: boolean
  onApprove: () => void
  onKeepPlanning: () => void
}

export const PlanCard = ({ item, approved, onApprove, onKeepPlanning }: PlanCardProps) => (
  <div className={s.plan}>
    <div className={s.planHead}>
      <span className={s.planLabel}>PLAN READY</span>
      <span className={s.planHint}>{item.meta}</span>
      <div className={s.spacer} />
    </div>

    <div className={s.planSteps}>
      {item.steps.map((step) => (
        <div key={step.n} className={s.planStep}>
          <span className={s.planNum}>{step.n}</span>
          <div className={s.planText}>
            {step.text}
            {step.files ? <span className={s.planFiles}> {step.files}</span> : null}
          </div>
        </div>
      ))}
    </div>

    <div className={s.cardFoot}>
      <button type="button" className={s.primary} onClick={onApprove} disabled={approved}>
        {approved ? '✓ Running plan' : 'Approve & run'}
      </button>
      <button type="button" className={s.secondary} onClick={onKeepPlanning}>
        Keep planning
      </button>
      <div className={s.spacer} />
      <span className={s.planHint}>{item.duration}</span>
    </div>
  </div>
)
