import type { ToolGroupItem } from '../../feed/types'
import type { CardState } from '../../hooks/useCardState'
import s from '../feed.module.css'
import { CHIP_CLASS, ToolCard } from './ToolCard'

interface ToolGroupCardProps {
  item: ToolGroupItem
  cards: CardState
  /** id вызова, который прямо сейчас ждёт твоего решения — если такой есть среди детей группы. */
  awaitingPermissionId: string | undefined
}

export const ToolGroupCard = ({ item, cards, awaitingPermissionId }: ToolGroupCardProps) => {
  // Один вызов подряд — рисуем его как обычную одиночную карточку, без рамки
  // группы: сворачивать нечего, а лишняя стрелочка только мешала бы.
  if (item.tools.length === 1) {
    const tool = item.tools[0]!
    return (
      <ToolCard
        item={tool}
        open={cards.isOpen(tool.id)}
        appliedHunks={cards.appliedHunks}
        awaitingPermission={tool.id === awaitingPermissionId}
        onToggle={() => cards.toggle(tool.id)}
        onAcceptHunk={cards.applyHunk}
        onRejectHunk={cards.rejectHunk}
      />
    )
  }

  const open = cards.isOpen(item.id)
  const current = item.tools.at(-1)!
  const currentAwaited = current.id === awaitingPermissionId

  return (
    <div className={s.toolGroup}>
      <button type="button" className={s.toolGroupHead} onClick={() => cards.toggle(item.id)}>
        <span className={`${s.caret} ${open ? s.caretOpen : ''}`}>▶</span>

        {item.pending ? (
          <>
            <span className={`${s.toolChip} ${CHIP_CLASS[current.chip]}`}>{current.chip}</span>
            <span className={s.toolTarget}>{current.target}</span>
            <span className={`${s.toolMeta} ${currentAwaited ? s.waiting : s.running}`}>
              {currentAwaited ? '· waiting for you' : '· running'}
            </span>
          </>
        ) : (
          <span className={s.toolTarget}>{item.tools.length} tools</span>
        )}

        <div className={s.spacer} />
        {item.pending ? <span className={s.toolMeta}>{item.tools.length} tools</span> : null}
        <span className={s.toolDur}>{item.duration}</span>
      </button>

      {open ? (
        <div className={s.toolGroupBody}>
          {item.tools.map((tool) => (
            <ToolCard
              key={tool.id}
              item={tool}
              open={cards.isOpen(tool.id)}
              appliedHunks={cards.appliedHunks}
              awaitingPermission={tool.id === awaitingPermissionId}
              onToggle={() => cards.toggle(tool.id)}
              onAcceptHunk={cards.applyHunk}
              onRejectHunk={cards.rejectHunk}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
