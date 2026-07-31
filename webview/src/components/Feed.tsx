import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { parseParagraphs } from '../feed/markdown'
import type { AskItem, FeedItem, PermItem, TaskItem, TodoItem, ToolItem } from '../feed/types'
import type { CardState } from '../hooks/useCardState'
import s from './feed.module.css'
import { PlanCard } from './items/PlanCard'
import { CheckpointRow, CompactRow, CrashRow, MetaRow } from './items/Rows'
import { TaskCard } from './items/TaskCard'
import { TextCard } from './items/TextCard'
import { ToolGroupCard } from './items/ToolGroupCard'
import { UserCard } from './items/UserCard'
import { ScrollThumb } from './ScrollThumb'

/**
 * Список задач, вопрос агента и запрос разрешения в ленте не рисуются — за них
 * отвечают закреплённые панели над полем ввода (TaskListPanel/AskPanel/PermissionPanel).
 */
type FeedRowItem = Exclude<FeedItem, TodoItem | AskItem | PermItem>

interface FeedProps {
  items: FeedItem[]
  streamingText: string
  streaming: boolean
  streamStatus: string
  errors: string[]
  cards: CardState
  onPlanDecision: (itemId: string, decision: 'approve' | 'keepPlanning') => void
  onDismissError: (index: number) => void
  scrollRef?: (element: HTMLElement | null) => void
  onScroll?: () => void
}

