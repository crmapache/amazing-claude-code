import type { TaskItem } from '../feed/types'
import s from './feed.module.css'

interface AgentStreamViewProps {
  /** Агент, открытый сейчас в дропдауне — или ничего, пока вкладка не выбрана. */
  item: TaskItem | undefined
}

/**
 * Область вывода, когда в дропдауне открыт конкретный агент, а не main — тот
 * же визуальный язык, что раньше был у карточки задачи в общей ленте, но как
 * самостоятельный экран: шапка с прогрессом и весь накопленный лог агента, а
 * не последние несколько строк.
 */
export const AgentStreamView = ({ item }: AgentStreamViewProps) => {
  if (!item) return null

  return (
    <div className={s.agentView}>
      <div className={s.agentViewHead}>
        <span className={s.taskChip}>TASK</span>
        <span className={s.taskTarget}>{item.target}</span>
        <span className={s.taskMeta}>{item.meta}</span>
        <div className={s.spacer} />
        <span className={`${s.taskDur} ${item.pending ? s.running : ''}`}>
          {item.pending ? item.duration || 'running' : item.duration}
        </span>
      </div>

      <div className={s.agentViewBody}>
        {item.log.map((line, index) => (
          <div
            key={index}
            className={`${s.detail} ${line.tone === 'ok' ? s.detailOk : ''} ${line.tone === 'bad' ? s.detailBad : ''}`}
          >
            {line.text}
          </div>
        ))}

        <div className={s.barRow}>
          <div className={s.bar}>
            <div className={s.barFill} style={{ width: `${item.percent}%` }} />
          </div>
          <span className={s.barLabel}>{item.pending ? `${item.percent}%` : '100% · returned'}</span>
        </div>
      </div>
    </div>
  )
}
