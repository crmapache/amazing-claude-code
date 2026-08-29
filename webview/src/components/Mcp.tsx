import { useEffect, useState } from 'react'
import type { McpServerInfo } from '../protocol'
import { SkeletonBar } from './Skeleton'
import s from './sideMenu.module.css'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'

interface McpProps {
  /** null means the list has not arrived yet: it loads by itself, long before the screen is opened. */
  servers: McpServerInfo[] | null
  /** A request worth saying out loud is under way: a refresh from the button. */
  loading: boolean
  message: { ok: boolean; text: string } | null
  onRefresh: () => void
  onReconnect: (name: string) => void
  onAuthenticate: (name: string) => void
  onRemove: (name: string) => void
  onAdd: (name: string, command: string, transport: string) => void
}

const ADD_SERVER_KEY = 'add-server'
const TRANSPORTS = ['stdio', 'sse', 'http'] as const

/**
 * What each state is called on screen. The words are the ones the terminal's `/mcp` prints: the panel and
 * the terminal show one and the same thing, and calling it by different words is not an option.
 */
const statusText = (t: Dict): Record<string, string> => ({
  connected: t.mcp.status.connected,
  'needs-auth': t.mcp.status.needsAuth,
  failed: t.mcp.status.failed,
  pending: t.mcp.status.pending,
  disabled: t.mcp.status.disabled,
})

const STATUS_CLASS: Record<string, string> = {
  connected: s.cardStateOk ?? '',
  'needs-auth': s.cardStateWarn ?? '',
  failed: s.cardStateBad ?? '',
  pending: '',
  disabled: '',
}

const DOT_CLASS: Record<string, string> = {
  connected: s.cardDotOn ?? '',
  'needs-auth': s.cardDotWarn ?? '',
  failed: s.cardDotBad ?? '',
  pending: '',
  disabled: '',
}

/**
 * The groups are the terminal's, in the terminal's order: first what is configured for this project, then
 * what is personal, then the claude.ai connectors, then what is built in and what came with plugins.
 */
const GROUPS: { scope: string; title: string; hint: string }[] = [
  { scope: 'project', title: 'PROJECT', hint: '.mcp.json of this project' },
  { scope: 'local', title: 'THIS PROJECT ONLY', hint: 'yours, not shared with the repo' },
  { scope: 'user', title: 'USER', hint: '~/.claude.json' },
  { scope: 'claudeai', title: 'CLAUDE.AI', hint: 'connectors of your account' },
  { scope: 'dynamic', title: 'BUILT-IN & PLUGINS', hint: 'always available' },
]

/**
 * MCP servers: the same screen as `/mcp` in a terminal - who is connected, who needs a sign-in, who
 * failed and why - plus adding and removing, which the terminal does not have at all.
 *
 * The statuses and the scopes come from the CLI itself (see McpServerInfo): the panel invents nothing, it
 * merely lays them out into groups and draws the button for the action this server genuinely has
 * available.
 */
