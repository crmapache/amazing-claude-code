import { useState } from 'react'
import { formatDuration } from '../../feed/tools'
import { useGrowthFlash } from '../../hooks/useGrowthFlash'
import { useNow } from '../../hooks/useNow'
import { useLocale, useT } from '../../i18n'
import type { Scenario, ScenarioQueued, ScenarioQueueState, ScenarioRunSummary, ScenarioSchedule } from '../../protocol'
import { StatePill } from '../../components/scenarios/StatePill'
import { BANDS, type ScenariosBand } from '../../components/scenarios/view'
import { clockLabel, defaultHour, nextNote, schedulesOf, weekdayName, whenLabel } from '../../scenarios/schedule'
import { runElapsed } from '../../scenarios/timeline'
import { countdown, timetableOf } from '../../scenarios/timetable'
import { blankScenario } from '../../scenarios/blank'
import { cardRuns, passesOf, problemsOf, blocking } from '../../scenarios/rules'
import { pastRuns, runMarks, runningRuns } from '../../scenarios/runs'
import { namedRun, queueBehind, queueMarks, queueStanding, queuedFor } from '../../scenarios/queue'
import { startedLabel } from '../../scenarios/moments'
import type { ScenarioShelves } from '../facts'
import {
  outcomeText,
  repositoryOfOption,
  shelfOptionId,
  shelfOptions,
  type RepositoryChoice,
  type ShelfChoice,
} from '../scenarios'
import { Back } from './Back'
import { HourSheet, NewScenarioSheet, QueueSheet, ScenarioActionsSheet, StartSheet } from './ScenarioSheets'
import { PickSheet } from './ScenarioPick'
import m from '../mobile.module.css'

interface ScenariosProps {
  /** null until the IDE has said - the shelves arrive by themselves, nobody asks (see RemoteFeed). */
  shelves: ScenarioShelves | null
  /**
   * The runs going right now, as summaries.
   *
   * Several of them, because one scenario can be started as many times as somebody wants. Summaries
   * rather than whole records: only the screen that draws a timeline needs one of those, and waiting for
   * one meant a run standing on a question - which sends nothing more until it is answered - never
   * appeared here at all.
   */
  live: ScenarioRunSummary[]
  /**
   * What is lined up to run one after another (see ScenarioQueue), and whether the file could be read.
   *
   * Null until the machine has said anything at all - drawn as neither a list nor "nothing is lined up",
   * for the reason the shelves are.
   */
  queue: { state: ScenarioQueueState; unread: boolean } | null
  project: string
  /** Every project of every paired IDE, for where a new scenario is kept - see RepositoryChoice. */
  repositories: RepositoryChoice[]
  /**
   * A closed repository was picked to keep a new scenario in: the IDE opens it, and `then` is told the key
   * it is open under. Opening takes seconds, and the screen says so meanwhile (see [opening]).
   */
  onOpenRepository: (repository: RepositoryChoice, then: (projectKey: string) => void) => void
  opening: { going: boolean; error: string }
  /** What the IDE said it could not do, as a name there are words for. Empty when there is nothing. */
  problem: string
  /** When a model started writing a scenario, or 0 - the sheet counts the wait out loud. */
  draftingSince: number
  draftError: string
  onOpenRun: (runId: string) => void
  onRun: (scenario: Scenario, inputs: Record<string, string>) => void
  onQueue: (scenario: Scenario, inputs: Record<string, string>, afterSuccess: boolean) => void
  onDequeue: (entryId: string) => void
  onMoveQueued: (entryId: string, by: number) => void
  onQueueMode: (entryId: string, afterSuccess: boolean) => void
  onQueueGoOn: () => void
  onQueueClear: () => void
  onSchedule: (
    scenario: Scenario,
    scheduleId: string,
    hour: { at: number; repeat: ScenarioSchedule['repeat']; weekday: number },
    inputs: Record<string, string>,
  ) => void
  onUnschedule: (scheduleId: string) => void
  onEdit: (scenario: Scenario) => void
  /** A blank one, and where it is to be kept - the shelf is chosen before the editor opens. */
  onNew: (draft: Scenario, shelf: ShelfChoice) => void
  onDraft: (description: string, shelf: ShelfChoice) => void
  onCancelDraft: () => void
  onDuplicate: (scenario: Scenario) => void
  onDelete: (scenario: Scenario) => void
  onPause: (runId: string) => void
  onResume: (runId: string) => void
  onStop: (runId: string) => void
  onBack: () => void
}

