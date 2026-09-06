import type { SessionEntry } from '../projects'
import { chatState } from '../projects'
import { Sheet } from './Sheet'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

interface TabsSheetProps {
  project: string
  sessions: SessionEntry[]
  /** Which of them is on screen. */
  sessionId: string
  onPick: (session: SessionEntry) => void
  onNew: () => void
  onClose: () => void
}

/**
 * Every conversation of this project, and the way into a new one.
 *
 * The strip above the feed holds the same list, and this sheet exists because a strip cannot: a project
 * with six conversations in it is six chips wider than a phone, and the ones that matter are as likely
 * to be at the far end as at the near one. Pressed on the tab already open, the strip opens this.
 *
 * A fork is indented under what it grew out of and carries its group's colour bar - the same two marks
 * the panel's own tabs use, and for the same reason: a fork holds its parent's whole transcript, so
 * answering in one rather than the other is answering somewhere else entirely.
 */
export const TabsSheet = ({ project, sessions, sessionId, onPick, onNew, onClose }: TabsSheetProps) => {
  const t = useT()

  return (
    <Sheet
      title={t.mobile.tabs.title}
      meta={project}
      height="78%"
      onClose={onClose}
      footer={
        <button type="button" className={m.buttonPrimary} onClick={onNew}>
          {t.mobile.sessions.newChat}
        </button>
      }
    >
      {sessions.map((session) => (
        <button
          key={session.sessionId}
          type="button"
          className={`${m.tabRow} ${session.sessionId === sessionId ? m.tabRowOn : ''}`}
          // The indent is the branching depth, capped: a fork of a fork of a fork would otherwise walk
          // its title off the right edge of a phone.
          style={{ paddingLeft: `${10 + Math.min(session.depth, 3) * 12}px` }}
          onClick={() => onPick(session)}
        >
          <span className={m.tabRowBar} style={{ background: groupColor(session.groupId) }} />
          <span className={`${m.chatDot} ${dotClass(session)}`} />
          {session.depth > 0 ? <span className={m.tabFork}>⑂</span> : null}
          <span className={m.tabRowTitle}>{session.title}</span>
        </button>
      ))}

      {/* Reordering stays at the desk: the order of the tabs is one list shared by every client, and a
          drag on a phone would rearrange the strip somebody is working in (see RemoteCommands). */}
      <p className={m.sheetNote}>{t.mobile.tabs.note}</p>
    </Sheet>
  )
}

/**
 * The colour of a group's bar, from the conversation the chain grew out of - the panel's own arithmetic
 * (see tabs.ts). Deterministic rather than assigned in order: the list is rebuilt from an inventory
 * whose order is the IDE's, and a colour that moved with it would say nothing.
 */
export const groupColor = (groupId: string): string => {
  let hash = 0
  for (let index = 0; index < groupId.length; index += 1) hash = (hash * 31 + groupId.charCodeAt(index)) | 0

  return `hsl(${Math.abs(hash) % 360}, 55%, 72%)`
}

/** The same five states the list of conversations paints. */
export const dotClass = (session: SessionEntry): string => {
  const state = chatState(session)
  if (state === 'crashed') return m.dotCrashed ?? ''
  if (state === 'attention') return m.dotAttention ?? ''
  if (state === 'running') return m.dotRunning ?? ''
  if (state === 'done') return m.dotDone ?? ''

  return ''
}
