import type { ScenarioRunSummary } from '../../protocol'
import { formatTokens } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
import { startedLabel } from '../../scenarios/moments'
import { runMarks } from '../../scenarios/runs'
import { runElapsed } from '../../scenarios/timeline'
import { useTicking } from '../../hooks/useTicking'
import { useLocale, useT } from '../../i18n'
import { StatePill } from './StatePill'
import { CrossIcon } from './icons'
import s from './scenarios.module.css'

/**
 * What is happening, and then what came of it.
 *
 * A live run is a card and a finished one is a row of a table, because they are two different things to
 * do with: one is acted on - answered, held, ended - and the other is compared with eleven others. They
 * used to wear the same clothes, which meant reading every row to find out which kind it was.
 *
 * The table's columns are the whole point of it. Cards, duration and cost read DOWN rather than across, so
 * a fortnight of nights compares at a glance instead of one line at a time.
 */
export const RunsBand = ({
  going,
  finished,
  shown,
  onShow,
  onOpen,
  onAnswer,
  onPause,
  onResume,
  onStop,
  onDelete,
}: {
  going: ScenarioRunSummary[]
  finished: ScenarioRunSummary[]
  shown: number
  onShow: () => void
  onOpen: (runId: string) => void
  /** Straight into the run, on the card that is standing on a question. */
  onAnswer: (runId: string) => void
  onPause: (runId: string) => void
  onResume: (runId: string) => void
  onStop: (run: ScenarioRunSummary) => void
  onDelete: (run: ScenarioRunSummary) => void
}) => {
  const t = useT()
  const locale = useLocale()
  // Only while something is going, which here is the same as "while there are cards above the table".
  const now = useTicking(going.length > 0)
  const marks = runMarks(going)

  return (
    <>
      <div className={s.section}>
        <div className={s.label}>
          {t.scenarios.running}
          {going.length > 1 ? <span className={s.labelNote}>{t.scenarios.runningNote}</span> : null}
          <span className={s.labelLine} />
        </div>

        {going.length === 0 ? (
          <div className={s.emptyShelf}>
            <span className={s.emptyTitle}>{t.scenarios.nothingRunning}</span>
          </div>
        ) : (
          <div className={s.runCards}>
            {going.map((run) => (
              <LiveRun
                key={run.id}
                run={run}
                mark={marks[run.id] ?? ''}
                now={now}
                onOpen={() => onOpen(run.id)}
                onAnswer={() => onAnswer(run.id)}
                onPause={() => onPause(run.id)}
                onResume={() => onResume(run.id)}
                onStop={() => onStop(run)}
              />
            ))}
          </div>
        )}
      </div>

      <div className={s.section}>
        <div className={s.label}>
          {t.scenarios.pastRuns}
          <span className={s.labelNote}>{t.scenarios.newestFirst}</span>
          <span className={s.labelLine} />
        </div>

        {finished.length === 0 ? (
          <div className={s.emptyShelf}>
            <span className={s.emptyTitle}>{t.scenarios.noRuns}</span>
          </div>
        ) : (
          <div className={s.table}>
            <div className={`${s.tableRow} ${s.tableHead}`}>
              <span className={s.colRun}>{t.scenarios.table.run}</span>
              <span className={s.colStarted}>{t.scenarios.table.started}</span>
              <span className={s.colCards}>{t.scenarios.table.cards}</span>
              <span className={s.colTook}>{t.scenarios.table.took}</span>
              <span className={s.colCost}>{t.scenarios.table.cost}</span>
              <span className={s.colState}>{t.scenarios.table.state}</span>
              <span className={s.colDrop} />
            </div>

            {finished.slice(0, shown).map((run) => (
              <div key={run.id} className={s.tableRow}>
                <button
                  type="button"
                  className={`${s.colRun} ${s.tableOpen}`}
                  onClick={() => onOpen(run.id)}
                  aria-label={run.scenarioName}
                >
                  <span className={s.tableName}>{run.scenarioName}</span>
                  {answerOf(run) ? <span className={s.tableMark}>{answerOf(run)}</span> : null}
                </button>
                <span className={s.colStarted}>{startedLabel(run.startedAt, locale, t.scenarios.when)}</span>
                <span className={s.colCards}>{`${run.done}/${run.total}`}</span>
                <span className={s.colTook}>
                  {run.finishedAt > 0 ? formatDuration(runElapsed(run, run.finishedAt)) : ''}
                </span>
                <span className={s.colCost}>{run.cost > 0 ? `$${run.cost.toFixed(2)}` : ''}</span>
                <span className={s.colState}>
                  <StatePill state={run.state} failure={run.failure} />
                </span>
                <span className={s.colDrop}>
                  <button
                    type="button"
                    className={`${s.iconButton} ${s.iconDanger}`}
                    data-tooltip={t.scenarios.deleteRun}
                    aria-label={t.scenarios.deleteRun}
                    onClick={() => onDelete(run)}
                  >
                    <CrossIcon />
                  </button>
                </span>
              </div>
            ))}

            {/* Inside the table rather than under it: the gap between it and the last run is the one
                between two runs, and a row that opens more of them belongs to them. */}
            {finished.length > shown ? (
              <button type="button" className={s.moreRuns} onClick={onShow}>
                {t.scenarios.moreRuns(finished.length - shown)}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * One run that is going: what it is doing, how far it has got, and what it has stopped to ask.
 *
 * The question is on the card, under a rule and in the warning tone, because it is the one thing here
 * that is waiting for a person. Answer / Open / Stop sit where the reading ends.
 */
const LiveRun = ({
  run,
  mark,
  now,
  onOpen,
  onAnswer,
  onPause,
  onResume,
  onStop,
}: {
  run: ScenarioRunSummary
  mark: string
  now: number
  onOpen: () => void
  onAnswer: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) => {
  const t = useT()
  const share = run.total > 0 ? Math.round((run.done / run.total) * 100) : 0
  const asks = run.state === 'blocked'

  return (
    <div className={`${s.runCard} ${asks ? s.runCardAsks : ''}`}>
      <div className={s.runCardHead}>
        <button type="button" className={s.runCardTitles} onClick={onOpen}>
          <span className={s.runCardName}>{run.scenarioName}</span>
          {mark ? <span className={s.runCardMark}>{mark}</span> : null}
        </button>

        <StatePill state={run.state} failure={run.failure} />

        <span className={s.runCardButtons}>
          {asks ? (
            <button type="button" className={`${s.button} ${s.buttonWarn}`} onClick={onAnswer}>
              {t.scenarios.asks.answer}
            </button>
          ) : run.state === 'paused' ? (
            <button type="button" className={`${s.button} ${s.buttonMain}`} onClick={onResume}>
              {t.scenarios.run.resume}
            </button>
          ) : (
            <button type="button" className={s.button} onClick={onPause}>
              {t.scenarios.run.pause}
            </button>
          )}
          <button type="button" className={s.button} onClick={onOpen}>
            {t.scenarios.run.open}
          </button>
          <button type="button" className={`${s.button} ${s.buttonDanger}`} onClick={onStop}>
            {t.scenarios.run.stop}
          </button>
        </span>
      </div>

      {/* Where it is, in the scenario's own words: which stage of how many, and the card it is on. */}
      {run.at ? (
        <div className={s.runCardWhere}>
          {run.stages ? <span>{t.scenarios.run.stageOf(run.stage ?? 0, run.stages)}</span> : null}
          <span className={s.factDot}>·</span>
          <span className={s.runCardStep}>{run.at}</span>
          {run.passes && run.passes > 1 ? (
            <>
              <span className={s.factDot}>·</span>
              <span>{t.scenarios.run.passOf(run.pass ?? 1, run.passes)}</span>
            </>
          ) : null}
          {run.nudges ? (
            <>
              <span className={s.factDot}>·</span>
              <span className={s.runCardNudge}>{t.scenarios.run.sentBack(run.nudges)}</span>
            </>
          ) : null}
        </div>
      ) : null}

      <div className={s.runCardFacts}>
        <span className={s.progress}>
          <span className={`${s.progressFill} ${s.progressDone}`} style={{ width: `${share}%` }} />
        </span>
        <span className={s.runValue}>{t.scenarios.run.cards(run.done, run.total)}</span>
        <span className={s.runSegment}>
          <span className={s.runKey}>
            {run.state === 'paused' ? t.scenarios.run.openFor : t.scenarios.run.running}
          </span>
          <span className={s.runValue}>{formatDuration(runElapsed(run, now))}</span>
        </span>
        {run.tokens ? (
          <span className={s.runSegment}>
            <span className={s.runKey}>{t.scenarios.run.tokens}</span>
            <span className={s.runValue}>{formatTokens(run.tokens)}</span>
          </span>
        ) : null}
        {run.cost > 0 ? (
          <span className={s.runSegment}>
            <span className={s.runKey}>{t.scenarios.run.cost}</span>
            <span className={s.runValue}>${run.cost.toFixed(2)}</span>
          </span>
        ) : null}
      </div>

      {run.asking ? (
        <button type="button" className={s.runCardAsk} onClick={onAnswer}>
          <span className={s.runCardAskLabel}>{t.scenarios.run.asking}</span>
          <span className={s.runCardAskText}>{run.asking}</span>
        </button>
      ) : null}
    </div>
  )
}

/** The first answer this run was given - the ticket, usually. What tells two nights of one scenario apart. */
const answerOf = (run: ScenarioRunSummary): string => {
  const said = Object.values(run.inputs ?? {}).find((value) => value.trim().length > 0) ?? ''
  return said.split('\n')[0]?.trim().slice(0, 24) ?? ''
}
