import { useSmoothStream } from 'smooth-stream-text/react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { openThought } from '../feed/build'
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
 * The task list, the agent's question and a permission request are not drawn in the feed - the pinned
 * panels above the input field answer for them (TaskListPanel/AskPanel/PermissionPanel).
 */
type FeedRowItem = Exclude<FeedItem, TodoItem | AskItem | PermItem | TaskItem>

/** A dozen and a half pixels of slack: scrolling lands exactly at the bottom only rarely. */
const BOTTOM_THRESHOLD_PX = 16

const isAtBottom = (element: HTMLElement): boolean =>
  element.scrollHeight - element.scrollTop - element.clientHeight < BOTTOM_THRESHOLD_PX

interface FeedProps {
  items: FeedItem[]
  streamingText: string
  /** The number the printing answer will take in the feed as a finished block - see PanelState. */
  streamingId?: string
  /** The chunks of a thought that have arrived but have not yet gathered into a finished thinking block. */
  streamingThinking: string
  streaming: boolean
  streamStatus: string
  /**
   * The status line speaks not about work but about waiting out someone else's breakage - a failed API
   * request awaiting a retry. The shimmer across the letters means work under way, and at that moment
   * there is none at all (see streamStatus in App.tsx).
   */
  statusStalled: boolean
  cards: CardState
  onPlanDecision: (itemId: string, decision: 'approve' | 'keepPlanning') => void
  /** An error has been read and removed by hand - by its number in the feed. */
  onDismissError: (id: string) => void
  /** Open a link from the agent's answer in the system browser. */
  onOpenLink: (url: string) => void
  scrollRef?: (element: HTMLElement | null) => void
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
}: FeedProps) => {
  const view = useRef<HTMLElement | null>(null)

  /**
   * The task list, the agent's question and a permission request are not drawn in the feed - the pinned
   * panels above the input field answer for them. An agent's card (task) does not get here either - it
   * has a tab of its own, see AgentStreamView. A plan's card leaves the feed as soon as a decision about
   * it is taken (either way) - it has done its job rather than hanging there inactive.
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
   * The answer is printed not at the ragged speed it arrives at: the chunks accumulate and are handed out
   * as an even stream, with the pace adjusting itself to the supply - which is why the text flows rather
   * than jumping out in batches of twenty words. The reveal wave over that stream is drawn by the card
   * itself (see TextCard).
   */
  const { text: pacedText } = useSmoothStream(streamingText, { done: !streaming })

  /**
   * The printing thought and answer live in the same list as everything else rather than as separate
   * blocks under it: to React the answer's card has to stay the same node when that same answer arrives
   * as a finished block, or the reveal wave breaks at the seam and the feed blinks.
   */
  /**
   * A printing thought is appended to the very card it will later lie in as a finished block (see
   * openThought in build.ts). As a separate line at the bottom it would hang there until the stream ended
   * and then jump into the card above before one's eyes - a line of its own is left only to the very
   * first thought of a piece, when there is nothing to append to yet.
   */
  const openThink = streamingThinking ? openThought(settled) : -1

  const rows: FeedRowItem[] = [
    ...settled.map((item, index) =>
      index === openThink && item.kind === 'think'
        ? { ...item, thoughts: [...item.thoughts, streamingThinking], pending: true }
        : item,
    ),
    ...(streamingThinking && openThink < 0
      ? [{ id: 'streaming-think', kind: 'think' as const, thoughts: [streamingThinking], pending: true }]
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
   * While an unanswered permission request of the MAIN stream is open somewhere in the feed (not a
   * subagent's - its decisions have a tab of their own, see AgentStreamView), the freshest "running" card
   * is in fact simply waiting for a person. Without this mark both situations look like the same
   * spinner.
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
  /** Until the user scrolls up themselves, the feed sticks to the bottom. */
  const stick = useRef(true)
  /** The same thing, but in state - whether to draw the "down" button depends on it. */
  const [stuck, setStuck] = useState(true)

  const toBottom = useCallback(() => {
    const element = view.current
    if (!element) return

    if (stick.current) {
      element.scrollTop = element.scrollHeight
      return
    }

    // "Not sticking" may have been set not by a person but by a race: while a card was still growing
    // (see the ResizeObserver below), a browser scroll event slipped between frames with sizes that had
    // not settled and cleared the flag. Since the feed already stands at the bottom without any explicit
    // scrolling, we trust the actual position rather than a stuck flag: otherwise the "down" button with
    // its counter hangs there forever although there is nowhere left to jump.
    if (isAtBottom(element)) {
      stick.current = true
      setStuck(true)
    }
  }, [])

  useLayoutEffect(toBottom, [items, pacedText, streamingThinking, toBottom])

  /**
   * The unread count is what has accumulated from the agent while the feed is not sticking to the
   * bottom. The user's own messages are not counted: they have seen them anyway, they have only just
   * written them. While the feed sticks to the bottom the counter is held at zero - the user sees
   * everything as it arrives.
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
   * One effect is not enough: the cards keep growing after the paint - a diff expands, a font loads - and
   * the feed is left standing a little above the end.
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

        {/* An empty status line means either that what is happening has already been said in the feed
            itself (as during a context compaction), or that there is nothing to say at all - the second
            case is what keeps this line alive even when streaming is already false: streamStatus has a
            branch of its own about a background subagent left working after the turn itself ended. */}
        {streamStatus ? (
          <div className={s.streaming}>
            {/* The text itself shimmers: a white slab over it on a dark background looks dirty, while a
                gradient across the letters reads as the line breathing. */}
            <span className={`${s.streamingText} ${statusStalled ? s.streamingStalled : ''}`}>{streamStatus}</span>
          </div>
        ) : null}

      </main>

      <ScrollThumb targetRef={view} />

      {/* While the feed does not stick to the bottom, new cards arrive silently - this button is the
          "something has appeared below" signal, without which one would have to find them oneself, by
          accidentally scrolling to the end. */}
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
  /** The id of the call genuinely awaiting permission right now (or undefined when there is none). */
  lastPendingId: string | undefined
  /** Whether a turn is running: whether the buttons under a plan are alive depends on it (see PlanCard). */
  awaitingPlan: boolean
  onPlanDecision: (itemId: string, decision: 'approve' | 'keepPlanning') => void
  onDismissError: (id: string) => void
  onOpenLink: (url: string) => void
}

/**
 * A settled card does not change - and there is no reason to redraw it.
 *
 * While an answer is running, the feed updates every frame: the text arrives a couple of characters at a
 * time, and on every such portion React walks the whole list. Without this memoization every card of the
 * conversation would be reassembled along with the printing line - hundreds of nodes with markup, diffs
 * and command logs, whole, every time. Hence the stalls that made the panel fall behind what was
 * happening.
 *
 * This works precisely because everything else around it is stable: events are appended to the feed
 * without reassembling what already lies there (see reducePanel), while the cards' state and the handlers
 * keep their references (useCardState, App).
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
      return <ThinkRow item={item} open={cards.isOpen(item.id)} onToggle={() => cards.toggle(item.id)} />

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
