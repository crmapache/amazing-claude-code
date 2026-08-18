import { useSmoothStream } from 'smooth-stream-text/react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parseParagraphs } from '../feed/markdown'
import type { AskItem, FeedItem, PermItem, TaskItem, TodoItem, ToolItem } from '../feed/types'
import type { CardState } from '../hooks/useCardState'
import s from './feed.module.css'
import { BashCard } from './items/BashCard'
import { PlanCard } from './items/PlanCard'
import { CheckpointRow, CompactRow, CrashRow, ErrorRow, MetaRow, RetryRow, ThinkRow } from './items/Rows'
import { TextCard } from './items/TextCard'
import { ToolGroupCard } from './items/ToolGroupCard'
import { UserCard } from './items/UserCard'
import { ScrollThumb } from './ScrollThumb'

/**
 * Список задач, вопрос агента и запрос разрешения в ленте не рисуются — за них
 * отвечают закреплённые панели над полем ввода (TaskListPanel/AskPanel/PermissionPanel).
 */
type FeedRowItem = Exclude<FeedItem, TodoItem | AskItem | PermItem | TaskItem>

/** Полтора десятка пикселей запаса: в самый низ прокрутка попадает редко. */
const BOTTOM_THRESHOLD_PX = 16

const isAtBottom = (element: HTMLElement): boolean =>
  element.scrollHeight - element.scrollTop - element.clientHeight < BOTTOM_THRESHOLD_PX

interface FeedProps {
  items: FeedItem[]
  streamingText: string
  /** Номер, под которым печатающийся ответ ляжет в ленту готовым блоком — см. PanelState. */
  streamingId?: string
  /** Кусочки мысли, которые уже пришли, но ещё не собрались в готовый блок thinking. */
  streamingThinking: string
  streaming: boolean
  streamStatus: string
  /**
   * Строка состояния говорит не про работу, а про ожидание чужой поломки —
   * сорванный запрос к API, который ждёт повтора. Перелив по буквам означает
   * идущую работу, а её в этот момент нет вовсе (см. streamStatus в App.tsx).
   */
  statusStalled: boolean
  cards: CardState
  onPlanDecision: (itemId: string, decision: 'approve' | 'keepPlanning') => void
  /** Ошибку прочитали и убрали руками — по её номеру в ленте. */
  onDismissError: (id: string) => void
  /** Открыть ссылку из ответа агента в системном браузере. */
  onOpenLink: (url: string) => void
  scrollRef?: (element: HTMLElement | null) => void
  onScroll?: () => void
}

