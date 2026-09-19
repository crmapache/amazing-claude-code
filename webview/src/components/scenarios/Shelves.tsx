import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  useDndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type Modifiers,
} from '@dnd-kit/core'
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import type {
  Scenario,
  ScenarioQueueState,
  ScenarioRunSummary,
  ScenarioSchedule,
  ScenarioScope,
} from '../../protocol'
import {
  arrangementOf,
  heldAt,
  idOfRow,
  landing,
  placed,
  placement,
  placeOfRow,
  rowKey,
  shelfOfRow,
  stepped,
  type Arrangement,
  type RowBox,
  type ShelfPlace,
} from '../../scenarios/arrange'
import { useT } from '../../i18n'
import { LiftedRow, Shelf, shelfHeading } from './Shelf'

/**
 * The carried copy goes up and down only, and never out of the list: sideways means nothing here and only
 * smears the drag, and past the edge of the list it would be over the tabs, which it cannot be put on.
 */
const LIFT_MODIFIERS: Modifiers = [restrictToVerticalAxis, restrictToFirstScrollableAncestor]

/**
 * A drag starts once the grip has moved a few pixels, not on the press: otherwise the tremor of a hand
 * clicking the grip would already count as a move.
 */
const POINTER_ACTIVATION = { distance: 4 }

/** What a drag in progress holds: the row, how tall it is, and the shelves as they were and stand now. */
interface Carried {
  key: string
  /** Its height, so a shelf it empties keeps exactly its place open (see the slot in Shelf). */
  height: number
  start: Arrangement
  now: Arrangement
}

type ShelfProps = Parameters<typeof Shelf>[0]

/** Every row's layout box, top to bottom, and the line between the shelves - what landing reads. */
const measured = (on: Arrangement, rects: Map<string | number, ClientRect>) => {
  const rows: RowBox[] = (['project', 'user'] as const).flatMap((scope) =>
    on[scope].flatMap((key) => {
      const rect = rects.get(key)
      return rect ? [{ key, shelf: scope, top: rect.top, height: rect.height }] : []
    }),
  )
  // The middle of the second shelf's heading: the line between the two (see landing).
  const heading = rects.get(shelfHeading('user'))
  return { rows, boundary: heading ? heading.top + heading.height / 2 : null }
}

/**
 * The two headings measured again whenever a row changes shelves.
 *
 * The library measures the rows of a list again when that list changes, and leaves everything else as it
 * was measured when the drag began. The second shelf's heading is the line between the shelves, and it
 * moves by a whole row each time one crosses: left where it was, the row just let into the first shelf
 * read as past the line again and went back, and back again - a render loop that took the panel down.
 */
const Remeasure = ({ arrangement }: { arrangement: Arrangement }) => {
  const { measureDroppableContainers } = useDndContext()
  useLayoutEffect(() => {
    measureDroppableContainers([shelfHeading('project'), shelfHeading('user')])
  }, [arrangement, measureDroppableContainers])
  return null
}

/**
 * Both shelves, and a row dragged along one of them or over onto the other.
 *
 * Built the way snakein's lists of documents are - a grip on the row, the row's slot sliding to wherever it
 * would land, the neighbours making way, and the place read by the leading edge (see landing) - with one
 * thing those lists never needed: a second shelf to cross to. That is what the carried copy on a layer of
 * its own is for. A row moved onto the other shelf mid-drag is a row taken out of one list and put into
 * another, and the row itself cannot follow the hand through that; a copy can, and the slot left behind is
 * just a place in whichever list it is in now.
 *
 * Dropped on the other shelf, the row's FILE moves (see ScenarioStore.place): the shelf is where the file
 * lies, and nothing else says it. The row is drawn where it was put straight away and held there until the
 * IDE's list arrives - a refusal comes back as that same list, and puts it back where it really is.
 */
