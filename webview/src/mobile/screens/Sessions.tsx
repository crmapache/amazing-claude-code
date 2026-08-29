import { ChatRow } from './ChatRow'
import type { LinkState } from '../link'
import m from '../mobile.module.css'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'

export interface SessionEntry {
  agentId: string
  agentLabel: string
  projectKey: string
  projectName: string
  sessionId: string
  title: string
  /** Where that title came from: 'default' means nobody has named this conversation yet. */
  titleSource: string
  status: string
  awaitsYou: boolean
  /** Work in this one has been finished at least once, and its process died under it - see ChatRow. */
  worked: boolean
  crashed: boolean
  seq: number
  online: boolean
}

/**
 * One project, as this screen groups it.
 *
 * Closed ones are on the list too - the projects this IDE remembers rather than the ones it happens to
 * have on screen. A phone is picked up to start something as often as to answer something, and "the
 * project I was in yesterday" is never among the open windows of an editor that has been restarted.
 */
export interface ProjectEntry {
  agentId: string
  agentLabel: string
  /** The key the IDE names this project by - a closed one is named by a key of its own (see recents). */
  key: string
  name: string
  closed: boolean
  online: boolean
  /** How many of this project's conversations this phone has put away - see ChatRow. */
  hiddenCount: number
  sessions: SessionEntry[]
}

export interface AgentEntry {
  agentId: string
  label: string
  state: LinkState
}

interface SessionsProps {
  agents: AgentEntry[]
  projects: ProjectEntry[]
  /** How the phone is doing at reaching anything - 'none' when nothing is paired yet. */
  reach: LinkState | 'none'
  onOpen: (entry: SessionEntry) => void
  onNew: (project: ProjectEntry) => void
  onPair: () => void
  /** Forget an IDE this phone is paired with - see the note on the row it hangs off. */
  onForget: (agentId: string) => void
  onHistory: (project: ProjectEntry) => void
  /** Put one conversation away on this phone, and bring a project's back. */
  onHide: (entry: SessionEntry) => void
  onShowHidden: (project: ProjectEntry) => void
}

/**
 * Why the screen looks the way it does, in words that say where the fault is.
 *
 * Kept apart rather than collapsed into one spinner because what a person should do about each one is
 * different: a tunnel fixes itself, a sleeping laptop is fixed by opening it, and a relay that will not
 * answer is somebody's server rather than anything to do with this phone.
 */
const reachText = (t: Dict): Record<Exclude<SessionsProps['reach'], 'connected' | 'none'>, string> =>
  t.mobile.sessions.reach

/** The same thing said about one IDE rather than about the phone's whole situation. */
const agentText = (t: Dict): Record<Exclude<LinkState, 'connected'>, string> => t.mobile.sessions.agent

/**
 * What is happening, across every paired IDE.
 *
 * Grouped by project rather than listed flat: a project is what a conversation is started in, and the
 * name of the machine a tab belongs to is not what somebody scanning this list is reading for.
 *
 * Inside a project, sorted by what needs a person rather than by time: a phone is picked up to unblock
 * something, and a conversation that is merely running can wait for the desk. An IDE that is not
 * answering is shown greyed rather than hidden - "my laptop is asleep" and "nothing is happening" are
 * different answers, and hiding the difference sends someone looking for a bug that is not there.
 */