export const Feed = ({
  items,
  streamingText,
  streamingId,
  streamingThinking,
  streaming,
  streamStatus,
  statusStalled,
  cards,
  onPlanDecision,
  onDismissError,
  onOpenLink,
  scrollRef,
  onScroll,
}: FeedProps) => {
  const view = useRef<HTMLElement | null>(null)

  /**
   * Список задач, вопрос агента и запрос разрешения в ленте не рисуются — за
   * них отвечают закреплённые панели над полем ввода. Карточка агента (task)
   * тоже сюда не попадает — у неё своя вкладка, см. AgentStreamView. Карточка
   * плана уходит из ленты, как только по ней принято решение (в любую
   * сторону) — она своё дело сделала, а не остаётся висеть неактивной.
   */
  const settled = useMemo(
    () =>
      items.filter(
        (item): item is FeedRowItem =>
          item.kind !== 'todo' &&
          item.kind !== 'ask' &&
          item.kind !== 'perm' &&
          item.kind !== 'task' &&
          !(item.kind === 'plan' && cards.planDecisions[item.id] !== undefined),
      ),
    [items, cards.planDecisions],
  )

  /**
   * Ответ печатается не с той рваной скоростью, с какой приходит: куски копятся и
   * выдаются ровным потоком, а темп сам подстраивается под подачу — оттого текст
   * льётся, а не выпрыгивает пачками по двадцать слов. Волну проявления поверх
   * этого потока рисует уже сама карточка (см. TextCard).
   */
  const { text: pacedText } = useSmoothStream(streamingText, { done: !streaming })

  /**
   * Печатающиеся мысль и ответ живут в том же списке, что и всё остальное, а не
   * отдельными блоками под ним: карточка ответа обязана остаться для React тем же
   * узлом, когда тот же ответ придёт готовым блоком, иначе на стыке рвётся волна
   * проявления, а лента моргает.
   */
  const rows: FeedRowItem[] = [
    ...settled,
    ...(streamingThinking
      ? [{ id: 'streaming-think', kind: 'think' as const, text: streamingThinking, pending: true }]
      : []),
    ...(pacedText
      ? [
          {
            id: streamingId ?? 'streaming',
            kind: 'text' as const,
            paragraphs: parseParagraphs(pacedText),
            source: pacedText,
          },
        ]
      : []),
  ]

  /**
   * Пока где-то в ленте открыт неотвеченный запрос разрешения ГЛАВНОГО потока
   * (не субагента — у его решений своя вкладка, см. AgentStreamView), самая
   * свежая «выполняется»-карточка на деле просто ждёт человека. Без этой
   * пометки обе ситуации выглядят одинаковым спиннером.
   */
  const lastPendingId = useMemo(() => {
    const awaitingPermission = items.some(
      (item) => item.kind === 'perm' && item.decision === null && item.taskId === undefined,
    )
    if (!awaitingPermission) return undefined

    return items
      .flatMap<ToolItem>((item) => (item.kind === 'toolGroup' ? item.tools.filter((tool) => tool.pending) : []))
      .at(-1)?.id
  }, [items])
  /** Пока пользователь не отмотал вверх сам, лента липнет к низу. */
  const stick = useRef(true)
  /** То же самое, но в состоянии — от него зависит, рисовать ли кнопку «вниз». */
  const [stuck, setStuck] = useState(true)

  const toBottom = useCallback(() => {
    const element = view.current
    if (!element) return

    if (stick.current) {
      element.scrollTop = element.scrollHeight
      return
    }

    // «Не липнет» мог выставить не человек, а гонка: пока карточка дорастала
    // (см. ResizeObserver ниже), где-то между кадрами проскочило браузерное
    // scroll-событие с ещё не осевшими размерами и сбросило флаг. Раз лента и
    // без явной прокрутки уже стоит внизу — верим фактическому положению, а не
    // застрявшему флагу: иначе кнопка «вниз» с счётчиком висит вечно, хотя
    // прыгать уже некуда.
    if (isAtBottom(element)) {
      stick.current = true
      setStuck(true)
    }
  }, [])

  useLayoutEffect(toBottom, [items, pacedText, streamingThinking, toBottom])

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

  const isEmpty = rows.length === 0

  return (
    <div className={s.feedWrap}>
      <main
        className={s.feed}
        ref={(element) => {
          view.current = element
          scrollRef?.(element)
        }}
        onScroll={(event) => {
          const atBottom = isAtBottom(event.currentTarget)
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
            <ItemView
              item={item}
              cards={cards}
              lastPendingId={lastPendingId}
              awaitingPlan={streaming}
              onPlanDecision={onPlanDecision}
              onDismissError={onDismissError}
              onOpenLink={onOpenLink}
            />
          </div>
        ))}

        {/* Пустая строка статуса означает, что о происходящем уже сказано в самой
            ленте (так во время сжатия контекста), либо сказать нечего вовсе —
            второй случай и держит эту строку живой даже когда streaming уже
            false: у streamStatus есть отдельная ветка про фонового субагента,
            который остался работать после того, как сам ход завершился. */}
        {streamStatus ? (
          <div className={s.streaming}>
            {/* Переливается сам текст: белая плашка поверх него на тёмном фоне
                выглядит грязно, а градиент по буквам читается как дыхание строки. */}
            <span className={`${s.streamingText} ${statusStalled ? s.streamingStalled : ''}`}>{streamStatus}</span>
          </div>
        ) : null}

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
  /** Идёт ли ход: от этого зависит, живые ли кнопки под планом (см. PlanCard). */
  awaitingPlan: boolean
  onPlanDecision: (itemId: string, decision: 'approve' | 'keepPlanning') => void
  onDismissError: (id: string) => void
  onOpenLink: (url: string) => void
}

/**
 * Осевшая карточка не меняется — и перерисовывать её незачем.
 *
 * Пока идёт ответ, лента обновляется каждый кадр: текст прибывает по паре
 * символов, и на каждую такую порцию React проходит по всему списку. Без этой
 * памяти вместе с печатающейся строкой заново собирались бы и все карточки
 * разговора — сотни узлов с разметкой, диффами и логами команд, каждый раз
 * целиком. Отсюда и провалы, из-за которых панель переставала успевать за
 * происходящим.
 *
 * Работает это ровно потому, что всё остальное вокруг постоянно: события
 * складываются в ленту, не пересобирая уже лежащее (см. reducePanel), состояние
 * карточек и обработчики держат свои ссылки (useCardState, App).
 */
const ItemView = memo(({
  item,
  cards,
  lastPendingId,
  awaitingPlan,
  onPlanDecision,
  onDismissError,
  onOpenLink,
}: ItemViewProps) => {
  switch (item.kind) {
    case 'user':
      return <UserCard item={item} onOpenLink={onOpenLink} />

    case 'bash':
      return <BashCard item={item} />

    case 'text':
      return <TextCard item={item} onOpenLink={onOpenLink} />

    case 'think':
      return <ThinkRow item={item} />

    case 'toolGroup':
      return <ToolGroupCard item={item} cards={cards} awaitingPermissionId={lastPendingId} />

    case 'plan':
      return (
        <PlanCard
          item={item}
          awaiting={awaitingPlan}
          onApprove={() => onPlanDecision(item.id, 'approve')}
          onKeepPlanning={() => onPlanDecision(item.id, 'keepPlanning')}
          onOpenLink={onOpenLink}
        />
      )

    case 'checkpoint':
      return <CheckpointRow item={item} />

    case 'compact':
      return <CompactRow item={item} />

    case 'retry':
      return <RetryRow item={item} />

    case 'meta':
      return <MetaRow item={item} />

    case 'crash':
      return <CrashRow item={item} />

    case 'error':
      return <ErrorRow item={item} onDismiss={() => onDismissError(item.id)} onOpenLink={onOpenLink} />
  }
})

ItemView.displayName = 'ItemView'
