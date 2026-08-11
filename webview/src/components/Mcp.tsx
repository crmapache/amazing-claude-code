import { useEffect, useState } from 'react'
import type { McpServerInfo } from '../protocol'
import { SkeletonBar } from './Skeleton'
import s from './shell.module.css'

interface McpProps {
  /** null — список ещё не приходил: он загружается сам, задолго до открытия вкладки. */
  servers: McpServerInfo[] | null
  /** Идёт запрос, о котором стоит сказать вслух: обновление по кнопке. */
  loading: boolean
  message: { ok: boolean; text: string } | null
  onRefresh: () => void
  onReconnect: (name: string) => void
  onAuthenticate: (name: string) => void
  onRemove: (name: string) => void
  onAdd: (name: string, command: string, transport: string) => void
  onClose: () => void
}

const ADD_SERVER_KEY = 'add-server'
const TRANSPORTS = ['stdio', 'sse', 'http'] as const

/**
 * Как называется каждое состояние на экране. Слова — те же, что печатает
 * терминальный `/mcp`: панель и терминал показывают одно и то же, и разными
 * словами звать это нельзя.
 */
const STATUS_TEXT: Record<string, string> = {
  connected: 'connected',
  'needs-auth': 'needs authentication',
  failed: 'failed',
  pending: 'connecting…',
  disabled: 'disabled',
}

const STATUS_CLASS: Record<string, string> = {
  connected: s.mcpStatusOk ?? '',
  'needs-auth': s.mcpStatusWarn ?? '',
  failed: s.mcpStatusBad ?? '',
  pending: s.mcpStatusIdle ?? '',
  disabled: s.mcpStatusIdle ?? '',
}

/**
 * Группы — те же, что в терминале, и в том же порядке: сначала то, что
 * настроено под этот проект, потом личное, потом коннекторы claude.ai, потом
 * встроенное и пришедшее с плагинами.
 */
const GROUPS: { scope: string; title: string; hint: string }[] = [
  { scope: 'project', title: 'PROJECT', hint: '.mcp.json of this project' },
  { scope: 'local', title: 'THIS PROJECT ONLY', hint: 'yours, not shared with the repo' },
  { scope: 'user', title: 'USER', hint: '~/.claude.json' },
  { scope: 'claudeai', title: 'CLAUDE.AI', hint: 'connectors of your account' },
  { scope: 'dynamic', title: 'BUILT-IN & PLUGINS', hint: 'always available' },
]

