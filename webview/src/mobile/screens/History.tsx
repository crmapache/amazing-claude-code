import { describeWhen } from '../../feed/when'
import type { HistoryEntry } from '../../protocol'
import type { ProjectEntry } from './Sessions'
import { Back } from './Back'
import m from '../mobile.module.css'

interface HistoryProps {
  project: ProjectEntry
  /** null means the list has not arrived yet - it is read off that machine's disk when asked for. */
  conversations: HistoryEntry[] | null
  onOpen: (entry: HistoryEntry) => void
  onBack: () => void
}

/**
 * A project's past conversations, on a phone.
 *
 * The same list the panel shows, and for the same reason it exists there: Claude Code keeps it itself,
 * so a conversation started in a terminal is here too. What differs is what opening one does. The panel
 * replaces the tab in front of it, which is right at a desk - the person can see which tab that is.
 * From a phone it opens a tab of its own, because from here there is no telling whether somebody is in
 * the middle of using the one on screen.
 */
export const History = ({ project, conversations, onOpen, onBack }: HistoryProps) => (
  <>
    <header className={m.header}>
      <Back onClick={onBack} />
      <span className={m.headerTitle}>History</span>
      <span className={m.headerMeta}>{project.name}</span>
    </header>

    <div className={m.list}>
      {conversations === null && <p className={m.empty}>Loading…</p>}

      {conversations?.length === 0 && <p className={m.empty}>No past conversations in this project yet.</p>}

      {conversations && conversations.length > 0 && (
        <div className={m.project}>
          <div className={m.chats}>
            {conversations.map((entry) => (
              <button key={entry.id} type="button" className={m.past} onClick={() => onOpen(entry)}>
                <span className={m.pastTitle}>{entry.title}</span>
                <span className={m.pastMeta}>
                  {describeWhen(entry.updatedAt)} · {entry.messages} {entry.messages === 1 ? 'message' : 'messages'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  </>
)
