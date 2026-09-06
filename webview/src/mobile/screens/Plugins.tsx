import { useState } from 'react'
import type { AvailablePluginInfo, InstalledPluginInfo, PluginMarketplaceInfo } from '../../protocol'
import { Back } from './Back'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

type Tab = 'installed' | 'browse' | 'markets'

interface PluginsProps {
  /** null means the answer has not arrived yet - it is asked for when this screen opens. */
  installed: InstalledPluginInfo[] | null
  available: AvailablePluginInfo[]
  marketplaces: PluginMarketplaceInfo[] | null
  project: string
  onBack: () => void
}

/**
 * The plugins of the project on screen - read, and only read.
 *
 * What it buys is the question somebody in front of a conversation actually has: which skills and
 * commands this agent has at all, and which of them somebody switched off. Installing, enabling and
 * disabling are refused over the wire (see RemoteCommands): they fetch and run somebody else's code on
 * the work machine, or silently change what the agent there may do - and unlike a line in an MCP config
 * that is not a decision with a blast radius anybody can see from a sofa.
 *
 * Three tabs rather than three screens, because they are three views of one list and switching between
 * them is the comparison a person came to make.
 */
export const Plugins = ({ installed, available, marketplaces, project, onBack }: PluginsProps) => {
  const t = useT()
  const [tab, setTab] = useState<Tab>('installed')
  const [query, setQuery] = useState('')

  const matches = query.trim()
    ? available.filter((plugin) =>
        `${plugin.name} ${plugin.description}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : available

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{t.menu.rows.plugins.label}</span>
            <span className={m.threadWhere}>{project}</span>
          </span>
        </div>

        <div className={m.segmented}>
          {(['installed', 'browse', 'markets'] as const).map((one) => (
            <button
              key={one}
              type="button"
              className={`${m.segment} ${tab === one ? m.segmentOn : ''}`}
              onClick={() => setTab(one)}
            >
              {t.mobile.plugins.tabs[one]}
            </button>
          ))}
        </div>
      </header>

      <div className={m.list}>
        <p className={m.screenNote}>{t.mobile.plugins.readOnly}</p>

        {installed === null && <p className={m.empty}>{t.common.loading}</p>}

        {tab === 'installed' && installed !== null && (
          installed.length === 0 ? (
            <p className={m.empty}>{t.mobile.plugins.noneInstalled}</p>
          ) : (
            <div className={m.card}>
              {installed.map((plugin) => (
                <div key={plugin.id} className={`${m.pluginRow} ${plugin.enabled ? '' : m.pluginRowOff}`}>
                  <span className={`${m.dot} ${plugin.enabled ? m.dotLive : ''}`} />
                  <span className={m.pluginText}>
                    <span className={m.pluginName}>{plugin.id}</span>
                    <span className={m.pluginMeta}>
                      {[plugin.version, plugin.scope].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={plugin.enabled ? m.pluginOn : m.pluginOff}>
                    {plugin.enabled ? t.mobile.plugins.on : t.mobile.plugins.off}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'browse' && (
          <>
            <div className={m.formRow}>
              <input
                className={m.input}
                placeholder={t.mobile.plugins.search}
                value={query}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {matches.length === 0 ? (
              <p className={m.empty}>{t.mobile.plugins.nothingFound}</p>
            ) : (
              <div className={m.card}>
                {matches.map((plugin) => (
                  <div key={plugin.id} className={m.pluginRow}>
                    <span className={m.pluginText}>
                      <span className={m.pluginName}>{plugin.name}</span>
                      <span className={m.pluginMeta}>{plugin.description}</span>
                      <span className={m.pluginMeta}>{plugin.marketplace}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* The catalogue is cut to what a relay frame carries (see RemoteFeed.forPhone). Said out
                loud rather than left to look like the end of the list: a truncation nobody mentions
                reads as "that is all there is". */}
            <p className={m.screenNote}>{t.mobile.plugins.trimmed}</p>
          </>
        )}

        {tab === 'markets' && (
          marketplaces === null || marketplaces.length === 0 ? (
            <p className={m.empty}>{t.mobile.plugins.noMarkets}</p>
          ) : (
            <div className={m.card}>
              {marketplaces.map((market) => (
                <div key={market.name} className={m.pluginRow}>
                  <span className={m.pluginText}>
                    <span className={m.pluginName}>{market.name}</span>
                    {/* A marketplace kept in a folder on that machine arrives named as a folder rather
                        than by its path - a path is the one thing that never leaves (see RemoteFeed). */}
                    <span className={m.pluginMeta}>{market.source}</span>
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </>
  )
}
