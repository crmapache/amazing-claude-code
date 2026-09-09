import { useState } from 'react'
import type { McpServerInfo } from '../../protocol'
import { Back } from './Back'
import m from '../mobile.module.css'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'

interface McpProps {
  /** null means the answer has not arrived yet - it is asked for when this screen opens. */
  servers: McpServerInfo[] | null
  /** How the last request went, in the IDE's own words. Empty when there is nothing to say. */
  message: { ok: boolean; text: string } | null
  /**
   * The address a sign-in is finished at, by server - see the `mcpSignIn` message.
   *
   * Held rather than opened: it arrives a moment after the press, and a page a phone opens outside a
   * press is a page the browser blocks. So the row grows a link, and the link is the press.
   */
  signIns: Record<string, string>
  project: string
  onRefresh: () => void
  onReconnect: (name: string) => void
  onAuthenticate: (name: string) => void
  onRemove: (name: string) => void
  onAdd: (name: string, command: string, transport: string) => void
  onBack: () => void
}

const TRANSPORTS = ['stdio', 'sse', 'http'] as const

/**
 * What each state is called on screen. The words are the ones the terminal's `/mcp` prints, and the
 * panel's screen uses the same: three places calling one state by three names is three bugs waiting.
 */
const statusText = (t: Dict): Record<string, string> => ({
  connected: t.mcp.status.connected,
  'needs-auth': t.mcp.status.needsAuth,
  failed: t.mcp.status.failed,
  pending: t.mcp.status.pending,
  disabled: t.mcp.status.disabled,
})

const DOT: Record<string, string> = {
  connected: m.dotLive ?? '',
  'needs-auth': m.dotAttention ?? '',
  failed: m.dotCrashed ?? '',
  pending: '',
  disabled: '',
}

/**
 * The MCP servers of the project on screen, from a phone.
 *
 * The whole screen used to be at the desk and nowhere else, and the argument was that adding a server
 * writes a command line onto somebody's machine. It still does; what changed is the comparison. The
 * same channel has carried `prompt` since the first day, and a prompt hands the agent a shell - a door
 * incomparably wider than a line in a config. Refusing this one bought no safety and cost the thing a
 * person away from the desk actually needs: a run that has stopped because a server fell over, and no
 * way to see it or bring it back.
 *
 * One thing is honestly missing rather than hidden: a server's command line is not sent here at all -
 * it is a path on that machine and sometimes a secret in an argument (see RemoteFeed.forPhone) - so a
 * row is named by what it is and what state it is in.
 *
 * Signing in is split by where it ends. An OAuth server's sign-in comes back to a port the CLI opened on
 * that machine, so a page opened on a phone would be redirected nowhere - those rows say "at the desk".
 * A claude.ai connector is signed in on claude.ai itself and nothing comes back to the machine, so the
 * IDE hands the phone the address and the phone opens it (see ProjectCatalog.authenticateMcp).
 */