/**
 * MCP-серверы: тот же экран, что `/mcp` в терминале — кто подключён, кому нужен
 * вход, кто упал и почему, — плюс добавление и удаление, которых в терминале
 * нет вовсе.
 *
 * Статусы и области приходят от самого CLI (см. McpServerInfo): панель ничего
 * не додумывает, она только раскладывает их по группам и рисует кнопку под то
 * действие, которое этому серверу и правда доступно.
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
  onClose,
}: McpProps) => {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [transport, setTransport] = useState('stdio')
  /**
   * Что сейчас в работе — ключ вида "remove:name". Отклик обязан быть
   * мгновенным: кнопка гаснет и меняет подпись сразу, не дожидаясь ответа CLI.
   */
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  // Снимаем "в работе" только когда пришёл настоящий итог — иначе баннер,
  // погасший по другой причине, разблокировал бы кнопку раньше времени.
  useEffect(() => {
    if (message) setPendingAction(null)
  }, [message])

  // Группы, в которых никого нет, не рисуем вовсе: пустой заголовок «PROJECT»
  // говорил бы, что у проекта что-то настроено, хотя там пусто.
  const groups = GROUPS.map((group) => ({
    ...group,
    servers: servers?.filter((server) => server.scope === group.scope) ?? [],
  })).filter((group) => group.servers.length > 0)

  // Область, которую мы не знаем в лицо, всё равно обязана быть видна — иначе
  // сервер просто пропал бы с экрана, хотя CLI о нём рассказал.
  const known = new Set(GROUPS.map((group) => group.scope))
  const rest = servers?.filter((server) => !known.has(server.scope)) ?? []
  const shown = rest.length > 0 ? [...groups, { scope: 'other', title: 'OTHER', hint: '', servers: rest }] : groups

  return (
    <>
      <div className={s.menuScrim} onClick={onClose} />
      <div className={s.mcp}>
        <div className={s.historyHead}>
          <span className={s.historyLabel}>MCP SERVERS</span>
          <span className={s.historyHint}>
            {servers === null ? 'status · sign in · reconnect' : `${servers.length} servers`}
          </span>
          <div className={s.spacer} />
          <button type="button" className={s.mcpRefresh} onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {message ? (
          <div className={message.ok ? s.mcpMessageOk : s.mcpMessageError}>{message.text}</div>
        ) : null}

        <div className={s.mcpBody}>
          {servers === null
            ? [0, 1, 2].map((row) => (
                <div key={row} className={s.mcpItem}>
                  <div className={s.mcpItemHead}>
                    <SkeletonBar width={7} height={7} round />
                    <SkeletonBar width="34%" />
                    <div className={s.spacer} />
                    <SkeletonBar width="16%" height={9} />
                  </div>
                  <div className={s.mcpCommand}>
                    <SkeletonBar width="58%" height={9} />
                  </div>
                </div>
              ))
            : null}

          {servers?.length === 0 ? <div className={s.historyEmpty}>No MCP servers configured.</div> : null}

          {shown.map((group) => (
            <div key={group.scope} className={s.mcpGroup}>
              <div className={s.mcpGroupHead}>
                <span className={s.historyLabel}>{group.title}</span>
                {group.hint ? <span className={s.historyHint}>{group.hint}</span> : null}
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
        </div>

        <form
          className={s.mcpAddForm}
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim() || !command.trim()) return

            setPendingAction(ADD_SERVER_KEY)
            onAdd(name.trim(), command.trim(), transport)
            setName('')
            setCommand('')
          }}
        >
          <span className={s.historyLabel}>ADD SERVER</span>
          <div className={s.mcpAddRow}>
            <input
              className={s.mcpInput}
              placeholder="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className={s.transportToggle}>
              {TRANSPORTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${s.transportOption} ${transport === option ? s.transportOptionActive : ''}`}
                  onClick={() => setTransport(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <input
            className={s.mcpInput}
            placeholder="command, or URL for sse/http"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
          />
          <button type="submit" className={s.mcpAddButton} disabled={pendingAction === ADD_SERVER_KEY}>
            {pendingAction === ADD_SERVER_KEY ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>
    </>
  )
}

/**
 * Строка одного сервера. Кнопки — только те, что этому серверу и правда
 * доступны: вход просят там, где его ждут; удалить можно то, что лежит в
 * конфиге, а встроенное и пришедшее с плагином — нет (его удаляет плагин).
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
  const authKey = `auth:${server.name}`
  const reconnectKey = `reconnect:${server.name}`
  const removeKey = `remove:${server.name}`
  const busy = pendingAction === authKey || pendingAction === reconnectKey || pendingAction === removeKey
  const removable = server.scope === 'project' || server.scope === 'user' || server.scope === 'local'

  return (
    <div className={s.mcpItem}>
      <div className={s.mcpItemHead}>
        <span className={`${s.mcpDot} ${server.status === 'connected' ? s.mcpDotOn : s.mcpDotOff}`} />
        <span className={s.mcpName}>{server.name}</span>
        <span className={`${s.mcpStatusText} ${STATUS_CLASS[server.status] ?? ''}`}>
          {STATUS_TEXT[server.status] ?? server.status}
        </span>
      </div>

      <div className={s.mcpCommand} title={server.command}>
        {server.command}
      </div>

      {/* Причину отказа показываем прямо здесь: без неё «failed» отправляет
          читать логи, хотя CLI уже всё объяснил. */}
      {server.error ? <div className={s.mcpError}>{server.error}</div> : null}

      <div className={s.mcpActions}>
        {server.status === 'needs-auth' ? (
          <button
            type="button"
            className={`${s.mcpAction} ${s.mcpActionPrimary}`}
            disabled={busy}
            onClick={() => {
              onAction(authKey)
              onAuthenticate(server.name)
            }}
          >
            {pendingAction === authKey ? 'Opening…' : 'Authenticate'}
          </button>
        ) : null}

        <button
          type="button"
          className={s.mcpAction}
          disabled={busy}
          onClick={() => {
            onAction(reconnectKey)
            onReconnect(server.name)
          }}
        >
          {pendingAction === reconnectKey ? 'Reconnecting…' : server.status === 'failed' ? 'Retry' : 'Reconnect'}
        </button>

        {removable ? (
          <button
            type="button"
            className={`${s.mcpAction} ${s.mcpActionDanger}`}
            disabled={busy}
            onClick={() => {
              onAction(removeKey)
              onRemove(server.name)
            }}
          >
            {pendingAction === removeKey ? 'Removing…' : 'Remove'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
