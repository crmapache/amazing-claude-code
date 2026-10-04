import { Fragment, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { isSideComposerLayout, type ComposerLayout } from '../composerLayout'
import { BranchChip, SPARK_PATH } from './StatusBar'
import s from './shell.module.css'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'
import { useFieldHistory } from '../hooks/useFieldHistory'
import { useResting } from '../hooks/useResting'
import type { TitleSource } from '../protocol'
import type { TabCall } from '../sounds'

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
   * Fork a tab's conversation, whole - the button on every conversation's tab, beside the cross (see
   * App.fork). The panel's own tabs (the statistics, a scenario's run) hold no conversation and have none.
   */
  onFork?: (sessionId: string) => void
  /**
   * The tabs with a conversation to fork. The others keep the button, dimmed and saying why: it stands on
   * every tab so that a tab's width never depends on it (see sessionTab).
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
   * TabNameField). Only when it changed: a name confirmed as it stood is not a new one, and it would
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
   * The stripe over it. A colour out of the same cool arc the groups draw from, but fixed rather than
   * hashed: the statistics is always the statistics, and it should always look it.
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

/**
 * The longest name the field takes. The IDE holds the same line (SessionTitle.OWN_MAX_LENGTH): the strip
 * cuts a name long before this, and a pasted paragraph has no business in every list of tabs.
 */
const TAB_NAME_MAX = 100

/**
 * The field a conversation's name is typed into, standing where the name stood (see naming in Header).
 *
 * A component of its own rather than a piece of sessionTab, for the reason OwnAnswer is one: the keys
 * the embedded browser does not give a plain field come from a hook (see useFieldHistory), and a hook
 * cannot be called inside the strip's loop.
 *
 * Enter keeps the name, Escape keeps the old one, and the focus leaving keeps what was typed - the way
 * a rename field behaves in the IDE around it and everywhere else.
 */
