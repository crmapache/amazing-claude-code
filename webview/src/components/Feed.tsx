import { useSmoothStream } from 'smooth-stream-text/react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { drawnInFeed, openThought, spokenAnswer } from '../feed/build'
import { copiedText } from '../feed/copy'
import { parseParagraphs } from '../feed/markdown'
import { placeShift, rowAtEdge, type FeedMemory } from '../feed/place'
import { matchSpans } from '../feed/searchText'
import type { PaintedTerm } from '../protocol'
import type { FeedItem, FeedRowItem, ToolItem } from '../feed/types'
import type { CardState } from '../hooks/useCardState'
import s from './feed.module.css'
import { BashCard } from './items/BashCard'
import { FindingsCard } from './items/FindingsCard'
import { PlanCard } from './items/PlanCard'
import { TaskCard } from './items/TaskCard'
import {
  CheckpointRow,
  CompactRow,
  CrashRow,
  ErrorRow,
  LimitRow,
  MetaRow,
  ModelSwitchRow,
  RetryRow,
  ThinkRow,
} from './items/Rows'
import { TextCard } from './items/TextCard'
import { ToolGroupCard } from './items/ToolGroupCard'
import { UserCard } from './items/UserCard'
import { ScrollThumb } from './ScrollThumb'
import { useT } from '../i18n'

/** A dozen and a half pixels of slack: scrolling lands exactly at the bottom only rarely. */
const BOTTOM_THRESHOLD_PX = 16

/** How long an opened card keeps the feed in place - long enough for it to finish growing. */
const HOLD_MS = 400

/** How long a row a search jumped to stays lit - long enough to find it, short enough to read it plain. */
const LIT_MS = 1800

/** The name the painted words are registered under - what the ::highlight rule in feed.module.css answers to. */
const HIGHLIGHT_NAME = 'acc-search'

/**
 * How often the paint follows the feed's own changes, at most. An answer being printed changes the feed
 * dozens of times a second, and every one of them used to walk the whole conversation's text and build
 * the paint afresh - on a long conversation that was a stutter for as long as the answer went on. The
 * words of a fresh search are painted at once; a moment's lag behind the printing is nothing anybody sees.
 */
const PAINT_INTERVAL_MS = 300

