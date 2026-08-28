import type { PlanItem } from '../../feed/types'
import { Markdown } from './Markdown'
import s from '../feed.module.css'

interface PlanCardProps {
  item: PlanItem
  onApprove: () => void
  onKeepPlanning: () => void
  /**
   * Whether anyone is genuinely waiting for an answer. In a conversation raised from the history a plan's
   * card arrives together with the whole transcript, but there is nothing to decide about it: the turn
   * ended some time in the past. Buttons there would be a deception - a press would reach nobody.
   */
  awaiting: boolean
  /**
   * The agent took the question back before anyone answered it - Stop pressed over the card, or a hook
   * that came to its own decision. Said out loud rather than left as a card with no buttons: silence
   * there reads as "the panel has lost the buttons", and the person goes on waiting for something that
   * has already ended.
   */
  withdrawn?: boolean
  /** A link inside a plan opens outside, as in the agent's answer. */
  onOpenLink: (url: string) => void
}

/**
 * A plan is shown exactly as the agent wrote it: by the same markdown parsing as an ordinary answer (see
 * Markdown). It no longer has a simplified "number + line" layout of its own - that lost section
 * headings, nested items and every bit of markup inside a line.
 */
export const PlanCard = ({
  item,
  onApprove,
  onKeepPlanning,
  awaiting,
  withdrawn,
  onOpenLink,
}: PlanCardProps) => (
  <div className={s.plan}>
    <div className={s.planHead}>
      <span className={s.planLabel}>PLAN READY</span>
      <span className={s.planHint}>{item.meta}</span>
      <div className={s.spacer} />
    </div>

    <div className={s.planBody}>
      <Markdown paragraphs={item.paragraphs} onOpenLink={onOpenLink} />
    </div>

    <div className={s.cardFoot}>
      {awaiting && (
        <>
          <button type="button" className={s.primary} onClick={onApprove}>
            Approve &amp; run
          </button>
          <button type="button" className={s.secondary} onClick={onKeepPlanning}>
            Keep planning
          </button>
        </>
      )}
      {withdrawn && <span className={s.planHint}>The agent stopped waiting for a decision</span>}
      <div className={s.spacer} />
      <span className={s.planHint}>{item.duration}</span>
    </div>
  </div>
)