const TabNameField = ({
  title,
  label,
  onDone,
}: {
  title: string
  label: string
  /**
   * The name typed, or null when the naming was called off, and whether a key ended it (Enter or Escape)
   * rather than the focus leaving - see onReturnToInput in Header.
   */
  onDone: (name: string | null, byKey: boolean) => void
}) => {
  const [value, setValue] = useState(title)
  const field = useFieldHistory(value, setValue)
  const input = useRef<HTMLInputElement>(null)
  /** Enter unmounts the field, and the blur that follows must not count as a second answer. */
  const done = useRef(false)

  const finish = (name: string | null, byKey: boolean) => {
    if (done.current) return
    done.current = true
    onDone(name, byKey)
  }

  // The whole name selected, as every rename field opens: typing replaces it, an arrow keeps it.
  useLayoutEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  return (
    <input
      ref={input}
      className={s.tabNameField}
      value={value}
      maxLength={TAB_NAME_MAX}
      aria-label={label}
      spellCheck={false}
      onChange={field.onChange}
      onKeyDown={(event) => {
        // Every key here is the field's own. The tab around it opens on Enter and Space - Space would
        // never reach the name at all - and the panel stops the agent on Escape and changes the mode on
        // Shift+Tab (see App).
        event.stopPropagation()
        // Enter confirms an input method's candidate and Escape throws its half-typed character away:
        // neither is an answer to the naming (see composer-field in the rules).
        if (event.nativeEvent.isComposing) return

        if (event.key === 'Enter') {
          event.preventDefault()
          finish(value, true)
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          finish(null, true)
          return
        }

        field.onKeyDown(event)
      }}
      onBlur={() => finish(value, false)}
      // A press inside the field places the caret rather than starting a drag of the tab, a click does not
      // pick the tab again, and a double click selects a word rather than opening the field anew.
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
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

/** Where a unit of the row stands and how wide it is - see unitRow. */
interface Unit {
  id: string
  left: number
  right: number
  top: number
  bottom: number
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
 * beside the cross it read as a speck.
 */
const ForkIcon = () => (
  <svg className={s.forkIcon} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="4.5" cy="3.5" r="1.6" />
    <circle cx="11.5" cy="3.5" r="1.6" />
    <circle cx="8" cy="12.5" r="1.6" />
    <path d="M4.5 5.1v.9a2.2 2.2 0 0 0 2.2 2.2h2.6A2.2 2.2 0 0 0 11.5 6v-.9" />
    <path d="M8 8.2v2.7" />
  </svg>
)

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
  onFork,
  forkable = NOTHING_FORKABLE,
  onReorderGroups,
  onReorderTabs,
  onNameSession,
  naming,
  onNaming,
  onReturnToInput,
  onOpenMenu,
  layout,
  gitBranch,
  watchers = 0,
  pullRequest,
  onOpenPullRequest,
  panelTabs = EMPTY_PANEL_TABS,
  onPickPanelTab,
  onClosePanelTab,
  calls = NO_CALLS,
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
   * Where the groups stood on screen at the moment the tab was released.
   *
   * Without this snapshot the landing jerked: rearranging the row and dropping the offsets happen in one
   * frame, and the browser saw only the final layout. The tab teleported from under the hand into its
   * slot, while the neighbours on top of that played out an offset that had already been cancelled - a
   * jump by a tab's width and a slow return. With the snapshot that same frame starts from the previous
   * picture and travels to the new one.
   */
  const landing = useRef<{ drag: Drag; places: Map<string, { x: number; y: number }> } | null>(null)

  /**
   * A snapshot of the row in the units this gesture moves: where each stands and how wide it is.
   *
   * It is taken once, at the gesture's start, and does not change after that - which is exactly why the
   * pushing apart comes out calm: every decision is made from a motionless picture rather than from the
   * one we are moving ourselves.
   *
   * A group drag sees the whole strip, group by group; a fork dragged inside its group sees that group's
   * tabs and nothing else - the rest of the strip is not part of the gesture and does not budge.
   */
  const unitRow = (drag: Drag): Unit[] => {
    const root = tabs.current
    if (!root) return []

    const units: Unit[] = []

    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-group]'))) {
      const id = unitIdOf(node, drag)
      if (!id) continue

      const left = node.offsetLeft
      const right = left + node.offsetWidth
      const top = node.offsetTop
      const bottom = top + node.offsetHeight
      const last = units.at(-1)

      // Only a group spans several tabs; inside one group every tab is a unit of its own, so this arm
      // never fires there.
      if (last?.id === id) {
        last.left = Math.min(last.left, left)
        last.right = Math.max(last.right, right)
        last.top = Math.min(last.top, top)
        last.bottom = Math.max(last.bottom, bottom)
        continue
      }

      units.push({ id, left, right, top, bottom })
    }

    return units
  }

  /** The tabs by unit: a group holds as many as the conversation has forks, a single tab holds one. */
  const unitNodes = (kind: DragKind): Map<string, HTMLElement[]> => {
    const root = tabs.current
    const nodes = new Map<string, HTMLElement[]>()
    if (!root) return nodes

    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-group]'))) {
      const id = kind === 'tab' ? node.dataset.tab : node.dataset.group
      if (!id) continue

      const list = nodes.get(id)
      if (list) list.push(node)
      else nodes.set(id, [node])
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
  const placeFor = (row: Unit[], from: number, shift: number): number => {
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
    // was typed - the way a press anywhere else in the panel puts it down (see TabNameField).
    const focused = document.activeElement
    if (focused instanceof HTMLInputElement && tabs.current?.contains(focused)) focused.blur()

    event.preventDefault()

    const row = unitRow(drag)
    const from = row.findIndex((unit) => unit.id === drag.id)
    if (from < 0) return

    /**
     * The head of a group stays the head: a fork may be dragged among the other forks and no further (see
     * moveWithinGroup). The floor is set here as well as there, or the neighbours would step aside for a
     * place the drop is going to refuse.
     */
    const floor = drag.kind === 'tab' ? 1 : 0

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
        setDragging(drag)
      }

      const shift = move.clientX - startX
      setOffset(shift)

      /**
       * A new place is accepted only if it holds at a slightly smaller offset too: right on the
       * boundary a hand trembles by a couple of pixels, and without this check the neighbours started
       * trembling back and forth along with it.
       */
      const wanted = Math.max(floor, placeFor(row, from, shift))
      if (wanted !== place) {
        const backOff = wanted > place ? -SWAP_GAP_PX : SWAP_GAP_PX
        if (Math.max(floor, placeFor(row, from, shift + backOff)) === wanted) place = wanted
      }

      /**
       * The neighbours between the old place and the new one move aside by a tab's width - exactly
       * enough to make room for it. They move by an offset while the row itself stays as it is: the
       * order changes once, when the tab is released.
       */
      const next: Record<string, number> = {}
      for (const [index, unit] of row.entries()) {
        if (index === from) continue
        if (index > from && index <= place) next[unit.id] = -width
        if (index < from && index >= place) next[unit.id] = width
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
        const nodes = unitNodes(drag.kind)
        const rendered = new Map<string, { x: number; y: number }>()
        for (const unit of row) {
          const node = nodes.get(unit.id)?.[0]
          const live = node ? liveShift(node) : { x: 0, y: 0 }
          rendered.set(unit.id, { x: unit.left + live.x, y: unit.top + live.y })
        }
        landing.current = { drag, places: rendered }

        // The destination in the original row: having travelled to the right, we stand before the unit
        // that came after the last one to step aside.
        const before = place > from ? (row[place + 1]?.id ?? null) : row[place]?.id ?? null
        if (place !== from) {
          if (drag.kind === 'tab') reorder.current.onReorderTabs(drag.id, before)
          else reorder.current.onReorderGroups(drag.id, before)
        }

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

    const nodes = unitNodes(before.drag.kind)

    for (const unit of unitRow(before.drag)) {
      const was = before.places.get(unit.id)
      if (!was) continue

      const dx = was.x - unit.left
      const dy = was.y - unit.top

      for (const node of nodes.get(unit.id) ?? []) {
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
   * and for the tabs that hold no conversation - as far as the strip is concerned they are one kind of
   * thing.
   */
  const dragStyle = (groupId: string, tabId?: string) => {
    // The gesture in progress decides what the row is made of: while a fork travels inside its group, the
    // units are that group's tabs, and every other tab in the strip stands perfectly still.
    const key = dragging?.kind === 'tab' ? tabId : groupId
    if (!key) return {}

    if (dragging?.id === key) return { transform: `translateX(${offset}px)` }
    const shift = shifts[key]
    return shift ? { transform: `translateX(${shift}px)` } : {}
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
          // Everything the gesture carries is lifted, not only the tab under the hand: a group travels
          // whole, so all its tabs rise with it, while a fork moved inside its group rises alone.
          (dragging?.kind === 'tab' ? dragging.id === session.id : dragging?.id === session.groupId)
            ? s.tabDragging
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
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
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          // Space scrolls the strip otherwise, and the tab under the finger never opens.
          event.preventDefault()
          onPickSession(session.id)
        }}
      >
        <TabGlow call={calls[session.id]} />
        <span className={s.tabGroupBar} style={{ background: color }} />
        <span className={`${s.dot} ${DOT_CLASS[session.state]}`} data-tooltip={dotTitle(t)[session.state]} />
        {session.depth > 0 ? (
          <span className={s.tabFork} style={{ color }}>
            ⑂
          </span>
        ) : null}
        {naming === session.id ? (
          <TabNameField
            title={session.title}
            label={t.header.renameTab}
            onDone={(name, byKey) => finishNaming(session, name, byKey)}
          />
        ) : (
          <span className={s.tabTitle}>{session.title}</span>
        )}
        {/* On the tab it forks, beside the cross: both are things done to this conversation. On every tab and
            always: shown on the open tab alone, it widened the tab it came to and narrowed the one it left,
            and a narrow strip jumped on every switch. A tab with nothing to fork keeps it dimmed, with a
            hint saying why - aria-disabled rather than disabled, or the hint would never come up. */}
        {onFork ? (
          <button
            type="button"
            className={`${s.tabForkButton} ${forkable.has(session.id) ? '' : s.tabForkButtonOff}`}
            aria-label={t.header.fork}
            aria-disabled={forkable.has(session.id) ? undefined : true}
            data-tooltip={forkable.has(session.id) ? t.header.fork : t.header.forkEmpty}
            onClick={(event) => {
              event.stopPropagation()
              if (forkable.has(session.id)) onFork(session.id)
            }}
          >
            <ForkIcon />
          </button>
        ) : null}
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
        dragging?.id === tab.id ? s.tabDragging : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={dragStyle(tab.id)}
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
      <span className={s.tabGroupBar} style={{ background: tab.color }} />
      {/* A run of a scenario is work, and its dot answers for it exactly as a conversation's does: the
          word beside it is the name of the scenario, so the state is written nowhere else in the strip.
          The statistics passes neither, and its dot stays grey and silent - a hint there would answer
          with the word standing next to it. */}
      <span
        className={`${s.dot} ${DOT_CLASS[tab.state ?? 'idle']}`}
        data-tooltip={tab.hint || undefined}
      />
      <span className={s.tabTitle}>{tab.title}</span>
      <button
        type="button"
        className={s.tabClose}
        aria-label={tab.closeLabel}
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
        {panels.filter((tab) => tab.at >= groups.length).map(panelTab)}

        <button type="button" className={s.tabAdd} data-tooltip={t.header.newSession} onClick={onNewSession}>
          +
        </button>
      </div>

      <div className={s.spacer} />

      <div className={s.headerTools}>
        {watchers > 0 && (
          <span
            className={s.watchers}
            data-tooltip={t.header.watchers(watchers)}
          >
            ◉ {watchers}
          </span>
        )}

        <BranchChip gitBranch={gitBranch} pullRequest={pullRequest} onOpenPullRequest={onOpenPullRequest} />

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
    </header>
  )
}
