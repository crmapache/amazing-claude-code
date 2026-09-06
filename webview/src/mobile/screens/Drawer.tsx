import type { AgentEntry } from '../projects'
import type { LinkState } from '../link'
import m from '../mobile.module.css'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'

interface DrawerProps {
  agents: AgentEntry[]
  /** How many conversations, across every paired IDE, are stopped waiting for a person. */
  waiting: number
  /** How many subagents and background commands are alive in the conversation on screen, if one is. */
  live: number
  /** What the accounts row says on its right: the account in force, or nothing until the IDE has said. */
  account: string
  /** Whether any MCP server of the project on screen wants attention - the dot on that row. */
  mcpTone: 'none' | 'warn' | 'bad'
  /** Absent where there is no conversation on screen to have tasks, or no project to ask about. */
  onProjects: () => void
  onTasks?: () => void
  onMcp?: () => void
  onPlugins?: () => void
  onAccounts?: () => void
  onPair: () => void
  /**
   * Stop being paired with an IDE.
   *
   * Offered only for one that has gone quiet, which is the same rule the first screen used to carry it
   * under: forgetting a machine that is answering is one mistap away from losing a pairing on purpose,
   * while a sandbox that was thrown away otherwise sits here for ever, knocking every half minute.
   */
  onForget: (agentId: string) => void
  onClose: () => void
}

/** The same words the first screen uses about one IDE, said here under the product's name. */
const agentText = (t: Dict): Record<Exclude<LinkState, 'connected'>, string> => t.mobile.sessions.agent

/**
 * The side menu, behind the burger on the first screen.
 *
 * The phone used to have no such thing, and it did not need one: four screens, all of them reachable
 * from the list. It needs one now, because the screens that were added - the MCP servers, the plugins,
 * the accounts - belong to the machine rather than to a conversation, and there is nowhere in a
 * conversation for them to hang off. The panel at the desk answered the same question the same way
 * (see SideMenu.tsx), and the order here is the panel's own: what is opened while working first, what
 * is read now and then after it.
 *
 * Which machines are reachable stands at the top rather than in a row of its own, because it is the
 * question this menu is opened with as often as any: a screen full of nothing is either a quiet
 * morning or a laptop that went to sleep, and only this tells the two apart.
 */
export const Drawer = ({
  agents,
  waiting,
  live,
  account,
  mcpTone,
  onProjects,
  onTasks,
  onMcp,
  onPlugins,
  onAccounts,
  onPair,
  onForget,
  onClose,
}: DrawerProps) => {
  const t = useT()

  return (
    <div className={m.drawerScrim} onClick={onClose}>
      <aside className={m.drawer} onClick={(event) => event.stopPropagation()}>
        <div className={m.drawerHead}>
          {/* The same asset the installed icon is made of - one logo, no second copy to keep in step
              (see scripts/mobile-icons.py). */}
          <div className={m.drawerBrand}>
            <img className={m.drawerLogo} src="/icon-192.png" alt="" />
            <span className={m.drawerName}>{t.menu.footer}</span>
          </div>

          <div className={m.drawerAgents}>
            {agents.map((agent) => (
              <span key={agent.agentId} className={m.drawerAgent}>
                <span className={`${m.dot} ${agent.state === 'connected' ? m.dotLive : ''}`} />
                <span className={m.drawerAgentLabel}>{agent.label}</span>
                {agent.state !== 'connected' && (
                  <>
                    <span className={m.drawerAgentState}>{agentText(t)[agent.state]}</span>
                    <button
                      type="button"
                      className={m.drawerForget}
                      onClick={() => onForget(agent.agentId)}
                    >
                      {t.mobile.drawer.forget}
                    </button>
                  </>
                )}
              </span>
            ))}
          </div>
        </div>

        <nav className={m.drawerNav}>
          <button type="button" className={`${m.drawerRow} ${m.drawerRowOn}`} onClick={onProjects}>
            <span className={m.drawerIcon}>▤</span>
            <span className={m.drawerLabel}>{t.mobile.drawer.projects}</span>
            {waiting > 0 && <span className={m.drawerBadge}>{t.mobile.drawer.waiting(waiting)}</span>}
          </button>

          {onTasks && (
            <button type="button" className={m.drawerRow} onClick={onTasks}>
              <span className={m.drawerIcon}>◷</span>
              <span className={m.drawerLabel}>{t.mobile.drawer.tasks}</span>
              {live > 0 && <span className={m.drawerValueAgent}>{t.mobile.drawer.live(live)}</span>}
            </button>
          )}

          <div className={m.drawerRule} />

          {/* The three screens that are about the machine rather than about a conversation. They need a
              project to ask - each one is answered by an IDE, and the phone talks to several - so they
              are absent while no project has been opened, rather than present and refusing. */}
          {onMcp && (
            <button type="button" className={m.drawerRow} onClick={onMcp}>
              <span className={m.drawerIcon}>⇄</span>
              <span className={m.drawerLabel}>{t.mobile.drawer.mcp}</span>
              {mcpTone !== 'none' && (
                <span className={`${m.dot} ${mcpTone === 'bad' ? m.dotCrashed : m.dotAttention}`} />
              )}
            </button>
          )}

          {onPlugins && (
            <button type="button" className={m.drawerRow} onClick={onPlugins}>
              <span className={m.drawerIcon}>▧</span>
              <span className={m.drawerLabel}>{t.mobile.drawer.plugins}</span>
            </button>
          )}

          {onAccounts && (
            <button type="button" className={m.drawerRow} onClick={onAccounts}>
              <span className={m.drawerIcon}>◉</span>
              <span className={m.drawerLabel}>{t.mobile.drawer.accounts}</span>
              {account !== '' && <span className={m.drawerValue}>{account}</span>}
            </button>
          )}

          <div className={m.drawerRule} />

          <button type="button" className={m.drawerRow} onClick={onPair}>
            <span className={m.drawerIcon}>＋</span>
            <span className={m.drawerLabel}>{t.mobile.drawer.pair}</span>
          </button>
        </nav>

        {/* What the channel is, in one line, at the foot of the one screen with room for it. A client
            served off a bare relay address has to be able to say whose it is and what it carries. */}
        <div className={m.drawerFoot}>
          <span className={m.drawerFootLine}>{t.mobile.drawer.sealed}</span>
          <a
            className={m.drawerFootLink}
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.mobile.composer.whatTravels}
          </a>
        </div>
      </aside>
    </div>
  )
}
