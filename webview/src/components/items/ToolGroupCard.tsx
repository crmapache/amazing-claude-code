import { useEffect, useState } from 'react'
import type { ToolGroupItem } from '../../feed/types'
import type { CardState } from '../../hooks/useCardState'
import s from '../feed.module.css'
import { CHIP_CLASS, ToolCard } from './ToolCard'
import { Caret } from './Caret'
import { useT } from '../../i18n'

interface ToolGroupCardProps {
  item: ToolGroupItem
  cards: CardState
  /** The id of the call awaiting your decision right now - when there is one among the group's children. */
  awaitingPermissionId: string | undefined
}

/**
 * Between calls inside one "burst" the group honestly becomes non-pending for a moment - the previous
 * call has resolved and the next has not begun yet (see appendToolCall in build.ts). Without a delay that
 * jerks the header between a tool's name and the "N tools" counter on every such gap. The delay gives the
 * next call a chance to arrive and cancel the collapse without showing the counter for nothing.
 */
const COLLAPSE_DELAY_MS = 300

export const ToolGroupCard = ({ item, cards, awaitingPermissionId }: ToolGroupCardProps) => {
  const t = useT()
  const [collapsed, setCollapsed] = useState(!item.pending)

  useEffect(() => {
    if (item.pending) {
      setCollapsed(false)
      return
    }
    const timer = window.setTimeout(() => setCollapsed(true), COLLAPSE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [item.pending])

  // A single call in a row is drawn as an ordinary standalone card, without the group's frame: there is
  // nothing to collapse, and an extra arrow would only get in the way.
  if (item.tools.length === 1) {
    const tool = item.tools[0]!
    return (
      <ToolCard
        item={tool}
        open={cards.isOpen(tool.id)}
        awaitingPermission={tool.id === awaitingPermissionId}
        onToggle={() => cards.toggle(tool.id)}
      />
    )
  }

  const open = cards.isOpen(item.id)
  const current = item.tools.at(-1)!
  const currentAwaited = current.id === awaitingPermissionId

  return (
    <div className={s.toolGroup}>
      <button type="button" className={s.toolGroupHead} onClick={() => cards.toggle(item.id)}>
        <Caret open={open} />

        {!collapsed ? (
          <>
            <span className={`${s.toolChip} ${CHIP_CLASS[current.chip]}`}>{current.chip}</span>
            <span className={s.toolTarget}>{current.target}</span>
            {item.pending ? (
              <span className={`${s.toolMeta} ${currentAwaited ? s.waiting : s.running}`}>
                {currentAwaited ? t.feed.tool.waitingForYou : t.feed.tool.running}
              </span>
            ) : null}
          </>
        ) : (
          <span className={s.toolTarget}>{t.feed.tool.count(item.tools.length)}</span>
        )}

        <div className={s.spacer} />
        {!collapsed ? <span className={s.toolMeta}>{t.feed.tool.count(item.tools.length)}</span> : null}
        <span className={s.toolDur}>{item.duration}</span>
      </button>

      {open ? (
        <div className={s.toolGroupBody}>
          {item.tools.map((tool) => (
            <ToolCard
              key={tool.id}
              item={tool}
              open={cards.isOpen(tool.id)}
              awaitingPermission={tool.id === awaitingPermissionId}
              onToggle={() => cards.toggle(tool.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
