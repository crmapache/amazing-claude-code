import { useCallback, useState } from 'react'
import { describeWhen } from '../feed/when'
import { useT } from '../i18n'
import type { ClosedTab, HistoryDeleteOutcome, HistoryEntry } from '../protocol'
import { Confirm } from './Confirm'
import { ContextMenu } from './ContextMenu'
import { NameField } from './NameField'
import { CrossIcon } from './scenarios/icons'
import s from './sideMenu.module.css'

interface HistoryProps {
  /** null means the list has not arrived yet: it is read from disk by itself, before the menu opens. */
  conversations: HistoryEntry[] | null
  onOpen: (entry: HistoryEntry) => void
  /**
   * The tabs closed by hand that can be opened again, the latest first, with anything open again already left
   * out (see ClosedTabs.kt) - each with the name it would wear on the strip.
   */
  closed?: (ClosedTab & { name: string })[]
  onReopen?: (key: string) => void
  /** The panel's key for the latest of them, as a hover hint names it - empty when there is none. */
  reopenKey?: string
  /**
   * Deleting a past conversation - absent where it cannot be done (no trash that takes this project's
   * conversations, an IDE built before it), and then the rows have no button.
   */
  onDelete?: (entry: HistoryEntry) => void
  /**
   * Naming a past conversation, from its row's right-click menu. The IDE decides where the name goes: to the
   * tab that holds the conversation, if one does, or into the transcript on disk (see
   * ProjectCatalog.renameConversation).
   */
  onRename?: (entry: HistoryEntry, title: string) => void
  /**
   * Whether a conversation is open in a tab: such a row offers no deleting, because the tab's process is
   * writing into the very file and would carry on into a transcript nobody can find.
   */
  isOpen?: (id: string) => boolean
  /** Why the last delete did not happen, said above the list - null when it did, or nothing was deleted. */
  refusal?: { title: string; outcome: HistoryDeleteOutcome } | null
}

/**
 * The project's past conversations. Claude Code keeps the list itself, so what was started in a terminal
 * is visible here too - the panel stores nothing of its own.
 *
 * Today's are split off from the rest because that is the cut people actually look for: "the one I was
 * in an hour ago" is a different question from "the one from that week", and a single flat list makes
 * the first question as much work as the second.
 */
