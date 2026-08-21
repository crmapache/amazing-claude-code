import type { HistoryEntry } from '../protocol'
import s from './shell.module.css'

interface HistoryProps {
  /** null means the list has not arrived yet: it is read from disk by itself, before the modal opens. */
  conversations: HistoryEntry[] | null
  onOpen: (entry: HistoryEntry) => void
  onClose: () => void
}

/**
 * The project's past conversations. Claude Code keeps the list itself, so what was started in a terminal
 * is visible here too - the panel stores nothing of its own.
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

/** Recent conversations are labelled by time, older ones by date: that makes them easier to recognise. */
const when = (updatedAt: number): string => {
  const date = new Date(updatedAt)
  const sameDay = new Date().toDateString() === date.toDateString()

  return sameDay
    ? `today ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