export const Mcp = ({
  servers,
  message,
  signIns,
  project,
  onRefresh,
  onReconnect,
  onAuthenticate,
  onRemove,
  onAdd,
  onBack,
}: McpProps) => {
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [transport, setTransport] = useState<string>('stdio')

  const submit = () => {
    if (!name.trim() || !command.trim()) return
    onAdd(name.trim(), command.trim(), transport)
    setName('')
    setCommand('')
    setAdding(false)
  }

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{t.menu.rows.mcp.label}</span>
            <span className={m.threadWhere}>{project}</span>
          </span>
          <button type="button" className={m.headerWord} onClick={onRefresh}>
            {t.mcp.refreshAll}
          </button>
        </div>
      </header>

      <div className={m.pageList}>
        {message ? (
          <p className={message.ok ? m.noteOk : m.noteBad}>{message.text}</p>
        ) : null}

        {servers === null && <p className={m.empty}>{t.common.loading}</p>}
        {servers?.length === 0 && <p className={m.empty}>{t.mcp.empty}</p>}

        {servers && servers.length > 0 && (
          <div className={m.card}>
            {servers.map((server) => (
              <ServerRow
                key={server.name}
                server={server}
                signIn={signIns[server.name]}
                onReconnect={() => onReconnect(server.name)}
                onAuthenticate={() => onAuthenticate(server.name)}
                onRemove={
                  removable(server)
                    ? () => {
                        if (window.confirm(t.mobile.mcp.removeAsk(server.name))) onRemove(server.name)
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {/*
          Adding one, behind a press rather than always open.

          The form is three fields on a screen whose whole point is a list of four rows, and adding a
          server is the rarest thing anybody does here. Its own warning stands with it, because the
          consequence is the one thing this screen cannot show: the conversation's process is restarted
          to pick the server up, and whatever was running in it stops.
        */}
        {adding ? (
          <div className={m.card}>
            <div className={m.formRow}>
              <input
                className={m.input}
                placeholder={t.mcp.namePlaceholder}
                value={name}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className={m.formRow}>
              <input
                className={m.input}
                placeholder={t.mcp.commandPlaceholder}
                value={command}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setCommand(event.target.value)}
              />
            </div>

            <div className={m.segmented}>
              {TRANSPORTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${m.segment} ${transport === option ? m.segmentOn : ''}`}
                  onClick={() => setTransport(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            <p className={m.formNote}>{t.mobile.mcp.restartNote}</p>

            <div className={m.formActions}>
              <button type="button" className={m.buttonSecondary} onClick={() => setAdding(false)}>
                {t.common.cancel}
              </button>
              <button
                type="button"
                className={m.buttonPrimary}
                disabled={!name.trim() || !command.trim()}
                onClick={submit}
              >
                {t.mcp.add}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={m.wideButton} onClick={() => setAdding(true)}>
            {t.mobile.mcp.addServer}
          </button>
        )}

        <p className={m.screenNote}>{t.mobile.mcp.deskNote}</p>
      </div>
    </>
  )
}

/**
 * Whether this server lives in a config that can be edited at all.
 *
 * What is built in or came with a plugin is removed by removing the plugin - the same rule the panel's
 * screen goes by, because it is the CLI's rule rather than either screen's.
 */
const removable = (server: McpServerInfo): boolean =>
  server.scope === 'project' || server.scope === 'user' || server.scope === 'local'

/**
 * Whether a sign-in to this server can be finished from a phone at all.
 *
 * The CLI is the one that knows - it says with the address whether it waits for a callback on the
 * machine - and the IDE refuses the other kind out loud. This is the same answer read off the row, so
 * that the button is offered only where pressing it can end well: the connectors of the claude.ai account
 * are the ones signed in on claude.ai.
 */
const signsInHere = (server: McpServerInfo): boolean => server.transport === 'claudeai-proxy'

const ServerRow = ({
  server,
  signIn,
  onReconnect,
  onAuthenticate,
  onRemove,
}: {
  server: McpServerInfo
  /** Where its sign-in is finished, once the IDE has said - see McpProps.signIns. */
  signIn?: string
  onReconnect: () => void
  onAuthenticate: () => void
  onRemove?: () => void
}) => {
  const t = useT()
  const needsAuth = server.status === 'needs-auth'

  return (
    <div className={`${m.serverRow} ${server.status === 'disabled' ? m.serverRowOff : ''}`}>
      <span className={`${m.dot} ${DOT[server.status] ?? ''}`} />

      <span className={m.serverText}>
        <span className={m.serverName}>{server.name}</span>
        <span className={`${m.serverState} ${needsAuth ? m.serverStateWarn : ''} ${server.status === 'failed' ? m.serverStateBad : ''}`}>
          {[server.transport, statusText(t)[server.status] ?? server.status].filter(Boolean).join(' · ')}
          {/* The CLI's own explanation of a failure, which is what saves a trip to the machine to read
              a log that already says it. */}
          {server.error ? ` · ${server.error}` : ''}
        </span>
      </span>

      {/* A sign-in that ends on claude.ai is offered; one that ends in a browser on the machine with the
          IDE is named and left there - a button that sends somebody to a page that cannot come back is
          worse than a word. Once the IDE has answered with the address, the row's button IS the address:
          a page has to be opened by a press, and the press that asked for it is long over. */}
      {needsAuth && signsInHere(server) ? (
        signIn ? (
          <a className={m.rowButtonPrimary} href={signIn} target="_blank" rel="noopener noreferrer">
            {t.mobile.mcp.continueSignIn}
          </a>
        ) : (
          <button type="button" className={m.rowButtonPrimary} onClick={onAuthenticate}>
            {t.mcp.authenticate}
          </button>
        )
      ) : needsAuth ? (
        <span className={m.atDesk}>{t.mobile.mcp.atDesk}</span>
      ) : (
        <button type="button" className={m.rowButton} onClick={onReconnect}>
          {server.status === 'failed' ? t.mcp.retry : t.mcp.reconnect}
        </button>
      )}

      {onRemove ? (
        <button type="button" className={m.rowButtonDanger} onClick={onRemove}>
          {t.mcp.remove}
        </button>
      ) : null}
    </div>
  )
}
