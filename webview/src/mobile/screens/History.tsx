import { describeWhen } from '../../feed/when'
import type { HistoryEntry } from '../../protocol'
import type { ProjectEntry } from '../projects'
import { Back } from './Back'
import { Magnifier } from '../../components/SearchCapsule'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

interface HistoryProps {
  project: ProjectEntry
  /** null means the list has not arrived yet - it is read off that machine's disk when asked for. */
  conversations: HistoryEntry[] | null
  /**
   * The IDE is opening the project this conversation is in - only ever true for a closed one, and it
   * takes seconds rather than milliseconds. Said out loud for the same reason the screen that starts a
   * conversation in a closed project says it: a tap that visibly does nothing is a tap made again.
   */
  busy: boolean
  error: string
  onOpen: (entry: HistoryEntry) => void
  onBack: () => void
  /**
   * The search over this project's conversations - the same window as over a thread, minus "this chat".
   * Absent for a closed project: what searches them lives in that project's hub, and a closed one has
   * none (see SearchDesk).
   */
  onSearch?: () => void
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
export const History = ({ project, conversations, busy, error, onOpen, onBack, onSearch }: HistoryProps) => {
  const t = useT()

  return (
  <>
    <header className={m.threadHeader}>
      <div className={m.threadHeadRow}>
        <Back onClick={onBack} />
        <span className={m.threadTitles}>
          <span className={m.threadTitle}>{t.mobile.history.title}</span>
          <span className={m.threadWhere}>{project.name}</span>
        </span>
        {onSearch && (
          <button type="button" className={m.headerIcon} onClick={onSearch} aria-label={t.search.title}>
            <Magnifier size={18} />
          </button>
        )}
      </div>
    </header>

    <div className={m.list}>
      {conversations === null && <p className={m.empty}>{t.common.loading}</p>}

      {conversations?.length === 0 && <p className={m.empty}>{t.mobile.history.empty}</p>}

      {/* Over the list rather than under it: what it is about is the row just pressed, and a line at the
          foot of forty conversations is a line nobody sees. */}
      {busy && <p className={m.historyOpening}>{t.mobile.newSession.opening}</p>}

      {error && <p className={m.startError}>{error}</p>}

      {conversations && conversations.length > 0 && (
        <div className={m.project}>
          <div className={m.chats}>
            {conversations.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={m.past}
                disabled={busy}
                onClick={() => onOpen(entry)}
              >
                <span className={m.pastTitle}>{entry.title}</span>
                <span className={m.pastMeta}>
                  {describeWhen(entry.updatedAt)} · {t.history.messages(entry.messages)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  </>  )
}
