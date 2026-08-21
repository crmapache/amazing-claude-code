import { useLayoutEffect, useRef } from 'react'
import type { TaskItem } from '../feed/types'
import s from './feed.module.css'

interface AgentStreamViewProps {
  /** The agent currently opened by a chip - or nothing while no tab is chosen. */
  item: TaskItem | undefined
}

/**
 * The output area when a particular agent's chip is selected rather than main - simply its log, in the
 * same plain text as an ordinary answer in the main feed. No card with a header, no percentage progress
 * bar: in the real terminal Claude Code a subagent has nothing at all beyond a timer - the percentage is
 * already an extension on top, and it is visible on the chip anyway, so duplicating it here serves
 * nothing.
 */
export const AgentStreamView = ({ item }: AgentStreamViewProps) => {
  const body = useRef<HTMLDivElement | null>(null)

  // A live agent's growing log sticks to the bottom, like the main feed - otherwise watching a working
  // agent would mean scrolling down by hand on every new step.
  useLayoutEffect(() => {
    const element = body.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [item?.id, item?.log.length])

  if (!item) return null

  return (
    <div className={s.agentViewBody} ref={body}>
      {item.log.map((line, index) => (
        <div
          key={index}
          className={`${s.agentViewLine} ${line.tone === 'ok' ? s.agentViewOk : ''} ${line.tone === 'bad' ? s.agentViewBad : ''} ${line.tone === 'dim' ? s.agentViewDim : ''}`}
        >
          {line.text}
        </div>
      ))}
      {/* It ticks by the same shared tick mechanism as this agent's chip in the header (see
          tickDurations in feed/build.ts) - we simply show the same value here rather than only on the
          chip. */}
      {item.pending ? <div className={s.agentViewWorking}>Working · {item.duration || '0.0s'}</div> : null}
    </div>
  )
}
