import type { HistoryEntry } from '../protocol'
import s from './shell.module.css'

interface HistoryProps {
  /** null — список ещё не приходил: он читается с диска сам, до открытия модалки. */
  conversations: HistoryEntry[] | null
  onOpen: (entry: HistoryEntry) => void
  onClose: () => void
}

/**
 * Прошлые разговоры проекта. Список ведёт сам Claude Code, поэтому здесь видно и
 * то, что начиналось в терминале, — панель ничего своего не хранит.
 */
export const History = ({ conversations, onOpen, onClose }: HistoryProps) => (
  <>
    <div className={s.menuScrim} onClick={onClose} />
    <div className={s.history}>
      <div className={s.historyHead}>
        <span className={s.historyLabel}>HISTORY</span>
        <span className={s.historyHint}>conversations in this project</span>
      </div>

      <div className={s.historyBody}>
        {conversations === null ? <div className={s.historyEmpty}>Loading…</div> : null}

        {conversations?.length === 0 ? (
          <div className={s.historyEmpty}>No past conversations here yet.</div>
        ) : null}

        {conversations?.map((entry) => (
          <button key={entry.id} type="button" className={s.historyItem} onClick={() => onOpen(entry)}>
            <span className={s.historyTitle}>{entry.title}</span>
            <span className={s.historyMeta}>
              {when(entry.updatedAt)} · {entry.messages} {entry.messages === 1 ? 'message' : 'messages'} · {entry.id}
            </span>
          </button>
        ))}
      </div>
    </div>
  </>
)

/** Свежие разговоры называем по времени, старые — по дате: так их проще узнать. */
const when = (updatedAt: number): string => {
  const date = new Date(updatedAt)
  const sameDay = new Date().toDateString() === date.toDateString()

  return sameDay
    ? `today ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
