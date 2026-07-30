import { useEffect, useState } from 'react'
import type { McpServerInfo } from '../protocol'
import { SkeletonBar } from './Skeleton'
import s from './shell.module.css'

interface McpProps {
  servers: McpServerInfo[]
  loading: boolean
  message: { ok: boolean; text: string } | null
  onRefresh: () => void
  onReconnect: (name: string) => void
  onEnable: (name: string) => void
  onDisable: (name: string) => void
  onRemove: (name: string) => void
  onAdd: (name: string, command: string, transport: string) => void
  onClose: () => void
}

const ADD_SERVER_KEY = 'add-server'
const TRANSPORTS = ['stdio', 'sse', 'http'] as const

/**
 * Список MCP-серверов и управление ими — тот же набор, что `claude mcp` в
 * терминале, но кнопками. Reconnect/enable/disable — не отсюда напрямую: своей
 * управляющей команды для них в CLI нет, только слэш-команда внутри разговора,
 * поэтому эти три идут обычным промптом в активную вкладку (см. App.tsx), а
 * список и add/remove — отдельными разовыми вызовами `claude mcp ...`.
 */
export const Mcp = ({
  servers,
  loading,
  message,
  onRefresh,
  onReconnect,
  onEnable,
  onDisable,
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

  return (
    <>
      <div className={s.menuScrim} onClick={onClose} />
      <div className={s.mcp}>
        <div className={s.historyHead}>
          <span className={s.historyLabel}>MCP SERVERS</span>
          <span className={s.historyHint}>status · reconnect · add · remove</span>
          <div className={s.spacer} />
          <button type="button" className={s.mcpRefresh} onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {message ? (
          <div className={message.ok ? s.mcpMessageOk : s.mcpMessageError}>{message.text}</div>
        ) : null}

        <div className={s.mcpBody}>
          {loading && servers.length === 0
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
                  <div className={s.mcpActions}>
                    <SkeletonBar width={66} height={20} />
                    <SkeletonBar width={54} height={20} />
                    <SkeletonBar width={54} height={20} />
                  </div>
                </div>
              ))
            : null}

          {servers.length === 0 && !loading ? (
            <div className={s.historyEmpty}>No MCP servers configured.</div>
          ) : null}

          {servers.map((server) => {
            const disabledServer = server.status.toLowerCase().includes('disabled')
            const reconnectKey = `reconnect:${server.name}`
            const enableKey = `enable:${server.name}`
            const disableKey = `disable:${server.name}`
            const removeKey = `remove:${server.name}`
            const busy =
              pendingAction === reconnectKey ||
              pendingAction === enableKey ||
              pendingAction === disableKey ||
              pendingAction === removeKey

            return (
              <div key={server.name} className={s.mcpItem}>
                <div className={s.mcpItemHead}>
                  <span className={`${s.mcpDot} ${server.connected ? s.mcpDotOn : s.mcpDotOff}`} />
                  <span className={s.mcpName}>{server.name}</span>
                  <span className={s.mcpStatusText}>{server.status}</span>
                </div>
                <div className={s.mcpCommand} title={server.command}>
                  {server.command}
                </div>
                <div className={s.mcpActions}>
                  <button
                    type="button"
                    className={s.mcpAction}
                    disabled={busy}
                    onClick={() => {
                      setPendingAction(reconnectKey)
                      onReconnect(server.name)
                    }}
                  >
                    {pendingAction === reconnectKey ? 'Reconnecting…' : 'Reconnect'}
                  </button>
                  {disabledServer ? (
                    <button
                      type="button"
                      className={s.mcpAction}
                      disabled={busy}
                      onClick={() => {
                        setPendingAction(enableKey)
                        onEnable(server.name)
                      }}
                    >
                      {pendingAction === enableKey ? 'Enabling…' : 'Enable'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={s.mcpAction}
                      disabled={busy}
                      onClick={() => {
                        setPendingAction(disableKey)
                        onDisable(server.name)
                      }}
                    >
                      {pendingAction === disableKey ? 'Disabling…' : 'Disable'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${s.mcpAction} ${s.mcpActionDanger}`}
                    disabled={busy}
                    onClick={() => {
                      setPendingAction(removeKey)
                      onRemove(server.name)
                    }}
                  >
                    {pendingAction === removeKey ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            )
          })}
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
