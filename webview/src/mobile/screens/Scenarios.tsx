import { useState } from 'react'
import { formatDuration } from '../../feed/tools'
import { useNow } from '../../hooks/useNow'
import { useLocale, useT } from '../../i18n'
import type { Scenario, ScenarioRun, ScenarioRunSummary, ScenarioSchedule } from '../../protocol'
import { StatePill } from '../../components/scenarios/StatePill'
import { clockLabel, scheduleNote, weekdayName } from '../../scenarios/schedule'
import { passesOf } from '../../scenarios/rules'
import { progressOf } from '../../scenarios/timeline'
import type { ScenarioShelves } from '../facts'
import { dayAndHour, outcomeText } from '../scenarios'
import { Back } from './Back'
import m from '../mobile.module.css'

interface ScenariosProps {
  /** null until the IDE has said - the shelves arrive by themselves, nobody asks (see RemoteFeed). */
  shelves: ScenarioShelves | null
  /** The run going right now, once its own message has arrived. */
  live: ScenarioRun | null
  project: string
  /** What the IDE said it could not do, as a name there are words for. Empty when there is nothing. */
  problem: string
  onOpenRun: (runId: string) => void
  onBack: () => void
}

/** How many past runs stand before the list offers the rest - a screenful and a bit. */
const RUNS_SHOWN = 8

/**
 * The rounds of work this project has written down, and the one that may be going right now.
 *
 * What is going comes first and comes as a card rather than a row, because it is the only thing on the
 * screen that is happening: a scenario runs unattended for hours, which is precisely the situation in
 * which the person it belongs to is not at the machine. Everything under it is a list of what exists,
 * and what exists is not what somebody picked up a phone to look at.
 *
 * The shelves themselves are drawn but not pressable, and that is the honest shape of what this device
 * may do (see RemoteCommands): writing a scenario writes a file into the repository, and pressing play
 * raises agents that work over somebody's working copy for hours - both are read and reviewed at a
 * keyboard, in front of the diff they produce. Watching one, answering it and stopping it are here.
 */
export const Scenarios = ({ shelves, live, project, problem, onOpenRun, onBack }: ScenariosProps) => {
  const t = useT()
  const clock = useNow()
  const [shown, setShown] = useState(RUNS_SHOWN)

  const past = shelves?.past ?? []
  const list = shelves?.list ?? []

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{t.scenarios.button}</span>
            <span className={m.threadWhere}>{project}</span>
          </span>
        </div>
      </header>

      <div className={m.list}>
        {problem ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : null}

        {shelves === null && <p className={m.empty}>{t.common.loading}</p>}

        {live ? (
          <LiveRun run={live} now={clock()} onOpen={() => onOpenRun(live.id)} />
        ) : (
          shelves !== null && <p className={m.empty}>{t.mobile.scenarios.nothingRunning}</p>
        )}

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

        {shelves !== null && (
          <>
            <p className={m.bandTitle}>{t.scenarios.title}</p>

            {list.length === 0 ? (
              <p className={m.empty}>{t.mobile.scenarios.none}</p>
            ) : (
              <div className={m.card}>
                {list.map((scenario) => (
                  <ScenarioRow
                    key={`${scenario.scope}:${scenario.id}`}
                    scenario={scenario}
                    hour={shelves.schedules.find(
                      (one) => one.scenarioId === scenario.id && one.scope === scenario.scope,
                    )}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <p className={m.screenNote}>{t.mobile.scenarios.deskNote}</p>
      </div>
    </>
  )
}

/** The run that is going, or the one that has just stopped going: the whole card is the way into it. */
const LiveRun = ({ run, now, onOpen }: { run: ScenarioRun; now: number; onOpen: () => void }) => {
  const t = useT()
  const progress = progressOf(run)
  const share = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const elapsed = formatDuration((run.finishedAt > 0 ? run.finishedAt : now) - run.startedAt)

  return (
    <>
      <p className={m.bandTitle}>{t.mobile.scenarios.running}</p>

      <button type="button" className={m.runCard} onClick={onOpen}>
        <span className={m.runCardHead}>
          <span className={m.runCardName}>{run.scenarioName}</span>
          <span className={m.taskRowChevron}>›</span>
        </span>

        <span className={m.runFacts}>
          <StatePill state={run.state} failure={run.failure} />
          <span className={m.runFact}>{t.scenarios.run.cards(progress.done, progress.total)}</span>
          <span className={m.runFact}>
            <span className={m.runFactKey}>
              {run.state === 'paused' ? t.scenarios.run.open : t.scenarios.run.running}
            </span>
            {elapsed}
          </span>
        </span>

        <span className={m.runTrack}>
          <span className={m.runFill} style={{ width: `${share}%` }} />
        </span>

        {/* A card has stopped to ask, said in a sentence rather than left to the pill: "waiting for you"
            is a state, and this is the one thing on the screen that a person - this person - is what is
            being waited for. */}
        {run.question && (
          <span className={m.runAsk}>
            <span className={m.runAskText}>{run.question.title || run.question.tool}</span>
            <span>{t.mobile.sessions.answer}</span>
          </span>
        )}
      </button>
    </>
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
            {`${dayAndHour(run.startedAt, locale)} · ${t.scenarios.run.cards(run.done, run.total)}`}
          </span>
        </span>
      </span>

      <span className={m.taskRowChevron}>›</span>
    </button>
  )
}

/**
 * One scenario on a shelf: what it is made of, and when it starts by itself.
 *
 * Which shelf it sits on is not said. At the desk that decides where the file is written and who else
 * gets it; from here nothing is written, and a heading over each half would be two headings spent on a
 * distinction nobody on this screen can act on.
 */
const ScenarioRow = ({ scenario, hour }: { scenario: Scenario; hour?: ScenarioSchedule }) => {
  const t = useT()

  const cards = scenario.stages.reduce((total, stage) => total + stage.cards.length, 0)
  const loops = scenario.stages.some((stage) => passesOf(stage) > 1)

  return (
    <div className={m.scenarioRow}>
      <span className={m.scenarioName}>{scenario.name}</span>
      <span className={m.scenarioMeta}>
        {[t.scenarios.stages(scenario.stages.length), t.scenarios.cards(cards), loops ? t.scenarios.hasLoop : '']
          .filter(Boolean)
          .join(' · ')}
      </span>
      {hour ? <HourLine hour={hour} /> : null}
    </div>
  )
}

/**
 * The hour a scenario starts at by itself, in one line.
 *
 * One line rather than the desk's three, and the truest of them: an hour that was missed is the fact
 * worth a phone's row - nothing is ever started late (see ScenarioSchedule.missedAt), so a round of
 * work that quietly did not run last night leaves no other trace anywhere.
 */
const HourLine = ({ hour }: { hour: ScenarioSchedule }) => {
  const t = useT()
  const locale = useLocale()
  const note = scheduleNote(hour)

  /*
   * The day and the clock, and the clock in the same twenty-four hour form the field was typed in at the
   * desk: left to the locale it comes back as "09:00 AM" beside a setting that says "09:00", which reads
   * as two different times rather than one written twice.
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

  const said = note.missed
    ? t.scenarios.when.missed(when(note.missed))
    : note.next
      ? t.scenarios.when.next(when(note.next))
      : note.ran
        ? t.scenarios.when.ran(when(note.ran))
        : clockLabel(hour.at)

  return <span className={`${m.scenarioWhen} ${note.missed ? m.scenarioMissed : ''}`}>{`${rhythm} · ${said}`}</span>
}

