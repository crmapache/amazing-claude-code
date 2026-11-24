import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { isSideComposerLayout, type ComposerLayout } from '../composerLayout'
import { SPARK_PATH } from './StatusBar'
import s from './shell.module.css'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'
import { useResting } from '../hooks/useResting'
import type { TerminalHoldState, TitleSource } from '../protocol'
import { splitTabTitle } from '../feed/title'
import type { TabCall } from '../sounds'
import { beforeOf, placeOn, rowFor, shotOf, SWAP_GAP_PX, type Point, type Shot, type TabRect } from '../tabDrag'
import { ContextMenu } from './ContextMenu'
import { NameField } from './NameField'

/**
 * What is happening in a tab: nothing, work under way, work finished, or someone being waited for. The
 * circle is one and the same, the colour and the breathing differ - that way the state is visible out of
 * the corner of the eye, without reading a caption.
 */
export type SessionState = 'idle' | 'running' | 'done' | 'attention' | 'crashed'

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
   * Fork the open tab's conversation, whole (see App.fork) - the button on the right of the header, beside
   * the menu, the way Amazing IDE has it. The tabs carry none of their own: one on every tab
   * stood beside the one up here, and the strip is the place for names (2026-10-21).
   */
  onFork?: (sessionId: string) => void
  /**
   * The tabs with a conversation to fork. With any other open - one nobody has written into, the statistics,
   * the scenarios - the header's button goes dead and says why.
   */
  forkable?: ReadonlySet<string>
  /**
   * The tab order after a drag: put the group `groupId` before the group `beforeGroupId` (or at the end,
   * when there is none).
   *
   * What moves is the whole group - a conversation together with its forks. They cannot be dragged apart
   * one by one and someone else's tab cannot be inserted inside: a group is one topic, and a tab in the
   * middle of someone else's topic would mean nothing but confusion.
   *
   * The tabs that hold no conversation travel through here too, each as a group of one (see tabs.ts):
   * the strip knows a single kind of rearrangement, and whoever is above sorts out what of it the shell
   * should hear.
   */
  onReorderGroups: (groupId: string, beforeGroupId: string | null) => void
  /**
   * The other half of the same gesture: a fork dragged inside its own group, to stand before the tab
   * `beforeSessionId` (or last in the group, when there is none).
   *
   * A fork never leaves its group and never steps in front of the conversation it grew out of - see
   * moveWithinGroup in tabs.ts, which this hands the decision to. Which of the two a press starts is
   * decided by what is under it: the head of a group carries the group, a fork carries itself.
   */
  onReorderTabs: (sessionId: string, beforeSessionId: string | null) => void
  /**
   * The name the person typed into a conversation's tab - a double click on it opens the field (see
   * NameField). Only when it changed: a name confirmed as it stood is not a new one, and it would
   * otherwise pin whatever the model had called the conversation as the person's own.
   */
  onNameSession: (id: string, title: string) => void
  /**
   * The tab whose name is being typed right now, if any. Held above the strip because a double click is
   * not the only door: `/rename` with no name opens the same field on the tab on screen (see runLocal).
   * One at a time: opening another closes this one through its blur, which keeps what was typed.
   */
  naming: string | null
  onNaming: (id: string | null) => void
  /**
   * The conversation a tab holds, if one has been born in it - for "Copy Session ID" in the tab's right-click
   * menu (see tabMenu). Asked when the menu opens: the strip itself knows tabs, not conversations.
   */
  conversationOf?: (tabId: string) => string | undefined
  onCopySessionId?: (tabId: string) => void
  /** Whether a terminal holds a tab's conversation - the menu offers to show it rather than to open one. */
  terminalOf?: (tabId: string) => TerminalHoldState | undefined
  /** Continue in terminal for a tab under the pointer - see App.continueInTerminal. */
  onContinueInTerminal?: (tabId: string) => void
  /**
   * Enter or Escape has ended a naming, and the keyboard goes back to the input field. Left to itself the
   * focus went nowhere - the field it was in is gone - and the next word typed after naming a tab needed a
   * click first. Only a key does this: a naming put down by a click elsewhere leaves the focus where the
   * hand sent it.
   */
  onReturnToInput: () => void
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
   * The tabs of the strip that hold no conversation: the statistics, the scenarios, a run being watched.
   *
   * Not sessions and not in the sessions list on purpose: the shell owns that list and overwrites it
   * whole, while these belong to this screen alone - they hold no conversation, and closing one kills
   * nothing. Dragged they are all the same, each a group of one (see tabs.ts): `at` is how many
   * conversation groups stand to its left, and the order of this array breaks a tie between two that
   * work out to the same place.
   */
  panelTabs?: PanelTab[]
  onPickPanelTab?: (id: string) => void
  onClosePanelTab?: (id: string) => void
  /**
   * The panel's keys for a new tab and for closing the open one, as hover hints name them (see keyText) -
   * empty while the IDE has not said, and then the hints say only what they always said. The close key's hint
   * names the key that opens the tab again as well (see closeTabHint in App): a close made by mistake is
   * undone from where it was made.
   */
  newTabKey?: string
  closeTabKey?: string
  /**
   * The conversations that called the person with a sound and have not been opened since, by tab. Each
   * glows in the colour of what it called about until it is opened (see TabGlow): the sound says that
   * something happened, and with a dozen tabs open only this says where.
   */
  calls?: Record<string, TabCall>
}

/** One of those tabs, as the strip needs it - see [HeaderProps.panelTabs]. */
export interface PanelTab {
  id: string
  title: string
  at: number
  active: boolean
  /**
   * The stripe over it, and the light it is lit by when open (see .tabActive). A colour out of the same
   * cool arc the groups draw from, but fixed rather than hashed: the statistics is always the statistics,
   * and it should always look it.
   */
  color: string
  closeLabel: string
  /**
   * What its dot says, for the tabs that have something to say - a run of a scenario, and the hub over
   * the runs of this project (see runDot in scenarios/runs.ts). Absent is the grey of the statistics,
   * which is a screen rather than work and is never busy.
   */
  state?: SessionState
  /** The word under the pointer for that dot. Empty leaves the dot without a hint at all. */
  hint?: string
}

