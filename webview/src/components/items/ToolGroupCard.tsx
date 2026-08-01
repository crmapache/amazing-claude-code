import { useEffect, useState } from 'react'
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

/**
 * Между вызовами внутри одного «взрыва» группа на мгновение честно становится
 * не pending — предыдущий вызов уже разрешился, следующий ещё не начался (см.
 * appendToolCall в build.ts). Без задержки это дёргает заголовок между именем
 * инструмента и счётчиком «N tools» на каждом таком зазоре. Задержка даёт
 * следующему вызову шанс прилететь и отменить схлопывание, не показывая
 * счётчик зазря.
 */
const COLLAPSE_DELAY_MS = 300

export const ToolGroupCard = ({ item, cards, awaitingPermissionId }: ToolGroupCardProps) => {
  const [collapsed, setCollapsed] = useState(!item.pending)

  useEffect(() => {
    if (item.pending) {
      setCollapsed(false)
      return
    }
    const timer = window.setTimeout(() => setCollapsed(true), COLLAPSE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [item.pending])

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

        {!collapsed ? (
          <>
            <span className={`${s.toolChip} ${CHIP_CLASS[current.chip]}`}>{current.chip}</span>
            <span className={s.toolTarget}>{current.target}</span>
            {item.pending ? (
              <span className={`${s.toolMeta} ${currentAwaited ? s.waiting : s.running}`}>
                {currentAwaited ? '· waiting for you' : '· running'}
              </span>
            ) : null}
          </>
        ) : (
          <span className={s.toolTarget}>{item.tools.length} tools</span>
        )}

        <div className={s.spacer} />
        {!collapsed ? <span className={s.toolMeta}>{item.tools.length} tools</span> : null}
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
