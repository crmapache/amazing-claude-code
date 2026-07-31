import { useLayoutEffect, useRef } from 'react'
import type { TaskItem } from '../feed/types'
import s from './feed.module.css'

interface AgentStreamViewProps {
  /** Агент, открытый сейчас чипом — или ничего, пока вкладка не выбрана. */
  item: TaskItem | undefined
}

/**
 * Область вывода, когда выбран чип конкретного агента, а не main — просто
 * его лог, тем же простым текстом, что и обычный ответ в главной ленте. Ни
 * карточки с шапкой, ни бара прогресса в процентах: в настоящем терминальном
 * Claude Code у субагента нет вообще ничего, кроме таймера — сам процент это
 * уже расширение поверх, и он и так виден на чипе, здесь дублировать незачем.
 */
export const AgentStreamView = ({ item }: AgentStreamViewProps) => {
  const body = useRef<HTMLDivElement | null>(null)

  // Растущий лог живого агента липнет к низу, как основная лента — иначе
  // наблюдение за работающим агентом означало бы вручную домотку вниз на
  // каждый новый шаг.
  useLayoutEffect(() => {
    const element = body.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [item?.id, item?.log.length])

  if (!item) return null

  return (
    <div className={s.agentViewBody} ref={body}>
      {item.log.length === 0 ? (
        <div className={`${s.agentViewLine} ${s.agentViewDim}`}>Working…</div>
      ) : (
        item.log.map((line, index) => (
          <div
            key={index}
            className={`${s.agentViewLine} ${line.tone === 'ok' ? s.agentViewOk : ''} ${line.tone === 'bad' ? s.agentViewBad : ''} ${line.tone === 'dim' ? s.agentViewDim : ''}`}
          >
            {line.text}
          </div>
        ))
      )}
    </div>
  )
}
