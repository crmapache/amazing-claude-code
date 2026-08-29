import { describeWhen } from '../feed/when'
import { useT } from '../i18n'
import type { HistoryEntry } from '../protocol'
import s from './sideMenu.module.css'

interface HistoryProps {
  /** null means the list has not arrived yet: it is read from disk by itself, before the menu opens. */
  conversations: HistoryEntry[] | null
  onOpen: (entry: HistoryEntry) => void
}

/**
 * The project's past conversations. Claude Code keeps the list itself, so what was started in a terminal
 * is visible here too - the panel stores nothing of its own.
 *
 * Today's are split off from the rest because that is the cut people actually look for: "the one I was
 * in an hour ago" is a different question from "the one from that week", and a single flat list makes
 * the first question as much work as the second.
 */
export const History = ({ conversations, onOpen }: HistoryProps) => {
  const t = useT()
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const today = conversations?.filter((entry) => entry.updatedAt >= startOfToday) ?? []
  const earlier = conversations?.filter((entry) => entry.updatedAt < startOfToday) ?? []

  return (
    <div className={`${s.screen} ${s.screenList}`}>
      {conversations === null ? <div className={s.screenEmpty}>{t.common.loading}</div> : null}

      {conversations?.length === 0 ? <div className={s.screenEmpty}>{t.history.empty}</div> : null}

      {today.length > 0 ? (
        <>
          <div className={s.screenGroup}>
            <span className={s.screenLabel}>{t.history.today}</span>
          </div>
          {today.map((entry) => (
            <Entry key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </>
      ) : null}

      {earlier.length > 0 ? (
        <>
          <div className={s.screenGroup}>
            <span className={s.screenLabel}>{t.history.earlier}</span>
          </div>
          {earlier.map((entry) => (
            <Entry key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </>
      ) : null}
    </div>
  )
}

const Entry = ({ entry, onOpen }: { entry: HistoryEntry; onOpen: (entry: HistoryEntry) => void }) => {
  const t = useT()

  return (
    <button type="button" className={s.historyRow} onClick={() => onOpen(entry)} data-tooltip={entry.id}>
      <span className={s.historyTitle}>{entry.title}</span>
      <span className={s.historyMeta}>
        {describeWhen(entry.updatedAt)} · {t.history.messages(entry.messages)}
      </span>
    </button>
  )
}