/** The browser's highlight registry, when there is one: JCEF has it, a test's DOM does not. */
const highlightRegistry = (): HighlightRegistry | undefined => {
  if (typeof CSS === 'undefined' || typeof Highlight === 'undefined') return undefined
  return 'highlights' in CSS ? CSS.highlights : undefined
}

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
  /**
   * A page of this conversation further back than the EARLIER mark - see historyPage in feed/build.ts.
   * Both screens want it: a tab opens a past conversation with its end rather than the whole of it (see
   * ClaudeHistory.opening), and a phone is handed the end of a live one. Undefined leaves the mark a
   * plain, unclickable caption - the beginning is on screen, or there is nothing to anchor a request on.
   */
  onLoadEarlier?: () => void
  /**
   * How many pages of earlier messages have been applied to this feed (see PanelState.earlierPages) - the
   * signal to hold the reading position when one arrives.
   *
   * A page goes in ABOVE everything on screen, and a browser keeps the scroll offset as a number: the lines
   * being read jump down the screen by the height of what has just been loaded, which reads as the feed
   * throwing the reader somewhere else. The count is the signal rather than the feed growing, because the
   * mark above the feed keeps its own identity across a page and growth alone cannot tell "loaded above"
   * from "an answer arrived below".
   */
  earlierPages?: number
  scrollRef?: (element: HTMLElement | null) => void
  /**
   * A row to bring on screen and light up for a moment - a search hit the person chose (see
   * feed/search.ts). The nonce makes the same row askable for twice: the capsule's arrows walk the hits,
   * and two presses on one hit are two jumps.
   */
  focus?: { row: string; nonce: number }
  /**
   * The jump [focus] asked for has been made. What asks for a jump should forget it here: this feed is
   * built afresh for every tab it is switched to (see the key over it in App.tsx), and a request left
   * standing would be carried out again by every such feed - the row a person had just been put back at
   * would be thrown away for the hit they had long since read.
   */
  onFocused?: () => void
  /**
   * The words to paint across the feed while a search is open - folded as the index folds them (see
   * feed/searchText.ts). Painted through the browser's highlight registry rather than by wrapping text
   * in marks: the cards' markup stays as it is, chips and code included, and nothing is re-rendered.
   */
  paint?: readonly PaintedTerm[]
  /**
   * Where this tab's feed was left when it was last on screen, and where to put that back - see
   * feed/place.ts. Left out (the phone, the harness's own screens) the feed simply opens at its end,
   * which is what it did for everyone before.
   */
  place?: FeedMemory
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
  onLoadEarlier,
  earlierPages,
  scrollRef,
  focus,
  onFocused,
  paint,
  place,
}: FeedProps) => {
  const view = useRef<HTMLElement | null>(null)
  const t = useT()

  /**
   * The task list, the agent's question and a permission request are not drawn in the feed - the pinned
   * panels above the input field answer for them. An agent's card (task) does not get here either - it
   * has a tab of its own, see AgentStreamView. A plan's card leaves the feed as soon as a decision about
   * it is taken (either way) - it has done its job rather than hanging there inactive.
   *
   * A plan the agent took back is not a decision and does not leave: nobody chose anything, the text is
   * still worth reading, and a plan vanishing because the turn was stopped would be the person's loss.
   * It merely loses its buttons - see PlanCard.withdrawn.
   */
  const settled = useMemo(
    () =>
      items.filter(
        (item): item is FeedRowItem =>
          drawnInFeed(item) &&
          !(
            item.kind === 'plan' &&
            cards.planDecisions[item.id] !== undefined &&
            cards.planDecisions[item.id] !== 'withdrawn'
          ),
      ),
    [items, cards.planDecisions],
  )

  /**
   * The answer is printed not at the ragged speed it arrives at: the chunks accumulate and are handed out
   * as an even stream, with the pace adjusting itself to the supply - which is why the text flows rather
   * than jumping out in batches of twenty words. The reveal wave over that stream is drawn by the card
   * itself (see TextCard).
   *
   * The chunks are handed over cleaned: an answer beginning with a service block that the model printed
   * back at itself must not show while it streams either - see spokenAnswer, and the same call in
   * applyAssistant for the finished block.
   */
  const { text: pacedText } = useSmoothStream(spokenAnswer(streamingText), { done: !streaming })

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

  /**
   * The row a person last pressed something in, and where it stood at that moment.
   *
   * Written on every press inside the feed and used only by the one below: a press is not by itself a
   * reason to hold anything, and holding the feed on every click would stop an answer printing at the
   * bottom the moment somebody copied a line out of it.
   */
  const pressed = useRef<{ row: HTMLElement; top: number } | null>(null)
  /**
   * The row being held in place right now - see [holdPressed].
   *
   * A deadline rather than a single frame: a card that has just opened goes on growing after the paint
   * (a diff unfolds, a font lands), and each of those growths comes back through the observer below.
   */
  const held = useRef<{ row: HTMLElement; top: number; until: number } | null>(null)

  const rememberPress = useCallback((target: EventTarget | null) => {
    const element = view.current
    const row = target instanceof Element ? target.closest<HTMLElement>('[data-acc-row]') : null
    pressed.current = element && row ? { row, top: row.getBoundingClientRect().top } : null
  }, [])

  /**
   * What opening a card does to the scroll: nothing.
   *
   * Everything that unfolds in the feed - a group of calls, a thought, a paste in one's own message -
   * makes the feed taller, and while it sticks to the bottom that growth used to drag it to the end. The
   * card opened under the pointer therefore left the screen upwards, and what came into view was the end
   * of the conversation, which is precisely what the person was not looking at. So a press that unfolds
   * something pins the row it happened in: the text opens where the eye already is, downwards.
   *
   * The bottom loses out to the pinned row on purpose. Unfolding an old card means reading it, and a feed
   * that jumps to the end mid-reading is the very thing being fixed here - the "down" button appears
   * instead, and takes one back the moment it is wanted.
   */
  const holdPressed = useCallback(() => {
    if (pressed.current) held.current = { ...pressed.current, until: performance.now() + HOLD_MS }
  }, [])

  const toBottom = useCallback(() => {
    const element = view.current
    if (!element) return

    const holding = held.current
    if (holding) {
      if (!holding.row.isConnected || performance.now() > holding.until) held.current = null
      else {
        // The row is put back where it was pressed, and where the feed ends up afterwards is what decides
        // whether it still sticks: unfolding at the very bottom leaves it there, unfolding higher up does
        // not.
        element.scrollTop += holding.row.getBoundingClientRect().top - holding.top
        const atBottom = isAtBottom(element)
        stick.current = atBottom
        setStuck(atBottom)
        return
      }
    }

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

  useLayoutEffect(toBottom, [items, pacedText, streamingThinking, cards, toBottom])

  /**
   * The memory, as it stood when this feed was mounted - see [FeedProps.place].
   *
   * Read through a ref so that the restore below depends on nothing: it must happen once, when the tab
   * comes back, and a memory handed down as a fresh object on some later render would otherwise drag the
   * reading back to where it was minutes ago.
   */
  const placeRef = useRef(place)
  placeRef.current = place

  /**
   * Where the tab was left, put back the moment it returns.
   *
   * Runs after the effect above rather than instead of it: that one has just gone to the end, this one
   * comes back from it, and both happen in the same commit, so nothing of it is ever painted. A place
   * that was sticking to the bottom is already served by the effect above - there is nothing to put back,
   * and the end is where the tab belongs.
   *
   * The row is held for a moment afterwards the same way an unfolded card is (see [holdPressed]): the
   * feed goes on settling after this paint - a font lands, a card measures itself - and every one of
   * those growths comes back through the observer below.
   */
  useLayoutEffect(() => {
    const element = view.current
    const saved = placeRef.current?.read()
    if (!element || !saved || saved.stick) return

    const edge = element.getBoundingClientRect().top
    const row = saved.row
      ? element.querySelector<HTMLElement>(`[data-acc-row][data-acc-id="${CSS.escape(saved.row)}"]`)
      : null

    if (row) {
      element.scrollTop += placeShift(saved, row.getBoundingClientRect().top, edge)
      held.current = { row, top: edge + saved.offset, until: performance.now() + HOLD_MS }
    } else {
      // The row it was held by is gone from the feed - a plan answered, an error dismissed, a page of a
      // conversation not yet asked for again. The plain offset is the closest thing to the truth left.
      element.scrollTop = saved.top
    }

    const atBottom = isAtBottom(element)
    stick.current = atBottom
    setStuck(atBottom)
  }, [])

  /**
   * Where the feed stands, written down on every scroll - see [FeedProps.place].
   *
   * On the scroll rather than on the way out: by the time this tab is being taken off the screen its
   * rows are already being taken apart, and the only measurement anyone can trust is the one made while
   * they still stood. Scrolling is also the only thing that moves the reading, so nothing is missed -
   * setting scrollTop by hand raises a scroll of its own, and the jumps below arrive here too.
   */
  const remember = useCallback((element: HTMLElement, atBottom: boolean) => {
    const memory = placeRef.current
    if (!memory) return

    const top = element.scrollTop
    if (atBottom) {
      memory.write({ stick: true, offset: 0, top })
      return
    }

    const rows = element.querySelectorAll<HTMLElement>('[data-acc-row]')
    const edge = element.getBoundingClientRect().top
    const at = rowAtEdge(rows.length, (index) => rows[index].getBoundingClientRect().bottom, edge)
    const row = rows[at]

    memory.write(
      row
        ? { stick: false, row: row.dataset.accId, offset: row.getBoundingClientRect().top - edge, top }
        : { stick: false, offset: 0, top },
    )
  }, [])

  /**
   * Keep the reading position when a page of earlier messages arrives - see [FeedProps.earlierPages].
   *
   * The measurements describe the feed as it stood before the page went in: the offset is then put back
   * where it was, plus however much taller the feed became above it. Not while the feed sticks to the
   * bottom: there the bottom is the position worth holding, and the effect above has already gone there.
   *
   * They are taken both here and on every scroll (see onScroll below), and the second of those is the one
   * that matters: scrolling on its own does not render, so a chat being read - which is exactly a chat
   * opened from history, with no agent printing into it - kept the offset of whenever it last happened to
   * render. Reading up to the top and asking for more then landed the reader near the bottom of the chat,
   * which is the very thing this is here to prevent.
   */
  const measured = useRef({ pages: earlierPages ?? 0, height: 0, top: 0 })

  useLayoutEffect(() => {
    const element = view.current
    if (!element) return

    const pages = earlierPages ?? 0
    if (pages !== measured.current.pages && !stick.current) {
      element.scrollTop = measured.current.top + (element.scrollHeight - measured.current.height)
    }

    measured.current = { pages, height: element.scrollHeight, top: element.scrollTop }
  })

  /**
   * The unread count is what has accumulated from the agent while the feed is not sticking to the
   * bottom. The user's own messages are not counted: they have seen them anyway, they have only just
   * written them. While the feed sticks to the bottom the counter is held at zero - the user sees
   * everything as it arrives.
   *
   * Counted from the last row seen rather than from how many rows there are: a page of earlier messages
   * goes in ABOVE everything on screen (see earlierPages), and by count alone that is the same event as
   * that many answers arriving below - the button would offer to jump down to messages that are in fact
   * older than the ones being read. The anchor is a settled row rather than whatever stands last: a
   * printing thought or answer is folded into the card above it when it finishes, and an anchor on one of
   * those would vanish from under the counter mid-stream.
   */
  const seenId = useRef<string | undefined>(undefined)
  const settledTailId = settled.at(-1)?.id

  useEffect(() => {
    if (stuck) seenId.current = settledTailId
  }, [stuck, settledTailId])

  const anchor = seenId.current
  const seenAt = anchor === undefined ? -1 : rows.findIndex((row) => row.id === anchor)
  /** The anchor is gone from the feed (a plan card decided, an error dismissed): claim nothing unread. */
  const unread =
    anchor !== undefined && seenAt < 0 ? 0 : rows.slice(seenAt + 1).filter((item) => item.kind !== 'user').length

  const jumpToBottom = () => {
    const element = view.current
    if (!element) return

    // Whatever was being held in place has just been overruled by a person asking for the end
    // (see [holdPressed]): left standing, the pin would pull the feed back out of the bottom on the
    // next growth of any card.
    held.current = null
    stick.current = true
    setStuck(true)
    element.scrollTop = element.scrollHeight
  }

  /**
   * One effect is not enough: the cards keep growing after the paint - a diff expands, a font loads - and
   * the feed is left standing a little above the end.
   */
  /**
   * The same card state, with every fold and unfold pinning its row first (see [holdPressed]).
   *
   * Here rather than in each card because the cards already share this one object: what unfolds in the
   * feed unfolds through it, so a card added later gets the behaviour without knowing there is any.
   */
  const folding = useMemo<CardState>(
    () => ({
      ...cards,
      toggle: (id: string) => {
        holdPressed()
        cards.toggle(id)
      },
    }),
    [cards, holdPressed],
  )

  useEffect(() => {
    const element = view.current
    if (!element) return

    const observer = new ResizeObserver(toBottom)
    for (const child of Array.from(element.children)) observer.observe(child)
    observer.observe(element)

    return () => observer.disconnect()
  }, [rows.length, toBottom])

  /**
   * The row a search jumped to, lit up for a moment - see [FeedProps.focus].
   *
   * Brought to the upper third of the screen rather than the top: the hit is read in its neighbourhood,
   * and the question it answers usually stands right above it. The feed stops sticking to the bottom for
   * it - the person has gone somewhere on purpose, and an answer arriving below must not drag them back.
   */
  const [litRow, setLitRow] = useState<string | undefined>(undefined)

  useLayoutEffect(() => {
    if (!focus) return
    const element = view.current
    const row = element?.querySelector<HTMLElement>(`[data-acc-id="${CSS.escape(focus.row)}"]`)
    if (!element || !row) return

    // The same reason as in [jumpToBottom]: a jump asked for by hand outranks any pinned row, including
    // the one this feed restored itself to a moment ago.
    held.current = null
    stick.current = false
    setStuck(false)
    element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - element.clientHeight * 0.3
    setLitRow(focus.row)
    onFocused?.()

    const timer = setTimeout(() => setLitRow(undefined), LIT_MS)
    return () => clearTimeout(timer)
    // Only the request itself: whoever asked is told once per jump, not once per change of the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  /*
   * The words a search matched, painted wherever they stand in the feed - see [FeedProps.paint].
   *
   * Through the highlight registry, so the paint is a style over ranges rather than a change to the
   * text: a card's markup is left exactly as it is, and the paint goes with the last word of the search
   * rather than living in the cards. Recomputed when the feed changes: an answer printing below the
   * hit adds words to paint, and a page loaded above moves everything.
   */
  /** What the paint on screen was built for, and when - see [PAINT_INTERVAL_MS]. */
  const painted = useRef<{ paint: readonly PaintedTerm[]; at: number } | undefined>(undefined)

  useEffect(() => {
    const registry = highlightRegistry()
    if (!registry) return
    if (!paint || paint.length === 0) {
      registry.delete(HIGHLIGHT_NAME)
      painted.current = undefined
      return
    }

    const apply = () => {
      const element = view.current
      if (!element) return

      const ranges: Range[] = []
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        if (!text.trim()) continue
        for (const [start, end] of matchSpans(text, paint)) {
          const range = document.createRange()
          range.setStart(node, start)
          range.setEnd(node, end)
          ranges.push(range)
        }
      }

      registry.set(HIGHLIGHT_NAME, new Highlight(...ranges))
      painted.current = { paint, at: Date.now() }
    }

    // New words are painted at once; the feed's own changes wait their turn, so that an answer being
    // printed costs one walk of the feed every so often rather than one per piece. The paint that stands
    // meanwhile is left standing: a range over text that has since moved lights the wrong place for a
    // moment at worst, while a feed with no paint at all between two pieces would flicker.
    const last = painted.current
    const wait = last && last.paint === paint ? Math.max(0, PAINT_INTERVAL_MS - (Date.now() - last.at)) : 0
    if (wait === 0) {
      apply()
      return
    }
    const timer = setTimeout(apply, wait)
    return () => clearTimeout(timer)
  }, [paint, rows.length, pacedText, items])

  // The paint goes with the feed it was painted over.
  useEffect(
    () => () => {
      highlightRegistry()?.delete(HIGHLIGHT_NAME)
    },
    [],
  )

  const isEmpty = rows.length === 0

  return (
    <div className={s.feedWrap}>
      <main
        className={s.feed}
        ref={(element) => {
          view.current = element
          scrollRef?.(element)
        }}
        // On the press rather than on the click: by the time a click is delivered the card has already
        // been through React once on some paths, and the row would be measured where it moved to. A key
        // counts as a press of its own - a card unfolds from the keyboard just as well, and the anchor
        // left over from some earlier click would pin a row nobody was looking at.
        onPointerDownCapture={(event) => rememberPress(event.target)}
        onKeyDownCapture={(event) => rememberPress(event.target)}
        // Only when the selection genuinely holds a chip - everything else is the browser's own copy,
        // which is already right and which we have no business rewriting (see copiedText).
        onCopy={(event) => {
          const text = copiedText(window.getSelection(), document)
          if (text === null) return

          event.clipboardData.setData('text/plain', text)
          event.preventDefault()
        }}
        onScroll={(event) => {
          const element = event.currentTarget
          const atBottom = isAtBottom(element)
          stick.current = atBottom
          setStuck(atBottom)
          // Where the reading is, measured when it moves rather than when React happens to look: setStuck
          // bails out once the answer stops changing, and every scroll after the first would leave the
          // remembered offset behind (see the effect above). The reads are the ones isAtBottom just made.
          measured.current = { ...measured.current, height: element.scrollHeight, top: element.scrollTop }
          remember(element, atBottom)
        }}
      >
        {isEmpty ? (
          <div className={s.empty}>
            <p className={s.emptyTitle}>{t.feed.empty.title}</p>
            <p className={s.emptyHint}>{t.feed.empty.hint}</p>
          </div>
        ) : null}

        {rows.map((item) => (
          <div
            key={item.id}
            className={item.id === litRow ? `${s.row} ${s.rowLit}` : s.row}
            data-acc-row=""
            data-acc-id={item.id}
          >
            <ItemView
              item={item}
              cards={folding}
              lastPendingId={lastPendingId}
              awaitingPlan={streaming}
              onPlanDecision={onPlanDecision}
              onDismissError={onDismissError}
              onOpenLink={onOpenLink}
              onLoadEarlier={onLoadEarlier}
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
        <button
          type="button"
          className={s.jumpToBottom}
          onClick={jumpToBottom}
          data-tooltip={t.feed.jumpToLatest}
          data-tooltip-at="top right"
        >
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
  onLoadEarlier?: () => void
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
  onLoadEarlier,
}: ItemViewProps) => {
  switch (item.kind) {
    case 'user':
      return <UserCard item={item} cards={cards} onOpenLink={onOpenLink} />

    case 'bash':
      return <BashCard item={item} />

    case 'text':
      return <TextCard item={item} onOpenLink={onOpenLink} />

    case 'think':
      return <ThinkRow item={item} open={cards.isOpen(item.id)} onToggle={() => cards.toggle(item.id)} />

    case 'toolGroup':
      return <ToolGroupCard item={item} cards={cards} awaitingPermissionId={lastPendingId} />

    case 'task':
      return <TaskCard item={item} open={cards.isOpen(item.id)} onToggle={() => cards.toggle(item.id)} />

    case 'findings':
      return (
        <FindingsCard item={item} isOpen={cards.isOpen} onToggle={cards.toggle} onOpenLink={onOpenLink} />
      )

    case 'plan':
      return (
        <PlanCard
          item={item}
          awaiting={awaitingPlan && cards.planDecisions[item.id] === undefined}
          withdrawn={cards.planDecisions[item.id] === 'withdrawn'}
          onApprove={() => onPlanDecision(item.id, 'approve')}
          onKeepPlanning={() => onPlanDecision(item.id, 'keepPlanning')}
          onOpenLink={onOpenLink}
        />
      )

    case 'checkpoint':
      return <CheckpointRow item={item} onLoadEarlier={item.chip === 'EARLIER' ? onLoadEarlier : undefined} />

    case 'compact':
      return <CompactRow item={item} />

    case 'retry':
      return <RetryRow item={item} />

    case 'model':
      return <ModelSwitchRow item={item} onOpenLink={onOpenLink} />

    case 'meta':
      return <MetaRow item={item} />

    case 'crash':
      return <CrashRow item={item} />

    case 'error':
      return <ErrorRow item={item} onDismiss={() => onDismissError(item.id)} onOpenLink={onOpenLink} />

    case 'limit':
      return <LimitRow item={item} />
  }
})

ItemView.displayName = 'ItemView'
