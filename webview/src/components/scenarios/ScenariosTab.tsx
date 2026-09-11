import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  ModelInfo,
  Scenario,
  ScenarioRunSummary,
  ScenarioSchedule,
  ScenarioScope,
} from '../../protocol'
import { blankScenario } from '../../scenarios/blank'
import { pastRuns, runningRuns } from '../../scenarios/runs'
import { defaultHour } from '../../scenarios/schedule'
import { timetableOf } from '../../scenarios/timetable'
import { useT } from '../../i18n'
import { Confirm } from '../Confirm'
import { Help } from './Help'
import { NewScenarioForm } from './NewScenarioForm'
import { RunsBand } from './RunsBand'
import { ScenarioEditor } from './ScenarioEditor'
import { ScheduleBand } from './ScheduleBand'
import { Shelf } from './Shelf'
import { StartForm } from './StartForm'
import { WhenForm } from './WhenForm'
import {
  BANDS,
  EDIT_AT_FIRST,
  RUNS_PAGE,
  type ScenariosBand,
  type ScenariosOverlay,
  type ScenariosShown,
  type ScenariosView,
  type ScheduledHour,
} from './view'
import s from './scenarios.module.css'

export { AT_FIRST, SHOWN_AT_FIRST } from './view'
export type { ScenariosShown, ScenariosView } from './view'

/**
 * The hub, built around three questions: what exists, what is happening, what will happen.
 *
 * It used to be five sections down one scroll, every row of them in the same clothes and every word in
 * the console font - a scenario, a live run, a scheduled hour and a finished run were told apart only by
 * reading. Now each question is a band with a count of its own, so nothing is hunted for by scrolling,
 * and the three forms have left the list for an overlay: half a minute of a model reading the project no
 * longer moves the shelf under whoever is looking at it.
 *
 * A row is a scenario and everything one does to a scenario is on it. The runs stand under the shelves as
 * a line each, and pressing one opens it in a tab of its own - a run goes on for hours and is not
 * something to look at inside a list.
 */
export interface ScenariosTabProps {
  scenarios: Scenario[] | null
  runs: ScenarioRunSummary[]
  /**
   * The runs going right now, as summaries.
   *
   * There may be several: one scenario can be started as many times as somebody wants. They arrive on a
   * message of their own, once a second, because they change while the shelves do not (see
   * ScenarioDesk.sendLive).
   */
  liveRuns: ScenarioRunSummary[]
  /** Every scheduled run of this project - see ScenarioSchedule. */
  schedules: ScenarioSchedule[]
  /** The hours could not be read off the disk at all - which is not "there are none". */
  schedulesUnread?: boolean
  onSchedule: (scenario: Scenario, scheduleId: string, hour: ScheduledHour, inputs: Record<string, string>) => void
  onUnschedule: (scheduleId: string) => void
  /** Whether this project has a repository to put a shared scenario in at all. */
  canShare: boolean
  /** For the editor's model menus: the account's catalogue and the names added by hand, as the composer has them. */
  models: ModelInfo[] | null
  customModels: string[]
  /** The last refusal from the IDE, as a name this screen has words for. */
  outcome: string
  onDismissOutcome: () => void
  /**
   * What the hub is showing, and how much of its long list is unfolded.
   *
   * Both are kept by App rather than here: this tab is unmounted the moment somebody looks at another
   * one, and a sentence half typed into the new-scenario form - or a scenario half written in the editor
   * - is not a thing to lose to a glance at a chat. It cost exactly that before: writing the description,
   * pressing the button, stepping into the conversation to check something and coming back to an empty
   * screen with a model still working somewhere behind it.
   */
  view: ScenariosView
  onView: Dispatch<SetStateAction<ScenariosView>>
  shown: ScenariosShown
  onShown: Dispatch<SetStateAction<ScenariosShown>>
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
  onPauseRun: (runId: string) => void
  onResumeRun: (runId: string) => void
  onStopRun: (runId: string) => void
}

