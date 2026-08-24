import { useEffect, useMemo, useState } from 'react'
import type { AvailablePluginInfo, InstalledPluginInfo, PluginMarketplaceInfo } from '../protocol'
import { SkeletonBar } from './Skeleton'
import s from './sideMenu.module.css'

type View = 'installed' | 'browse' | 'marketplaces'

interface PluginsProps {
  /** null means the list has not arrived yet: it loads by itself, long before the screen is opened. */
  installed: InstalledPluginInfo[] | null
  available: AvailablePluginInfo[] | null
  marketplaces: PluginMarketplaceInfo[] | null
  /** A request worth saying out loud is under way: a refresh from the button. */
  loading: boolean
  message: { ok: boolean; text: string } | null
  onRefresh: () => void
  onInstall: (plugin: string) => void
  onUninstall: (plugin: string) => void
  onEnable: (plugin: string) => void
  onDisable: (plugin: string) => void
  onAddMarketplace: (source: string) => void
  onRemoveMarketplace: (name: string) => void
  onDismissMessage: () => void
}

/** 1636 → "1.6k": the install counter runs to four digits while the card is narrow. */
const formatCount = (count: number) => (count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count))

/** " (3)" beside a tab's name - but only once the list has genuinely arrived: there must be no zero before it loads. */
const tabCount = (items: unknown[] | null) => (items ? ` (${items.length})` : '')

const BROWSE_LIMIT = 30
const ADD_MARKETPLACE_KEY = 'add-marketplace'

/**
 * Plugins and marketplaces - the same screen as the MCP servers one, but with one fundamental
 * difference: install/uninstall/enable/disable are the CLI's own subcommands (see ClaudePlugin.kt), and
 * `claude plugin list --available` genuinely hands over the catalogue of every plugin in the connected
 * marketplaces - which is why there is a real search here, impossible for MCP servers.
 */