export const Sessions = ({
  agents,
  projects,
  reach,
  onOpen,
  onNew,
  onPair,
  onForget,
  onHistory,
  onHide,
  onShowHidden,
}: SessionsProps) => {
  const t = useT()
  // Where the projects this IDE merely remembers begin. They get a heading of their own: "there is
  // nothing in this one" and "this one is not even open" are different facts, and a list that shows
  // them alike reads as a list of empty projects.
  const firstClosed = projects.findIndex((project) => project.closed)

  // Which machine a project is on matters only when there is more than one of them. With a single IDE
  // paired it is the same line under every card, and a fact repeated on every card stops being read.
  const manyAgents = agents.length > 1

  return (
    <>
      <header className={m.header}>
        {/* The mark the app is opened by, on the one screen that has room for it: a phone client served
            off a bare relay address needs to say whose it is somewhere, and the home screen is where
            somebody arriving from a link looks. The same asset the installed icon is made of - one
            logo, no second copy to keep in step (see scripts/mobile-icons.py). */}
        <img className={m.headerLogo} src="/icon-192.png" alt="" />
        <span className={m.headerTitle}>{t.menu.footer}</span>
        <button type="button" className={m.headerAction} onClick={onPair}>
          {t.mobile.pair}
        </button>
      </header>

      {/* The one question this screen is asked before any other: is the machine on. A dot rather than a
          sentence, because it is read at a glance and read every time - and a word beside it whenever
          the answer is anything other than plain yes. */}
      {agents.length > 0 && (
        <div className={m.agents}>
          {agents.map((agent) => (
            <span key={agent.agentId} className={m.agent}>
              <span className={`${m.dot} ${agent.state === 'connected' ? m.dotLive : ''}`} />
              <span className={m.agentLabel}>{agent.label}</span>
              {agent.state !== 'connected' && <span className={m.agentState}>{agentText(t)[agent.state]}</span>}

              {/* An IDE that has stopped answering for good - a sandbox that was thrown away, a machine
                  that will not come back - otherwise sits on this list forever, knocking every half
                  minute and taking up the row that says whether anything is reachable at all. Only
                  offered while it is silent: forgetting one that is answering is a mistap away from
                  losing the pairing on purpose. */}
              {agent.state !== 'connected' && (
                <button type="button" className={m.agentForget} onClick={() => onForget(agent.agentId)}>
                  Forget
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {reach !== 'connected' && reach !== 'none' && <p className={m.reach}>{reachText(t)[reach]}</p>}

      <div className={m.list}>
        {projects.length === 0 && reach === 'connected' && (
          <p className={m.empty}>{t.mobile.sessions.nothingYet}</p>
        )}

        {projects.length === 0 && reach === 'none' && (
          <p className={m.empty}>{t.mobile.sessions.nonePaired}</p>
        )}

        {projects.map((project, index) => (
          <div key={`${project.agentId}:${project.key}`}>
            {index === firstClosed && <p className={m.sectionTitle}>{t.mobile.sessions.recentlyOpened}</p>}

            <section className={`${m.project} ${project.online ? '' : m.projectOffline}`}>
              <div className={m.projectHead}>
                <span className={m.projectMain}>
                  <span className={m.projectName}>{project.name}</span>
                  {manyAgents && <span className={m.projectMeta}>{project.agentLabel}</span>}
                </span>
              </div>

              {project.sessions.length > 0 ? (
                <div className={m.chats}>
                  {project.sessions.map((session) => (
                    <ChatRow
                      key={`${session.agentId}:${session.sessionId}`}
                      session={session}
                      onOpen={() => onOpen(session)}
                      onHide={() => onHide(session)}
                    />
                  ))}
                </div>
              ) : (
                <p className={m.projectQuiet}>
                  {project.closed ? t.mobile.sessions.projectClosed : t.mobile.sessions.noConversations}
                </p>
              )}

              {/* What was put away, and the way back to it. Counted rather than listed: the point of
                  hiding one is that it stops taking up a row. */}
              {project.hiddenCount > 0 && (
                <button type="button" className={m.projectHidden} onClick={() => onShowHidden(project)}>
                  {t.mobile.sessions.hidden(project.hiddenCount)}
                </button>
              )}

              {/* Both ways out of this card, on one row at its foot: back into something (which is where
                  a phone often wants to go - the thing worth answering is as likely to be yesterday's
                  conversation as today's tab; Claude Code keeps that list itself, so what was started in
                  a terminal is on it too) and forward into something new.

                  The new one is a square with a plus rather than the words "New chat" up in the heading.
                  Up there it was the loudest thing on a card whose point is the list below it, and read
                  as the card's own title bar; down here the two live where a hand already is, and which
                  is which is said by shape rather than by a capsule. */}
              <div className={m.projectFoot}>
                {!project.closed && (
                  <button
                    type="button"
                    className={m.projectHistory}
                    disabled={!project.online}
                    onClick={() => onHistory(project)}
                  >
                    {t.mobile.sessions.pastConversations}
                  </button>
                )}

                {/* On a closed project this is the only thing there is to do - and the tap opens the
                    project as well - so there it keeps its words and the whole width: a bare plus on a
                    card that says "not open right now" explains nothing. */}
                <button
                  type="button"
                  className={project.closed ? m.projectOpen : m.projectNew}
                  disabled={!project.online}
                  aria-label={project.closed ? undefined : t.mobile.sessions.newChat}
                  onClick={() => onNew(project)}
                >
                  {project.closed ? t.mobile.sessions.newChat : null}
                </button>
              </div>
            </section>
          </div>
        ))}
      </div>
    </>
  )
}