export const History = ({
  conversations,
  onOpen,
  closed = [],
  onReopen,
  reopenKey = '',
  onDelete,
  onRename,
  isOpen,
  refusal = null,
}: HistoryProps) => {
  const t = useT()
  // Asked first: the press takes a whole conversation off the list, and the trash is the only way back.
  const [removing, setRemoving] = useState<HistoryEntry | null>(null)
  /** A row's right-click menu and where it was opened (see ContextMenu). */
  const [menu, setMenu] = useState<{ entry: HistoryEntry; x: number; y: number } | null>(null)
  // Steady across renders: the menu listens for Escape and the pointer with it (see Menu).
  const closeMenu = useCallback(() => setMenu(null), [])
  /** The row whose name is being typed - one at a time, as on the strip. */
  const [renaming, setRenaming] = useState<string | null>(null)
  const deleteOf = (entry: HistoryEntry) =>
    onDelete && !isOpen?.(entry.id) ? () => setRemoving(entry) : undefined

  const entryOf = (entry: HistoryEntry) => (
    <Entry
      key={entry.id}
      entry={entry}
      onOpen={onOpen}
      onDelete={deleteOf(entry)}
      onMenu={onRename ? (x, y) => setMenu({ entry, x, y }) : undefined}
      renaming={renaming === entry.id}
      onRenamed={(name) => {
        setRenaming(null)
        // An empty name or the same one is no naming - as on the strip (see finishNaming in Header).
        const next = name?.trim()
        if (next && next !== entry.title) onRename?.(entry, next)
      }}
    />
  )
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const today = conversations?.filter((entry) => entry.updatedAt >= startOfToday) ?? []
  const earlier = conversations?.filter((entry) => entry.updatedAt < startOfToday) ?? []

  return (
    <div className={`${s.screen} ${s.screenList}`}>
      {/* At the top, where the eye is after the press: the row it is about came back somewhere in the list. */}
      {refusal && refusal.outcome !== 'trashed' ? (
        <div className={`${s.cardError} ${s.choiceNote}`} role="status">
          {refusal.outcome === 'open' ? t.history.deleteOpen(refusal.title) : t.history.deleteRefused(refusal.title)}
        </div>
      ) : null}

      {/* Above the past conversations rather than among them: these are tabs - with what was in their field,
          their model and their place on the strip - and opening one puts it back as it was, which a
          conversation picked below does not. A conversation may stand in both lists for that reason. */}
      {closed.length > 0 && onReopen ? (
        <>
          <div className={s.screenGroup}>
            <span className={s.screenLabel}>{t.history.closed}</span>
          </div>
          {closed.map((tab, index) => (
            <button
              key={tab.key}
              type="button"
              className={s.historyRow}
              onClick={() => onReopen(tab.key)}
              // The key brings back the latest one, so it is named on that row alone.
              data-tooltip={t.history.reopen(index === 0 ? reopenKey : '')}
            >
              <span className={s.historyTitle}>{tab.name}</span>
              <span className={s.historyMeta}>
                {[describeWhen(tab.closedAt), tab.kind === 'fork' ? t.history.fork : ''].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </>
      ) : null}

      {conversations === null ? <div className={s.screenEmpty}>{t.common.loading}</div> : null}

      {conversations?.length === 0 ? <div className={s.screenEmpty}>{t.history.empty}</div> : null}

      {today.length > 0 ? (
        <>
          <div className={s.screenGroup}>
            <span className={s.screenLabel}>{t.history.today}</span>
          </div>
          {today.map(entryOf)}
        </>
      ) : null}

      {earlier.length > 0 ? (
        <>
          <div className={s.screenGroup}>
            <span className={s.screenLabel}>{t.history.earlier}</span>
          </div>
          {earlier.map(entryOf)}
        </>
      ) : null}

      {menu && onRename ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={t.header.tabMenu}
          options={[{ id: 'rename', label: t.header.renameTab }]}
          onPick={() => setRenaming(menu.entry.id)}
          onClose={closeMenu}
        />
      ) : null}

      {removing && onDelete ? (
        <Confirm
          title={t.history.deleteTitle}
          subject={removing.title}
          note={t.history.deleteNote}
          confirmLabel={t.history.delete}
          onConfirm={() => {
            onDelete(removing)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </div>
  )
}

const Entry = ({
  entry,
  onOpen,
  onDelete,
  onMenu,
  renaming,
  onRenamed,
}: {
  entry: HistoryEntry
  onOpen: (entry: HistoryEntry) => void
  onDelete?: () => void
  /** The right-click menu - absent where nothing can be renamed (an IDE built before it). */
  onMenu?: (x: number, y: number) => void
  renaming: boolean
  onRenamed: (name: string | null) => void
}) => {
  const t = useT()

  const meta = (
    <span className={s.historyMeta}>
      {describeWhen(entry.updatedAt)} · {t.history.messages(entry.messages)}
    </span>
  )

  // The name field stands where the name stood, in a row that is no longer a button: a press in the field
  // places the caret rather than opening the conversation.
  const row = renaming ? (
    <div className={s.historyRow}>
      <NameField
        title={entry.title}
        label={t.header.renameTab}
        className={s.historyRenameInput}
        onDone={(name) => onRenamed(name)}
      />
      {meta}
    </div>
  ) : (
    <button
      type="button"
      className={s.historyRow}
      onClick={() => onOpen(entry)}
      onContextMenu={
        onMenu
          ? (event) => {
              event.preventDefault()
              onMenu(event.clientX, event.clientY)
            }
          : undefined
      }
      data-tooltip={entry.id}
    >
      <span className={s.historyTitle}>{entry.title}</span>
      {meta}
    </button>
  )

  if (!onDelete) return row

  // The button stands beside the row rather than inside it: a button within a button is not valid markup,
  // and a press on it must not also open the conversation it is about to delete.
  return (
    <div className={s.historyItem}>
      {row}
      <button
        type="button"
        className={s.historyDelete}
        data-tooltip={t.history.delete}
        aria-label={t.history.delete}
        onClick={onDelete}
      >
        <CrossIcon />
      </button>
    </div>
  )
}
