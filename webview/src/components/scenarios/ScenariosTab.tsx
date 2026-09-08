import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  ModelInfo,
  Scenario,
  ScenarioRepeat,
  ScenarioRunSummary,
  ScenarioSchedule,
  ScenarioScope,
} from '../../protocol'
import { formatDuration } from '../../feed/tools'
import { describeWhen } from '../../feed/when'
import { blankScenario } from '../../scenarios/blank'
import { cardRuns, missingInputs, passesOf, runnable } from '../../scenarios/rules'
import { clockLabel, defaultHour, HOURS, MINUTES, pad2, scheduleNote, WEEKDAYS, weekdayName } from '../../scenarios/schedule'
import { Picker } from './Picker'
import { useFieldHistory } from '../../hooks/useFieldHistory'
import { useNow } from '../../hooks/useNow'
import { useLocale, useT } from '../../i18n'
import { Confirm } from '../Confirm'
import { ScenarioEditor } from './ScenarioEditor'
import { StatePill } from './StatePill'
import s from './scenarios.module.css'

/**
 * The hub: the rounds of work somebody wrote down, and the runs that came of them.
 *
 * Two shelves, kept apart on the screen because they are kept apart on the disk and mean different
 * things: one travels with the repository and is read by whoever else works in it, the other is this
 * person's own and follows them from project to project. A row is a scenario and everything one does to
 * a scenario is on it; the past runs stand under them, and pressing one opens it in a tab of its own -
 * a run goes on for hours and is not something to look at inside a list.
 */
export interface ScenariosTabProps {
  scenarios: Scenario[] | null
  runs: ScenarioRunSummary[]
  /** The run going right now, if any. One at a time in a project, by design. */
  liveRunId: string
  /** The hours these scenarios start at by themselves - one per scenario at most. */
  schedules: ScenarioSchedule[]
  onSchedule: (scenario: Scenario, hour: ScheduledHour, inputs: Record<string, string>) => void
  onUnschedule: (id: string, scope: ScenarioScope) => void
  /** Whether this project has a repository to put a shared scenario in at all. */
  canShare: boolean
  /** For the editor's model menus: the account's catalogue and the names added by hand, as the composer has them. */
  models: ModelInfo[] | null
  customModels: string[]
  /** The last refusal from the IDE, as a name this screen has words for. */
  outcome: string
  onDismissOutcome: () => void
  /** Opens the feedback screen - the strip at the top of the hub sends people there (see t.scenarios.untested). */
  onFeedback: () => void
  /**
   * What the hub is showing, and how much of the past runs is unfolded.
   *
   * Both are kept by App rather than here: this tab is unmounted the moment somebody looks at another
   * one, and a sentence half typed into the new-scenario form - or a scenario half written in the editor
   * - is not a thing to lose to a glance at a chat. It cost exactly that before: writing the description,
   * pressing the button, stepping into the conversation to check something and coming back to an empty
   * screen with a model still working somewhere behind it.
   */
  view: ScenariosView
  onView: Dispatch<SetStateAction<ScenariosView>>
  shownRuns: number
  onShownRuns: (shown: number) => void
  /**
   * When the model started writing a scenario, or 0 when none is being written - see onDraft.
   *
   * The moment rather than a yes-or-no, because the form counts the wait out loud. It is kept in App
   * along with the request it belongs to for the reason everything else about this screen is: the tab is
   * unmounted by a glance at a chat, and a start remembered inside it would begin the count again on the
   * way back - the same lie the compact's percentage told when its clock lived in the card.
   */
  draftingSince: number
  /** Why the last attempt at one came back with nothing, in the CLI's own words. */
  draftError: string
  /** What the model wrote, once: it opens in the editor unsaved, and is taken with onDraftTaken. */
  drafted: Scenario | null
  /** Describe a round of work and have a model write it down (see ScenarioAuthor on the IDE's side). */
  onDraft: (description: string) => void
  onCancelDraft: () => void
  onDraftTaken: () => void
  onSave: (scenario: Scenario, scope: ScenarioScope) => void
  onDelete: (id: string, scope: ScenarioScope) => void
  onDuplicate: (id: string, scope: ScenarioScope) => void
  onRun: (scenario: Scenario, inputs: Record<string, string>) => void
  onOpenRun: (runId: string) => void
  onDeleteRun: (runId: string) => void
}