const ELLIPSIS = '…'

/** The ellipsis's width in a font, measured once per font: the one glyph the name does not hold. */
const ellipsisWidths = new Map<string, number>()

const ellipsisWidth = (font: string): number => {
  const known = ellipsisWidths.get(font)
  if (known !== undefined) return known

  const context = document.createElement('canvas').getContext('2d')
  if (!context) return 0
  context.font = font
  const width = context.measureText(ELLIPSIS).width
  ellipsisWidths.set(font, width)
  return width
}

/**
 * The name as it fits [room] pixels: whole if it does, otherwise cut in the middle - the head down to the
 * ellipsis, then the last word (see splitTabTitle). Measured on the name itself as the tab lays it out (the
 * hidden copy in TabTitle), so the font, its fallbacks and the kerning are the tab's own. A tail that leaves
 * the head less than a couple of letters is given up, and the name is cut at the end.
 */
const fitTitle = (title: string, text: Text, room: number, font: string): string => {
  const range = document.createRange()
  const width = (to: number, from = 0) => {
    range.setStart(text, from)
    range.setEnd(text, to)
    return range.getBoundingClientRect().width
  }

  if (width(title.length) <= room + 0.5) return title

  /** The head's longest start, letters whole, that fits [budget]; null when not even [least] letters do. */
  const headIn = (head: string, budget: number, least: number): string | null => {
    const stops = [0]
    for (const letter of head) stops.push(stops.at(-1)! + letter.length)

    let low = 0
    let high = stops.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (width(stops[middle]!) <= budget) low = middle
      else high = middle - 1
    }
    return low < least ? null : head.slice(0, stops[low]).trimEnd()
  }

  const dots = ellipsisWidth(font)
  const { head, tail } = splitTabTitle(title)
  if (tail) {
    const kept = headIn(head, room - dots - width(title.length, head.length), 2)
    if (kept !== null) return `${kept}${ELLIPSIS}${tail}`
  }

  return `${headIn(title, room - dots, 0) ?? ''}${ELLIPSIS}`
}

/**
 * A tab's name, for a strip of conversations that often begin alike: "Refactor auth module" and "Refactor
 * auth tests" cut at the end were the same tab twice (asked from IntelliJ IDEA, 0.13.20).
 *
 * So the name is cut in the middle: the head gives way to an ellipsis and the last word stays (see
 * splitTabTitle, fitTitle). The cut is worked out rather than left to `text-overflow`: a box cut by the
 * browser ends its ellipsis wherever the last whole letter did, and in the middle of a name that left a
 * gap of up to a letter before the tail - "Refactor …   documentation".
 *
 * Two copies of the name, for the two jobs it has. The hidden one is the whole name in the flow: it is what
 * the tab is as wide as (the tab grows into its row's room up to its whole name, see .tab in the styles),
 * what is measured, what a screen reader reads, and what the hint checks for a cut. The visible one lies
 * over it, as it fits. Cut or not, the name is whole a hover away - the hint comes up only when something
 * is cut (`data-tooltip-clipped`, see Tooltips), and not on the tab being dragged, where it would ride along.
 */
const TabTitle = ({ title, hint }: { title: string; hint: boolean }) => {
  const box = useRef<HTMLSpanElement>(null)
  const whole = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(title)

  useLayoutEffect(() => {
    const element = box.current
    const text = whole.current?.firstChild
    if (!element || !(text instanceof Text)) return

    const fit = () =>
      setShown(fitTitle(title, text, element.getBoundingClientRect().width, getComputedStyle(element).font))

    fit()
    // The tab's width changes with everything around it - a tab opened or closed in its row, the panel
    // resized - and the webfont may arrive after the first measure.
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    let live = true
    void document.fonts?.ready.then(() => live && fit())

    return () => {
      live = false
      observer.disconnect()
    }
  }, [title])

  return (
    <span ref={box} className={s.tabTitle} data-tooltip={hint ? title : undefined} data-tooltip-clipped="">
      <span ref={whole} className={s.tabTitleWhole}>
        {title}
      </span>
      <span className={s.tabTitleShown} aria-hidden="true">
        {shown}
      </span>
    </span>
  )
}

/**
 * The sparks over a calling tab: where each twinkles, how big, on what rhythm.
 *
 * Along the top and bottom edges, clear of the name in the middle: a spark over a letter reads as a smudge
 * on it. The periods differ and the delays run negative for the reason the ring's sparks have them (see
 * SPARKS in StatusBar) - in step they would blink like a signal rather than shimmer.
 */
const CALL_SPARKS = [
  { left: '16%', top: 2, size: 8, seconds: 2.7, delay: 0.4 },
  { left: '64%', top: 3, size: 6, seconds: 3.3, delay: 1.9 },
  { left: '40%', bottom: 3, size: 7, seconds: 2.4, delay: 1.1 },
  { left: '82%', bottom: 4, size: 6, seconds: 3.6, delay: 2.6 },
]

/** How long the calling tabs keep moving with nobody's hand in the panel - see useResting. */
const CALLS_REST_AFTER_MS = 30_000

/**
 * How far into its rhythm a tab's light starts, out of the moment it was called. Two tabs lit at once
 * would otherwise pass their sheens and open their sparks in step - and they do light up at once, every
 * time the strip wakes from rest (see useResting) - which reads as one signal blinking rather than as
 * light on each.
 */
const CALL_PHASE_SPAN_MS = 5000