/** How many past runs stand before the list offers the rest - a screenful and a bit. */
const RUNS_SHOWN = 8

/**
 * The rounds of work this project has written down, on the same four tabs the desk has.
 *
 * It opens on Runs, and that is the difference between the two screens: a phone is picked up because
 * something is happening, not to browse a shelf. Everything the desk can do is here - run with the
 * answers a scenario asks for, write one from a sentence, edit it, put it on a clock, duplicate it,
 * delete it, hold a run, end it, answer it - because the reason to be away from the keyboard and the
 * reason a scenario exists are the same reason: it works for hours with nobody in front of it.
 *
 * Short things are sheets and long things are screens. A run, a schedule, a new scenario and a row's own
 * actions fold up from the bottom; the editor and one card take the whole screen and come back with the
 * arrow.
 */
export const Scenarios = ({
  shelves,
  live,
  queue,
  project,
  repositories,
  onOpenRepository,
  opening,
  problem,
  draftingSince,
  draftError,
  onOpenRun,
  onRun,
  onQueue,
  onDequeue,
  onMoveQueued,
  onQueueMode,
  onQueueGoOn,
  onQueueClear,
  onSchedule,
  onUnschedule,
  onEdit,
  onNew,
  onDraft,
  onCancelDraft,
  onDuplicate,
  onDelete,
  onPause,
  onResume,
  onStop,
  onBack,
}: ScenariosProps) => {
  const t = useT()
  const clock = useNow()
  const [band, setBand] = useState<ScenariosBand>('runs')
  const [shown, setShown] = useState(RUNS_SHOWN)

  /** Which sheet is up, if any. One at a time: they all come from the same edge of the screen. */
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' })

  const past = pastRuns(shelves?.past ?? [], live)
  const list = shelves?.list ?? []
  const going = runningRuns(live)
  const marks = runMarks(going)
  const schedules = shelves?.schedules ?? []

  const waiting = queue?.state.waiting ?? []

  const counts: Record<ScenariosBand, number> = {
    scenarios: list.length,
    runs: going.length,
    queue: waiting.length,
    schedule: timetableOf(schedules, list).count,
  }
  const queueFlash = useGrowthFlash(queue ? waiting.length : null)

  const shared = list.filter((one) => one.scope === 'user')
  const own = list.filter((one) => one.scope === 'project')

  const card = (scenario: Scenario) => (
    <ScenarioCard
      key={`${scenario.scope}:${scenario.id}`}
      scenario={scenario}
      hours={schedulesOf(schedules, scenario)}
      onOpen={() => setSheet({ kind: 'row', scenario })}
      onRun={() =>
        scenario.inputs.length === 0
          ? onRun(scenario, {})
          : setSheet({ kind: 'run', scenario, values: {} })
      }
      onSchedule={() =>
        setSheet({
          kind: 'when',
          scenario,
          scheduleId: '',
          hour: { at: defaultHour(), repeat: 'once', weekday: 1 },
          values: {},
        })
      }
    />
  )

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{t.scenarios.button}</span>
            <span className={m.threadWhere}>{project}</span>
          </span>
          <button
            type="button"
            className={m.headerWord}
            // The shared shelf by default: a scenario that follows the person around is the likelier
            // thing to want from a phone, and the repository is one chip away.
            onClick={() => setSheet({ kind: 'new', description: '', shelf: { scope: 'user' }, picking: false })}
          >
            {t.mobile.scenarios.create}
          </button>
        </div>

        {/* The same four questions the desk asks, in the order a phone asks them. */}
        <div className={m.bandTabs}>
          {BANDS.map((one) => (
            <button
              key={one}
              type="button"
              className={`${m.bandTab} ${band === one ? m.bandTabOn : ''}`}
              onClick={() => setBand(one)}
            >
              {t.scenarios.bands[one]}
              {/* Lit for work that is happening and for a queue that has STOPPED - the two things
                  worth knowing without opening the band. */}
              <span
                key={one === 'queue' ? queueFlash : 0}
                className={`${m.bandTabCount} ${one === 'queue' && queueFlash ? m.bandTabGrew : ''} ${
                  (one === 'runs' && counts.runs > 0) || (one === 'queue' && queue?.state.held) ? m.bandTabLive : ''
                }`}
              >
                {counts[one]}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div className={m.pageList}>
        {problem ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : null}
        {opening.going ? <p className={m.noteOk}>{t.mobile.newSession.opening}</p> : null}
        {opening.error ? <p className={m.noteBad}>{opening.error}</p> : null}
        {/* Not while the project is being opened for this screen: that note already says why nothing is
            here yet, and a second one under it says the same thing less exactly. */}
        {shelves === null && !opening.going && !opening.error && <p className={m.empty}>{t.common.loading}</p>}

        {band === 'runs' ? (
          <>
            <p className={m.bandHead}>
              <span className={m.bandTitleInline}>{t.scenarios.running}</span>
              {going.length > 1 ? <span className={m.bandCount}>{going.length}</span> : null}
            </p>

            {going.length === 0
              ? shelves !== null && <p className={m.empty}>{t.scenarios.nothingRunning}</p>
              : going.map((run) => (
                  <LiveRun
                    key={run.id}
                    run={run}
                    mark={marks[run.id] ?? ''}
                    now={clock()}
                    onOpen={() => onOpenRun(run.id)}
                    onPause={() => onPause(run.id)}
                    onResume={() => onResume(run.id)}
                    onStop={() => {
                      // The only thing on this screen that cannot be taken back, so it asks first.
                      if (window.confirm(`${t.scenarios.run.stopTitle}\n\n${t.scenarios.run.stopSubject}`)) {
                        onStop(run.id)
                      }
                    }}
                  />
                ))}

            {past.length > 0 && (
              <>
                <p className={m.bandTitle}>{t.scenarios.pastRuns}</p>
                <div className={m.card}>
                  {past.slice(0, shown).map((run) => (
                    <PastRun key={run.id} run={run} onOpen={() => onOpenRun(run.id)} />
                  ))}
                </div>

                {past.length > shown && (
                  <button type="button" className={m.wideButton} onClick={() => setShown(past.length)}>
                    {t.scenarios.moreRuns(past.length - shown)}
                  </button>
                )}

                {/* The way back, where the list ends: after "show more" that is the whole history away
                    from the top, and folding it should not mean scrolling back up past it. */}
                {shown > RUNS_SHOWN && past.length > RUNS_SHOWN && (
                  <button type="button" className={m.wideButton} onClick={() => setShown(RUNS_SHOWN)}>
                    {t.scenarios.fewerRuns}
                  </button>
                )}
              </>
            )}
          </>
        ) : null}

        {band === 'scenarios' && shelves !== null ? (
          <>
            {/* Said rather than left as silence: the hours hang under the scenarios here, so a file that
                could not be read draws exactly what an empty one does - see ScenarioShelves. */}
            {shelves.schedulesUnread && <p className={m.empty}>{t.scenarios.when.unread}</p>}

            {/*
              The shelf every project shares comes first: it is the same whichever project this screen was
              opened from, and it is the one a phone most often wants. The repository's own follows, under
              its name. There is no picking another one here any more: the screen is opened off a project's
              own card (see Projects), so which repository it is about is decided by the tap that opened it,
              and another one is a step back and one card away.
            */}
            <p className={m.bandTitle}>{t.scenarios.shelves.user}</p>
            {shared.length === 0 ? (
              <p className={m.empty}>{t.scenarios.shelves.userEmpty}</p>
            ) : (
              shared.map(card)
            )}

            <p className={m.bandTitle}>{t.mobile.scenarios.inRepository(project)}</p>
            {!shelves.canShare ? (
              <p className={m.empty}>{t.scenarios.shelves.noProject}</p>
            ) : own.length === 0 ? (
              <p className={m.empty}>{t.scenarios.shelves.projectEmpty}</p>
            ) : (
              own.map(card)
            )}
          </>
        ) : null}

        {band === 'queue' ? (
          <QueueList
            queue={queue}
            live={going}
            past={past}
            onOpenRun={onOpenRun}
            onRemove={onDequeue}
            onMove={onMoveQueued}
            onMode={onQueueMode}
            onGoOn={onQueueGoOn}
            onClear={onQueueClear}
          />
        ) : null}

        {band === 'schedule' && shelves !== null ? (
          <Timetable
            schedules={schedules}
            scenarios={list}
            unread={shelves.schedulesUnread}
            now={clock()}
            onEdit={(schedule) => {
              const scenario = list.find(
                (one) => one.id === schedule.scenarioId && one.scope === schedule.scope,
              )
              if (!scenario) return
              setSheet({
                kind: 'when',
                scenario,
                scheduleId: schedule.id,
                hour: { at: schedule.at, repeat: schedule.repeat, weekday: schedule.weekday },
                values: schedule.inputs,
              })
            }}
          />
        ) : null}
      </div>

      {sheet.kind === 'row' ? (
        <ScenarioActionsSheet
          scenario={sheet.scenario}
          hours={schedulesOf(schedules, sheet.scenario)}
          queued={queuedFor(queue?.state ?? null, sheet.scenario).length}
          onQueue={() => {
            // Always through the form, even for a scenario that asks nothing: there is a choice to make
            // here - what the turn waits for - so it is never a question about nothing.
            setSheet({ kind: 'queue', scenario: sheet.scenario, values: {}, afterSuccess: true })
          }}
          onRun={() => {
            const scenario = sheet.scenario
            setSheet({ kind: 'none' })
            if (scenario.inputs.length === 0) onRun(scenario, {})
            else setSheet({ kind: 'run', scenario, values: {} })
          }}
          onSchedule={() =>
            setSheet({
              kind: 'when',
              scenario: sheet.scenario,
              scheduleId: '',
              hour: { at: defaultHour(), repeat: 'once', weekday: 1 },
              values: {},
            })
          }
          onEdit={() => {
            onEdit(sheet.scenario)
            setSheet({ kind: 'none' })
          }}
          onDuplicate={() => {
            onDuplicate(sheet.scenario)
            setSheet({ kind: 'none' })
          }}
          onDelete={() => {
            onDelete(sheet.scenario)
            setSheet({ kind: 'none' })
          }}
          onClose={() => setSheet({ kind: 'none' })}
        />
      ) : null}

      {sheet.kind === 'run' ? (
        <StartSheet
          scenario={sheet.scenario}
          values={sheet.values}
          going={going.length}
          onChange={(values) => setSheet({ ...sheet, values })}
          onRun={() => {
            onRun(sheet.scenario, sheet.values)
            setSheet({ kind: 'none' })
          }}
          onClose={() => setSheet({ kind: 'none' })}
        />
      ) : null}

      {sheet.kind === 'queue' ? (
        <QueueSheet
          scenario={sheet.scenario}
          values={sheet.values}
          afterSuccess={sheet.afterSuccess}
          waiting={waiting.length}
          behind={queueBehind(queue?.state ?? null, going)?.scenarioName ?? ''}
          onChange={(values) => setSheet({ ...sheet, values })}
          onAfterSuccess={(afterSuccess) => setSheet({ ...sheet, afterSuccess })}
          onQueue={() => {
            onQueue(sheet.scenario, sheet.values, sheet.afterSuccess)
            // Back to the shelf rather than over to the queue, as on the desk: turns are lined up several at
            // a time, and the count on the Queue tab lighting up is the press's answer (useGrowthFlash).
            setSheet({ kind: 'none' })
          }}
          onClose={() => setSheet({ kind: 'none' })}
        />
      ) : null}

      {sheet.kind === 'when' ? (
        <HourSheet
          scenario={sheet.scenario}
          editing={sheet.scheduleId.length > 0}
          hour={sheet.hour}
          values={sheet.values}
          onHour={(hour) => setSheet({ ...sheet, hour })}
          onValues={(values) => setSheet({ ...sheet, values })}
          onSet={() => {
            onSchedule(sheet.scenario, sheet.scheduleId, sheet.hour, sheet.values)
            setSheet({ kind: 'none' })
          }}
          onClear={
            sheet.scheduleId
              ? () => {
                  onUnschedule(sheet.scheduleId)
                  setSheet({ kind: 'none' })
                }
              : undefined
          }
          onClose={() => setSheet({ kind: 'none' })}
        />
      ) : null}

      {sheet.kind === 'new' ? (
        <NewScenarioSheet
          description={sheet.description}
          shelf={sheet.shelf}
          repositories={repositories}
          opening={opening.going}
          since={draftingSince}
          error={draftError}
          onChange={(description) => setSheet({ ...sheet, description })}
          onPickShelf={() => setSheet({ ...sheet, picking: true })}
          onDraft={() => onDraft(sheet.description, sheet.shelf)}
          onCancelDraft={onCancelDraft}
          onByHand={() => {
            // The words are chosen here, where the dictionary is: a blank scenario carries the name it
            // and its first stage go by, and the app above has no words of its own.
            onNew(blankScenario(t.scenarios.newName, t.scenarios.stage, sheet.shelf.scope), sheet.shelf)
            setSheet({ kind: 'none' })
          }}
          onClose={() => setSheet({ kind: 'none' })}
        />
      ) : null}

      {/* The shelf for a new scenario, over the sheet that asked - drawn here so that it stacks above it. */}
      {sheet.kind === 'new' && sheet.picking ? (
        <PickSheet
          title={t.scenarios.editor.shelf}
          value={shelfOptionId(sheet.shelf, repositories)}
          options={shelfOptions(repositories, {
            shared: t.scenarios.editor.mine,
            opensProject: t.mobile.scenarios.opensProject,
            closed: t.mobile.sessions.projectClosed,
            noProject: t.scenarios.shelves.noProject,
          })}
          onPick={(id) => {
            const repo = repositoryOfOption(id, repositories)
            if (repo?.closed && !repo.canOpen) return
            if (!repo) {
              setSheet({ ...sheet, shelf: { scope: 'user' }, picking: false })
            } else if (repo.closed) {
              // Opened first: the shelf is named by the key the project is open under, which the IDE
              // answers with, and the sheet stays where it is until then.
              setSheet({ ...sheet, picking: false })
              onOpenRepository(repo, (key) =>
                setSheet((current) =>
                  current.kind === 'new'
                    ? { ...current, shelf: { scope: 'project', agentId: repo.agentId, projectKey: key } }
                    : current,
                ),
              )
            } else {
              setSheet({ ...sheet, shelf: { scope: 'project', agentId: repo.agentId, projectKey: repo.projectKey }, picking: false })
            }
          }}
          onClose={() => setSheet({ ...sheet, picking: false })}
        />
      ) : null}
    </>
  )
}

/** Which sheet is up. One at a time - they all come from the same edge of the screen. */
type Sheet =
  | { kind: 'none' }
  | { kind: 'row'; scenario: Scenario }
  | { kind: 'run'; scenario: Scenario; values: Record<string, string> }
  | { kind: 'queue'; scenario: Scenario; values: Record<string, string>; afterSuccess: boolean }
  | {
      kind: 'when'
      scenario: Scenario
      scheduleId: string
      hour: { at: number; repeat: ScenarioSchedule['repeat']; weekday: number }
      values: Record<string, string>
    }
  | { kind: 'new'; description: string; shelf: ShelfChoice; picking: boolean }

/**
 * One run that is going: what it is doing, and the two or three things to do about it.
 *
 * The question it has stopped on is on the card, because that is the reason a phone was picked up at
 * all - and the buttons under it are the answer to it rather than a menu.
 */
const LiveRun = ({
  run,
  mark,
  now,
  onOpen,
  onPause,
  onResume,
  onStop,
}: {
  run: ScenarioRunSummary
  mark: string
  now: number
  onOpen: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) => {
  const t = useT()
  const share = run.total > 0 ? Math.round((run.done / run.total) * 100) : 0
  const elapsed = formatDuration(runElapsed(run, now))
  const asks = run.state === 'blocked'

  return (
    <div className={`${m.runCard} ${asks ? m.runCardAsks : ''}`}>
      <button type="button" className={m.runCardHead} onClick={onOpen}>
        <span className={m.runCardName}>{run.scenarioName}</span>
        {mark ? <span className={m.runCardMark}>{mark}</span> : null}
        <span className={m.taskRowChevron}>›</span>
      </button>

      <span className={m.runFacts}>
        <StatePill state={run.state} failure={run.failure} />
        <span className={m.runFact}>{t.scenarios.run.cards(run.done, run.total)}</span>
        <span className={m.runFact}>
          <span className={m.runFactKey}>
            {run.state === 'paused' ? t.scenarios.run.openFor : t.scenarios.run.runningShort}
          </span>
          {elapsed}
        </span>
        {run.cost > 0 ? <span className={m.runFact}>{`$${run.cost.toFixed(2)}`}</span> : null}
      </span>

      <span className={m.runTrack}>
        <span className={m.runFill} style={{ width: `${share}%` }} />
      </span>

      {run.asking ? <p className={m.runAskText}>{run.asking}</p> : null}

      <div className={m.runCardButtons}>
        {asks ? (
          <>
            <button type="button" className={m.rowButtonPrimary} onClick={onOpen}>
              {t.scenarios.asks.answer}
            </button>
            <button type="button" className={m.rowButton} onClick={onOpen}>
              {t.scenarios.run.open}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={m.rowButton} onClick={run.state === 'paused' ? onResume : onPause}>
              {run.state === 'paused' ? t.scenarios.run.resume : t.scenarios.run.pause}
            </button>
            <button type="button" className={m.rowButtonDanger} onClick={onStop}>
              {t.scenarios.run.stop}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const PastRun = ({ run, onOpen }: { run: ScenarioRunSummary; onOpen: () => void }) => {
  const t = useT()
  const locale = useLocale()

  return (
    <button type="button" className={m.pastRun} onClick={onOpen}>
      <span className={m.pastRunText}>
        <span className={m.pastRunName}>{run.scenarioName}</span>

        <span className={m.pastRunFacts}>
          <StatePill state={run.state} failure={run.failure} />
          <span className={m.pastRunMeta}>
            {[
              startedLabel(run.startedAt, locale, t.scenarios.when),
              `${run.done}/${run.total}`,
              run.cost > 0 ? `$${run.cost.toFixed(2)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </span>

      <span className={m.taskRowChevron}>›</span>
    </button>
  )
}

/**
 * One scenario on a shelf: what it is made of, when it starts by itself, and the two things done to it
 * most often - run it, and put it on a clock. Everything else is behind the chevron.
 */
const ScenarioCard = ({
  scenario,
  hours,
  onOpen,
  onRun,
  onSchedule,
}: {
  scenario: Scenario
  hours: ScenarioSchedule[]
  onOpen: () => void
  onRun: () => void
  onSchedule: () => void
}) => {
  const t = useT()
  const locale = useLocale()

  /*
   * Whether it can be run at all - and only for a scenario this side actually has.
   *
   * The shelves travel without their prose (see RemoteFeed.trimmedScenarios), and the rules read against
   * a skeleton answer that every card is missing its prompt. A row that says "needs fixing" about a
   * scenario that runs perfectly at the desk is worse than a row that says nothing: pressing Run is
   * answered by the IDE itself, which has the whole thing in front of it.
   */
  const broken = !scenario.trimmed && problemsOf(scenario).some(blocking)
  const summary = nextNote(hours)

  return (
    <div className={`${m.card} ${m.scenarioCard} ${scenario.scope === 'project' ? m.railProject : m.railUser}`}>
      <button type="button" className={m.scenarioCardHead} onClick={onOpen}>
        <span className={m.scenarioName}>{scenario.name}</span>
        <span className={m.taskRowChevron}>›</span>
      </button>

      <span className={`${m.scenarioMeta} ${broken ? m.scenarioBroken : ''}`}>
        {broken
          ? t.scenarios.needsFixing
          : [
              t.scenarios.stages(scenario.stages.length),
              t.scenarios.cards(cardRuns(scenario)),
              scenario.stages.some((stage) => passesOf(stage) > 1) ? t.scenarios.hasLoop : '',
              scenario.inputs.length > 0
                ? t.scenarios.asksFor(scenario.inputs.map((input) => input.name).filter(Boolean).join(', '))
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
      </span>

      {summary ? (
        <span className={`${m.scenarioWhen} ${summary.missed ? m.scenarioMissed : ''}`}>
          {[
            summary.count > 1 ? t.scenarios.when.scheduled(summary.count) : '',
            summary.missed
              ? t.scenarios.when.missed(whenLabel(summary.missed, locale))
              : summary.next
                ? t.scenarios.when.next(whenLabel(summary.next, locale))
                : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      ) : null}

      <div className={m.runCardButtons}>
        <button type="button" className={m.rowButton} disabled={broken} onClick={onRun}>
          {t.scenarios.play}
        </button>
        <button type="button" className={m.rowButton} disabled={broken} onClick={onSchedule}>
          {t.scenarios.when.another}
        </button>
      </div>
    </div>
  )
}

/**
 * What is lined up to run one after another, and what the queue is doing about it.
 *
 * The desk's band, in a thumb's shape: the stop first, because it is the only thing here a person has to
 * answer; then the turn that is going; then the turns waiting, in the order they will be taken. A row is
 * pressed to change what that turn waits for - the one decision a queued turn carries - and the two
 * arrows and the cross are what reorders and drops it.
 */
const QueueList = ({
  queue,
  live,
  past,
  onOpenRun,
  onRemove,
  onMove,
  onMode,
  onGoOn,
  onClear,
}: {
  queue: { state: ScenarioQueueState; unread: boolean } | null
  live: ScenarioRunSummary[]
  /** The runs that are over, so the one a stop names can be told apart from a run of the same scenario going now. */
  past: ScenarioRunSummary[]
  onOpenRun: (runId: string) => void
  onRemove: (entryId: string) => void
  onMove: (entryId: string, by: number) => void
  onMode: (entryId: string, afterSuccess: boolean) => void
  onGoOn: () => void
  onClear: () => void
}) => {
  const t = useT()

  if (queue === null) return <p className={m.empty}>{t.common.loading}</p>
  if (queue.unread) return <p className={m.empty}>{t.scenarios.queue.unread}</p>

  const waiting = queue.state.waiting
  const standing = queueStanding(queue.state, live, past)
  const marks = queueMarks(waiting)

  return (
    <>
      {standing.kind === 'held' ? (
        <div className={m.queueHeld}>
          <p className={m.queueHeldTitle}>{t.scenarios.queue.stopped}</p>
          {/* The run it stopped on opens from its sentence, as the one the queue stands behind opens from its
              row: a name alone answers "which run?" wrongly as soon as a run of the same scenario is going. */}
          {standing.runId ? (
            <button type="button" className={m.queueHeldOpen} onClick={() => onOpenRun(standing.runId)}>
              <p className={m.queueHeldWhy}>
                {t.scenarios.queue.stoppedOn(namedRun(standing.name, standing.mark), whyWords(standing.why, t))}
              </p>
            </button>
          ) : (
            <p className={m.queueHeldWhy}>
              {t.scenarios.queue.stoppedOn(standing.name, whyWords(standing.why, t))}
            </p>
          )}
          <div className={m.queueHeldButtons}>
            {waiting.length > 0 ? (
              <button type="button" className={m.buttonPrimary} onClick={onGoOn}>
                {standing.after ? t.scenarios.queue.goOnBehind : t.scenarios.queue.goOn}
              </button>
            ) : null}
            <button
              type="button"
              className={m.buttonSecondary}
              onClick={() => {
                // The one thing here that cannot be taken back: what it drops is a night somebody lined
                // up, and there is nothing to put it back from.
                if (window.confirm(`${t.scenarios.queue.clearTitle}\n\n${t.scenarios.queue.clearSubject(waiting.length)}`)) {
                  onClear()
                }
              }}
            >
              {t.scenarios.queue.clear}
            </button>
          </div>
        </div>
      ) : null}

      {standing.kind === 'going' ? (
        <button type="button" className={m.card} onClick={() => onOpenRun(standing.run.id)}>
          <p className={m.queueGoingRow}>
            <span className={m.queueGoingDot} />
            <span className={m.queueGoingName}>{namedRun(standing.run.scenarioName, standing.mark)}</span>
            <span className={m.queueGoingFact}>
              {t.scenarios.run.cards(standing.run.done, standing.run.total)}
            </span>
          </p>
        </button>
      ) : null}

      {waiting.length === 0 ? (
        <p className={m.empty}>{t.scenarios.queue.empty}</p>
      ) : (
        <div className={m.card}>
          {waiting.map((entry, at) => (
            <QueuedRow
              key={entry.id}
              entry={entry}
              at={at}
              mark={marks[entry.id] ?? ''}
              first={at === 0}
              last={at === waiting.length - 1}
              onRemove={() => onRemove(entry.id)}
              onMove={(by) => onMove(entry.id, by)}
              onMode={() => onMode(entry.id, !entry.afterSuccess)}
            />
          ))}
        </div>
      )}
    </>
  )
}

const QueuedRow = ({
  entry,
  at,
  mark,
  first,
  last,
  onRemove,
  onMove,
  onMode,
}: {
  entry: ScenarioQueued
  at: number
  mark: string
  first: boolean
  last: boolean
  onRemove: () => void
  onMove: (by: number) => void
  onMode: () => void
}) => {
  const t = useT()

  return (
    <div className={m.queueRow}>
      <span className={m.hourGutter}>
        <span className={m.hourClock}>{at + 1}</span>
      </span>

      {/* The whole middle changes what this turn waits for: the queue is where a night is read at once,
          which is the moment somebody realises the third one need not wait for the second. */}
      <button type="button" className={m.queueRowText} onClick={onMode}>
        <span className={m.hourName}>{[entry.scenarioName, mark].filter(Boolean).join(' · ')}</span>
        <span className={m.hourFacts}>
          {[
            entry.afterSuccess ? t.scenarios.queue.waitsForSuccess : t.scenarios.queue.waitsForAnything,
            entry.failure ? t.scenarios.queue.wouldNotStart(whyWords(entry.failure, t)) : '',
            ...Object.values(entry.inputs ?? {}).filter((value) => value.trim().length > 0),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </button>

      <span className={m.queueRowButtons}>
        <button
          type="button"
          className={m.queueRowStep}
          disabled={first}
          aria-label={t.scenarios.queue.moveUp}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={m.queueRowStep}
          disabled={last}
          aria-label={t.scenarios.queue.moveDown}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className={m.queueRowStep}
          aria-label={t.scenarios.queue.remove}
          onClick={onRemove}
        >
          ×
        </button>
      </span>
    </div>
  )
}

/**
 * Why the queue stopped, in words - the same two dictionaries the desk looks in.
 *
 * Two kinds of reason arrive under one name: how a run ended, and why a turn would not start at all. The
 * machine has no words of its own, so both travel as names.
 */
const whyWords = (why: string, t: ReturnType<typeof useT>): string => {
  const states = t.scenarios.runStates as Record<string, string>
  const outcomes = t.scenarios.outcomes as Record<string, string>

  return states[why] ?? outcomes[why] ?? t.scenarios.queue.stoppedUnknown
}

/** The hours, grouped by the day they fall on - the same timetable the desk draws, from one function. */
const Timetable = ({
  schedules,
  scenarios,
  unread,
  now,
  onEdit,
}: {
  schedules: ScenarioSchedule[]
  scenarios: Scenario[]
  unread: boolean
  now: number
  onEdit: (schedule: ScenarioSchedule) => void
}) => {
  const t = useT()
  const locale = useLocale()

  if (unread) return <p className={m.empty}>{t.scenarios.when.unread}</p>

  const table = timetableOf(schedules, scenarios, now)
  if (table.count === 0) return <p className={m.empty}>{t.scenarios.when.nothing}</p>

  const rows = [
    ...(table.missed.length > 0 ? [{ key: 'missed', title: t.scenarios.when.missedShort, rows: table.missed }] : []),
    ...table.days.map((day) => ({
      key: day.key,
      title: [
        day.awayInDays === 0 ? t.scenarios.when.today : day.awayInDays === 1 ? t.scenarios.when.tomorrow : '',
        new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
          .format(new Date(day.at))
          .toUpperCase(),
      ]
        .filter(Boolean)
        .join(' · '),
      rows: day.rows,
    })),
  ]

  return (
    <>
      {rows.map((group) => (
        <div key={group.key}>
          <p className={m.bandTitle}>{group.title}</p>
          <div className={m.card}>
            {group.rows.map((row) => (
              <button
                key={row.schedule.id}
                type="button"
                className={`${m.hourRow} ${row.missed ? m.hourMissed : ''}`}
                onClick={() => onEdit(row.schedule)}
              >
                <span className={m.hourGutter}>
                  <span className={m.hourClock}>{clockLabel(row.schedule.at)}</span>
                  <span className={m.hourAway}>
                    {row.missed
                      ? t.scenarios.when.missedShort
                      : t.scenarios.when.inTime(countdown(row.at - now))}
                  </span>
                </span>
                <span className={m.hourText}>
                  <span className={m.hourName}>{row.scenario?.name ?? t.scenarios.when.orphan}</span>
                  <span className={m.hourFacts}>
                    {[
                      row.schedule.repeat === 'weekly'
                        ? t.scenarios.when.weeklyOn(weekdayName(row.schedule.weekday, locale, 'long'))
                        : t.scenarios.when.repeats[row.schedule.repeat],
                      ...Object.values(row.schedule.inputs).filter((value) => value.trim().length > 0),
                    ].join(' · ')}
                  </span>
                </span>
                <span className={m.taskRowChevron}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
