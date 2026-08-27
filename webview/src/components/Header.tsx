import { Fragment, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { isSideComposerLayout, type ComposerLayout } from '../composerLayout'
import { STATISTICS_GROUP } from '../tabs'
import { BranchChip } from './StatusBar'
import s from './shell.module.css'

/**
 * What is happening in a tab: nothing, work under way, work finished, or someone being waited for. The
 * circle is one and the same, the colour and the breathing differ - that way the state is visible out of
 * the corner of the eye, without reading a caption.
 */
export type SessionState = 'idle' | 'running' | 'done' | 'attention' | 'crashed'

/**
 * Where a tab's name came from - it decides whether it may be overwritten. 'default' means not a word
 * has been said yet and a stand-in is in place ('main session' / 'new session'). 'heuristic' is an
 * instant guess from the first message, which the LLM's answer arriving after it may replace. 'llm' is
 * what the generation sent (see sessionTitle in protocol.ts): the next answer no longer overwrites it,
 * only a reset on /clear does.
 */
export type TitleSource = 'default' | 'heuristic' | 'llm'

export interface Session {
  id: string
  title: string
  state: SessionState
  /** The root conversation: forks and forks of forks carry one and the same one. */
  groupId: string
  /** The branching depth: 0 is the root, 1 a fork, 2 a fork of a fork. */
  depth: number
  titleSource: TitleSource
}

/**
 * The groups' colours, but not simply a hue around the circle: two neighbouring hues at the same
 * lightness and saturation are almost indistinguishable to the eye (the first attempt came out exactly
 * that way) - the golden angle between hues loosens that neighbourhood, while alternating three bands of
 * lightness and saturation separates by contrast even the pairs of hues that still ended up side by
 * side.
 *
 * A rainbow across all 360° was the one piece of colour noise in the panel: the tabs shouted over the
 * feed the panel is opened for. Now the hues live in the theme's cool arc (aquamarine → moon blue →
 * iris) - the groups are still distinguishable but no longer argue with the accents.
 */
const GROUP_COLOR_COUNT = 18
const GOLDEN_ANGLE = 137.508
/** The cool arc: aquamarine → moon blue → iris. The arc is 114° wide. */
const HUE_START = 178
const HUE_SPAN = 114
const COLOR_BANDS = [
  { s: 62, l: 70 },
  { s: 55, l: 58 },
  { s: 45, l: 78 },
]
const GROUP_COLORS = Array.from({ length: GROUP_COLOR_COUNT }, (_, index) => {
  const hue = Math.round(HUE_START + ((index * GOLDEN_ANGLE) % HUE_SPAN))
  const band = COLOR_BANDS[index % COLOR_BANDS.length]!
  return `hsl(${hue}, ${band.s}%, ${band.l}%)`
})

/**
 * By the group's own id rather than by a tab count - the colour does not slide when others are opened
 * and closed beside it. A plain multiplication by 31 mixes similar strings poorly (in
 * "session-<timestamp>" only the last digits differ) - tabs close in time got neighbouring hues around
 * the circle, that is, visually identical ones. MurmurHash3's finalizer below is the avalanche mixing
 * step after which a small difference in the input gives an entirely different colour number in the
 * output.
 */
const colorForGroup = (groupId: string): string => {
  let hash = 0
  for (let i = 0; i < groupId.length; i++) hash = Math.imul(hash ^ groupId.charCodeAt(i), 0x01000193)

  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16

  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length] ?? GROUP_COLORS[0]!
}

