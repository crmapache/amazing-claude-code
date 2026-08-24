import { ChatRow } from './ChatRow'
import type { LinkState } from '../link'
import m from '../mobile.module.css'

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
const REACH_TEXT: Record<Exclude<SessionsProps['reach'], 'connected' | 'none'>, string> = {
  connecting: 'Connecting…',
  asleep: 'Connected to the relay, but no IDE is answering.',
  elsewhere: 'Also open in another tab or in the installed app - that copy holds the connection.',
  reconnecting: 'Reconnecting… the list below may be out of date.',
  offline: 'Cannot reach the relay. Nothing is lost - this comes back on its own.',
}

/** The same thing said about one IDE rather than about the phone's whole situation. */
const AGENT_TEXT: Record<Exclude<LinkState, 'connected'>, string> = {
  connecting: 'connecting…',
  asleep: 'not answering',
  elsewhere: 'open elsewhere',
  reconnecting: 'reconnecting…',
  offline: 'offline',
}

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
        <span className={m.headerTitle}>Amazing Claude Code</span>
        <button type="button" className={m.headerAction} onClick={onPair}>
          Pair
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
              {agent.state !== 'connected' && <span className={m.agentState}>{AGENT_TEXT[agent.state]}</span>}

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

      {reach !== 'connected' && reach !== 'none' && <p className={m.reach}>{REACH_TEXT[reach]}</p>}

      <div className={m.list}>
        {projects.length === 0 && reach === 'connected' && (
          <p className={m.empty}>Nothing to show yet. Open a project in the IDE, or pair another one.</p>
        )}

        {projects.length === 0 && reach === 'none' && (
          <p className={m.empty}>No IDE is paired with this phone yet. Tap Pair to add one.</p>
        )}

        {projects.map((project, index) => (
          <div key={`${project.agentId}:${project.key}`}>
            {index === firstClosed && <p className={m.sectionTitle}>Recently opened</p>}

            <section className={`${m.project} ${project.online ? '' : m.projectOffline}`}>
              <div className={m.projectHead}>
                <span className={m.projectMain}>
                  <span className={m.projectName}>{project.name}</span>
                  {manyAgents && <span className={m.projectMeta}>{project.agentLabel}</span>}
                </span>

                {/* Starting something is the other half of what this app is for, and on a project that
                    is closed it is the only thing there is to do - the tap opens the project as well. */}
                <button
                  type="button"
                  className={m.projectNew}
                  disabled={!project.online}
                  onClick={() => onNew(project)}
                >
                  New chat
                </button>
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
                  {project.closed ? 'Not open in the IDE right now.' : 'No conversations yet.'}
                </p>
              )}

              {/* What was put away, and the way back to it. Counted rather than listed: the point of
                  hiding one is that it stops taking up a row. */}
              {project.hiddenCount > 0 && (
                <button type="button" className={m.projectHidden} onClick={() => onShowHidden(project)}>
                  {project.hiddenCount} hidden · show
                </button>
              )}

              {/* The conversations this project has had before, which is where a phone often wants to go:
                  the thing worth answering is as likely to be yesterday's conversation as today's tab.
                  Claude Code keeps that list itself, so what was started in a terminal is on it too. */}
              {!project.closed && (
                <button
                  type="button"
                  className={m.projectHistory}
                  disabled={!project.online}
                  onClick={() => onHistory(project)}
                >
                  Past conversations
                </button>
              )}
            </section>
          </div>
        ))}
      </div>
    </>
  )
}