export const Feed = ({
  items,
  streamingText,
  streaming,
  streamStatus,
  errors,
  cards,
  onPlanDecision,
  onDismissError,
  scrollRef,
  onScroll,
}: FeedProps) => {
  const view = useRef<HTMLElement | null>(null)

  /**
   * Список задач, вопрос агента и запрос разрешения в ленте не рисуются — за
   * них отвечают закреплённые панели над полем ввода. Карточка плана уходит
   * из ленты, как только по ней принято решение (в любую сторону) — она своё
   * дело сделала, а не остаётся висеть неактивной.
   */
  const rows = items.filter(
    (item): item is FeedRowItem =>
      item.kind !== 'todo' &&
      item.kind !== 'ask' &&
      item.kind !== 'perm' &&
      !(item.kind === 'plan' && cards.planDecisions[item.id] !== undefined),
  )

  /**
   * Пока где-то в ленте открыт неотвеченный запрос разрешения, самая свежая
   * «выполняется»-карточка на деле просто ждёт человека — агент вообще ещё не
   * начал команду. Без этой пометки обе ситуации выглядят одинаковым спиннером.
   */
  const awaitingPermission = items.some((item) => item.kind === 'perm' && item.decision === null)
  const lastPendingId = awaitingPermission
    ? items
        .flatMap<ToolItem | TaskItem>((item) => {
          if (item.kind === 'toolGroup') return item.tools.filter((tool) => tool.pending)
          if (item.kind === 'task' && item.pending) return [item]
          return []
        })
        .at(-1)?.id
    : undefined
  /** Пока пользователь не отмотал вверх сам, лента липнет к низу. */
  const stick = useRef(true)
  /** То же самое, но в состоянии — от него зависит, рисовать ли кнопку «вниз». */
  const [stuck, setStuck] = useState(true)

  const toBottom = useCallback(() => {
    const element = view.current
    if (!element || !stick.current) return

    element.scrollTop = element.scrollHeight
  }, [])

  useLayoutEffect(toBottom, [items, streamingText, errors.length, toBottom])

  /**
   * Число непрочитанных — то, что накопилось от агента, пока лента не липнет к
   * низу. Сообщения самого пользователя не считаем: он и так их видел, он их
   * только что написал. Пока лента липнет к низу, счётчик держим на нуле —
   * пользователь и так видит всё по мере поступления.
   */
  const seenCount = useRef(0)
  const unreadCount = rows.filter((item) => item.kind !== 'user').length

  useEffect(() => {
    if (stuck) seenCount.current = unreadCount
  }, [stuck, unreadCount])

  const unread = Math.max(0, unreadCount - seenCount.current)

  const jumpToBottom = () => {
    const element = view.current
    if (!element) return

    stick.current = true
    setStuck(true)
    element.scrollTop = element.scrollHeight
  }

  /**
   * Одного эффекта мало: карточки дорастают после отрисовки — раскрывается дифф,
   * подгружается шрифт, — и лента остаётся стоять чуть выше конца.
   */
  useEffect(() => {
    const element = view.current
    if (!element) return

    const observer = new ResizeObserver(toBottom)
    for (const child of Array.from(element.children)) observer.observe(child)
    observer.observe(element)

    return () => observer.disconnect()
  }, [rows.length, toBottom])

  const isEmpty = rows.length === 0 && !streamingText && errors.length === 0

  return (
    <div className={s.feedWrap}>
      <main
        className={s.feed}
        ref={(element) => {
          view.current = element
          scrollRef?.(element)
        }}
        onScroll={(event) => {
          const element = event.currentTarget
          // Полтора десятка пикселей запаса: в самый низ прокрутка попадает редко.
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 16
          stick.current = atBottom
          setStuck(atBottom)
          onScroll?.()
        }}
      >
        {isEmpty ? (
          <div className={s.empty}>
            <p className={s.emptyTitle}>Ask Claude about this project</p>
            <p className={s.emptyHint}>@ for files · / for commands</p>
          </div>
        ) : null}

        {rows.map((item) => (
          <div key={item.id} className={s.row}>
            <ItemView item={item} cards={cards} lastPendingId={lastPendingId} onPlanDecision={onPlanDecision} />
          </div>
        ))}

        {streamingText ? (
          <div className={s.row}>
            {/* Печатающийся ответ разбираем тем же разбором, что и готовый: иначе он
                валится сплошной простынёй и на глазах перестраивается в конце. */}
            <TextCard item={{ id: 'streaming', kind: 'text', paragraphs: parseParagraphs(streamingText) }} />
          </div>
        ) : null}

        {streaming ? (
          <div className={s.streaming}>
            {/* Переливается сам текст: белая плашка поверх него на тёмном фоне
                выглядит грязно, а градиент по буквам читается как дыхание строки. */}
            <span className={s.streamingText}>{streamStatus}</span>
          </div>
        ) : null}

        {errors.map((error, index) => (
          <p key={`${index}-${error.slice(0, 24)}`} className={s.error}>
            <span className={s.errorText}>{error}</span>
            <button type="button" className={s.errorDismiss} onClick={() => onDismissError(index)}>
              ×
            </button>
          </p>
        ))}
      </main>

      <ScrollThumb targetRef={view} />

      {/* Пока лента не липнет к низу, новые карточки приходят молча — эта кнопка
          и есть тот самый сигнал «внизу что-то появилось», без которого их
          пришлось бы искать самому, случайно долистав до конца. */}
      {!stuck ? (
        <button type="button" className={s.jumpToBottom} onClick={jumpToBottom} title="Jump to latest">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M8 2.5v9M4 8l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {unread > 0 ? <span className={s.jumpToBottomBadge}>{unread}</span> : null}
        </button>
      ) : null}
    </div>
  )
}

interface ItemViewProps {
  item: FeedRowItem
  cards: CardState
  /** id вызова, который сейчас реально ждёт разрешения (или undefined, если ждать нечего). */
  lastPendingId: string | undefined
  onPlanDecision: (itemId: string, decision: 'approve' | 'keepPlanning') => void
}

const ItemView = ({ item, cards, lastPendingId, onPlanDecision }: ItemViewProps) => {
  switch (item.kind) {
    case 'user':
      return <UserCard item={item} />

    case 'text':
      return <TextCard item={item} />

    case 'toolGroup':
      return <ToolGroupCard item={item} cards={cards} awaitingPermissionId={lastPendingId} />

    case 'task':
      return (
        <TaskCard
          item={item}
          open={cards.isOpen(item.id)}
          awaitingPermission={item.id === lastPendingId}
          onToggle={() => cards.toggle(item.id)}
        />
      )

    case 'plan':
      return (
        <PlanCard
          item={item}
          onApprove={() => onPlanDecision(item.id, 'approve')}
          onKeepPlanning={() => onPlanDecision(item.id, 'keepPlanning')}
        />
      )

    case 'checkpoint':
      return <CheckpointRow item={item} />

    case 'compact':
      return <CompactRow item={item} />

    case 'meta':
      return <MetaRow item={item} />

    case 'crash':
      return <CrashRow item={item} />
  }
}
