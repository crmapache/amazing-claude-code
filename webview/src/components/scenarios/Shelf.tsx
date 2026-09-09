import type { Scenario, ScenarioRunSummary, ScenarioSchedule, ScenarioScope } from '../../protocol'
import { cardRuns, passesOf, problemsOf, blocking } from '../../scenarios/rules'
import { nextNote, schedulesOf, whenLabel } from '../../scenarios/schedule'
import { runMarks } from '../../scenarios/runs'
import { useLocale, useT } from '../../i18n'
import { ClockIcon, CrossIcon, DuplicateIcon } from './icons'
import s from './scenarios.module.css'

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
 */
export const Shelf = ({
  label,
  note,
  scope,
  scenarios,
  empty,
  emptyNote,
  schedules,
  runs,
  onEdit,
  onRun,
  onWhen,
  onDuplicate,
  onRemove,
  onOpenRun,
  onNew,
}: {
  label: string
  note: string
  scope: ScenarioScope
  scenarios: Scenario[]
  empty: string
  emptyNote: string
  /** Every scheduled run of the project; the row takes its own out of it. */
  schedules: ScenarioSchedule[]
  /** Everything going right now; a row shows the ones that came from it. */
  runs: ScenarioRunSummary[]
  onEdit: (scenario: Scenario) => void
  onRun: (scenario: Scenario) => void
  onWhen: (scenario: Scenario) => void
  onDuplicate: (id: string, scope: ScenarioScope) => void
  onRemove: (scenario: Scenario) => void
  onOpenRun: (runId: string) => void
  /** Offered on an empty shelf, where the row that is missing is the only thing to say. */
  onNew: () => void
}) => {
  const t = useT()
  const marks = runMarks(runs)

  return (
    <div className={s.section}>
      <div className={s.label}>
        <span className={`${s.labelRail} ${scope === 'project' ? s.railProject : s.railUser}`} />
        {label}
        <span className={s.labelNote}>{note}</span>
        <span className={s.labelLine} />
      </div>

      {scenarios.length === 0 ? (
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
        <div className={s.rows}>
          {scenarios.map((scenario) => (
            <ShelfRow
              key={`${scenario.scope}:${scenario.id}`}
              scenario={scenario}
              hours={schedulesOf(schedules, scenario)}
              running={runs.filter((run) => run.scenarioId === scenario.id && run.scope === scenario.scope)}
              marks={marks}
              onEdit={() => onEdit(scenario)}
              onRun={() => onRun(scenario)}
              onWhen={() => onWhen(scenario)}
              onDuplicate={() => onDuplicate(scenario.id, scenario.scope)}
              onRemove={() => onRemove(scenario)}
              onOpenRun={onOpenRun}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const ShelfRow = ({
  scenario,
  hours,
  running,
  marks,
  onEdit,
  onRun,
  onWhen,
  onDuplicate,
  onRemove,
  onOpenRun,
}: {
  scenario: Scenario
  hours: ScenarioSchedule[]
  running: ScenarioRunSummary[]
  marks: Record<string, string>
  onEdit: () => void
  onRun: () => void
  onWhen: () => void
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
    <div className={`${s.shelfRow} ${scenario.scope === 'project' ? s.railProject : s.railUser}`}>
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
