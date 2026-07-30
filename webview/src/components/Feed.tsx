import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { parseParagraphs } from '../feed/markdown'
import type { FeedItem } from '../feed/types'
import { picksFor, todoOverridesFor, type CardState } from '../hooks/useCardState'
import s from './feed.module.css'
import { AskCard } from './items/AskCard'
import { PermissionCard } from './items/PermissionCard'
import { PlanCard } from './items/PlanCard'
import { CheckpointRow, CompactRow, CrashRow, MetaRow } from './items/Rows'
import { TaskCard } from './items/TaskCard'
import { TextCard } from './items/TextCard'
import { TodoCard } from './items/TodoCard'
import { ToolCard } from './items/ToolCard'
import { UserCard } from './items/UserCard'
import { ScrollThumb } from './ScrollThumb'

interface FeedProps {
  items: FeedItem[]
  streamingText: string
  streaming: boolean
  streamStatus: string
  errors: string[]
  cards: CardState
  onSendAnswers: (answers: string[]) => void
  onApprovePlan: () => void
  onKeepPlanning: () => void
  onPermissionDecision: (id: string, decision: 'once' | 'always' | 'deny') => void
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
  onSendAnswers,
  onApprovePlan,
  onKeepPlanning,
  onPermissionDecision,
  onDismissError,
  scrollRef,
  onScroll,
}: FeedProps) => {
  const view = useRef<HTMLElement | null>(null)

  /**
   * Пока где-то в ленте открыт неотвеченный запрос разрешения, самая свежая
   * «выполняется»-карточка на деле просто ждёт человека — агент вообще ещё не
   * начал команду. Без этой пометки обе ситуации выглядят одинаковым спиннером.
   */
  const awaitingPermission = items.some((item) => item.kind === 'perm' && item.decision === null)
  const lastPendingId = awaitingPermission
    ? items.filter((item) => (item.kind === 'tool' || item.kind === 'task') && item.pending).at(-1)?.id
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
  const unreadCount = items.filter((item) => item.kind !== 'user').length

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
  }, [items.length, toBottom])

  const isEmpty = items.length === 0 && !streamingText && errors.length === 0

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

        {items.map((item) => (
          <div key={item.id} className={s.row}>
            <ItemView
              item={item}
              cards={cards}
              awaitingPermission={item.id === lastPendingId}
              onSendAnswers={onSendAnswers}
              onApprovePlan={onApprovePlan}
              onKeepPlanning={onKeepPlanning}
              onPermissionDecision={onPermissionDecision}
            />
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
  item: FeedItem
  cards: CardState
  /** Эта самая свежая «выполняется»-карточка на деле ждёт твоего решения, не работает. */
  awaitingPermission: boolean
  onSendAnswers: (answers: string[]) => void
  onApprovePlan: () => void
  onKeepPlanning: () => void
  onPermissionDecision: (id: string, decision: 'once' | 'always' | 'deny') => void
}

const ItemView = ({
  item,
  cards,
  awaitingPermission,
  onSendAnswers,
  onApprovePlan,
  onKeepPlanning,
  onPermissionDecision,
}: ItemViewProps) => {
  switch (item.kind) {
    case 'user':
      return <UserCard item={item} />

    case 'text':
      return <TextCard item={item} />

    case 'tool':
      return (
        <ToolCard
          item={item}
          open={cards.isOpen(item.id)}
          appliedHunks={cards.appliedHunks}
          awaitingPermission={awaitingPermission}
          onToggle={() => cards.toggle(item.id)}
          onAcceptHunk={cards.applyHunk}
          onRejectHunk={cards.rejectHunk}
        />
      )

    case 'task':
      return (
        <TaskCard
          item={item}
          open={cards.isOpen(item.id)}
          awaitingPermission={awaitingPermission}
          onToggle={() => cards.toggle(item.id)}
        />
      )

    case 'todo':
      return (
        <TodoCard
          item={item}
          overrides={todoOverridesFor(cards.todoOverrides, item.id)}
          onToggle={(todoId, next) => cards.setTodo(item.id, todoId, next)}
        />
      )

    case 'plan':
      return (
        <PlanCard
          item={item}
          approved={cards.approvedPlans.includes(item.id)}
          onApprove={() => {
            cards.approvePlan(item.id)
            onApprovePlan()
          }}
          onKeepPlanning={onKeepPlanning}
        />
      )

    case 'perm':
      return (
        <PermissionCard
          item={item}
          // Решение хранится в самом элементе: агент стоит и ждёт именно его,
          // а не состояния карточки в интерфейсе.
          decision={item.decision}
          onDecide={(decision) => onPermissionDecision(item.id, decision)}
        />
      )

    case 'ask':
      return (
        <AskCard
          item={item}
          picks={picksFor(cards.picks, item.id)}
          onPick={(questionId, optionId) => cards.pick(item.id, questionId, optionId)}
          onSubmit={onSendAnswers}
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
