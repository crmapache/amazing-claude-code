import type { PlanItem } from '../../feed/types'
import { Markdown } from './Markdown'
import s from '../feed.module.css'

interface PlanCardProps {
  item: PlanItem
  onApprove: () => void
  onKeepPlanning: () => void
  /**
   * Ждёт ли кто-то ответа на самом деле. У разговора, поднятого из истории,
   * карточка плана приезжает вместе со всей перепиской, но решать по ней нечего:
   * ход кончился когда-то в прошлом. Кнопки там были бы обманом — нажатие не
   * дошло бы ни до кого.
   */
  awaiting: boolean
  /** Ссылка внутри плана открывается снаружи, как и в ответе агента. */
  onOpenLink: (url: string) => void
}

/**
 * План показывается ровно так, как агент его написал: тем же разбором markdown,
 * что и обычный ответ (см. Markdown). Своей упрощённой раскладки «номер +
 * строка» у него больше нет — она теряла заголовки разделов, вложенные пункты и
 * всю разметку внутри строки.
 */
export const PlanCard = ({ item, onApprove, onKeepPlanning, awaiting, onOpenLink }: PlanCardProps) => (
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
      <div className={s.spacer} />
      <span className={s.planHint}>{item.duration}</span>
    </div>
  </div>
)
