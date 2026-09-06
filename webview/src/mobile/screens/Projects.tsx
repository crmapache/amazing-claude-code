import { ChatRow } from './ChatRow'
import { Magnifier } from '../../components/SearchCapsule'
import type { AgentEntry, ProjectEntry, SessionEntry } from '../projects'
import { waitingFor } from '../projects'
import type { ProjectFacts } from '../facts'
import type { LinkState } from '../link'
import m from '../mobile.module.css'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'

interface ProjectsProps {
  agents: AgentEntry[]
  projects: ProjectEntry[]
  /** What each project itself is like, by `agentId:projectKey` - the branch and its pull request. */
  facts: Record<string, ProjectFacts>
  /** How the phone is doing at reaching anything - 'none' when nothing is paired yet. */
  reach: LinkState | 'none'
  /**
   * What time it is on one paired IDE - the clock a row's "working · 2m 40s" is counted against.
   *
   * A function of the machine rather than one number, because this screen shows several at once and
   * they disagree with this phone by different amounts (see mobile/clock.ts).
   */
  now: (agentId: string) => number
  onOpen: (entry: SessionEntry) => void
  /** Straight to the screen where the answer is given, from the band at the top. */
  onDecide: (entry: SessionEntry) => void
  onNew: (project: ProjectEntry) => void
  onHistory: (project: ProjectEntry) => void
  onMenu: () => void
  onSearch: (project: ProjectEntry) => void
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
const reachText = (t: Dict): Record<Exclude<ProjectsProps['reach'], 'connected' | 'none'>, string> =>
  t.mobile.sessions.reach

/**
 * Everything that is happening, on every paired IDE.
 *
 * Two bands, and the order between them is the whole screen. What is stopped waiting for a person goes
 * at the top, out of its project and named by what it wants - a permission is one tap and a plan is a
 * page, and somebody deciding whether to get up is deciding by that. The projects follow, each with its
 * branch, its conversations and the two ways out of it.
 *
 * Grouped by project rather than listed flat: a project is what a conversation is started in, and the
 * name of the machine a tab belongs to is not what somebody scanning this list is reading for. An IDE
 * that is not answering is shown greyed rather than hidden - "my laptop is asleep" and "nothing is
 * happening" are different answers, and hiding the difference sends someone looking for a bug that is
 * not there.
 */
export const Projects = ({
  agents,
  projects,
  facts,
  reach,
  now,
  onOpen,
  onDecide,
  onNew,
  onHistory,
  onMenu,
  onSearch,
  onHide,
  onShowHidden,
}: ProjectsProps) => {
  const t = useT()

  // Where the projects this IDE merely remembers begin. They get a heading of their own: "there is
  // nothing in this one" and "this one is not even open" are different facts, and a list that shows
  // them alike reads as a list of empty projects.
  const firstClosed = projects.findIndex((project) => project.closed)

  // Which machine a project is on matters only when there is more than one of them. With a single IDE
  // paired it is the same line under every card, and a fact repeated on every card stops being read.
  const manyAgents = agents.length > 1

  const waiting = waitingFor(projects)

  /** The one project a search from this screen would be over - meaningless with none or several open. */
  const only = projects.filter((project) => !project.closed)

  return (
    <>
      <header className={m.homeHeader}>
        <div className={m.homeHeadRow}>
          <button type="button" className={m.headerIcon} aria-label={t.mobile.drawer.menu} onClick={onMenu}>
            <Burger />
          </button>
          <span className={m.homeTitle}>{t.mobile.drawer.projects}</span>
          {only.length === 1 && (
            <button
              type="button"
              className={m.headerIcon}
              aria-label={t.search.title}
              onClick={() => onSearch(only[0]!)}
            >
              <Magnifier size={18} />
            </button>
          )}
        </div>

        {/* The one question this screen is asked before any other: is the machine on. Dots rather than
            sentences, because it is read at a glance and read every time - and a word beside one
            whenever the answer is anything other than plain yes. */}
        {agents.length > 0 && (
          <div className={m.homeAgents}>
            {agents.map((agent) => (
              <span key={agent.agentId} className={m.homeAgent}>
                <span className={`${m.dot} ${agent.state === 'connected' ? m.dotLive : ''}`} />
                <span className={m.homeAgentLabel}>{agent.label}</span>
                {agent.state !== 'connected' && (
                  <span className={m.homeAgentState}>{t.mobile.sessions.agent[agent.state]}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className={m.list}>
        {reach !== 'connected' && reach !== 'none' && <p className={m.reach}>{reachText(t)[reach]}</p>}

        {waiting.length > 0 && (
          <>
            <p className={m.bandTitle}>{t.mobile.sessions.waitingForYou}</p>
            {waiting.map((session) => (
              <button
                key={`${session.agentId}:${session.projectKey}:${session.sessionId}`}
                type="button"
                className={m.waitCard}
                onClick={() => onDecide(session)}
              >
                <span className={m.waitMain}>
                  <span className={m.waitKind}>{waitKind(t, session.awaits)}</span>
                  <span className={m.waitTitle}>{session.title}</span>
                  <span className={m.waitWhere}>
                    {manyAgents ? `${session.agentLabel} · ` : ''}
                    {session.projectName}
                  </span>
                </span>
                <span className={m.waitAction}>{t.mobile.sessions.answer}</span>
              </button>
            ))}
          </>
        )}

        {projects.length === 0 && reach === 'connected' && (
          <p className={m.empty}>{t.mobile.sessions.nothingYet}</p>
        )}

        {projects.length === 0 && reach === 'none' && (
          <p className={m.empty}>{t.mobile.sessions.nonePaired}</p>
        )}

        {projects.map((project, index) => {
          const fact = facts[`${project.agentId}:${project.key}`]
          // How many conversations the project holds, tinted by whether any of them is stopped. A count
          // of what waits would repeat the band at the top of the screen; what the corner is actually
          // asked is "how much is going on in here".
          const stopped = project.sessions.filter((session) => session.awaitsYou).length
          const open = project.sessions.length

          return (
            <div key={`${project.agentId}:${project.key}`}>
              {index === firstClosed && <p className={m.bandTitle}>{t.mobile.sessions.recentlyOpened}</p>}

              <section className={`${m.project} ${project.online ? '' : m.projectOffline}`}>
                <div className={m.projectHead}>
                  <span className={m.projectMain}>
                    <span className={m.projectName}>{project.name}</span>

                    {/* The branch and its pull request, which is what tells two cards of the same
                        project apart in the memory of somebody who left an hour ago. Only where the IDE
                        has said - a closed project has told this phone nothing about itself. */}
                    {fact?.gitBranch ? (
                      <span className={m.projectBranch}>
                        <BranchIcon />
                        <span className={m.projectBranchName}>{fact.gitBranch}</span>
                        {fact.pullRequest ? <span className={m.projectPr}>· PR #{fact.pullRequest}</span> : null}
                      </span>
                    ) : (
                      manyAgents && <span className={m.projectMeta}>{project.agentLabel}</span>
                    )}
                  </span>

                  {/* One badge rather than two: what is waiting is the answer somebody came for, and it
                      takes the accent; with nothing waiting the count of what is open is the fact worth
                      a corner. */}
                  {open > 0 ? (
                    <span className={stopped > 0 ? m.countWaiting : m.countOpen}>
                      {stopped > 0 ? t.mobile.sessions.countWaiting(stopped) : t.mobile.sessions.countOpen(open)}
                    </span>
                  ) : null}
                </div>

                {project.sessions.length > 0 ? (
                  <div className={m.chats}>
                    {project.sessions.map((session) => (
                      <ChatRow
                        key={`${session.agentId}:${session.sessionId}`}
                        session={session}
                        now={now(session.agentId)}
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

                {/* Both ways out of this card, on one row at its foot: back into something - which is
                    where a phone often wants to go, since the thing worth answering is as likely to be
                    yesterday's conversation as today's tab - and forward into something new. */}
                <div className={m.projectFoot}>
                  {!project.closed && (
                    <button
                      type="button"
                      className={m.footButton}
                      disabled={!project.online}
                      onClick={() => onHistory(project)}
                    >
                      {t.mobile.sessions.pastConversations}
                    </button>
                  )}

                  <button
                    type="button"
                    className={`${m.footButton} ${m.footButtonAccent}`}
                    disabled={!project.online}
                    onClick={() => onNew(project)}
                  >
                    {project.closed ? t.mobile.sessions.openAndStart : t.mobile.sessions.newChat}
                  </button>
                </div>
              </section>
            </div>
          )
        })}
      </div>
    </>
  )
}

/** What a stopped conversation is stopped for, in the two words the band has room for. */
const waitKind = (t: Dict, awaits: string): string =>
  awaits === 'perm'
    ? t.mobile.sessions.kind.permission
    : awaits === 'ask'
      ? t.mobile.sessions.kind.question
      : awaits === 'plan'
        ? t.mobile.sessions.kind.plan
        : t.mobile.sessions.kind.unknown

const Burger = () => (
  <svg viewBox="0 0 16 16" className={m.headerIconGlyph} aria-hidden="true">
    <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const BranchIcon = () => (
  <svg
    viewBox="0 0 16 16"
    className={m.projectBranchIcon}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="4.5" cy="3.5" r="1.75" />
    <circle cx="4.5" cy="12.5" r="1.75" />
    <circle cx="11.5" cy="3.5" r="1.75" />
    <path d="M4.5 5.25v5.5" />
    <path d="M11.5 5.25v1.25a3 3 0 0 1-3 3H6.25" />
  </svg>
)