/**
 * The light over a tab that called (see [HeaderProps.calls]): an aura rising off its bottom edge, a sheen
 * passing over it now and then, a few sparks - painted in what it called about.
 *
 * It comes and goes by fading rather than at once: always in the tab, invisible while there is nothing to
 * say. The call outlives itself by the length of the fade - taken away together with it, the colour would
 * drain to grey on the way out - and is let go only once the fade is over.
 */
const TabGlow = ({ call }: { call?: TabCall }) => {
  const [paint, setPaint] = useState(call)
  if (call && (call.tone !== paint?.tone || call.at !== paint.at)) setPaint(call)

  const phase = paint ? -(paint.at % CALL_PHASE_SPAN_MS) / 1000 : 0

  return (
    <span
      className={s.tabGlow}
      data-call={paint?.tone}
      data-lit={call ? '' : undefined}
      aria-hidden="true"
      style={{ ['--acc-call-phase' as string]: `${phase}s` }}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return
        if (!call) setPaint(undefined)
      }}
    >
      {paint
        ? CALL_SPARKS.map((spark) => (
            <svg
              key={spark.left}
              className={s.tabSpark}
              viewBox="0 0 12 12"
              style={{
                left: spark.left,
                top: spark.top,
                bottom: spark.bottom,
                width: spark.size,
                height: spark.size,
                animationDuration: `${spark.seconds}s`,
                animationDelay: `${phase - spark.delay}s`,
              }}
            >
              <path d={SPARK_PATH} />
            </svg>
          ))
        : null}
    </span>
  )
}

/** A stable empty default, so a header without such tabs does not rebuild its list on every draw. */
const EMPTY_PANEL_TABS: PanelTab[] = []

/** The same for a header nobody has called from. */
const NO_CALLS: Record<string, TabCall> = {}

/** And for a header that was told of no conversation to fork. */
const NOTHING_FORKABLE: ReadonlySet<string> = new Set()

/** Past this offset a press stops being a click and becomes a drag. */
const DRAG_THRESHOLD_PX = 4

/**
 * What a press moves: a whole group past its neighbours, or one fork inside its own group.
 *
 * Which of the two it is is decided by what is under the hand (see sessionTab): the head of a group
 * carries the group with all its forks, a fork carries only itself. A group of two has nothing to
 * rearrange inside it, so there a fork carries the group as well - the strip would otherwise hold a
 * gesture that visibly does nothing.
 */
type DragKind = 'group' | 'tab'

interface Drag {
  kind: DragKind
  /** The group's id, or the tab's - whichever this gesture moves. */
  id: string
  /** The group the gesture happens in. For a group drag it is the same as [id]. */
  groupId: string
}

/**
 * Which unit of the row a tab belongs to, for the gesture at hand - and nothing at all when it stands
 * outside it: a fork being dragged inside its group has no business with anybody else's tabs, and they
 * have none stepping aside for it.
 */
const unitIdOf = (node: HTMLElement, drag: Drag): string | undefined => {
  const groupId = node.dataset.group
  if (!groupId) return undefined
  if (drag.kind === 'group') return groupId
  return groupId === drag.groupId ? node.dataset.tab : undefined
}

/**
 * What stands in the strip under its own name: a tab - its conversation, or the panel tab it is (see
 * sessionTab and panelTab) - and the "+" after them, which is no tab but moves with the row all the same.
 */
const keyOf = (node: HTMLElement): string | undefined => node.dataset.tab ?? node.dataset.group ?? node.dataset.strip

/**
 * The class of the strip's last tab, the one that keeps the room the "+" stands in (see .tabTail). Read once
 * and checked: a gesture hands it from tab to tab by hand (see projectionFor), and classList refuses an
 * empty name with an exception.
 */
const TAIL_CLASS = s.tabTail ?? ''

/** How long a dropped tab's landing lasts. The same as the transition in shell.module.css. */
const LANDING_MS = 160

const DOT_CLASS: Record<SessionState, string> = {
  idle: '',
  running: s.dotRunning ?? '',
  done: s.dotDone ?? '',
  attention: s.dotAttention ?? '',
  crashed: s.dotCrashed ?? '',
}

/** What the dot on a tab says when the pointer rests on it - see SessionState. */
const dotTitle = (t: Dict): Record<SessionState, string> => ({
  idle: t.header.idle,
  running: t.header.running,
  done: t.header.done,
  attention: t.header.attention,
  crashed: t.header.crashed,
})

/**
 * A branch: one line splitting in two - what a fork is. Drawn rather than typed: the fork glyph a fork's
 * tab wears before its name comes out of the system's fallback font at a size of its own, and as a button
 * it read as a speck.
 */
const ForkIcon = () => (
  <svg className={s.menuIcon} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="4.5" cy="3.5" r="1.6" />
    <circle cx="11.5" cy="3.5" r="1.6" />
    <circle cx="8" cy="12.5" r="1.6" />
    <path d="M4.5 5.1v.9a2.2 2.2 0 0 0 2.2 2.2h2.6A2.2 2.2 0 0 0 11.5 6v-.9" />
    <path d="M8 8.2v2.7" />
  </svg>
)

/**
 * A new tab - drawn for the same reason as the burger (see below): "+" in the font sits off its centre, and
 * as the strip's own button it is the same drawing it wore in the header.
 */