export const Shelves = ({
  scenarios,
  canShare,
  schedules,
  runs,
  queue,
  onPlace,
  ...shelf
}: {
  scenarios: Scenario[]
  /** Whether this project has a folder for a shared scenario at all. */
  canShare: boolean
  schedules: ScenarioSchedule[]
  runs: ScenarioRunSummary[]
  queue: ScenarioQueueState | null
  onPlace: (move: { id: string; from: ScenarioScope; to: ScenarioScope; before: string }) => void
  onNew: (scope: ScenarioScope) => void
} & Pick<ShelfProps, 'onEdit' | 'onRun' | 'onWhen' | 'onQueue' | 'onDuplicate' | 'onRemove' | 'onOpenRun'>) => {
  const t = useT()

  // The order the IDE read off the disk, until somebody drags.
  const sent = useMemo(() => arrangementOf(scenarios), [scenarios])
  const byKey = useMemo(() => new Map(scenarios.map((one) => [rowKey(one), one])), [scenarios])

  /*
   * What was let go, drawn until the IDE answers - and tied to the list it was laid over, so the list that
   * comes next replaces it by itself: the order on the disk if it took, the old one if it was refused.
   */
  const [landed, setLanded] = useState<{ over: Scenario[]; arrangement: Arrangement } | null>(null)
  const shown = landed && landed.over === scenarios ? landed.arrangement : sent

  /*
   * The drag, in state for the screen and in a ref for the three readers that are not renders: the landing
   * is worked out, and the arrow keys stepped, inside the drag library's own passes, which see whatever
   * functions they were handed when the drag began.
   */
  const [carried, setCarried] = useState<Carried | null>(null)
  const carriedRef = useRef<Carried | null>(null)
  const carry = (next: Carried | null) => {
    carriedRef.current = next
    setCarried(next)
  }
  /** Where the row would land now - kept for the arrow keys, which step on from it. */
  const lastPlace = useRef<ShelfPlace | null>(null)
  /** How far the hand had travelled when the row last changed shelves (see onDragOver). */
  const crossedAt = useRef<number | null>(null)

  const arrangement = carried?.now ?? shown

  /**
   * The shelves this row may be put on. Not the repository's when there is no folder to write it into, and
   * not either one that already holds a scenario under its identifier: the IDE would refuse that move, and
   * a shelf that takes the row only to hand it back a moment later is worse than one that will not.
   */
  const openFor = useCallback(
    (on: Arrangement, key: string): Record<ScenarioScope, boolean> => {
      const id = idOfRow(key)
      const twin = (scope: ScenarioScope) => on[scope].some((one) => one !== key && idOfRow(one) === id)
      return { project: canShare && !twin('project'), user: !twin('user') }
    },
    [canShare],
  )

  const movable = (scenario: Scenario): boolean => {
    const key = rowKey(scenario)
    // The row in the hand stays movable whatever the shelves look like mid-drag: switched off, it would
    // be dropped by the library halfway across.
    if (carried?.key === key) return true
    const at = shelfOfRow(arrangement, key)
    if (!at) return false
    return arrangement[at].length > 1 || openFor(arrangement, key)[at === 'project' ? 'user' : 'project']
  }

  /*
   * Which row the carried one is over, as the library understands "over": on its own shelf, the row standing
   * at the place it would take; on the other shelf, that shelf's heading - a name the move below can tell
   * apart. The place itself travels with it, since that, and not the name, is what a drop acts on.
   */
  const collision: CollisionDetection = useCallback(
    ({ active, collisionRect, droppableRects, droppableContainers }) => {
      const now = carriedRef.current?.now
      const key = String(active.id)
      const from = now ? shelfOfRow(now, key) : null
      const origin = droppableRects.get(key)
      if (!now || !from || !origin) return []

      const { rows, boundary } = measured(now, droppableRects)
      const place = landing({
        key,
        from,
        top: collisionRect.top,
        bottom: collisionRect.bottom,
        origin: origin.top,
        rows,
        boundary,
        open: openFor(now, key),
      })
      lastPlace.current = place

      const over = place.shelf === from ? now[from][place.index] : shelfHeading(place.shelf)
      const container = droppableContainers.find((one) => one.id === over)
      return container ? [{ id: over, data: { droppableContainer: container, value: 0, place } }] : []
    },
    [openFor],
  )

  /**
   * The arrow keys, one place a press - over onto the other shelf too, and onto its FIRST place, which the
   * library's own stepping skipped: it knows neighbours, not the line between two lists.
   */
  const keyboard: KeyboardCoordinateGetter = useCallback(
    (event, { active, currentCoordinates, context }) => {
      const down = event.code === 'ArrowDown'
      if (!down && event.code !== 'ArrowUp') return undefined
      event.preventDefault()

      const now = carriedRef.current?.now
      const key = String(active)
      const origin = context.droppableRects.get(key)
      const rect = context.collisionRect
      const from = lastPlace.current ?? (now ? placeOfRow(now, key) : null)
      if (!now || !origin || !rect || !from) return undefined

      const { rows, boundary } = measured(now, context.droppableRects)
      const place = stepped(now, key, from, down, openFor(now, key))
      const top = heldAt({ arrangement: now, key, place, height: rect.height, origin: origin.top, rows, boundary })
      return top === null ? currentCoordinates : { x: currentCoordinates.x, y: currentCoordinates.y + (top - rect.top) }
    },
    [openFor],
  )

  const keys = useMemo(() => ({ coordinateGetter: keyboard }), [keyboard])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION }),
    // From the keyboard: Space picks the row up, the arrows move it, Space puts it down, Escape takes it back.
    useSensor(KeyboardSensor, keys),
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    lastPlace.current = null
    crossedAt.current = null
    const height = active.rect.current.initial?.height ?? 0
    carry({ key: String(active.id), height, start: shown, now: shown })
  }

  /*
   * Over the line onto the other shelf: the row is moved into that list now, not on the drop, so the shelf
   * opens up under the hand and its rows make way. Along its own shelf nothing changes until the drop -
   * the library slides the rows by itself.
   */
  const onDragOver = ({ collisions, delta }: DragOverEvent) => {
    const state = carriedRef.current
    const place = collisions?.[0]?.data?.place as ShelfPlace | undefined
    if (!state || !place || shelfOfRow(state.now, state.key) === place.shelf) return
    /*
     * A row changes shelves only when the HAND has moved since it last did.
     *
     * Crossing moves everything under the card - the shelf it left closes up, the one it joined opens -
     * so the next reading is taken against a page that has just moved. The shelves are laid out so that
     * it always moves the safe way (see the strip in Shelf), and this is the belt for the braces: without
     * it, any layout that says "back again" without the hand moving is a loop of renders rather than a
     * jitter, and the panel dies rather than looks odd.
     */
    if (crossedAt.current === delta.y) return
    crossedAt.current = delta.y
    carry({ ...state, now: placed(state.now, state.key, place) })
  }

  const onDragEnd = ({ collisions }: DragEndEvent) => {
    const state = carriedRef.current
    carry(null)
    if (!state) return

    const place = (collisions?.[0]?.data?.place as ShelfPlace | undefined) ?? lastPlace.current
    const end = place ? placed(state.now, state.key, place) : state.now
    const move = placement(state.start, end, state.key)
    if (!move) return

    setLanded({ over: scenarios, arrangement: end })
    onPlace(move)
  }

  // Tied to this component rather than counted by the library: the id names the hidden hints a screen
  // reader is pointed at, and a counter of the library's own could name two lists the same.
  const dndId = useId()

  const rowsOf = (scope: ScenarioScope): Scenario[] =>
    arrangement[scope].flatMap((key) => {
      const one = byKey.get(key)
      return one ? [one] : []
    })

  const carriedRow = carried ? byKey.get(carried.key) : undefined
  const carriedShelf = carried ? shelfOfRow(carried.now, carried.key) : null

  const common = {
    known: scenarios,
    movable,
    carrying: carried ? carried.height : null,
    schedules,
    runs,
    queue,
    onEdit: shelf.onEdit,
    onRun: shelf.onRun,
    onWhen: shelf.onWhen,
    onQueue: shelf.onQueue,
    onDuplicate: shelf.onDuplicate,
    onRemove: shelf.onRemove,
    onOpenRun: shelf.onOpenRun,
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => carry(null)}
    >
      <Remeasure arrangement={arrangement} />

      <Shelf
        {...common}
        label={t.scenarios.shelves.project}
        note={t.scenarios.shelves.projectNote}
        scope="project"
        scenarios={rowsOf('project')}
        empty={canShare ? t.scenarios.shelves.projectEmpty : t.scenarios.shelves.noProject}
        emptyNote={canShare ? t.scenarios.shelves.projectEmptyNote : t.scenarios.shelves.noProjectNote}
        onNew={() => shelf.onNew('project')}
      />

      <Shelf
        {...common}
        label={t.scenarios.shelves.user}
        note={t.scenarios.shelves.userNote}
        scope="user"
        scenarios={rowsOf('user')}
        empty={t.scenarios.shelves.userEmpty}
        emptyNote={t.scenarios.shelves.userEmptyNote}
        onNew={() => shelf.onNew('user')}
      />

      {/*
        On the body rather than here. The copy is placed by the window's coordinates, and anything above it
        that sets a transform, a filter or containment becomes what those coordinates are read against - the
        same trap the form overlays' menus fell into (see .overlay).
      */}
      {createPortal(
        <DragOverlay modifiers={LIFT_MODIFIERS}>
          {carriedRow && carriedShelf ? (
            <LiftedRow
              scenario={carriedRow}
              shelf={carriedShelf}
              known={scenarios}
              schedules={schedules}
              runs={runs}
              queue={queue}
            />
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}