/** An hour as the form holds it: minutes from midnight, a rhythm, and a day for a weekly one. */
export interface ScheduledHour {
  at: number
  repeat: ScenarioRepeat
  weekday: number
}

/**
 * What the hub is showing. Exported because it is kept in App rather than here - see the `view` prop.
 */
export type ScenariosView =
  | { kind: 'list' }
  | { kind: 'edit'; draft: Scenario; fresh: boolean }
  /** The little form in front of a run: the questions the scenario asks before it starts. */
  | { kind: 'start'; scenario: Scenario; values: Record<string, string> }
  /** What a new scenario begins as: a sentence for a model to write it from, or the empty form. */
  | { kind: 'new'; description: string }
  /** The form in front of an hour: when to start, how often, and the scenario's own questions. */
  | { kind: 'when'; scenario: Scenario; hour: ScheduledHour; values: Record<string, string> }

/**
 * How many past runs stand under the shelves before the rest is behind a row that asks for them.
 *
 * A run is a night's work and they pile up daily: a scenario on an hour leaves one every morning, and by
 * the second month the shelves - the thing this screen is actually for - are pushed off the top of it by
 * a list of dates nobody came here to read. Six is about a screenful under the two shelves, and the row
 * below says how many are left rather than hiding the number.
 */
export const RUNS_PAGE = 6

