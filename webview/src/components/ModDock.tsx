import { useEffect, useState } from 'react'
import type { ModPane, ModToast } from '../feed/types'
import { useNow } from '../hooks/useNow'
import { useT } from '../i18n'
import s from './modDock.module.css'

interface ModDockProps {
  /** A status line per mod, by its name - see PanelState.modStatus. */
  status: Record<string, string> | undefined
  /** The panes the mods hold open, which nothing here can draw - see PanelState.modPanes. */
  panes: ModPane[] | undefined
  /** The last toast, shown until it runs out - see PanelState.modToast. */
  toast: ModToast | undefined
}

/**
 * What a conversation's mods have to say, over the field: the toast, a status line per mod, and a word about
 * every pane one holds open.
 *
 * The terminal puts these in three places - a corner, a row under the prompt, a pane beside the transcript.
 * The panel has none of them free, and the field is where a person is looking when a mod speaks, so they
 * share one card in the stack above it, beside the questions and the task list. The mods' words are drawn as
 * they wrote them; only the pane gets a sentence of ours, because the pane itself cannot be drawn here, and a
 * mod holding a tool call on its buttons (see feed/mods.ts) left the turn standing with nothing to say why.
 *
 * Nothing at all for a conversation without a mod: none of the three exists until one speaks. Its own styles
 * rather than the composer's, because the phone draws the same card over its own field.
 */
export const ModDock = ({ status, panes, toast }: ModDockProps) => {
  const t = useT()
  const now = useNow()
  // A toast goes when it runs out, and nothing else would redraw the card at that moment.
  const [, expire] = useState(0)

  const toastLeft = toast ? toast.until - now() : 0
  useEffect(() => {
    if (!toast || toastLeft <= 0) return
    const timer = setTimeout(() => expire((count) => count + 1), toastLeft)
    return () => clearTimeout(timer)
  }, [toast, toastLeft])

  const lines = Object.entries(status ?? {})
  const open = panes ?? []
  const toasting = toast !== undefined && toastLeft > 0
  if (!toasting && lines.length === 0 && open.length === 0) return null

  return (
    <div className={s.dock} role="status" aria-label={t.feed.mods.label}>
      <span className={s.label}>{t.feed.mods.label}</span>

      {toasting ? (
        <div className={`${s.row} ${s.toast}`}>
          <span className={s.name}>{toast.plugin}</span>
          <span className={s.text}>{toast.text}</span>
        </div>
      ) : null}

      {lines.map(([plugin, text]) => (
        <div key={plugin} className={`${s.row} ${s.status}`}>
          <span className={s.name}>{plugin}</span>
          <span className={s.text}>{text}</span>
        </div>
      ))}

      {open.map((pane) => (
        <div key={pane.id} className={`${s.row} ${s.pane}`}>
          {t.feed.mods.pane(paneName(pane))}
        </div>
      ))}
    </div>
  )
}

/** A pane by its title, with the mod beside it when the two differ - "Blast Radius (blast-radius)". */
const paneName = (pane: ModPane): string => {
  const title = pane.title.trim()
  const plugin = pane.plugin.trim()
  if (!title) return plugin || pane.id
  return plugin && plugin !== title ? `${title} (${plugin})` : title
}