interface HeaderProps {
  sessions: Session[]
  activeSession: string
  onPickSession: (id: string) => void
  onCloseSession: (id: string) => void
  onNewSession: () => void
  /**
   * The tab order after a drag: put the group `groupId` before the group `beforeGroupId` (or at the end,
   * when there is none).
   *
   * What moves is the whole group - a conversation together with its forks. They cannot be dragged apart
   * one by one and someone else's tab cannot be inserted inside: a group is one topic, and a tab in the
   * middle of someone else's topic would mean nothing but confusion.
   *
   * The statistics travels through here too, as a group of one under STATISTICS_GROUP: the strip knows a
   * single kind of rearrangement, and whoever is above sorts out what of it the shell should hear.
   */
  onReorderGroups: (groupId: string, beforeGroupId: string | null) => void
  /**
   * The history, MCP, plugins, sounds, remote access and the preferences are gathered into one menu
   * behind the burger button on the right of the header - there was no longer room in the header for a
   * button per entry. It opens down the panel's right-hand edge and is drawn by App.tsx (see SideMenu):
   * unlike MODEL/EFFORT/MODE it does not stand next to its button, so there is no point to hand over.
   */
  onOpenMenu: () => void
  /**
   * The same layout as the whole panel's (see App.tsx) - what matters here is whether it is a tight one
   * (compact and left/right both save height with the same side rail, see isSideComposerLayout): the
   * header is lower (32px instead of 34px) and its icons smaller (26px instead of 28px). A modifier on
   * the header itself rather than props on every button - that edits one cascade in the styles rather
   * than a dozen places here.
   */
  layout: ComposerLayout
  /**
   * The branch and its PR live in one and the same place in every layout: on the right of the header,
   * before the burger. They used to live in three different places depending on the layout (the status
   * line, the task line, the composer itself) - now there is one source of truth rather than three copies
   * that would have to be kept in agreement.
   */
  gitBranch?: string
  pullRequest?: string
  onOpenPullRequest?: () => void
  /**
   * How many others are watching this project - a browser page beside the IDE, later a phone. Zero
   * hides the mark entirely: the ordinary case is nobody, and a permanent "0" would be noise.
   */
  watchers?: number
  /**
   * The statistics tab: a tab of its own in the strip, standing wherever it was last dragged to.
   *
   * Not a session and not in the sessions list on purpose: the shell owns that list and overwrites it
   * whole, while this tab is this screen's alone - it holds no conversation, and closing it kills
   * nothing. Dragged it is all the same, as a group of one (see STATISTICS_GROUP): `at` is how many
   * conversation groups stand to its left, `active` whether it is the one being looked at. Absent
   * entirely when the tab is not in the strip.
   */
  statistics?: { at: number; active: boolean }
  onPickStatistics?: () => void
  onCloseStatistics?: () => void
}

/**
 * The stripe over the statistics tab. A colour of its own out of the same cool arc the groups draw
 * from, but fixed rather than hashed: the tab is always the same tab, and it should always look it.
 */
const STATISTICS_COLOR = 'hsl(220, 62%, 70%)'

/** Past this offset a press stops being a click and becomes a drag. */
const DRAG_THRESHOLD_PX = 4

/**
 * The margin a change of place is checked against: a hand on the boundary trembles, and without it the
 * neighbours would tremble along with it (see startDrag).
 */
const SWAP_GAP_PX = 8

/** How long a dropped tab's landing lasts. The same as the transition in shell.module.css. */
const LANDING_MS = 160

const DOT_CLASS: Record<SessionState, string> = {
  idle: '',
  running: s.dotRunning ?? '',
  done: s.dotDone ?? '',
  attention: s.dotAttention ?? '',
  crashed: s.dotCrashed ?? '',
}

const DOT_TITLE: Record<SessionState, string> = {
  idle: 'Idle',
  running: 'Claude is working',
  done: 'Turn finished',
  attention: 'Waiting for you',
  crashed: 'Session stopped unexpectedly',
}

/**
 * Three lines as a drawing rather than the "☰" character: the typographic version has a seat of its own
 * in the font and sits below the middle of its line - next to the branch (see BranchChip), whose centre
 * is honest, the difference read to the eye as an unpainted row. Drawn, the lines stand strictly in the
 * centre of the viewBox, and with it of the button.
 */
