import type { TaskItem } from '../../feed/types'
import s from '../feed.module.css'

interface TaskCardProps {
  item: TaskItem
  open: boolean
  /** Агент ещё даже не начал: стоит и ждёт, разрешишь ли ты этот вызов. */
  awaitingPermission: boolean
  onToggle: () => void
}

export const TaskCard = ({ item, open, awaitingPermission, onToggle }: TaskCardProps) => (
  <div className={s.task}>
    <button type="button" className={s.taskHead} onClick={onToggle}>
      <span className={`${s.taskCaret} ${open ? s.caretOpen : ''}`}>▶</span>
      <span className={s.taskChip}>TASK</span>
      <span className={s.taskTarget}>{item.target}</span>
      <span className={s.taskMeta}>{item.meta}</span>
      <div className={s.spacer} />
      <span
        className={`${s.taskDur} ${item.pending ? (awaitingPermission ? s.waiting : s.running) : ''}`}
      >
        {item.pending ? (awaitingPermission ? 'waiting for you' : item.duration || 'running') : item.duration}
      </span>
    </button>

    {open ? (
      <div className={s.taskBody}>
        {item.detail.map((line, index) => (
          <div key={index} className={s.detail}>
            {line.text}
          </div>
        ))}

        <div className={s.barRow}>
          <div className={s.bar}>
            <div className={s.barFill} style={{ width: `${item.percent}%` }} />
          </div>
          <span className={s.barLabel}>
            {item.pending ? `${item.percent}%` : '100% · returned'}
          </span>
        </div>
      </div>
    ) : null}
  </div>
)