const PlusIcon = () => (
  <svg className={s.menuIcon} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

/**
 * Three lines as a drawing rather than the "☰" character: the typographic version has a seat of its own
 * in the font and sits below the middle of its line, and beside the drawn button next to it the
 * difference read to the eye as an unpainted row. Drawn, the lines stand strictly in the centre of the
 * viewBox, and with it of the button.
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
  onFork,
  forkable = NOTHING_FORKABLE,
  onReorderGroups,
  onReorderTabs,
  onNameSession,
  naming,
  onNaming,
  conversationOf,
  onCopySessionId,
  terminalOf,
  onContinueInTerminal,
  onReturnToInput,
  onOpenMenu,
  layout,
  panelTabs = EMPTY_PANEL_TABS,
  onPickPanelTab,
  onClosePanelTab,
  calls = NO_CALLS,
  newTabKey = '',
  closeTabKey = '',
}: HeaderProps) => {
  const t = useT()
  const compact = layout === 'compact' || isSideComposerLayout(layout)
  const header = useRef<HTMLElement>(null)
  const tabs = useRef<HTMLDivElement>(null)

  /**
   * The calling tabs hold still once nobody has been around for a while, and a fresh call sets them going
   * again - see useResting. What stays is the aura: the colour is what answers "which tab was that", the
   * movement only draws the eye to it.
   */
  const callValues = Object.values(calls)
  const resting = useResting(
    CALLS_REST_AFTER_MS,
    callValues.reduce((latest, call) => Math.max(latest, call.at), 0),
    callValues.length > 0,
  )

  /** The tab has just been dragged - the next click on it is the gesture's tail rather than a choice. */
  const dragged = useRef(false)
  /**
   * What is being dragged right now - it travels with the cursor and is lifted.
   *
   * Two kinds of gesture live in one piece of arithmetic: 'group' moves a conversation with all its forks
   * past its neighbours, 'tab' rearranges one group's forks between themselves. The difference is only in
   * what counts as a unit of the row - everything below works over units and asks no further questions.
   */
  const [dragging, setDragging] = useState<Drag | null>(null)
  /**
   * How far to shift it: as far as the hand has travelled from where it pressed - along the strip and, when
   * the strip has wrapped, up and down its rows.
   */
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  /**
   * How far to move each of the other tabs to make room, by the tab (see keyOf).
   *
   * We move them by an offset rather than by rearranging the row: while the gesture lasts, the order in
   * the state does not change at all. Rearranging on the fly created a feedback loop - a neighbour moved
   * away, the geometry changed, the condition fired again, and the tabs started darting about. Here the
   * whole calculation runs off one snapshot taken at the gesture's start, and there is nothing to dart
   * about.
   *
   * By the tab rather than by the group: on a wrapped strip one group's tabs can go different ways - the
   * head stays at the end of a row while its fork wraps onto the next one.
   */
  const [shifts, setShifts] = useState<Record<string, Point>>({})
  /**
   * How tall the strip stands while a gesture lasts, when the drop is going to need more rows than it has
   * now (see projectionFor) - otherwise nothing, and the strip is as tall as its tabs.
   */
  const [reach, setReach] = useState<number | null>(null)
  /**
   * The right-click menu of a conversation's tab and the tab it was opened on (see ContextMenu). Renaming
   * there opens the same field a double click does - the menu is the door that can be seen, a double click
   * on a tab is one nobody guesses.
   */
  const [tabMenu, setTabMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null)
  // Steady across renders: the menu listens for Escape and the pointer with it (see Menu).
  const closeTabMenu = useCallback(() => setTabMenu(null), [])

  /**
   * The two reorder callbacks as they stand when the tab is dropped rather than when it was pressed. A
   * gesture outlives the render it began in, and the callbacks close over the strip they were made with:
   * a name typed into a tab is put down by the very press that starts a drag (see startDrag), and the
   * strip as it stood a render earlier would come back from the drop without it.
   */
  const reorder = useRef({ onReorderGroups, onReorderTabs })
  reorder.current = { onReorderGroups, onReorderTabs }

  const finishNaming = (session: Session, name: string | null, byKey: boolean) => {
    onNaming(null)
    const next = name?.trim()
    if (next && next !== session.title) onNameSession(session.id, next)
    if (byKey) onReturnToInput()
  }

  /**
   * Where everything in the strip stood on screen at the moment the tab was released, and whether it was
   * drawn away from its place in the layout then (see the landing below).
   *
   * Without this snapshot the landing jerked: rearranging the row and dropping the offsets happen in one
   * frame, and the browser saw only the final layout. The tab teleported from under the hand into its
   * slot, while the neighbours on top of that played out an offset that had already been cancelled - a
   * jump by a tab's width and a slow return. With the snapshot that same frame starts from the previous
   * picture and travels to the new one.
   */
  const landing = useRef<Map<string, Point & { shifted: boolean }> | null>(null)

  /** Everything in the strip under its own name (see keyOf), in the order it is drawn. */
  const stripNodes = (): HTMLElement[] =>
    Array.from(tabs.current?.children ?? []).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && keyOf(node) !== undefined,
    )

  /** Where everything in the strip stands in the layout - the offsets a gesture draws it with left out. */
  const layoutOf = (): Map<string, Point> =>
    new Map(stripNodes().map((node) => [keyOf(node)!, { x: node.offsetLeft, y: node.offsetTop }]))

  /**
   * A snapshot of the strip for the gesture at hand: every tab, where it stands, and which unit of the
   * gesture it belongs to (see Shot).
   *
   * It is taken once, at the gesture's start, and does not change after that - which is exactly why the
   * pushing apart comes out calm: every decision is made from a motionless picture rather than from the
   * one we are moving ourselves.
   *
   * A group drag sees the whole strip, group by group; a fork dragged inside its group sees that group's
   * tabs and nothing else.
   */
  const stripShot = (drag: Drag): Shot => {
    const rects: TabRect[] = []
    for (const node of stripNodes()) {
      const key = keyOf(node)
      if (!key || !node.dataset.group) continue
      rects.push({
        key,
        unit: unitIdOf(node, drag),
        left: node.offsetLeft,
        right: node.offsetLeft + node.offsetWidth,
        top: node.offsetTop,
      })
    }
    return shotOf(rects)
  }

  /**
   * Where every other tab goes to make room, with the carried unit put before `before` (null - the end),
   * measured against `laid` - the strip as it stood when the gesture began.
   *
   * Not reckoned but asked of the browser: the strip is laid out once more in the order the drop is going
   * to give it, measured, and put back - all inside one task, so no frame ever sees it. On a wrapped strip
   * nothing else gives the truth: a tab carried into a row pushes that row's last tab onto the next one,
   * which pushes the next row's last, and a narrower tab leaving a row lets the start of the following row
   * climb into it. A shift by the carried tab's width, which was enough while the strip was one row,
   * cannot say any of that.
   *
   * By the flex `order` of the strip's own children rather than by moving nodes: React owns those nodes,
   * and the "+" at the end gets its number like everybody else and stays at the end. It moves with the
   * rest, too: left where it stood, it lay over the tab that came to the end of its row. The room it
   * stands in belongs to the last tab (see .tabTail), and that rule goes by the markup as well - so it is
   * handed to the tab the drop puts last, or the "+" would be measured inside a tab that has moved on and
   * the row it ends would come out a button too long.
   *
   * The height comes along: a drop that folds the strip onto one more row pushes a tab onto a row that is
   * not there yet, and that tab hid under the panel until the hand let go. The strip grows for it while
   * the gesture lasts - by exactly the row the drop is going to add anyway.
   */
  const projectionFor = (
    drag: Drag,
    laid: Map<string, Point>,
    before: string | null,
  ): { shifts: Record<string, Point>; height: number | null } => {
    const root = tabs.current
    if (!root) return { shifts: {}, height: null }

    const children = Array.from(root.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
    const carried = children.filter((node) => unitIdOf(node, drag) === drag.id)
    const rest = children.filter((node) => unitIdOf(node, drag) !== drag.id)

    let at = -1
    if (before === null) {
      // The end of the gesture's row rather than of the strip: the "+" stays last, and a fork carried to
      // the end of its group stops at the group's end.
      rest.forEach((node, index) => {
        if (unitIdOf(node, drag) !== undefined) at = index + 1
      })
    } else {
      at = rest.findIndex((node) => unitIdOf(node, drag) === before)
    }
    if (at < 0) return { shifts: {}, height: null }

    // Measured without the height a previous place of the gesture asked for, or the strip would only grow.
    const asked = root.style.minHeight
    root.style.minHeight = ''
    const height = root.offsetHeight

    const sequence = [...rest.slice(0, at), ...carried, ...rest.slice(at)]
    sequence.forEach((node, order) => {
      node.style.order = String(order)
    })
    // The strip's first tab stands flush with its edge, and the rule saying so (.tabGroupStart:first-child)
    // goes by the markup rather than by `order`. So the edge is handed to the tab the drop puts first, and
    // the one first in the markup takes a group's gap - or every row after it came out six pixels off.
    const leader = sequence.find((node) => node.dataset.group)
    const marked = children[0]
    const handOver = leader !== undefined && marked !== undefined && leader !== marked
    if (handOver) {
      leader.style.marginLeft = '0px'
      marked.style.marginLeft = 'var(--acc-group-gap)'
    }
    // The same at the other end: the room the "+" stands in goes to the tab the drop puts last.
    const tail = sequence.filter((node) => node.dataset.group).at(-1)
    const tailed = TAIL_CLASS ? children.find((node) => node.classList.contains(TAIL_CLASS)) : undefined
    const handTail = tail !== undefined && tailed !== undefined && tail !== tailed
    if (handTail) {
      tailed.classList.remove(TAIL_CLASS)
      tail.classList.add(TAIL_CLASS)
    }
    const projected = layoutOf()
    const projectedHeight = root.offsetHeight
    for (const node of sequence) node.style.order = ''
    if (handOver) {
      leader.style.marginLeft = ''
      marked.style.marginLeft = ''
    }
    if (handTail) {
      tail.classList.remove(TAIL_CLASS)
      tailed.classList.add(TAIL_CLASS)
    }
    root.style.minHeight = asked

    const next: Record<string, Point> = {}
    // The carried ones travel with the hand instead (see dragStyle).
    const travelling = new Set(carried.map(keyOf))
    for (const [key, to] of projected) {
      const was = laid.get(key)
      if (!was || travelling.has(key)) continue
      const x = to.x - was.x
      const y = to.y - was.y
      if (x || y) next[key] = { x, y }
    }
    return { shifts: next, height: projectedHeight > height ? projectedHeight : null }
  }

  /**
   * How far a tab is currently offset from its place in the layout.
   *
   * We ask the browser rather than compute it ourselves: if a neighbour is still travelling at that
   * moment, this gives its real position halfway there rather than where it is only about to arrive.
   * Otherwise a drop in the middle of someone else's move would snap that neighbour to its end point.
   */
  const liveShift = (node: HTMLElement): Point => {
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
  const startDrag = (event: ReactMouseEvent<HTMLDivElement>, drag: Drag) => {
    // A new press is a new story: the previous drag's tail has nothing to do with it. We clear it here
    // rather than in the tab's click handler: that one does not always run - releasing a tab outside the
    // row sends the click to a common ancestor, and a raised flag would swallow the next genuine click on
    // a tab.
    dragged.current = false

    // We drag with the left button only and by the tab itself only: the close cross stays a button
    // rather than a drag handle.
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return

    // The preventDefault below keeps the focus where it was, and a name being typed into a tab would
    // stay open under a press that picks or drags another. So the field is put down first, keeping what
    // was typed - the way a press anywhere else in the panel puts it down (see NameField).
    const focused = document.activeElement
    if (focused instanceof HTMLInputElement && tabs.current?.contains(focused)) focused.blur()

    event.preventDefault()

    const gripKey = keyOf(event.currentTarget)
    const startX = event.clientX
    const startY = event.clientY

    /**
     * The picture the whole gesture is answered from, taken on the first move of the hand rather than on
     * the press. The press puts down a name being typed into a tab (see above), and the strip redraws with
     * the field gone a moment later: a picture taken under the press had the field's width in it, and the
     * neighbours stood aside for places twenty pixels off the ones the drop then gave them.
     */
    const begin = () => {
      const shot = stripShot(drag)
      const from = shot.units.indexOf(drag.id)
      const grip = shot.tabs.find((tab) => tab.key === gripKey)
      // The run of the carried unit on the row the hand took it by: a group wrapped onto two rows is
      // carried by the part under the hand, and its other part simply travels along.
      const carried = shot.boxes.find((box) => box.index === from && box.line === grip?.line)
      if (from < 0 || !grip || !carried) return null

      return {
        shot,
        laid: layoutOf(),
        from,
        carried,
        /**
         * Up and down only as far as the gesture's own rows. A strip of one row keeps the tab on it exactly
         * as before - lifted off it, the tab would read as being carried out of the strip somewhere - and a
         * fork goes no higher or lower than its group reaches.
         */
        rowTop: grip.top,
        highest: (shot.lines[0] ?? grip.top) - grip.top,
        lowest: (shot.lines.at(-1) ?? grip.top) - grip.top,
      }
    }

    let gesture: ReturnType<typeof begin> | undefined

    /**
     * The head of a group stays the head: a fork may be dragged among the other forks and no further (see
     * moveWithinGroup). The floor is set here as well as there, or the neighbours would step aside for a
     * place the drop is going to refuse.
     */
    const floor = drag.kind === 'tab' ? 1 : 0

    let started = false
    let place = 0
    let row = 0
    // The place the neighbours are standing aside for right now - they are measured anew only when it
    // changes, not on every move of the hand.
    let shown = 0

    const onMove = (move: MouseEvent) => {
      if (gesture === undefined) {
        gesture = begin()
        if (gesture) {
          place = gesture.from
          shown = gesture.from
          row = gesture.carried.line
        }
      }
      // Nothing to carry: the tab is gone from the strip, or never was part of it.
      if (!gesture) {
        onUp()
        return
      }

      const { shot, laid, from, carried, rowTop, highest, lowest } = gesture
      const dx = move.clientX - startX
      const dy = Math.min(Math.max(move.clientY - startY, highest), lowest)

      if (!started) {
        // Below the threshold this is still an ordinary click on a tab rather than a drag.
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
        started = true
        setDragging(drag)
      }

      setOffset({ x: dx, y: dy })

      /**
       * A new place is accepted only if it holds at a slightly smaller offset too: right on the
       * boundary a hand trembles by a couple of pixels, and without this check the neighbours started
       * trembling back and forth along with it. The row has a margin of its own (see rowFor).
       */
      row = rowFor(shot.lines, rowTop + dy, row)
      const wanted = Math.max(floor, placeOn(shot.boxes, from, carried, row, dx))
      if (wanted !== place) {
        const backOff = wanted > place ? -SWAP_GAP_PX : SWAP_GAP_PX
        if (Math.max(floor, placeOn(shot.boxes, from, carried, row, dx + backOff)) === wanted) place = wanted
      }

      /**
       * The other tabs move to where the drop is going to put them - along the row and, on a wrapped
       * strip, from one row to the next. They move by an offset while the row itself stays as it is: the
       * order changes once, when the tab is released.
       */
      if (place !== shown) {
        shown = place
        const projection = place === from ? null : projectionFor(drag, laid, beforeOf(shot.units, from, place))
        setShifts(projection?.shifts ?? {})
        setReach(projection?.height ?? null)
      }
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      if (started && gesture) {
        // The picture on screen before the drop - the landing starts from it: each tab's place in the
        // layout plus the offset it is drawn with right now.
        const rendered = new Map<string, Point & { shifted: boolean }>()
        for (const node of stripNodes()) {
          const key = keyOf(node)
          if (!key) continue
          const live = liveShift(node)
          rendered.set(key, { x: node.offsetLeft + live.x, y: node.offsetTop + live.y, shifted: !!(live.x || live.y) })
        }
        landing.current = rendered

        if (place !== gesture.from) {
          const before = beforeOf(gesture.shot.units, gesture.from, place)
          if (drag.kind === 'tab') reorder.current.onReorderTabs(drag.id, before)
          else reorder.current.onReorderGroups(drag.id, before)
        }

        // A click after a drag does not switch the tab: the hand was moving it rather than choosing it.
        // The click event arrives right after mouseup - we suppress it there.
        dragged.current = true
      }

      setDragging(null)
      setOffset({ x: 0, y: 0 })
      setShifts({})
      setReach(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * The landing after a drop.
   *
   * The frame in which the order changes starts from the previous picture: every tab gets a short
   * journey from where it stood under the hand to its new place. The neighbours meanwhile stand rooted
   * (they have nowhere to travel - they are already where they belong), while the dropped tab calmly
   * travels from under the hand into the freed slot.
   *
   * An ordinary effect will not do here: it would fire after the browser had already drawn the frame in
   * the new places - that is, after the jerk itself.
   */
  useLayoutEffect(() => {
    const was = landing.current
    if (!was) return
    landing.current = null

    for (const node of stripNodes()) {
      const from = was.get(keyOf(node) ?? '')
      if (!from) continue

      const dx = from.x - node.offsetLeft
      const dy = from.y - node.offsetTop
      // A tab that neither stood aside nor has anywhere to go is left alone.
      if (!dx && !dy && !from.shifted) continue

      // The journey goes as an animation rather than a transition: for the neighbours the offset comes
      // out zero, and without one they would play out a cancelled transition - a jump by a tab's width
      // and a slow return. An animation stands above a transition in the cascade and holds them in
      // place while that one plays out for nothing.
      node.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: LANDING_MS,
        easing: 'ease',
      })
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
   * and for the tabs that hold no conversation - as far as the strip is concerned they are one kind of
   * thing.
   */
  const dragStyle = (groupId: string, tabId?: string) => {
    if (!dragging) return {}

    // The gesture in progress decides what travels with the hand: a whole group, or one fork inside its
    // group. Everybody else goes where the drop will put them - usually nowhere for a fork's gesture, but a
    // fork of another width rearranged on a wrapped strip can move a row's end onto the next row.
    const carried = dragging.kind === 'tab' ? tabId === dragging.id : groupId === dragging.id
    const shift = carried ? offset : shifts[tabId ?? groupId]
    return shift ? { transform: `translate(${shift.x}px, ${shift.y}px)` } : {}
  }

  /**
   * The strip block by block: a conversation with its forks, and the panel's own tabs standing wherever
   * they were left. Drawn from one list rather than from "the sessions, and then the others after them" -
   * otherwise those tabs could be dragged anywhere and would still snap back to the end.
   */
  const groups: { groupId: string; tabs: Session[] }[] = []
  for (const session of sessions) {
    const last = groups.at(-1)
    if (last?.groupId === session.groupId) last.tabs.push(session)
    else groups.push({ groupId: session.groupId, tabs: [session] })
  }
  /** Every such tab clamped to the strip it is actually in - a stale place must not point past its end. */
  const panels = panelTabs.map((tab) => ({ ...tab, at: Math.min(Math.max(tab.at, 0), groups.length) }))
  /**
   * Whether the header's fork has a conversation to carry: the open tab's own, by the same set the tabs'
   * buttons read. A panel tab open (the statistics, the scenarios) is not in it, and neither is a tab nobody
   * has written into yet.
   */
  const openForkable = forkable.has(activeSession)
  /** The panel's own tabs standing after the last conversation, in the order they are drawn. */
  const trailing = panels.filter((tab) => tab.at >= groups.length)
  /**
   * The strip's last tab, the one the "+" is glued to: it keeps the room the "+" stands in (see .tabTail), so
   * the two wrap as one and the "+" never goes down a row by itself.
   */
  const tailId = trailing.at(-1)?.id ?? groups.at(-1)?.tabs.at(-1)?.id

  const sessionTab = (session: Session, startsGroup: boolean, groupSize: number) => {
    const color = colorForGroup(session.groupId)
    /**
     * A fork carries itself, everything else carries the group. Two tabs in a group are left to the group
     * gesture on purpose: with a single fork under an unmovable head there is nothing to rearrange, and a
     * press that visibly does nothing reads as a broken strip.
     */
    const drag: Drag = startsGroup || groupSize < 3
      ? { kind: 'group', id: session.groupId, groupId: session.groupId }
      : { kind: 'tab', id: session.id, groupId: session.groupId }

    return (
      <div
        key={session.id}
        data-group={session.groupId}
        data-tab={session.id}
        role="tab"
        tabIndex={0}
        aria-selected={session.id === activeSession}
        className={[
          s.tab,
          session.id === activeSession ? s.tabActive : '',
          startsGroup ? s.tabGroupStart : '',
          session.id === tailId ? TAIL_CLASS : '',
          // Everything the gesture carries is lifted, not only the tab under the hand: a group travels
          // whole, so all its tabs rise with it, while a fork moved inside its group rises alone.
          (dragging?.kind === 'tab' ? dragging.id === session.id : dragging?.id === session.groupId)
            ? s.tabDragging
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          // To the styles rather than onto the stripe: the stripe, the fork sign and the light of the open tab
          // all paint with it, and the theme decides how deep (see --acc-group-paint).
          ['--acc-group' as string]: color,
          paddingLeft: 11 + session.depth * 9,
          // The whole group travels at once, unless the hand took a fork by itself - see [drag] above.
          ...dragStyle(session.groupId, session.id),
        }}
        onMouseDown={(event) => startDrag(event, drag)}
        onClick={() => {
          // The drag's tail rather than a tab being chosen - see startDrag, where the flag is also
          // cleared by the next press.
          if (dragged.current) return
          onPickSession(session.id)
        }}
        onDoubleClick={(event) => {
          // The cross is a button of its own, and two quick presses on it are two closes rather than a
          // rename. Nor is the tail of a drag a double click on anything.
          if ((event.target as HTMLElement).closest('button') || dragged.current) return
          onNaming(session.id)
        }}
        onContextMenu={(event) => {
          // The cross keeps the browser's menu, and so does the name field: cut and paste live there.
          if ((event.target as HTMLElement).closest('button, input') || dragged.current) return
          event.preventDefault()
          setTabMenu({ sessionId: session.id, x: event.clientX, y: event.clientY })
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          // Space scrolls the strip otherwise, and the tab under the finger never opens.
          event.preventDefault()
          onPickSession(session.id)
        }}
      >
        <TabGlow call={calls[session.id]} />
        <span className={s.tabGroupBar} />
        <span className={`${s.dot} ${DOT_CLASS[session.state]}`} data-tooltip={dotTitle(t)[session.state]} />
        {session.depth > 0 ? <span className={s.tabFork}>⑂</span> : null}
        {naming === session.id ? (
          <NameField
            title={session.title}
            label={t.header.renameTab}
            className={s.tabNameField}
            onDone={(name, byKey) => finishNaming(session, name, byKey)}
          />
        ) : (
          <TabTitle title={session.title} hint={!dragging} />
        )}
        <button
          type="button"
          className={s.tabClose}
          aria-label={`Close ${session.title}`}
          /* The key and nothing else, as on Send: the cross says "close" by itself. Only on the open tab -
             the key closes that one, and named on another tab's cross it would promise to close that. */
          data-tooltip={session.id === activeSession && closeTabKey ? closeTabKey : undefined}
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
  // [data-group], and each of these is a group of one in it (see tabs.ts).
  const panelTab = (tab: PanelTab) => (
    <div
      key={tab.id}
      data-group={tab.id}
      role="tab"
      tabIndex={0}
      aria-selected={tab.active}
      className={[
        s.tab,
        s.tabStatistics,
        s.tabGroupStart,
        tab.active ? s.tabActive : '',
        tab.id === tailId ? TAIL_CLASS : '',
        dragging?.id === tab.id ? s.tabDragging : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ['--acc-group' as string]: tab.color, ...dragStyle(tab.id) }}
      onMouseDown={(event) => startDrag(event, { kind: 'group', id: tab.id, groupId: tab.id })}
      onClick={() => {
        if (dragged.current) return
        onPickPanelTab?.(tab.id)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onPickPanelTab?.(tab.id)
      }}
    >
      <span className={s.tabGroupBar} />
      {/* A run of a scenario is work, and its dot answers for it exactly as a conversation's does: the
          word beside it is the name of the scenario, so the state is written nowhere else in the strip.
          The statistics passes neither, and its dot stays grey and silent - a hint there would answer
          with the word standing next to it. */}
      <span
        className={`${s.dot} ${DOT_CLASS[tab.state ?? 'idle']}`}
        data-tooltip={tab.hint || undefined}
      />
      <TabTitle title={tab.title} hint={!dragging} />
      <button
        type="button"
        className={s.tabClose}
        aria-label={tab.closeLabel}
        data-tooltip={tab.active && closeTabKey ? closeTabKey : undefined}
        onClick={(event) => {
          event.stopPropagation()
          onClosePanelTab?.(tab.id)
        }}
      >
        ×
      </button>
    </div>
  )

  return (
    // Marked for the open tab's call, which anything done in the panel answers except what is done up here
    // (see the effect over `activeCalling` in App).
    <header className={`${s.header} ${compact ? s.headerCompact : ''}`} ref={header} data-tab-strip>
      {/* A strip of tabs, and said to be one: without it a screen reader announces a row of nameless
          boxes, and nothing in here could be reached by keyboard at all - neither a conversation nor the
          panel's own tabs beside them. */}
      <div
        className={s.tabs}
        style={reach ? { minHeight: reach } : undefined}
        ref={tabs}
        role="tablist"
        aria-label={t.header.conversations}
        data-resting={resting || undefined}
      >
        {groups.map((group, index) => (
          <Fragment key={group.groupId}>
            {panels.filter((tab) => tab.at === index).map(panelTab)}
            {/* A group is set off from its neighbour by a gap: colour is not enough when the tabs are
                stuck together. The first tab of the strip gets no gap - the styles see to that. */}
            {group.tabs.map((session, place) => sessionTab(session, place === 0, group.tabs.length))}
          </Fragment>
        ))}
        {trailing.map(panelTab)}

        {/* Right after the last tab and glued to it: the tab keeps the room this stands in (see .tabTail),
            so when the row runs out the two go down together, and the "+" never stands on a row alone. It
            was in the header beside the menu for a release, and the hand looking for it went to the end of
            the tabs first. Named for the strip's drag arithmetic (see keyOf): it goes where the drop is
            going to put it. */}
        <button
          type="button"
          className={`${s.historyButton} ${s.tabAdd}`}
          data-strip="add"
          style={dragStyle('add')}
          aria-label={t.header.newSession}
          data-tooltip={newTabKey ? `${t.header.newSession} (${newTabKey})` : t.header.newSession}
          onClick={onNewSession}
        >
          <PlusIcon />
        </button>
      </div>

      <div className={s.spacer} />

      {/* Two of the panel's own, in a place that does not move: a fork of the open tab and the menu - the way
          Amazing IDE has them. The branch and its PR stood here once, and gave way: the IDE shows the branch
          already, and the phone, which has no IDE around it, keeps both on its project card. */}
      <div className={s.headerTools}>
        {onFork ? (
          <button
            type="button"
            className={s.historyButton}
            aria-label={t.header.fork}
            // Dead with aria-disabled rather than disabled, or the hint saying why would never come up.
            aria-disabled={openForkable ? undefined : true}
            data-tooltip={openForkable ? t.header.fork : t.header.forkEmpty}
            onClick={() => {
              if (openForkable) onFork(activeSession)
            }}
          >
            <ForkIcon />
          </button>
        ) : null}

        <button
          type="button"
          className={s.historyButton}
          aria-label={t.header.menu}
          data-tooltip={t.header.menu}
          onClick={onOpenMenu}
        >
          <HamburgerIcon />
        </button>
      </div>

      {tabMenu ? (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          title={t.header.tabMenu}
          options={[
            { id: 'rename', label: t.header.renameTab },
            ...(onCopySessionId && conversationOf?.(tabMenu.sessionId)
              ? [{ id: 'copyId', label: t.feed.session.copyId }]
              : []),
            // Only a conversation that exists can go on in a terminal, and one somebody else's terminal holds
            // has nothing here to offer (see TerminalCard).
            ...(onContinueInTerminal && conversationOf?.(tabMenu.sessionId) && terminalOf?.(tabMenu.sessionId) !== 'elsewhere'
              ? [
                  {
                    id: 'terminal',
                    label: terminalOf?.(tabMenu.sessionId) === 'here' ? t.terminal.show : t.terminal.continue,
                  },
                ]
              : []),
          ]}
          onPick={(id) => {
            if (id === 'rename') onNaming(tabMenu.sessionId)
            if (id === 'copyId') onCopySessionId?.(tabMenu.sessionId)
            if (id === 'terminal') onContinueInTerminal?.(tabMenu.sessionId)
          }}
          onClose={closeTabMenu}
        />
      ) : null}
    </header>
  )
}
