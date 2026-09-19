import type { CSSProperties, ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type {
  Scenario,
  ScenarioQueued,
  ScenarioQueueState,
  ScenarioRunSummary,
  ScenarioSchedule,
  ScenarioScope,
} from '../../protocol'
import { rowKey } from '../../scenarios/arrange'
import { cardRuns, passesOf, problemsOf, blocking } from '../../scenarios/rules'
import { queuedFor } from '../../scenarios/queue'
import { nextNote, schedulesOf, whenLabel } from '../../scenarios/schedule'
import { runMarks, runsOf } from '../../scenarios/runs'
import { useLocale, useT } from '../../i18n'
import { ClockIcon, CrossIcon, DuplicateIcon, GripIcon, QueueIcon } from './icons'
import s from './scenarios.module.css'

/**
 * The name a shelf's heading answers to while a row is dragged (see Shelves).
 *
 * The heading of the second shelf is the line between the two, and a drag has to be able to measure it;
 * a row key is a scope and a colon too, but never this word, so the two cannot meet.
 */
export const shelfHeading = (scope: ScenarioScope): string => `heading:${scope}`

/**
 * One shelf of scenarios: what is on it, what each one is set up to do, and everything one does to one.
 *
 * A row reads across in a fixed order - what the scenario is on the left, its hours on the right, the
 * actions in a column of their own - so the eye goes down a column instead of across four kinds of row.
 * The shelf is told from its neighbour by a rail down the side of every row: aqua for the repository,
 * iris for one's own, the same two paints branches and subagents already wear.
 *
 * The Run button is never disabled by another run - a scenario may be started as many times as somebody
 * wants, which is what the whole of this is about. What guards the second press is a moment's pause at
 * the one door runs go through (see App), not a dead button here.
 *
 * The rows are picked up by the grip on their left and put down anywhere on either shelf (see Shelves) -
 * by the grip alone, because everything else on a row is already a click with a meaning of its own.
 */
export const Shelf = ({
  label,
  note,
  scope,
  scenarios,
  known,
  movable,
  carrying,
  empty,
  emptyNote,
  schedules,
  runs,
  queue,
  onEdit,
  onRun,
  onWhen,
  onQueue,
  onDuplicate,
  onRemove,
  onOpenRun,
  onNew,
}: {
  label: string
  note: string
  scope: ScenarioScope
  /** This shelf's rows in the order they stand - mid-drag, that may include one read off the other shelf. */
  scenarios: Scenario[]
  /** Both shelves, to tell a run's scenario from another under the same identifier (see runsOf). */
  known: Scenario[]
  /** Whether a row has anywhere else to go - a row that has not gets no grip at all. */
  movable: (scenario: Scenario) => boolean
  /** How tall the row being carried is, or null when none is (see Shelves). */
  carrying: number | null
  empty: string
  emptyNote: string
  /** Every scheduled run of the project; the row takes its own out of it. */
  schedules: ScenarioSchedule[]
  /** Everything going right now; a row shows the ones that came from it. */
  runs: ScenarioRunSummary[]
  /** The project's queue; a row says how many turns of its own are waiting in it. */
  queue: ScenarioQueueState | null
  onEdit: (scenario: Scenario) => void
  onRun: (scenario: Scenario) => void
  onWhen: (scenario: Scenario) => void
  onQueue: (scenario: Scenario) => void
  onDuplicate: (id: string, scope: ScenarioScope) => void
  onRemove: (scenario: Scenario) => void
  onOpenRun: (runId: string) => void
  /** Offered on an empty shelf, where the row that is missing is the only thing to say. */
  onNew: () => void
}) => {
  const t = useT()
  const marks = runMarks(runs)
  // Measured rather than dropped on: where a drag crosses from one shelf to the other (see landing).
  const { setNodeRef: headingRef } = useDroppable({ id: shelfHeading(scope) })

  return (
    <div className={s.section}>
      <div ref={headingRef} className={s.label}>
        <span className={`${s.labelRail} ${scope === 'project' ? s.railProject : s.railUser}`} />
        {label}
        <span className={s.labelNote}>{note}</span>
        <span className={s.labelLine} />
      </div>

      {scenarios.length === 0 && carrying !== null ? (
        /*
          While a row is carried, an empty shelf is the place that row would take, of exactly its height -
          not the capsule with its words and its button. Two reasons, and they are the same reason: nothing
          on the screen moves while the hand does, and the line between the shelves (see landing) stands
          still. A shelf that changed height here moved that line, and a line that moves on its own is a
          row that changes shelves on its own - it bounced between them until the panel died of a render
          loop (React #185, seen live on a project with an empty shelf).
        */
        /* The height of a row, when the drag could not say how tall this one is (see .emptyDrop). */
        <div className={s.emptyDrop} style={carrying > 0 ? { height: carrying } : undefined} />
      ) : scenarios.length === 0 ? (
        <div className={s.emptyShelf}>
          <span className={s.emptyText}>
            <span className={s.emptyTitle}>{empty}</span>
            <span className={s.emptyNote}>{emptyNote}</span>
          </span>
          <button type="button" className={s.button} onClick={onNew}>
            {t.scenarios.create}
          </button>
        </div>
      ) : (
        <SortableContext id={scope} items={scenarios.map(rowKey)} strategy={verticalListSortingStrategy}>
          <div className={s.rows}>
            {scenarios.map((scenario) => (
              <SortableRow
                key={rowKey(scenario)}
                id={rowKey(scenario)}
                disabled={!movable(scenario)}
                scenario={scenario}
                shelf={scope}
                hours={schedulesOf(schedules, scenario)}
                running={runsOf(runs, scenario, known)}
                queued={queuedFor(queue, scenario)}
                marks={marks}
                onEdit={() => onEdit(scenario)}
                onRun={() => onRun(scenario)}
                onWhen={() => onWhen(scenario)}
                onQueue={() => onQueue(scenario)}
                onDuplicate={() => onDuplicate(scenario.id, scenario.scope)}
                onRemove={() => onRemove(scenario)}
                onOpenRun={onOpenRun}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  )
}

type RowProps = Parameters<typeof ShelfRow>[0]

/**
 * A row where it stands on its shelf, with the grip that picks it up.
 *
 * What moves with the hand is a copy on a layer of its own (see Shelves), and this is the slot it leaves
 * behind: it slides to wherever the row would land, so the gap under the hand is always the place it goes.
 */
const SortableRow = ({ id, disabled, ...row }: { id: string; disabled: boolean } & RowProps) => {
  const t = useT()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })

  return (
    <ShelfRow
      {...row}
      rowRef={setNodeRef}
      placing={isDragging}
      // Inline by exception, for the one value that changes on every movement of the hand. Translate rather
      // than the whole transform: rows are not one height (one with a run going carries a strip), and a
      // scale would squash the slot to the height of whichever row it is passing.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      grip={
        disabled ? null : (
          <button
            ref={setActivatorNodeRef}
            type="button"
            className={s.grip}
            aria-label={t.scenarios.moveRow}
            {...attributes}
            {...listeners}
          >
            <GripIcon />
          </button>
        )
      }
    />
  )
}

/**
 * The copy of a row that follows the hand, drawn on the layer above everything (see Shelves).
 *
 * The same row with nothing to press on it - it is a picture of what is being carried - and in the paint
 * of the shelf it would land on, so crossing over to the other shelf is seen before it is let go.
 */
export const LiftedRow = ({
  scenario,
  shelf,
  known,
  schedules,
  runs,
  queue,
}: {
  scenario: Scenario
  shelf: ScenarioScope
  known: Scenario[]
  schedules: ScenarioSchedule[]
  runs: ScenarioRunSummary[]
  queue: ScenarioQueueState | null
}) => {
  const nothing = () => undefined

  return (
    <ShelfRow
      scenario={scenario}
      shelf={shelf}
      hours={schedulesOf(schedules, scenario)}
      running={runsOf(runs, scenario, known)}
      queued={queuedFor(queue, scenario)}
      marks={runMarks(runs)}
      lifted
      grip={
        <span className={s.grip}>
          <GripIcon />
        </span>
      }
      onEdit={nothing}
      onRun={nothing}
      onWhen={nothing}
      onQueue={nothing}
      onDuplicate={nothing}
      onRemove={nothing}
      onOpenRun={nothing}
    />
  )
}

const ShelfRow = ({
  scenario,
  shelf,
  hours,
  running,
  queued,
  marks,
  grip,
  rowRef,
  style,
  placing,
  lifted,
  onEdit,
  onRun,
  onWhen,
  onQueue,
  onDuplicate,
  onRemove,
  onOpenRun,
}: {
  scenario: Scenario
  /** The shelf it is drawn on - its rail's paint. Mid-drag that is not always the one it was read off. */
  shelf: ScenarioScope
  hours: ScenarioSchedule[]
  running: ScenarioRunSummary[]
  /** The turns of this scenario waiting on the project's queue. */
  queued: ScenarioQueued[]
  marks: Record<string, string>
  /** What picks the row up, or nothing for a row with nowhere else to go. */
  grip?: ReactNode
  rowRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
  /** The slot left behind by a row that is being carried (see SortableRow). */
  placing?: boolean
  /** The copy that is carried (see LiftedRow). */
  lifted?: boolean
  onEdit: () => void
  onRun: () => void
  onWhen: () => void
  onQueue: () => void
  onDuplicate: () => void
  onRemove: () => void
  onOpenRun: (runId: string) => void
}) => {
  const t = useT()
  const locale = useLocale()

  const problems = problemsOf(scenario)
  const blockers = problems.filter(blocking)
  const broken = blockers.length > 0
  const summary = nextNote(hours)

  const asks = scenario.inputs.map((input) => input.name).filter((name) => name.trim().length > 0)
  // Empty for a scenario whose only hour was missed: drawn as an empty line it still took its gap, and
  // the one line above it sat a few pixels above the middle of the row.
  const coming = comingHours(hours, locale, t.scenarios.when)

  return (
    <div
      ref={rowRef}
      style={style}
      className={`${s.shelfRow} ${shelf === 'project' ? s.railProject : s.railUser} ${
        placing ? s.shelfRowPlacing : ''
      } ${lifted ? s.shelfRowLifted : ''}`}
    >
      {/*
        The whole row opens the editor, not only the words on its left: a card whose middle does nothing
        reads as a card that is broken there. The buttons on it keep their own meaning - a press that
        lands on any of them, or on the text button that exists for the keyboard, is theirs alone.
      */}
      <div
        className={s.shelfMain}
        role="presentation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return
          onEdit()
        }}
      >
        {grip}

        <button type="button" className={s.shelfText} onClick={onEdit}>
          <span className={s.shelfName}>{scenario.name}</span>

          {broken ? (
            <span className={s.shelfFacts}>
              <span className={s.broken}>{t.scenarios.needsFixing}</span>
              <span className={s.factDot}>·</span>
              <span className={s.broken}>{t.scenarios.problemsCount(blockers.length)}</span>
            </span>
          ) : (
            <span className={s.shelfFacts}>
              <span>{t.scenarios.stages(scenario.stages.length)}</span>
              <span className={s.factDot}>·</span>
              <span>{t.scenarios.cards(cardRuns(scenario))}</span>
              {scenario.stages.some((stage) => passesOf(stage) > 1) ? (
                <>
                  <span className={s.factDot}>·</span>
                  <span className={s.factChip}>{t.scenarios.hasLoop}</span>
                </>
              ) : null}
              {asks.length > 0 ? <span className={s.factChip}>{t.scenarios.asksFor(asks.join(', '))}</span> : null}
            </span>
          )}
        </button>

        {/*
          The hours, right-aligned in a column of their own: one line saying how many there are and
          whether one was missed, and under it the two that are coming soonest. A row that carried the
          count, the next hour and a missed one in one line wrapped to three in a narrow panel, and a
          shelf where one row is three deep reads as broken.
        */}
        {summary && !broken ? (
          <span className={s.shelfHours}>
            <span className={`${s.shelfHoursTop} ${summary.missed ? s.shelfMissed : ''}`}>
              <ClockIcon />
              {summary.missed
                ? t.scenarios.when.missed(whenLabel(summary.missed, locale))
                : t.scenarios.when.scheduled(summary.count)}
            </span>
            {coming ? <span className={s.shelfHoursNext}>{coming}</span> : null}
          </span>
        ) : null}

        <span className={s.shelfActions}>
          <button
            type="button"
            className={`${s.button} ${broken ? s.buttonWarn : s.buttonMain}`}
            onClick={broken ? onEdit : onRun}
          >
            {broken ? t.scenarios.fix : t.scenarios.play}
          </button>

          <span className={s.shelfIcons}>
            {/*
              A run that waits for the working copy rather than for an hour. Its own button beside the
              clock and beside Run, because the three are three different intentions and none of them is
              a variation of another: start now, start when nothing else of mine is going, start at nine.
              Folded into Run's form, the one that waits would be found by pressing the one that does not.
            */}
            <button
              type="button"
              className={`${s.iconButton} ${queued.length > 0 ? s.iconOn : ''}`}
              disabled={broken}
              data-tooltip={
                queued.length > 0 ? t.scenarios.queue.waitingHere(queued.length) : t.scenarios.queue.add
              }
              aria-label={t.scenarios.queue.add}
              onClick={onQueue}
            >
              <QueueIcon />
            </button>
            {/*
              Another run, waiting for its hour. Beside Run rather than inside its form: setting a time
              and pressing play are two different intentions, and the one that waits until nine is the
              one nobody wants to find by pressing the one that starts now.
            */}
            <button
              type="button"
              className={`${s.iconButton} ${hours.length > 0 ? s.iconOn : ''}`}
              disabled={broken}
              data-tooltip={t.scenarios.when.another}
              aria-label={t.scenarios.when.another}
              onClick={onWhen}
            >
              <ClockIcon />
            </button>
            <button
              type="button"
              className={s.iconButton}
              data-tooltip={t.scenarios.duplicate}
              aria-label={t.scenarios.duplicate}
              onClick={onDuplicate}
            >
              <DuplicateIcon />
            </button>
            <button
              type="button"
              className={`${s.iconButton} ${s.iconDanger}`}
              data-tooltip={t.scenarios.delete}
              aria-label={t.scenarios.delete}
              onClick={onRemove}
            >
              <CrossIcon />
            </button>
          </span>
        </span>
      </div>

      {/*
        What this scenario has going right now, under a rule of its own.

        On the row rather than only on the Runs band, because a scenario that is working is a different
        thing from one that is merely written down - and it is the row somebody presses Run on again.
      */}
      {running.length > 0 ? (
        <div className={s.shelfRuns}>
          {running.slice(0, 2).map((run) => (
            <button key={run.id} type="button" className={s.shelfRun} onClick={() => onOpenRun(run.id)}>
              <span className={`${s.shelfRunDot} ${run.state === 'blocked' ? s.shelfRunAsks : ''}`} />
              {/* Which run of this scenario it is - empty when it is the only one, and then the row is
                  the state alone, which is all there is to tell. */}
              {marks[run.id] ? <span className={s.shelfRunName}>{marks[run.id]}</span> : null}
              <span className={s.shelfRunFact}>
                {run.state === 'blocked'
                  ? t.scenarios.runStates.blocked
                  : t.scenarios.run.cards(run.done, run.total)}
              </span>
            </button>
          ))}
          <span className={s.shelfRunsMore}>{t.scenarios.runningHere(running.length)}</span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The two hours coming soonest, as one line: "next Mon 23:22 · then 09:00".
 *
 * Two rather than all of them, because the line has one row's width and a fortnight of arrangements
 * would fill the screen: the soonest is what somebody is checking, and the one after it says there is a
 * rhythm rather than a single date. The count above already says how many there are altogether.
 */
const comingHours = (
  hours: ScenarioSchedule[],
  locale: string,
  words: { next: (when: string) => string; then: (when: string) => string },
): string => {
  const coming = hours.filter((hour) => hour.nextAt > 0).sort((a, b) => a.nextAt - b.nextAt)
  if (coming.length === 0) return ''

  const parts = [words.next(whenLabel(coming[0].nextAt, locale))]
  if (coming.length > 1) parts.push(words.then(whenLabel(coming[1].nextAt, locale)))
  return parts.join(' · ')
}