export const Plugins = ({
  installed,
  available,
  marketplaces,
  loading,
  message,
  onRefresh,
  onInstall,
  onUninstall,
  onEnable,
  onDisable,
  onAddMarketplace,
  onRemoveMarketplace,
  onDismissMessage,
}: PluginsProps) => {
  const [view, setView] = useState<View>('installed')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  /**
   * What is currently in progress - a key of the form "install:id". The response to a click has to be
   * instant: the button dims and changes its caption at once, without waiting for the CLI's answer, which
   * may take a couple of seconds (the network, a git clone of the plugin).
   */
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  // We clear "in progress" only when a real outcome has arrived rather than when the banner went out
  // because a tab was switched - otherwise an Install still waiting for its answer would unblock too
  // early.
  useEffect(() => {
    if (message) setPendingAction(null)
  }, [message])

  const switchView = (next: View) => {
    setView(next)
    onDismissMessage()
  }

  const installedIds = useMemo(() => new Set((installed ?? []).map((plugin) => plugin.id)), [installed])

  const browseResults = useMemo(() => {
    const notInstalled = (available ?? []).filter((plugin) => !installedIds.has(plugin.id))
    const trimmed = query.trim().toLowerCase()

    const matches = trimmed
      ? notInstalled.filter(
          (plugin) =>
            plugin.name.toLowerCase().includes(trimmed) || plugin.description.toLowerCase().includes(trimmed),
        )
      : [...notInstalled].sort((a, b) => b.installCount - a.installCount)

    return matches.slice(0, BROWSE_LIMIT)
  }, [available, installedIds, query])

  return (
    <div className={s.screen}>
      <div className={s.tabs}>
        <button
          type="button"
          className={`${s.tab} ${view === 'installed' ? s.tabOn : ''}`}
          onClick={() => switchView('installed')}
        >
          Installed{tabCount(installed)}
        </button>
        <button
          type="button"
          className={`${s.tab} ${view === 'browse' ? s.tabOn : ''}`}
          onClick={() => switchView('browse')}
        >
          Browse{tabCount(available)}
        </button>
        <button
          type="button"
          className={`${s.tab} ${view === 'marketplaces' ? s.tabOn : ''}`}
          onClick={() => switchView('marketplaces')}
        >
          Markets{tabCount(marketplaces)}
        </button>
      </div>

      {message ? (
        <div className={message.ok ? `${s.message} ${s.messageOk}` : `${s.message} ${s.messageBad}`}>
          {message.text}
        </div>
      ) : null}

      {view === 'installed' ? (
        <>
          {installed === null
            ? [0, 1, 2].map((row) => (
                <div key={row} className={s.card}>
                  <div className={s.cardTop}>
                    <SkeletonBar width={6} height={6} round />
                    <SkeletonBar width="42%" />
                  </div>
                  <div className={s.cardActions}>
                    <SkeletonBar width={58} height={20} />
                    <SkeletonBar width={70} height={20} />
                  </div>
                </div>
              ))
            : null}

          {installed?.length === 0 ? <div className={s.screenEmpty}>No plugins installed.</div> : null}

          {installed?.map((plugin) => {
            const enableKey = `enable:${plugin.id}`
            const disableKey = `disable:${plugin.id}`
            const uninstallKey = `uninstall:${plugin.id}`
            const busy = pendingAction === enableKey || pendingAction === disableKey || pendingAction === uninstallKey

            return (
              <div key={plugin.id} className={s.card}>
                <div className={s.cardTop}>
                  <span className={`${s.cardDot} ${plugin.enabled ? s.cardDotOn : ''}`} />
                  <span className={s.cardName}>{plugin.id}</span>
                  <span className={s.cardMeta}>
                    {plugin.version} · {plugin.scope}
                  </span>
                </div>
                <div className={s.cardActions}>
                  {plugin.enabled ? (
                    <button
                      type="button"
                      className={s.button}
                      disabled={busy}
                      onClick={() => {
                        setPendingAction(disableKey)
                        onDisable(plugin.id)
                      }}
                    >
                      {pendingAction === disableKey ? 'Disabling…' : 'Disable'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={s.button}
                      disabled={busy}
                      onClick={() => {
                        setPendingAction(enableKey)
                        onEnable(plugin.id)
                      }}
                    >
                      {pendingAction === enableKey ? 'Enabling…' : 'Enable'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${s.button} ${s.buttonDanger}`}
                    disabled={busy}
                    onClick={() => {
                      setPendingAction(uninstallKey)
                      onUninstall(plugin.id)
                    }}
                  >
                    {pendingAction === uninstallKey ? 'Uninstalling…' : 'Uninstall'}
                  </button>
                </div>
              </div>
            )
          })}

          <button type="button" className={`${s.button} ${s.buttonWide}`} onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </>
      ) : null}

      {view === 'browse' ? (
        <>
          <input
            className={s.input}
            placeholder="Search plugins by name or description…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />

          {available === null
            ? [0, 1, 2].map((row) => (
                <div key={row} className={s.card}>
                  <div className={s.cardTop}>
                    <SkeletonBar width="46%" />
                  </div>
                  <SkeletonBar width="80%" height={9} />
                  <div className={s.cardActions}>
                    <SkeletonBar width={90} height={16} />
                    <SkeletonBar width={64} height={20} />
                  </div>
                </div>
              ))
            : null}

          {available !== null && browseResults.length === 0 ? (
            <div className={s.screenEmpty}>
              {available.length === 0 ? 'No marketplaces connected.' : 'No matches.'}
            </div>
          ) : null}

          {browseResults.map((plugin) => {
            const installKey = `install:${plugin.id}`
            const busy = pendingAction === installKey

            return (
              <div key={plugin.id} className={s.card}>
                <div className={s.cardTop}>
                  <span className={s.cardName}>{plugin.name}</span>
                  <span className={s.cardMeta}>{formatCount(plugin.installCount)} installs</span>
                </div>
                <div className={s.screenNote}>{plugin.description}</div>
                <div className={s.cardActions}>
                  <span className={s.cardState}>{plugin.marketplace}</span>
                  <button
                    type="button"
                    className={s.button}
                    disabled={busy}
                    onClick={() => {
                      setPendingAction(installKey)
                      onInstall(plugin.id)
                    }}
                  >
                    {busy ? 'Installing…' : 'Install'}
                  </button>
                </div>
              </div>
            )
          })}

          {browseResults.length === BROWSE_LIMIT ? (
            <div className={s.screenNote}>Showing first {BROWSE_LIMIT} matches - narrow your search for more.</div>
          ) : null}
        </>
      ) : null}

      {view === 'marketplaces' ? (
        <>
          {marketplaces === null
            ? [0, 1].map((row) => (
                <div key={row} className={s.card}>
                  <SkeletonBar width="38%" />
                  <SkeletonBar width="62%" height={9} />
                  <div className={s.cardActions}>
                    <SkeletonBar width={64} height={20} />
                  </div>
                </div>
              ))
            : null}

          {marketplaces?.length === 0 ? <div className={s.screenEmpty}>No marketplaces configured.</div> : null}

          {marketplaces?.map((marketplace) => {
            const removeKey = `remove-marketplace:${marketplace.name}`
            const busy = pendingAction === removeKey

            return (
              <div key={marketplace.name} className={s.card}>
                <div className={s.cardTop}>
                  <span className={s.cardName}>{marketplace.name}</span>
                </div>
                <div className={s.cardCommand} title={marketplace.source}>
                  {marketplace.source}
                </div>
                <div className={s.cardActions}>
                  <button
                    type="button"
                    className={`${s.button} ${s.buttonDanger}`}
                    disabled={busy}
                    onClick={() => {
                      setPendingAction(removeKey)
                      onRemoveMarketplace(marketplace.name)
                    }}
                  >
                    {busy ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            )
          })}

          <form
            className={s.field}
            onSubmit={(event) => {
              event.preventDefault()
              if (!source.trim()) return

              setPendingAction(ADD_MARKETPLACE_KEY)
              onAddMarketplace(source.trim())
              setSource('')
            }}
          >
            <span className={s.screenLabel}>ADD MARKETPLACE</span>
            <input
              className={s.input}
              placeholder="URL, path, or owner/repo on GitHub"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
            <button
              type="submit"
              className={`${s.button} ${s.buttonPrimary} ${s.buttonEnd}`}
              disabled={pendingAction === ADD_MARKETPLACE_KEY}
            >
              {pendingAction === ADD_MARKETPLACE_KEY ? 'Adding…' : 'Add'}
            </button>
          </form>
        </>
      ) : null}
    </div>
  )
}
