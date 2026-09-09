import { useState } from 'react'
import { formatDuration } from '../../feed/tools'
import { useNow } from '../../hooks/useNow'
import { useLocale, useT } from '../../i18n'
import type { Scenario, ScenarioRunSummary, ScenarioSchedule, ScenarioScope } from '../../protocol'
import { StatePill } from '../../components/scenarios/StatePill'
import { BANDS, type ScenariosBand } from '../../components/scenarios/view'
import { clockLabel, defaultHour, nextNote, schedulesOf, weekdayName, whenLabel } from '../../scenarios/schedule'
import { runElapsed } from '../../scenarios/timeline'
import { countdown, timetableOf } from '../../scenarios/timetable'
import { blankScenario } from '../../scenarios/blank'
import { cardRuns, passesOf, problemsOf, blocking } from '../../scenarios/rules'
import { pastRuns, runMarks, runningRuns } from '../../scenarios/runs'
import { startedLabel } from '../../scenarios/moments'
import type { ScenarioShelves } from '../facts'
import { outcomeText } from '../scenarios'
import { Back } from './Back'
import { HourSheet, NewScenarioSheet, ScenarioActionsSheet, StartSheet } from './ScenarioSheets'
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
  project: string
  /** What the IDE said it could not do, as a name there are words for. Empty when there is nothing. */
  problem: string
  /** When a model started writing a scenario, or 0 - the sheet counts the wait out loud. */
  draftingSince: number
  draftError: string
  onOpenRun: (runId: string) => void
  onRun: (scenario: Scenario, inputs: Record<string, string>) => void
  onSchedule: (
    scenario: Scenario,
    scheduleId: string,
    hour: { at: number; repeat: ScenarioSchedule['repeat']; weekday: number },
    inputs: Record<string, string>,
  ) => void
  onUnschedule: (scheduleId: string) => void
  onEdit: (scenario: Scenario) => void
  onNew: (draft: Scenario) => void
  onDraft: (description: string, scope: ScenarioScope) => void
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
 * The rounds of work this project has written down, on the same three tabs the desk has.
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
  project,
  problem,
  draftingSince,
  draftError,
  onOpenRun,
  onRun,
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

  const counts: Record<ScenariosBand, number> = {
    scenarios: list.length,
    runs: going.length,
    schedule: timetableOf(schedules, list).count,
  }

  const lastAnswers = (scenario: Scenario): Record<string, string> =>
    (shelves?.past ?? []).find((run) => run.scenarioId === scenario.id && run.scope === scenario.scope)?.inputs ?? {}

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
            onClick={() => setSheet({ kind: 'new', description: '', scope: shelves?.canShare ? 'project' : 'user' })}
          >
            {t.mobile.scenarios.create}
          </button>
        </div>

        {/* The same three questions the desk asks, in the order a phone asks them. */}
        <div className={m.bandTabs}>
          {BANDS.map((one) => (
            <button
              key={one}
              type="button"
              className={`${m.bandTab} ${band === one ? m.bandTabOn : ''}`}
              onClick={() => setBand(one)}
            >
              {t.scenarios.bands[one]}
              <span className={`${m.bandTabCount} ${one === 'runs' && counts.runs > 0 ? m.bandTabLive : ''}`}>
                {counts[one]}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div className={m.scenarioList}>
        {problem ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : null}
        {shelves === null && <p className={m.empty}>{t.common.loading}</p>}

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
              </>
            )}
          </>
        ) : null}

        {band === 'scenarios' && shelves !== null ? (
          <>
            {/* Said rather than left as silence: the hours hang under the scenarios here, so a file that
                could not be read draws exactly what an empty one does - see ScenarioShelves. */}
            {shelves.schedulesUnread && <p className={m.empty}>{t.scenarios.when.unread}</p>}

            {(['project', 'user'] as const).map((scope) => {
              const shelf = list.filter((one) => one.scope === scope)
              if (shelf.length === 0) return null

              return (
                <div key={scope}>
                  <p className={m.bandTitle}>
                    {scope === 'project' ? t.scenarios.shelves.project : t.scenarios.shelves.user}
                  </p>
                  {shelf.map((scenario) => (
                    <ScenarioCard
                      key={`${scenario.scope}:${scenario.id}`}
                      scenario={scenario}
                      hours={schedulesOf(schedules, scenario)}
                      onOpen={() => setSheet({ kind: 'row', scenario })}
                      onRun={() =>
                        scenario.inputs.length === 0
                          ? onRun(scenario, {})
                          : setSheet({ kind: 'run', scenario, values: lastAnswers(scenario) })
                      }
                      onSchedule={() =>
                        setSheet({
                          kind: 'when',
                          scenario,
                          scheduleId: '',
                          hour: { at: defaultHour(), repeat: 'once', weekday: 1 },
                          values: lastAnswers(scenario),
                        })
                      }
                    />
                  ))}
                </div>
              )
            })}

            {list.length === 0 ? <p className={m.empty}>{t.mobile.scenarios.none}</p> : null}
          </>
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
          onRun={() => {
            const scenario = sheet.scenario
            setSheet({ kind: 'none' })
            if (scenario.inputs.length === 0) onRun(scenario, {})
            else setSheet({ kind: 'run', scenario, values: lastAnswers(scenario) })
          }}
          onSchedule={() =>
            setSheet({
              kind: 'when',
              scenario: sheet.scenario,
              scheduleId: '',
              hour: { at: defaultHour(), repeat: 'once', weekday: 1 },
              values: lastAnswers(sheet.scenario),
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
          last={lastAnswers(sheet.scenario)}
          going={going.length}
          onChange={(values) => setSheet({ ...sheet, values })}
          onRun={() => {
            onRun(sheet.scenario, sheet.values)
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
          scope={sheet.scope}
          canShare={shelves?.canShare === true}
          since={draftingSince}
          error={draftError}
          onChange={(description) => setSheet({ ...sheet, description })}
          onScope={(scope) => setSheet({ ...sheet, scope })}
          onDraft={() => onDraft(sheet.description, sheet.scope)}
          onCancelDraft={onCancelDraft}
          onByHand={() => {
            // The words are chosen here, where the dictionary is: a blank scenario carries the name it
            // and its first stage go by, and the app above has no words of its own.
            onNew(blankScenario(t.scenarios.newName, t.scenarios.stage, sheet.scope))
            setSheet({ kind: 'none' })
          }}
          onClose={() => setSheet({ kind: 'none' })}
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
  | {
      kind: 'when'
      scenario: Scenario
      scheduleId: string
      hour: { at: number; repeat: ScenarioSchedule['repeat']; weekday: number }
      values: Record<string, string>
    }
  | { kind: 'new'; description: string; scope: ScenarioScope }

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