export const ScenariosTab = ({
  scenarios,
  runs,
  liveRunId,
  schedules,
  onSchedule,
  onUnschedule,
  canShare,
  models,
  customModels,
  outcome,
  onDismissOutcome,
  onFeedback,
  view,
  onView: setView,
  shownRuns,
  onShownRuns,
  draftingSince,
  draftError,
  drafted,
  onDraft,
  onCancelDraft,
  onDraftTaken,
  onSave,
  onDelete,
  onDuplicate,
  onRun,
  onOpenRun,
  onDeleteRun,
}: ScenariosTabProps) => {
  const t = useT()
  const [removing, setRemoving] = useState<{ scenario?: Scenario; run?: ScenarioRunSummary } | null>(null)
  const [helping, setHelping] = useState(false)

  const shelves = useMemo(
    () => ({
      project: (scenarios ?? []).filter((one) => one.scope === 'project'),
      user: (scenarios ?? []).filter((one) => one.scope === 'user'),
    }),
    [scenarios],
  )

  /** The empty form, which is what "new scenario" meant before a model could write one. */
  const byHand = () =>
    setView({
      kind: 'edit',
      fresh: true,
      draft: blankScenario(t.scenarios.newName, t.scenarios.stage, canShare ? 'project' : 'user'),
    })

  /*
   * What the model wrote opens in the editor, unsaved.
   *
   * Read before it is kept: the person asked for a round of work in one sentence and gets back three
   * stages of instructions to agents, and Save is the moment they say it is what they meant. Taken as it
   * lands, so that leaving the editor and coming back does not open it again over whatever is there now.
   */
  useEffect(() => {
    if (!drafted) return
    setView({ kind: 'edit', fresh: true, draft: drafted })
    onDraftTaken()
  }, [drafted, onDraftTaken, setView])

  /** The hour this scenario already has, if any - one per scenario (see ScheduleStore). */
  const hourOf = (scenario: Scenario): ScenarioSchedule | undefined =>
    schedules.find((one) => one.scenarioId === scenario.id && one.scope === scenario.scope)

  /** The form for an hour, filled in with whatever this scenario already has to say for itself. */
  const askWhen = (scenario: Scenario) => {
    const has = hourOf(scenario)

    setView({
      kind: 'when',
      scenario,
      hour: {
        // About an hour from now, worked out when the form opens rather than fixed: the thing somebody
        // schedules is usually the thing in front of them, not this second but once they have finished
        // what they are doing (see defaultHour).
        at: has?.at ?? defaultHour(),
        // Once, until somebody says otherwise. A rhythm is a standing arrangement - work raised every
        // morning whether or not anybody remembers setting it - and that is a thing to choose rather
        // than a thing to be given by a form that opened with it already ticked.
        repeat: has?.repeat ?? 'once',
        weekday: has?.weekday ?? 1,
      },
      // The answers it already has, or the ones its last run was given: the same round of work against
      // the same ticket is the commonest second run there is (see start below).
      values: has?.inputs ?? runs.find((run) => run.scenarioId === scenario.id)?.inputs ?? {},
    })
  }

  const start = (scenario: Scenario) => {
    /*
     * A scenario with nothing to ask starts on the press.
     *
     * A form with no fields in it and a Start button under it is a question about nothing: the person
     * has already said what they wanted by pressing the button on the row.
     */
    if (scenario.inputs.length === 0) return onRun(scenario, {})

    setView({
      kind: 'start',
      scenario,
      // What the last run of this scenario was given: the same round of work against the same ticket is
      // the commonest second run there is, and retyping it is the commonest reason not to.
      values: runs.find((run) => run.scenarioId === scenario.id)?.inputs ?? {},
    })
  }

  if (view.kind === 'edit') {
    return (
      <ScenarioEditor
        draft={view.draft}
        fresh={view.fresh}
        canShare={canShare}
        models={models}
        customModels={customModels}
        onChange={(draft) => setView({ ...view, draft })}
        onSave={(draft, scope) => {
          onSave(draft, scope)
          setView({ kind: 'list' })
        }}
        onCancel={() => setView({ kind: 'list' })}
      />
    )
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        <div className={s.headTitles}>
          <span className={s.title}>{t.scenarios.title}</span>
          <span className={s.hint}>{t.scenarios.hint}</span>
        </div>
        <span className={s.headSpace} />
        <div className={s.headButtons}>
          <button
            type="button"
            className={s.button}
            onClick={() => setView((current) => (current.kind === 'new' ? { kind: 'list' } : { kind: 'new', description: '' }))}
          >
            {t.scenarios.create}
          </button>
          {/*
            What all this is for, behind a question mark rather than written across the screen: it is read
            once, by somebody meeting the word for the first time.
          */}
          <button
            type="button"
            className={`${s.button} ${s.helpSquare}`}
            data-tooltip={t.scenarios.help.button}
            aria-label={t.scenarios.help.button}
            onClick={() => setHelping(true)}
          >
            ?
          </button>
        </div>
      </div>

      <div className={s.body}>
        {/*
          Said before anything is pressed rather than after something has gone wrong: this part is young,
          a scenario works for hours over the working copy, and the only report worth anything is one
          written while it is fresh. Hence the button - the feedback screen is four steps away through the
          menu, and a warning that ends in "tell somebody" without saying where is a warning nobody acts
          on. It comes off when the reports stop.
        */}
        <div className={s.untested}>
          <span className={s.untestedText}>{t.scenarios.untested.text}</span>
          <button type="button" className={s.untestedReport} onClick={onFeedback}>
            {t.scenarios.untested.report}
          </button>
        </div>

        {outcome ? (
          <div className={s.outcome} onClick={onDismissOutcome} role="presentation">
            {t.scenarios.outcomes[outcome as keyof typeof t.scenarios.outcomes] ?? t.scenarios.outcomes.unknown}
          </div>
        ) : null}

        {view.kind === 'new' ? (
          <NewScenarioForm
            description={view.description}
            since={draftingSince}
            error={draftError}
            onChange={(description) => setView({ kind: 'new', description })}
            onDraft={() => onDraft(view.description)}
            onCancel={onCancelDraft}
            onByHand={byHand}
          />
        ) : null}

        {view.kind === 'when' ? (
          <WhenForm
            scenario={view.scenario}
            hour={view.hour}
            values={view.values}
            onHour={(hour) => setView({ ...view, hour })}
            onValues={(values) => setView({ ...view, values })}
            onSet={() => {
              onSchedule(view.scenario, view.hour, view.values)
              setView({ kind: 'list' })
            }}
            onCancel={() => setView({ kind: 'list' })}
          />
        ) : null}

        {view.kind === 'start' ? (
          <StartForm
            scenario={view.scenario}
            values={view.values}
            onChange={(values) => setView({ ...view, values })}
            onStart={() => {
              onRun(view.scenario, view.values)
              setView({ kind: 'list' })
            }}
            onCancel={() => setView({ kind: 'list' })}
          />
        ) : null}

        <Shelf
          label={t.scenarios.shelves.project}
          scenarios={shelves.project}
          empty={canShare ? t.scenarios.shelves.projectEmpty : t.scenarios.shelves.noProject}
          busy={liveRunId.length > 0}
          hourOf={hourOf}
          onEdit={(draft) => setView({ kind: 'edit', draft, fresh: false })}
          onRun={start}
          onWhen={askWhen}
          onUnschedule={onUnschedule}
          onDuplicate={onDuplicate}
          onRemove={(scenario) => setRemoving({ scenario })}
        />

        <Shelf
          label={t.scenarios.shelves.user}
          scenarios={shelves.user}
          empty={t.scenarios.shelves.userEmpty}
          busy={liveRunId.length > 0}
          hourOf={hourOf}
          onEdit={(draft) => setView({ kind: 'edit', draft, fresh: false })}
          onRun={start}
          onWhen={askWhen}
          onUnschedule={onUnschedule}
          onDuplicate={onDuplicate}
          onRemove={(scenario) => setRemoving({ scenario })}
        />

        <div className={s.section}>
          <div className={s.label}>
            {t.scenarios.pastRuns}
            <span className={s.labelLine} />
          </div>

          {runs.length === 0 ? (
            <p className={s.empty}>{t.scenarios.noRuns}</p>
          ) : (
            <div className={s.rows}>
              {runs.slice(0, shownRuns).map((run) => (
                <div key={run.id} className={s.row}>
                  <button
                    type="button"
                    className={s.rowText}
                    onClick={() => onOpenRun(run.id)}
                    aria-label={run.scenarioName}
                  >
                    <span className={s.rowTitle}>{run.scenarioName}</span>
                    <span className={s.rowFacts}>
                      {[
                        describeWhen(run.startedAt),
                        t.scenarios.run.cards(run.done, run.total),
                        run.finishedAt > 0 ? formatDuration(run.finishedAt - run.startedAt) : '',
                        run.cost > 0 ? `$${run.cost.toFixed(2)}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                  <StatePill state={run.state} failure={run.failure} />
                  <span className={s.rowActions}>
                    <button
                      type="button"
                      className={`${s.iconButton} ${s.iconDanger}`}
                      data-tooltip={t.scenarios.deleteRun}
                      aria-label={t.scenarios.deleteRun}
                      disabled={run.id === liveRunId}
                      onClick={() => setRemoving({ run })}
                    >
                      ×
                    </button>
                  </span>
                </div>
              ))}

              {/* Standing inside the list rather than under it: the gap between it and the last run is
                  the one between two runs, and a row that opens more of them belongs to them. */}
              {runs.length > shownRuns ? (
                <button
                  type="button"
                  className={s.moreRuns}
                  onClick={() => onShownRuns(shownRuns + RUNS_PAGE)}
                >
                  {t.scenarios.moreRuns(runs.length - shownRuns)}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {helping ? <Help onClose={() => setHelping(false)} /> : null}

      {removing?.scenario ? (
        <Confirm
          title={t.scenarios.deleteTitle}
          subject={removing.scenario.name}
          confirmLabel={t.scenarios.delete}
          onConfirm={() => {
            onDelete(removing.scenario!.id, removing.scenario!.scope)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      ) : null}

      {removing?.run ? (
        <Confirm
          title={t.scenarios.deleteRunTitle}
          subject={removing.run.scenarioName}
          confirmLabel={t.scenarios.delete}
          onConfirm={() => {
            onDeleteRun(removing.run!.id)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </div>
  )
}

const Shelf = ({
  label,
  scenarios,
  empty,
  busy,
  hourOf,
  onEdit,
  onRun,
  onWhen,
  onUnschedule,
  onDuplicate,
  onRemove,
}: {
  label: string
  scenarios: Scenario[]
  empty: string
  /** A run is going in this project, and a second one in the same working copy is refused. */
  busy: boolean
  /** The hour this scenario starts at by itself, when it has one. */
  hourOf: (scenario: Scenario) => ScenarioSchedule | undefined
  onEdit: (scenario: Scenario) => void
  onRun: (scenario: Scenario) => void
  onWhen: (scenario: Scenario) => void
  onUnschedule: (id: string, scope: ScenarioScope) => void
  onDuplicate: (id: string, scope: ScenarioScope) => void
  onRemove: (scenario: Scenario) => void
}) => {
  const t = useT()

  return (
    <div className={s.section}>
      <div className={s.label}>
        {label}
        <span className={s.labelLine} />
      </div>

      {scenarios.length === 0 ? (
        <p className={s.empty}>{empty}</p>
      ) : (
        <div className={s.rows}>
          {scenarios.map((scenario) => {
            const broken = !runnable(scenario)
            const hour = hourOf(scenario)

            return (
              <div key={`${scenario.scope}:${scenario.id}`} className={s.row}>
                <button type="button" className={s.rowText} onClick={() => onEdit(scenario)}>
                  <span className={s.rowTitle}>{scenario.name}</span>
                  <span className={`${s.rowFacts} ${broken ? s.broken : ''}`}>
                    {broken
                      ? t.scenarios.needsFixing
                      : [
                          t.scenarios.stages(scenario.stages.length),
                          t.scenarios.cards(cardRuns(scenario)),
                          scenario.stages.some((stage) => passesOf(stage) > 1) ? t.scenarios.hasLoop : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </span>
                  {hour ? <HourLine hour={hour} /> : null}
                </button>

                <span className={s.rowActions}>
                  <button
                    type="button"
                    className={`${s.button} ${s.rowRun}`}
                    disabled={broken || busy}
                    data-tooltip={busy ? t.scenarios.busy : undefined}
                    onClick={() => onRun(scenario)}
                  >
                    {t.scenarios.play}
                  </button>
                  {/*
                    The hour it starts at by itself. Beside Run rather than inside its form: setting an
                    hour and pressing play are two different intentions, and the one that waits until nine
                    is the one nobody wants to find by pressing the one that starts now.
                  */}
                  <button
                    type="button"
                    className={`${s.iconButton} ${hour ? s.iconOn : ''}`}
                    disabled={broken}
                    data-tooltip={hour ? t.scenarios.when.change : t.scenarios.when.set}
                    aria-label={hour ? t.scenarios.when.change : t.scenarios.when.set}
                    onClick={() => onWhen(scenario)}
                  >
                    ◷
                  </button>
                  {hour ? (
                    <button
                      type="button"
                      className={s.iconButton}
                      data-tooltip={t.scenarios.when.clear}
                      aria-label={t.scenarios.when.clear}
                      onClick={() => onUnschedule(scenario.id, scenario.scope)}
                    >
                      ⊘
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={s.iconButton}
                    data-tooltip={t.scenarios.duplicate}
                    aria-label={t.scenarios.duplicate}
                    onClick={() => onDuplicate(scenario.id, scenario.scope)}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className={`${s.iconButton} ${s.iconDanger}`}
                    data-tooltip={t.scenarios.delete}
                    aria-label={t.scenarios.delete}
                    onClick={() => onRemove(scenario)}
                  >
                    ×
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Four lines about what a scenario is, and not a fifth.
 *
 * Everything here answers a question somebody actually has on this screen - what is it, what happens when
 * I press play, where does it live, what do I get - and a page nobody reads answers none of them.
 */
const Help = ({ onClose }: { onClose: () => void }) => {
  const t = useT()
  const close = useRef(onClose)
  close.current = onClose

  // Escape closes this before the panel sees it: there it stops the turn, and a window somebody opened to
  // read should not break off work nobody asked to break off (the search window is guarded the same way).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close.current()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <>
      <div className={s.helpScrim} onClick={onClose} />
      <div className={s.help} role="dialog" aria-modal="true" aria-label={t.scenarios.help.title}>
        <div className={s.helpHead}>
          <span className={s.helpTitle}>{t.scenarios.help.title}</span>
          <button type="button" className={s.iconButton} aria-label={t.common.close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={s.helpList}>
          {([
            ['what', t.scenarios.help.what],
            ['asks', t.scenarios.help.asks],
            ['run', t.scenarios.help.run],
            ['kept', t.scenarios.help.kept],
            ['watch', t.scenarios.help.watch],
          ] as const).map(([id, line]) => (
            <p key={id}>
              <span className={s.helpLead}>{line.lead}</span> {line.text}
            </p>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * How a new scenario begins: a sentence about the round of work, and a model to write it down.
 *
 * The description leads and the empty form stands beside it, because that is the order of the difficulty.
 * Anybody can say what they want done every Monday; almost nobody wants to fill in three stages of cards,
 * slots and definitions of done to find out what the thing even is. What comes back is a draft in the
 * editor, never a saved file - the whole form is on the screen afterwards and every word of it can be
 * changed, which is what makes handing the first draft to a model safe to do at all.
 *
 * Cancel is a real button rather than a spinner to wait out: this takes half a minute or more, because the
 * model reads the project before it writes (see ScenarioAuthor).
 */
const NewScenarioForm = ({
  description,
  since,
  error,
  onChange,
  onDraft,
  onCancel,
  onByHand,
}: {
  description: string
  /** When the model started writing, or 0 when nobody is - see draftingSince. */
  since: number
  error: string
  onChange: (description: string) => void
  onDraft: () => void
  onCancel: () => void
  onByHand: () => void
}) => {
  const t = useT()
  // Cmd/Ctrl+Backspace, Cmd/Ctrl+Z and the step forward, which this browser does not give a field of its
  // own (see useFieldHistory). Every plain field of the panel goes through it.
  const keys = useFieldHistory(description, onChange)
  const drafting = since > 0

  /*
   * A second's tick, and only while the model writes.
   *
   * A form nothing on which changes by itself has no business being redrawn once a second, so the timer
   * exists exactly as long as the wait does - the same reasoning the run tab's clock stands on.
   */
  const clock = useNow()
  const [now, setNow] = useState(() => clock())
  useEffect(() => {
    if (!drafting) return
    setNow(clock())
    const timer = setInterval(() => setNow(clock()), 1000)
    return () => clearInterval(timer)
  }, [drafting, clock])

  return (
    <div className={s.card} style={{ marginBottom: 14 }}>
      <div className={s.subLabel}>{t.scenarios.draft.title}</div>

      <textarea
        className={s.area}
        value={description}
        placeholder={t.scenarios.draft.hint}
        disabled={drafting}
        autoFocus
        onChange={keys.onChange}
        onKeyDown={(event) => {
          keys.onKeyDown(event)
          if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey) return
          // Enter writes it, Shift+Enter is a new line - the same pair the field for the model's search
          // has, and for its reason: this is one sentence far more often than it is three.
          event.preventDefault()
          if (!drafting && description.trim().length > 0) onDraft()
        }}
      />

      {/* Under the field rather than beside the caption: it belongs to what is being written, and it is
          the only thing on the screen that moves while a model works for half a minute. */}
      {drafting ? <div className={s.draftBar} /> : null}

      {error ? <p className={s.draftError}>{error}</p> : null}

      <div className={s.chips}>
        {drafting ? (
          <>
            <span className={s.draftGoing}>{t.scenarios.draft.going}</span>
            {/* How long it has already taken, beside the words rather than instead of them: a line that
                reads the same at the tenth second and at the ninetieth is a line that cannot be told
                from one that has stopped. A reading, so it is not translated - the same as "38h 10m" on
                the usage rings. */}
            <span className={s.draftElapsed}>{formatDuration(now - since)}</span>
            {/* Pinned to the right edge: with Cancel a step behind a shimmering caption, the one thing on
                the row that is pressed moved with the length of the sentence and the language. */}
            <button type="button" className={`${s.button} ${s.draftCancel}`} onClick={onCancel}>
              {t.common.cancel}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${s.button} ${s.buttonMain}`}
              disabled={description.trim().length === 0}
              onClick={onDraft}
            >
              {t.scenarios.draft.write}
            </button>
            {/* The way it always worked, kept as a button beside the field rather than behind a choice. */}
            <button type="button" className={s.button} onClick={onByHand}>
              {t.scenarios.draft.byHand}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * What a row says about its hour: when the next run is, and whether one was missed.
 *
 * Three facts and no sentence of its own (see scheduleNote): the panel speaks ten languages, and the
 * words for "tomorrow at nine" belong here rather than in the IDE that keeps the hour.
 */
const HourLine = ({ hour }: { hour: ScenarioSchedule }) => {
  const t = useT()
  const locale = useLocale()
  const note = scheduleNote(hour)

  /*
   * The day and the clock, and the clock in the same twenty-four hour form the field was typed in.
   *
   * Left to the locale this comes back as "09:00 AM" beside the row's own "09:00", which reads as two
   * different times rather than one written twice - and the hour is a setting somebody typed, not a date
   * to be presented.
   */
  const when = (at: number): string =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(at))

  const rhythm =
    hour.repeat === 'weekly'
      ? t.scenarios.when.weeklyOn(weekdayName(hour.weekday, locale, 'long'))
      : t.scenarios.when.repeats[hour.repeat]

  return (
    <span className={s.rowHour}>
      {/* The rhythm carries no clock of its own: the hour stands once, in whichever of the lines below
          is the true one - the next run, the missed one, or the one that has already been. */}
      <span>{note.next || note.missed || note.ran ? rhythm : `${rhythm} · ${clockLabel(hour.at)}`}</span>
      {note.next ? <span className={s.rowHourNext}>{t.scenarios.when.next(when(note.next))}</span> : null}
      {/*
        Said out loud, and in the colour of a thing that did not happen: nothing is ever started late (see
        ScenarioSchedule.missedAt), so an hour that passed while the IDE was closed leaves no other trace
        at all - and a scenario that quietly did not run last night is exactly what somebody needs to know.
      */}
      {note.missed ? <span className={s.rowHourMissed}>{t.scenarios.when.missed(when(note.missed))}</span> : null}
      {note.ran ? <span className={s.rowHourNext}>{t.scenarios.when.ran(when(note.ran))}</span> : null}
    </span>
  )
}

/**
 * The form for an hour: when, how often, and the scenario's own questions.
 *
 * The questions are here because at the hour there is nobody at the keyboard to answer them - a schedule
 * without them would be an alarm that rings and then asks something of an empty chair. The same fields as
 * the start form, and the same rule: nothing may be set while a required one is empty.
 */
const WhenForm = ({
  scenario,
  hour,
  values,
  onHour,
  onValues,
  onSet,
  onCancel,
}: {
  scenario: Scenario
  hour: ScheduledHour
  values: Record<string, string>
  onHour: (hour: ScheduledHour) => void
  onValues: (values: Record<string, string>) => void
  onSet: () => void
  onCancel: () => void
}) => {
  const t = useT()
  const locale = useLocale()
  const missing = missingInputs(scenario, values)

  return (
    <div className={s.card} style={{ marginBottom: 14 }}>
      <div className={s.cardHead}>
        <span className={s.rowTitle}>{scenario.name}</span>
      </div>

      <div className={s.form}>
        <div className={s.formRow}>
          <span className={s.formLabel}>{t.scenarios.when.at}</span>
          {/*
            Two of the panel's own menus rather than a time field: the browser inside the IDE draws that
            one in a white system panel of its own, which is a piece of Chromium sitting in the middle of
            this form and the only control on the screen that does not belong to the plugin.
          */}
          <span className={s.timeRow}>
            <Picker
              label=""
              title={t.scenarios.when.hours}
              value={String(Math.floor(hour.at / 60))}
              options={HOURS.map((one) => ({ id: String(one), label: pad2(one) }))}
              width={104}
              onPick={(id) => onHour({ ...hour, at: Number(id) * 60 + (hour.at % 60) })}
            />
            <span className={s.timeColon}>:</span>
            <Picker
              label=""
              title={t.scenarios.when.minutes}
              value={String(hour.at % 60)}
              options={MINUTES.map((one) => ({ id: String(one), label: pad2(one) }))}
              width={104}
              onPick={(id) => onHour({ ...hour, at: Math.floor(hour.at / 60) * 60 + Number(id) })}
            />
          </span>
        </div>

        <div className={s.formRow}>
          <span className={s.formLabel}>{t.scenarios.when.repeat}</span>
          <span className={s.chips}>
            {(['once', 'daily', 'weekdays', 'weekly'] as const).map((repeat) => (
              <button
                key={repeat}
                type="button"
                className={`${s.button} ${hour.repeat === repeat ? s.buttonMain : ''}`}
                onClick={() => onHour({ ...hour, repeat })}
              >
                {t.scenarios.when.repeats[repeat]}
              </button>
            ))}
          </span>
        </div>

        {hour.repeat === 'weekly' ? (
          <div className={s.formRow}>
            <span className={s.formLabel}>{t.scenarios.when.onDay}</span>
            <span className={s.chips}>
              {WEEKDAYS.map((weekday) => (
                <button
                  key={weekday}
                  type="button"
                  className={`${s.button} ${hour.weekday === weekday ? s.buttonMain : ''}`}
                  onClick={() => onHour({ ...hour, weekday })}
                >
                  {weekdayName(weekday, locale)}
                </button>
              ))}
            </span>
          </div>
        ) : null}

        {scenario.inputs.map((input) => (
          <div key={input.id} className={s.formRow}>
            <span className={s.formLabel}>{input.label || input.name}</span>
            <input
              className={s.field}
              value={values[input.name] ?? ''}
              placeholder={input.placeholder}
              onChange={(event) => onValues({ ...values, [input.name]: event.target.value })}
            />
          </div>
        ))}

        {/* Said before the button is pressed rather than after: the IDE has to be running at that hour,
            and a round of work that quietly did not happen is worse than one that was never set. */}
        <p className={s.formNote}>{t.scenarios.when.needsIde}</p>

        <div className={s.formRow}>
          <span className={s.formLabel} />
          <button
            type="button"
            className={`${s.button} ${s.buttonMain}`}
            disabled={missing.length > 0}
            onClick={onSet}
          >
            {t.scenarios.when.save}
          </button>
          <button type="button" className={s.button} onClick={onCancel}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** What the scenario asks before it starts: one field per input, and nothing else. */
const StartForm = ({
  scenario,
  values,
  onChange,
  onStart,
  onCancel,
}: {
  scenario: Scenario
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  onStart: () => void
  onCancel: () => void
}) => {
  const t = useT()
  const missing = missingInputs(scenario, values)

  return (
    <div className={s.card} style={{ marginBottom: 14 }}>
      <div className={s.cardHead}>
        <span className={s.rowTitle}>{scenario.name}</span>
      </div>

      <div className={s.form}>
        {scenario.inputs.map((input) => (
          <div key={input.id} className={s.formRow}>
            <span className={s.formLabel}>{input.label || input.name}</span>
            <input
              className={s.field}
              value={values[input.name] ?? ''}
              placeholder={input.placeholder}
              onChange={(event) => onChange({ ...values, [input.name]: event.target.value })}
            />
          </div>
        ))}

        <div className={s.formRow}>
          <span className={s.formLabel} />
          <button
            type="button"
            className={`${s.button} ${s.buttonMain}`}
            disabled={missing.length > 0}
            onClick={onStart}
          >
            {t.scenarios.play}
          </button>
          <button type="button" className={s.button} onClick={onCancel}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