export const ScenariosTab = ({
  scenarios,
  runs,
  liveRuns,
  schedules,
  schedulesUnread,
  onSchedule,
  onUnschedule,
  canShare,
  models,
  customModels,
  outcome,
  onDismissOutcome,
  view,
  onView: setView,
  shown,
  onShown: setShown,
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
  onPauseRun,
  onResumeRun,
  onStopRun,
}: ScenariosTabProps) => {
  const t = useT()
  const [removing, setRemoving] = useState<{
    scenario?: Scenario
    run?: ScenarioRunSummary
    schedule?: ScenarioSchedule
  } | null>(null)
  const [stopping, setStopping] = useState<ScenarioRunSummary | null>(null)
  const [helping, setHelping] = useState(false)

  const shelves = useMemo(
    () => ({
      project: (scenarios ?? []).filter((one) => one.scope === 'project'),
      user: (scenarios ?? []).filter((one) => one.scope === 'user'),
    }),
    [scenarios],
  )

  const going = useMemo(() => runningRuns(liveRuns), [liveRuns])
  const finished = useMemo(() => pastRuns(runs, liveRuns), [runs, liveRuns])
  const asking = going.filter((run) => run.state === 'blocked')

  /*
   * What the model wrote opens in the editor, unsaved.
   *
   * Read before it is kept: the person asked for a round of work in one sentence and gets back three
   * stages of instructions to agents, and Save is the moment they say it is what they meant. Taken as it
   * lands, so that leaving the editor and coming back does not open it again over whatever is there now.
   */
  useEffect(() => {
    if (!drafted) return
    setView({ kind: 'edit', fresh: true, draft: drafted, at: EDIT_AT_FIRST })
    onDraftTaken()
  }, [drafted, onDraftTaken, setView])

  const band = view.kind === 'list' ? view.band : 'scenarios'
  const over = view.kind === 'list' ? view.over : { kind: 'none' as const }

  const show = (next: ScenariosBand) => setView({ kind: 'list', band: next, over: { kind: 'none' } })
  const close = () => setView((current) => (current.kind === 'list' ? { ...current, over: { kind: 'none' } } : current))
  const openOver = (next: ScenariosOverlay) =>
    setView((current) => ({ kind: 'list', band: current.kind === 'list' ? current.band : 'scenarios', over: next }))

  /** The empty form, which is what "new scenario" meant before a model could write one. */
  const byHand = (scope: ScenarioScope) =>
    setView({
      kind: 'edit',
      fresh: true,
      at: EDIT_AT_FIRST,
      draft: blankScenario(t.scenarios.newName, t.scenarios.stage, canShare ? scope : 'user'),
    })

  /**
   * The form for a scheduled run, filled in with whatever there is to fill it with.
   *
   * One place, called from both doors - the clock on a scenario's row and a row of the timetable -
   * because it is twenty lines of decisions with reasons behind each of them. Handed `setView` instead,
   * the two doors would each assemble it and drift apart on the first change to any of these defaults.
   */
  const askWhen = (scenario: Scenario, schedule?: ScenarioSchedule) => {
    openOver({
      kind: 'when',
      scenario,
      scheduleId: schedule?.id ?? '',
      hour: {
        // About an hour from now, worked out when the form opens rather than fixed: the thing somebody
        // schedules is usually the thing in front of them, not this second but once they have finished
        // what they are doing (see defaultHour). An arrangement being CHANGED keeps its own hour.
        at: schedule?.at ?? defaultHour(),
        // Once, until somebody says otherwise. A rhythm is a standing arrangement - work raised every
        // morning whether or not anybody remembers setting it - and that is a thing to choose rather
        // than a thing to be given by a form that opened with it already ticked.
        repeat: schedule?.repeat ?? 'once',
        weekday: schedule?.weekday ?? 1,
      },
      // The answers this arrangement already has, and nothing else. A form that opens with somebody
      // else's answers already in it is a form whose fields get sent without being read - and an
      // arrangement raised every morning is the worst place for last week's ticket to hide.
      values: schedule?.inputs ?? {},
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

    openOver({
      kind: 'start',
      scenario,
      // Empty, always. Answers carried over from the last run look like answers somebody gave, and a
      // run started against last week's ticket is work done in the wrong place before anybody notices.
      values: {},
    })
  }

  /** An hour nobody was here for, run now: the scenario as it stands, with the answers it was given. */
  const runMissed = (schedule: ScenarioSchedule) => {
    const scenario = (scenarios ?? []).find(
      (one) => one.id === schedule.scenarioId && one.scope === schedule.scope,
    )
    if (scenario) onRun(scenario, schedule.inputs)
  }

  if (view.kind === 'edit') {
    return (
      <ScenarioEditor
        draft={view.draft}
        fresh={view.fresh}
        at={view.at}
        canShare={canShare}
        models={models}
        customModels={customModels}
        onChange={(draft) => setView({ ...view, draft })}
        onPlace={(at) => setView({ ...view, at })}
        onSave={(draft, scope) => {
          onSave(draft, scope)
          setView({ kind: 'list', band: 'scenarios', over: { kind: 'none' } })
        }}
        onCancel={() => setView({ kind: 'list', band: 'scenarios', over: { kind: 'none' } })}
      />
    )
  }

  const counts: Record<ScenariosBand, number> = {
    scenarios: (scenarios ?? []).length,
    runs: going.length,
    schedule: timetableOf(schedules, scenarios ?? []).count,
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
            className={`${s.button} ${s.buttonMain}`}
            onClick={() => openOver({ kind: 'new', description: '', scope: canShare ? 'project' : 'user' })}
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

      {/* The three questions, each with its own count and the one fact that belongs to it on the right. */}
      <div className={s.bands}>
        <div className={s.bandTabs} role="tablist">
          {BANDS.map((one) => (
            <button
              key={one}
              type="button"
              role="tab"
              aria-selected={band === one}
              className={`${s.bandTab} ${band === one ? s.bandTabOn : ''}`}
              onClick={() => show(one)}
            >
              {t.scenarios.bands[one]}
              <span className={`${s.bandCount} ${one === 'runs' && counts.runs > 0 ? s.bandCountLive : ''}`}>
                {counts[one]}
              </span>
            </button>
          ))}
        </div>

        <span className={s.bandNote}>
          {band === 'runs'
            ? [t.scenarios.spentToday(`$${spentToday(runs, going).toFixed(2)}`), t.scenarios.runsKept(finished.length)]
                .join(' · ')
            : band === 'schedule'
              ? t.scenarios.when.needsIdeShort
              : ''}
        </span>
      </div>

      <div className={s.body}>
        {outcome ? (
          <div className={s.outcome} onClick={onDismissOutcome} role="presentation">
            {t.scenarios.outcomes[outcome as keyof typeof t.scenarios.outcomes] ?? t.scenarios.outcomes.unknown}
          </div>
        ) : null}

        {/*
          A run that stopped to ask is a strip at the top rather than a row to find. It is the one thing
          on this screen waiting for a person, and it can be on any of the three bands.
        */}
        {asking.length > 0 ? (
          <div className={s.asksBand}>
            <span className={s.asksDot} />
            <span className={s.asksText}>
              {asking.length === 1 ? t.scenarios.asks.one : t.scenarios.asks.many(asking.length)}
              <span className={s.asksWhich}>{asking[0].scenarioName}</span>
            </span>
            <button type="button" className={`${s.button} ${s.buttonWarn}`} onClick={() => onOpenRun(asking[0].id)}>
              {t.scenarios.asks.answer}
            </button>
          </div>
        ) : null}

        {band === 'scenarios' ? (
          <>
            <Shelf
              label={t.scenarios.shelves.project}
              note={t.scenarios.shelves.projectNote}
              scope="project"
              scenarios={shelves.project}
              empty={canShare ? t.scenarios.shelves.projectEmpty : t.scenarios.shelves.noProject}
              emptyNote={canShare ? t.scenarios.shelves.projectEmptyNote : t.scenarios.shelves.noProjectNote}
              schedules={schedules}
              runs={going}
              onEdit={(draft) => setView({ kind: 'edit', draft, fresh: false, at: EDIT_AT_FIRST })}
              onRun={start}
              onWhen={(scenario) => askWhen(scenario)}
              onDuplicate={onDuplicate}
              onRemove={(scenario) => setRemoving({ scenario })}
              onOpenRun={onOpenRun}
              onNew={() => openOver({ kind: 'new', description: '', scope: 'project' })}
            />

            <Shelf
              label={t.scenarios.shelves.user}
              note={t.scenarios.shelves.userNote}
              scope="user"
              scenarios={shelves.user}
              empty={t.scenarios.shelves.userEmpty}
              emptyNote={t.scenarios.shelves.userEmptyNote}
              schedules={schedules}
              runs={going}
              onEdit={(draft) => setView({ kind: 'edit', draft, fresh: false, at: EDIT_AT_FIRST })}
              onRun={start}
              onWhen={(scenario) => askWhen(scenario)}
              onDuplicate={onDuplicate}
              onRemove={(scenario) => setRemoving({ scenario })}
              onOpenRun={onOpenRun}
              onNew={() => openOver({ kind: 'new', description: '', scope: 'user' })}
            />
          </>
        ) : null}

        {band === 'runs' ? (
          <RunsBand
            going={going}
            finished={finished}
            shown={shown.runs}
            onShow={() => setShown((current) => ({ ...current, runs: current.runs + RUNS_PAGE }))}
            onOpen={onOpenRun}
            onAnswer={onOpenRun}
            onPause={onPauseRun}
            onResume={onResumeRun}
            onStop={setStopping}
            onDelete={(run) => setRemoving({ run })}
          />
        ) : null}

        {band === 'schedule' ? (
          <ScheduleBand
            schedules={schedules}
            scenarios={scenarios ?? []}
            unread={schedulesUnread === true}
            onEdit={(schedule) => {
              const scenario = (scenarios ?? []).find(
                (one) => one.id === schedule.scenarioId && one.scope === schedule.scope,
              )
              if (scenario) askWhen(scenario, schedule)
            }}
            onRemove={(schedule) => setRemoving({ schedule })}
            onRunNow={runMissed}
          />
        ) : null}
      </div>

      {over.kind === 'new' ? (
        <NewScenarioForm
          description={over.description}
          scope={over.scope}
          canShare={canShare}
          since={draftingSince}
          error={draftError}
          onChange={(description) => openOver({ ...over, description })}
          onScope={(scope) => openOver({ ...over, scope })}
          onDraft={() => onDraft(over.description)}
          onCancel={onCancelDraft}
          onByHand={() => byHand(over.scope)}
          onClose={close}
        />
      ) : null}

      {over.kind === 'when' ? (
        <WhenForm
          scenario={over.scenario}
          editing={over.scheduleId.length > 0}
          hour={over.hour}
          values={over.values}
          onHour={(hour) => openOver({ ...over, hour })}
          onValues={(values) => openOver({ ...over, values })}
          onSet={() => {
            onSchedule(over.scenario, over.scheduleId, over.hour, over.values)
            close()
          }}
          onCancel={close}
        />
      ) : null}

      {over.kind === 'start' ? (
        <StartForm
          scenario={over.scenario}
          values={over.values}
          going={going.length}
          onChange={(values) => openOver({ ...over, values })}
          onStart={() => {
            onRun(over.scenario, over.values)
            close()
          }}
          onCancel={close}
        />
      ) : null}

      {helping ? <Help onClose={() => setHelping(false)} /> : null}

      {stopping ? (
        <Confirm
          title={t.scenarios.run.stopTitle}
          subject={stopping.scenarioName}
          note={t.scenarios.run.stopSubject}
          confirmLabel={t.scenarios.run.stop}
          onConfirm={() => {
            onStopRun(stopping.id)
            setStopping(null)
          }}
          onCancel={() => setStopping(null)}
        />
      ) : null}

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

      {removing?.schedule ? (
        <Confirm
          title={t.scenarios.when.clearTitle}
          subject={
            (scenarios ?? []).find(
              (one) => one.id === removing.schedule!.scenarioId && one.scope === removing.schedule!.scope,
            )?.name ?? t.scenarios.when.orphan
          }
          confirmLabel={t.scenarios.delete}
          onConfirm={() => {
            onUnschedule(removing.schedule!.id)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * What the rounds of work in this project have cost since midnight.
 *
 * The going ones counted with the finished, because a run that has been working since nine has already
 * spent what it says it has: a figure that only admits a night's cost the morning after is a figure
 * nobody can act on while there is still time to.
 */
const spentToday = (runs: ScenarioRunSummary[], going: ScenarioRunSummary[]): number => {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const since = midnight.getTime()

  return [...runs, ...going.filter((run) => !runs.some((one) => one.id === run.id))]
    .filter((run) => run.startedAt >= since)
    .reduce((sum, run) => sum + (run.cost || 0), 0)
}