export const Mcp = ({
  servers,
  loading,
  message,
  onRefresh,
  onReconnect,
  onAuthenticate,
  onRemove,
  onAdd,
}: McpProps) => {
  const t = useT()
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [transport, setTransport] = useState('stdio')
  /**
   * What is currently in progress - a key of the form "remove:name". The response has to be instant: the
   * button dims and changes its caption at once, without waiting for the CLI's answer.
   */
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  // We clear "in progress" only when a real outcome has arrived - otherwise a banner that went out for
  // another reason would unblock the button too early.
  useEffect(() => {
    if (message) setPendingAction(null)
  }, [message])

  // Groups with nobody in them are not drawn at all: an empty "PROJECT" heading would say the project
  // has something configured while there is nothing there.
  const groups = GROUPS.map((group) => ({
    ...group,
    servers: servers?.filter((server) => server.scope === group.scope) ?? [],
  })).filter((group) => group.servers.length > 0)

  // A scope we do not recognise still has to be visible - otherwise a server would simply vanish from
  // the screen although the CLI told us about it.
  const known = new Set(GROUPS.map((group) => group.scope))
  const rest = servers?.filter((server) => !known.has(server.scope)) ?? []
  const shown = rest.length > 0 ? [...groups, { scope: 'other', title: 'OTHER', hint: '', servers: rest }] : groups

  return (
    <div className={s.screen}>
      {message ? (
        <div className={message.ok ? `${s.message} ${s.messageOk}` : `${s.message} ${s.messageBad}`}>
          {message.text}
        </div>
      ) : null}

      {servers === null
        ? [0, 1, 2].map((row) => (
            <div key={row} className={s.card}>
              <div className={s.cardTop}>
                <SkeletonBar width={6} height={6} round />
                <SkeletonBar width="34%" />
              </div>
              <SkeletonBar width="58%" height={9} />
            </div>
          ))
        : null}

      {servers?.length === 0 ? <div className={s.screenEmpty}>{t.mcp.empty}</div> : null}

      {shown.map((group) => (
        <div key={group.scope} className={s.field}>
          <div className={s.screenGroup}>
            <span className={s.screenLabel}>{group.title}</span>
            {group.hint ? <span className={s.screenGroupHint}>{group.hint}</span> : null}
          </div>

          {group.servers.map((server) => (
            <ServerRow
              key={server.name}
              server={server}
              pendingAction={pendingAction}
              onAction={setPendingAction}
              onReconnect={onReconnect}
              onAuthenticate={onAuthenticate}
              onRemove={onRemove}
            />
          ))}
        </div>
      ))}

      <form
        className={s.field}
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim() || !command.trim()) return

          setPendingAction(ADD_SERVER_KEY)
          onAdd(name.trim(), command.trim(), transport)
          setName('')
          setCommand('')
        }}
      >
        <span className={s.screenLabel}>{t.mcp.addServer}</span>
        <div className={s.inputRow}>
          <input
            className={s.input}
            placeholder={t.mcp.namePlaceholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className={s.tabs}>
            {TRANSPORTS.map((option) => (
              <button
                key={option}
                type="button"
                className={`${s.tab} ${transport === option ? s.tabOn : ''}`}
                onClick={() => setTransport(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <input
          className={s.input}
          placeholder={t.mcp.commandPlaceholder}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
        />
        <div className={s.formActions}>
          <button type="button" className={s.button} onClick={onRefresh} disabled={loading}>
            {loading ? t.mcp.refreshing : t.mcp.refreshAll}
          </button>
          <button type="submit" className={`${s.button} ${s.buttonPrimary}`} disabled={pendingAction === ADD_SERVER_KEY}>
            {pendingAction === ADD_SERVER_KEY ? t.mcp.adding : t.mcp.add}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * One server's row. The buttons are only the ones this server genuinely has: a sign-in is offered where
 * one is expected; what lies in a config can be removed, while what is built in or came with a plugin
 * cannot (the plugin removes it).
 */
const ServerRow = ({
  server,
  pendingAction,
  onAction,
  onReconnect,
  onAuthenticate,
  onRemove,
}: {
  server: McpServerInfo
  pendingAction: string | null
  onAction: (key: string) => void
  onReconnect: (name: string) => void
  onAuthenticate: (name: string) => void
  onRemove: (name: string) => void
}) => {
  const t = useT()
  const authKey = `auth:${server.name}`
  const reconnectKey = `reconnect:${server.name}`
  const removeKey = `remove:${server.name}`
  const busy = pendingAction === authKey || pendingAction === reconnectKey || pendingAction === removeKey
  const removable = server.scope === 'project' || server.scope === 'user' || server.scope === 'local'
  const needsAuth = server.status === 'needs-auth'

  return (
    <div className={`${s.card} ${needsAuth ? s.cardWarn : ''}`}>
      <div className={s.cardTop}>
        <span className={`${s.cardDot} ${DOT_CLASS[server.status] ?? ''}`} />
        <span className={s.cardName}>{server.name}</span>
        <span className={`${s.cardState} ${STATUS_CLASS[server.status] ?? ''}`}>
          {statusText(t)[server.status] ?? server.status}
        </span>
      </div>

      <div className={s.cardCommand} data-tooltip={server.command}>
        {server.command}
      </div>

      {/* The reason for a failure is shown right here: without it "failed" sends one off to read logs
          although the CLI has already explained everything. */}
      {server.error ? <div className={s.cardError}>{server.error}</div> : null}

      <div className={s.cardActions}>
        {needsAuth ? (
          <button
            type="button"
            className={`${s.button} ${s.buttonPrimary}`}
            disabled={busy}
            onClick={() => {
              onAction(authKey)
              onAuthenticate(server.name)
            }}
          >
            {pendingAction === authKey ? t.mcp.opening : t.mcp.authenticate}
          </button>
        ) : null}

        <button
          type="button"
          className={s.button}
          disabled={busy}
          onClick={() => {
            onAction(reconnectKey)
            onReconnect(server.name)
          }}
        >
          {pendingAction === reconnectKey ? t.mcp.reconnecting : server.status === 'failed' ? t.mcp.retry : t.mcp.reconnect}
        </button>

        {removable ? (
          <button
            type="button"
            className={`${s.button} ${s.buttonDanger}`}
            disabled={busy}
            onClick={() => {
              onAction(removeKey)
              onRemove(server.name)
            }}
          >
            {pendingAction === removeKey ? t.mcp.removing : t.mcp.remove}
          </button>
        ) : null}
      </div>
    </div>
  )
}