const HamburgerIcon = () => (
  <svg className={s.menuIcon} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const Header = ({
  sessions,
  activeSession,
  onPickSession,
  onCloseSession,
  onNewSession,
  onReorderGroups,
  onOpenMenu,
  layout,
  gitBranch,
  watchers = 0,
  pullRequest,
  onOpenPullRequest,
  statistics,
  onPickStatistics,
  onCloseStatistics,
}: HeaderProps) => {
  const compact = layout === 'compact' || isSideComposerLayout(layout)
  const header = useRef<HTMLElement>(null)
  const tabs = useRef<HTMLDivElement>(null)

  /** The tab has just been dragged - the next click on it is the gesture's tail rather than a choice. */
  const dragged = useRef(false)
  /** The group being dragged right now - it travels with the cursor and is lifted. */
  const [dragging, setDragging] = useState<string | null>(null)
  /** How far to shift it: as far as the hand has travelled from where it pressed. */
  const [offset, setOffset] = useState(0)
  /**
   * How far to move each of the other groups to make room.
   *
   * We move them by an offset rather than by rearranging the row: while the gesture lasts, the order in
   * the state does not change at all. Rearranging on the fly created a feedback loop - a neighbour moved
   * away, the geometry changed, the condition fired again, and the tabs started darting about. Here the
   * whole calculation runs off one snapshot taken at the gesture's start, and there is nothing to dart
   * about.
   */
  const [shifts, setShifts] = useState<Record<string, number>>({})

  /**
   * Where the groups stood on screen at the moment the tab was released.
   *
   * Without this snapshot the landing jerked: rearranging the row and dropping the offsets happen in one
   * frame, and the browser saw only the final layout. The tab teleported from under the hand into its
   * slot, while the neighbours on top of that played out an offset that had already been cancelled - a
   * jump by a tab's width and a slow return. With the snapshot that same frame starts from the previous
   * picture and travels to the new one.
   */
  const landing = useRef<Map<string, { x: number; y: number }> | null>(null)

  /**
   * A snapshot of the row: where each group stands and how wide it is.
   *
   * It is taken once, at the gesture's start, and does not change after that - which is exactly why the
   * pushing apart comes out calm: every decision is made from a motionless picture rather than from the
   * one we are moving ourselves.
   */
  const rowSnapshot = (): { groupId: string; left: number; right: number; top: number; bottom: number }[] => {
    const root = tabs.current
    if (!root) return []

    const groups: { groupId: string; left: number; right: number; top: number; bottom: number }[] = []

    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-group]'))) {
      const groupId = node.dataset.group
      if (!groupId) continue

      const left = node.offsetLeft
      const right = left + node.offsetWidth
      const top = node.offsetTop
      const bottom = top + node.offsetHeight
      const last = groups.at(-1)

      if (last?.groupId === groupId) {
        last.left = Math.min(last.left, left)
        last.right = Math.max(last.right, right)
        last.top = Math.min(last.top, top)
        last.bottom = Math.max(last.bottom, bottom)
        continue
      }

      groups.push({ groupId, left, right, top, bottom })
    }

    return groups
  }

  /** The tabs by group: a group holds as many as the conversation has forks. */
  const groupNodes = (): Map<string, HTMLElement[]> => {
    const root = tabs.current
    const nodes = new Map<string, HTMLElement[]>()
    if (!root) return nodes

    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-group]'))) {
      const groupId = node.dataset.group
      if (!groupId) continue

      const list = nodes.get(groupId)
      if (list) list.push(node)
      else nodes.set(groupId, [node])
    }

    return nodes
  }

  /**
   * How far a tab is currently offset from its place in the layout.
   *
   * We ask the browser rather than compute it ourselves: if a neighbour is still travelling at that
   * moment, this gives its real position halfway there rather than where it is only about to arrive.
   * Otherwise a drop in the middle of someone else's move would snap that neighbour to its end point.
   */
  const liveShift = (node: HTMLElement): { x: number; y: number } => {
    const transform = getComputedStyle(node).transform
    if (!transform || transform === 'none') return { x: 0, y: 0 }

    try {
      const matrix = new DOMMatrixReadOnly(transform)
      return { x: matrix.m41, y: matrix.m42 }
    } catch {
      return { x: 0, y: 0 }
    }
  }

  /**
   * Where a tab is asking to go at such an offset: its place number in the row.
   *
   * A neighbour gives way when the tab has covered more than half of it - that is, when its edge has
   * passed the neighbour's middle. The answer depends only on the hand's position and the motionless
   * snapshot of the row: one and the same hand gives one and the same answer, however many times it is
   * asked.
   */
  const placeFor = (
    row: { groupId: string; left: number; right: number; top: number; bottom: number }[],
    from: number,
    shift: number,
  ): number => {
    const own = row[from]
    if (!own) return from

    const left = own.left + shift
    const right = own.right + shift
    let place = from

    for (const [index, group] of row.entries()) {
      if (index === from) continue
      // Neighbours from other rows do not step aside: a horizontal offset is meaningless for them, and
      // the row wraps when there is not enough space.
      if (group.bottom <= own.top || group.top >= own.bottom) continue

      const middle = (group.left + group.right) / 2
      if (index < from && left < middle) place = Math.min(place, index)
      if (index > from && right > middle) place = Math.max(place, index)
    }

    return place
  }

  /**
   * The start of a drag.
   *
   * Ordinary mouse events and listeners on the window itself rather than pointer events with capture:
   * the IDE's embedded browser renders offscreen and synthesizes input itself - pointer capture there
   * never reaches the tab, and a drag simply did not begin. Listeners on the window work in both cases
   * and go on catching the mouse when it has left the row of tabs.
   *
   * preventDefault straight away: otherwise the browser reads a held button as a text selection and
   * highlights the tab's caption instead of moving it.
   */
  const startDrag = (event: ReactMouseEvent<HTMLDivElement>, groupId: string) => {
    // A new press is a new story: the previous drag's tail has nothing to do with it. We clear it here
    // rather than in the tab's click handler: that one does not always run - releasing a tab outside the
    // row sends the click to a common ancestor, and a raised flag would swallow the next genuine click on
    // a tab.
    dragged.current = false

    // We drag with the left button only and by the tab itself only: the close cross stays a button
    // rather than a drag handle.
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return

    event.preventDefault()

    const row = rowSnapshot()
    const from = row.findIndex((group) => group.groupId === groupId)
    if (from < 0) return

    const own = row[from]!
    const width = own.right - own.left
    const startX = event.clientX
    let started = false
    let place = from

    const onMove = (move: MouseEvent) => {
      if (!started) {
        // Below the threshold this is still an ordinary click on a tab rather than a drag.
        if (Math.abs(move.clientX - startX) < DRAG_THRESHOLD_PX) return
        started = true
        setDragging(groupId)
      }

      const shift = move.clientX - startX
      setOffset(shift)

      /**
       * A new place is accepted only if it holds at a slightly smaller offset too: right on the
       * boundary a hand trembles by a couple of pixels, and without this check the neighbours started
       * trembling back and forth along with it.
       */
      const wanted = placeFor(row, from, shift)
      if (wanted !== place) {
        const backOff = wanted > place ? -SWAP_GAP_PX : SWAP_GAP_PX
        if (placeFor(row, from, shift + backOff) === wanted) place = wanted
      }

      /**
       * The neighbours between the old place and the new one move aside by a tab's width - exactly
       * enough to make room for it. They move by an offset while the row itself stays as it is: the
       * order changes once, when the tab is released.
       */
      const next: Record<string, number> = {}
      for (const [index, group] of row.entries()) {
        if (index === from) continue
        if (index > from && index <= place) next[group.groupId] = -width
        if (index < from && index >= place) next[group.groupId] = width
      }
      setShifts(next)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      if (started) {
        // The picture on screen before the drop - the landing starts from it. The layout did not change
        // during the gesture, so it is enough to add to the snapshot's places the offset each group is
        // currently drawn with.
        const nodes = groupNodes()
        const rendered = new Map<string, { x: number; y: number }>()
        for (const group of row) {
          const node = nodes.get(group.groupId)?.[0]
          const live = node ? liveShift(node) : { x: 0, y: 0 }
          rendered.set(group.groupId, { x: group.left + live.x, y: group.top + live.y })
        }
        landing.current = rendered

        // The destination in the original row: having travelled to the right, we stand before the group
        // that came after the last one to step aside.
        const before = place > from ? (row[place + 1]?.groupId ?? null) : row[place]?.groupId ?? null
        if (place !== from) onReorderGroups(groupId, before)

        // A click after a drag does not switch the tab: the hand was moving it rather than choosing it.
        // The click event arrives right after mouseup - we suppress it there.
        dragged.current = true
      }

      setDragging(null)
      setOffset(0)
      setShifts({})
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * The landing after a drop.
   *
   * The frame in which the order changes starts from the previous picture: every group gets a short
   * journey from where it stood under the hand to its new place. The neighbours meanwhile stand rooted
   * (they have nowhere to travel - they are already where they belong), while the dropped tab calmly
   * travels from under the hand into the freed slot.
   *
   * An ordinary effect will not do here: it would fire after the browser had already drawn the frame in
   * the new places - that is, after the jerk itself.
   */
  useLayoutEffect(() => {
    const before = landing.current
    if (!before) return
    landing.current = null

    const nodes = groupNodes()

    for (const group of rowSnapshot()) {
      const was = before.get(group.groupId)
      if (!was) continue

      const dx = was.x - group.left
      const dy = was.y - group.top

      for (const node of nodes.get(group.groupId) ?? []) {
        // The journey goes as an animation rather than a transition: for the neighbours the offset comes
        // out zero, and without one they would play out a cancelled transition - a jump by a tab's width
        // and a slow return. An animation stands above a transition in the cascade and holds them in
        // place while that one plays out for nothing.
        node.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
          duration: LANDING_MS,
          easing: 'ease',
        })
      }
    }
  })

  /**
   * When there is not enough room the tabs wrap onto a second line - the header grows. The overlays
   * (history, MCP, plugins, the menu) are positioned from its real height through a variable rather than
   * a number: otherwise, with a second line, they would lie over the tabs.
   */
  useEffect(() => {
    const element = header.current
    if (!element) return

    const updateHeight = () => {
      document.documentElement.style.setProperty('--header-height', `${element.offsetHeight}px`)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /**
   * How far a tab stands from its place in the layout while a gesture lasts: the group under the hand
   * travels with it, the rest step aside to make room (see shifts). One and the same for a conversation
   * and for the statistics - as far as the strip is concerned they are the same kind of thing.
   */
  const dragStyle = (groupId: string) => {
    if (dragging === groupId) return { transform: `translateX(${offset}px)` }
    const shift = shifts[groupId]
    return shift ? { transform: `translateX(${shift}px)` } : {}
  }

  /**
   * The strip block by block: a conversation with its forks, and the statistics standing wherever it was
   * left. Drawn from one list rather than from "the sessions, and then the statistics after them" -
   * otherwise that tab could be dragged anywhere and would still snap back to the end.
   */
  const groups: { groupId: string; tabs: Session[] }[] = []
  for (const session of sessions) {
    const last = groups.at(-1)
    if (last?.groupId === session.groupId) last.tabs.push(session)
    else groups.push({ groupId: session.groupId, tabs: [session] })
  }
  const statsAt = statistics ? Math.min(Math.max(statistics.at, 0), groups.length) : -1

  const sessionTab = (session: Session, startsGroup: boolean) => {
    const color = colorForGroup(session.groupId)

    return (
      <div
        key={session.id}
        data-group={session.groupId}
        role="tab"
        tabIndex={0}
        aria-selected={session.id === activeSession}
        className={[
          s.tab,
          session.id === activeSession ? s.tabActive : '',
          startsGroup ? s.tabGroupStart : '',
          dragging === session.groupId ? s.tabDragging : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          paddingLeft: 11 + session.depth * 9,
          // The whole group travels at once: a conversation with its forks is one thing.
          ...dragStyle(session.groupId),
        }}
        onMouseDown={(event) => startDrag(event, session.groupId)}
        onClick={() => {
          // The drag's tail rather than a tab being chosen - see startDrag, where the flag is also
          // cleared by the next press.
          if (dragged.current) return
          onPickSession(session.id)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          // Space scrolls the strip otherwise, and the tab under the finger never opens.
          event.preventDefault()
          onPickSession(session.id)
        }}
      >
        <span className={s.tabGroupBar} style={{ background: color }} />
        <span className={`${s.dot} ${DOT_CLASS[session.state]}`} data-tooltip={DOT_TITLE[session.state]} />
        {session.depth > 0 ? (
          <span className={s.tabFork} style={{ color }}>
            ⑂
          </span>
        ) : null}
        <span className={s.tabTitle}>{session.title}</span>
        <button
          type="button"
          className={s.tabClose}
          aria-label={`Close ${session.title}`}
          onClick={(event) => {
            event.stopPropagation()
            onCloseSession(session.id)
          }}
        >
          ×
        </button>
      </div>
    )
  }

  // A data-group of its own and the same press handler as the rest: the strip's drag arithmetic walks
  // [data-group], and this tab is a group of one in it (see STATISTICS_GROUP).
  const statisticsTab = statistics ? (
    <div
      data-group={STATISTICS_GROUP}
      role="tab"
      tabIndex={0}
      aria-selected={statistics.active}
      className={[
        s.tab,
        s.tabStatistics,
        s.tabGroupStart,
        statistics.active ? s.tabActive : '',
        dragging === STATISTICS_GROUP ? s.tabDragging : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={dragStyle(STATISTICS_GROUP)}
      onMouseDown={(event) => startDrag(event, STATISTICS_GROUP)}
      onClick={() => {
        if (dragged.current) return
        onPickStatistics?.()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onPickStatistics?.()
      }}
    >
      <span className={s.tabGroupBar} style={{ background: STATISTICS_COLOR }} />
      <span className={s.dot} data-tooltip="Statistics" />
      <span className={s.tabTitle}>Statistics</span>
      <button
        type="button"
        className={s.tabClose}
        aria-label="Close statistics"
        onClick={(event) => {
          event.stopPropagation()
          onCloseStatistics?.()
        }}
      >
        ×
      </button>
    </div>
  ) : null

  return (
    <header className={`${s.header} ${compact ? s.headerCompact : ''}`} ref={header}>
      {/* A strip of tabs, and said to be one: without it a screen reader announces a row of nameless
          boxes, and nothing in here could be reached by keyboard at all - neither a conversation nor the
          statistics beside them. */}
      <div className={s.tabs} ref={tabs} role="tablist" aria-label="Conversations">
        {groups.map((group, index) => (
          <Fragment key={group.groupId}>
            {index === statsAt ? statisticsTab : null}
            {/* A group is set off from its neighbour by a gap: colour is not enough when the tabs are
                stuck together. The first tab of the strip gets no gap - the styles see to that. */}
            {group.tabs.map((session, place) => sessionTab(session, place === 0))}
          </Fragment>
        ))}
        {statsAt >= groups.length ? statisticsTab : null}

        <button type="button" className={s.tabAdd} data-tooltip="New session" onClick={onNewSession}>
          +
        </button>
      </div>

      <div className={s.spacer} />

      <div className={s.headerTools}>
        {watchers > 0 && (
          <span
            className={s.watchers}
            data-tooltip={`${watchers} other ${watchers === 1 ? 'client is' : 'clients are'} watching this project`}
          >
            ◉ {watchers}
          </span>
        )}

        <BranchChip gitBranch={gitBranch} pullRequest={pullRequest} onOpenPullRequest={onOpenPullRequest} />

        <button
          type="button"
          className={s.historyButton}
          aria-label="Menu"
          data-tooltip="Menu"
          onClick={onOpenMenu}
        >
          <HamburgerIcon />
        </button>
      </div>
    </header>
  )
}
