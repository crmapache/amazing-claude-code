import { useEffect, useMemo, useState } from 'react'
import { formatTokens } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
import { useNow } from '../../hooks/useNow'
import { useLocale, useT } from '../../i18n'
import type { ScenarioRun as Run, ScenarioRunStep } from '../../protocol'
import { StatePill } from '../../components/scenarios/StatePill'
import { finished, progressOf, timelineOf } from '../../scenarios/timeline'
import { dayAndHour, outcomeText } from '../scenarios'
import { Back } from './Back'
import m from '../mobile.module.css'

interface ScenarioRunProps {
  /** null while the answer is on its way - a past run is asked for when this screen opens. */
  run: Run | null
  /** What the IDE said it could not do, as a name there are words for. Empty when there is nothing. */
  problem: string
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onAnswer: (allow: boolean, text: string) => void
  onBack: () => void
}

/**
 * One run of one scenario, as a phone shows it.
 *
 * The same timeline the panel draws and out of the same three functions (see scenarios/timeline.ts):
 * the stages in order, every pass of a loop written out as a row of its own, and what the main thread
 * said wedged in where it said it. A folded loop cannot answer the one question anybody has at
 * midnight - which of those six goes is happening now - and that question is the whole reason this
 * screen exists away from the desk.
 *
 * Two things the desk has are honestly absent here rather than hidden. A step's own conversation is not
 * opened: it is read off that machine's disk and runs to megabytes, while a frame over the relay's cap
 * is thrown away whole (see RemoteCommands, where `scenarioLog` is refused). And the line of what a
 * card's agent is saying THIS SECOND does not travel: it is the one field of a run that changes four
 * times a second, and carrying it would cost somebody's mobile data for every hour a run lasts (see
 * RemoteFeed.trimmedRun). What is left is every state, every clock and every verdict, which is what
 * somebody away from the keyboard is reading for.
 *
 * What can be done from here is what a run standing still needs: answer the card that stopped to ask,
 * hold it, or end it. Starting one and writing one stay at the desk.
 */
export const ScenarioRun = ({ run, problem, onPause, onResume, onStop, onAnswer, onBack }: ScenarioRunProps) => {
  const t = useT()
  const locale = useLocale()
  const clock = useNow()
  const [answer, setAnswer] = useState('')

  /*
   * The clock, ticking only while something is actually running.
   *
   * A finished run measures nothing - every duration on it is the difference between two stamps - so a
   * timer left going would redraw a page nobody is watching change once a second.
   *
   * It reads the IDE's time rather than this phone's (see hooks/useNow): every stamp on a run was made
   * on the machine it ran on, and subtracting one clock from another is how a step that began a minute
   * ago comes out having begun in the future.
   */
  const live = run !== null && !finished(run.state)
  const [now, setNow] = useState(() => clock())
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(clock()), 1000)
    return () => clearInterval(timer)
  }, [live, clock])

  const rows = useMemo(() => (run ? timelineOf(run) : []), [run])

  if (!run) {
    return (
      <>
        <header className={m.threadHeader}>
          <div className={m.threadHeadRow}>
            <Back onClick={onBack} />
            <span className={m.threadTitles}>
              <span className={m.threadTitle}>{t.scenarios.run.title}</span>
            </span>
          </div>
        </header>

        <div className={m.list}>
          {problem ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : <p className={m.empty}>{t.common.loading}</p>}
        </div>
      </>
    )
  }

  const over = finished(run.state)
  const progress = progressOf(run)
  const share = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const elapsed = formatDuration((run.finishedAt > 0 ? run.finishedAt : now) - run.startedAt)
  const question = run.question

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{run.scenarioName}</span>
            <span className={m.threadWhere}>{t.scenarios.run.startedAt(dayAndHour(run.startedAt, locale))}</span>
          </span>

          {/*
            Holding a run and ending it, in the header rather than in the footer under a thumb.

            The footer is where the answer to a question goes, and it is the one place on this screen a
            thumb rests: a button that ends a night's work does not belong where a thumb already is.
            Stopping asks first in any case - it is the only thing here that cannot be taken back.
          */}
          {!over && (
            <button type="button" className={m.headerWord} onClick={run.state === 'paused' ? onResume : onPause}>
              {run.state === 'paused' ? t.scenarios.run.resume : t.scenarios.run.pause}
            </button>
          )}

          {!over && (
            <button
              type="button"
              className={`${m.headerWord} ${m.headerWordDanger}`}
              onClick={() => {
                if (window.confirm(`${t.scenarios.run.stopTitle}\n\n${t.scenarios.run.stopSubject}`)) onStop()
              }}
            >
              {t.scenarios.run.stop}
            </button>
          )}
        </div>

        {/* How far along and how long, in the header block so that scrolling the timeline never takes
            them away: on a phone they are the pair of numbers the screen is opened for. */}
        <div className={m.runStrip}>
          <StatePill state={run.state} failure={run.failure} />

          <span className={m.runFact}>{t.scenarios.run.cards(progress.done, progress.total)}</span>

          {/*
            Three words for one number, because the number means three things. A finished run took that
            long; a going one has been going that long; a paused one has merely been open that long -
            nothing is being spent, and "running for" over a run standing still is a small lie.
          */}
          <span className={m.runFact}>
            <span className={m.runFactKey}>
              {over ? t.scenarios.run.took : run.state === 'paused' ? t.scenarios.run.open : t.scenarios.run.running}
            </span>
            {elapsed}
          </span>

          {run.tokens > 0 && (
            <span className={m.runFact}>
              <span className={m.runFactKey}>{t.scenarios.run.tokens}</span>
              {formatTokens(run.tokens)}
            </span>
          )}

          {run.cost > 0 && (
            <span className={m.runFact}>
              <span className={m.runFactKey}>{t.scenarios.run.cost}</span>
              {`$${run.cost.toFixed(2)}`}
            </span>
          )}
        </div>

        <div className={m.runTrack}>
          <span
            className={[
              m.runFill,
              run.state === 'done' ? m.runFillDone : '',
              run.state === 'failed' ? m.runFillFailed : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ width: `${share}%` }}
          />
        </div>
      </header>

      <div className={m.list}>
        {problem ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : null}
        {run.error ? <p className={m.noteBad}>{run.error}</p> : null}

        {/*
          What is being asked, up here where reading happens rather than in the footer with the answers.

          Only ever present when the scenario said to wait for a person rather than to let the main
          thread decide (see HeadSettings.onQuestion). Nothing is being spent while it stands: the card's
          turn is open and its clock is not running.
        */}
        {question && (
          <div className={m.askCard}>
            <p className={m.askTitle}>{question.title || question.tool}</p>

            {/*
              The call's own arguments, and only where they say something the title does not. A question
              with options carries the question, its options and their descriptions in there - all of it
              already on the screen in words. A permission is the other way round: the command, the path
              and the text being written are the whole of what is being decided.
            */}
            {question.detail && question.options.length === 0 ? (
              <p className={m.askDetail}>{question.detail}</p>
            ) : null}

            {/*
              An answer in one's own words, beside what is being asked rather than under the buttons.
              A field in a fixed footer is a field a keyboard slides over, and on a question with
              options the buttons below are the answer anybody actually gives.
            */}
            <input
              className={m.askField}
              value={answer}
              placeholder={t.scenarios.run.answerPlaceholder}
              autoCapitalize="sentences"
              onChange={(event) => setAnswer(event.target.value)}
            />
          </div>
        )}

        <div className={m.timeline}>
          {rows.map((row) => {
            if (row.kind === 'stage') {
              return (
                <div key={row.key} className={m.stageRow}>
                  {row.title || t.scenarios.stage}
                </div>
              )
            }

            if (row.kind === 'note') {
              return (
                <div key={row.key} className={m.note}>
                  <span className={m.noteWho}>{t.scenarios.run.headSaid}</span>
                  <span className={m.noteText}>{row.note.text}</span>
                </div>
              )
            }

            return (
              <StepRow
                key={row.key}
                step={row.step}
                index={row.index}
                passes={row.passes}
                untilDone={row.untilDone}
                now={now}
              />
            )
          })}
        </div>
      </div>

      {question && (
        <footer className={m.decisionFooter}>
          {/*
            The options as buttons, the way the panel puts the same question in an ordinary chat: what
            was offered is what gets pressed. Typed into the field instead, a label has to be spelled
            exactly right to be recognised as the choice (see CardQuestion.chosen).
          */}
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              className={m.buttonOption}
              onClick={() => {
                onAnswer(true, option)
                setAnswer('')
              }}
            >
              <span className={m.buttonOptionLabel}>{option}</span>
            </button>
          ))}

          {question.options.length === 0 && (
            <>
              <button
                type="button"
                className={m.buttonPrimary}
                onClick={() => {
                  onAnswer(true, answer)
                  setAnswer('')
                }}
              >
                {t.scenarios.run.allow}
              </button>

              {/*
                Refusing belongs to a permission and to nothing else. A question with options is answered
                whatever this side says (see CardQuestion.answers): the CLI builds the tool result out of
                the choice, and a "no" there reaches the card as nobody having answered at all - so the
                button would promise one thing and do another.
              */}
              <button
                type="button"
                className={m.buttonDanger}
                onClick={() => {
                  onAnswer(false, answer)
                  setAnswer('')
                }}
              >
                {t.scenarios.run.deny}
              </button>
            </>
          )}
        </footer>
      )}
    </>
  )
}

/**
 * One go at one card.
 *
 * Not a button, unlike at the desk: there is nothing behind it to open from here (see the note at the
 * top about `scenarioLog`), and a row that looks pressable and answers nothing is worse than a row that
 * does not.
 */
const StepRow = ({
  step,
  index,
  passes,
  untilDone,
  now,
}: {
  step: ScenarioRunStep
  index: number
  /** How many passes its stage was given. One means the row has no loop to place itself in. */
  passes: number
  untilDone: boolean
  now: number
}) => {
  const t = useT()
  const going = step.state === 'running' || step.state === 'asking' || step.state === 'judging'
  const elapsed =
    step.startedAt > 0 ? formatDuration((step.finishedAt > 0 ? step.finishedAt : now) - step.startedAt) : ''

  /*
   * One line, and which line depends on what there is.
   *
   * What the card finished with once its turn is over, and what it was asked to do before that - which
   * beats a line saying nothing is here. What the agent is saying at this very moment is the desk's
   * third answer and does not reach a phone at all (see the note at the top of this file).
   */
  const line = step.summary || step.prompt

  const slots = Object.entries(step.slots).filter(([, value]) => value.length > 0)

  return (
    <div
      className={[
        m.step,
        step.state === 'waiting' ? m.stepWaiting : '',
        step.state === 'skipped' ? m.stepSkipped : '',
        going ? m.stepRunning : '',
        step.state === 'failed' ? m.stepFailed : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={m.stepNumber}>{index + 1}</span>

      <span className={m.stepText}>
        <span className={m.stepHead}>
          <span className={m.stepTitle}>{step.title}</span>

          <StatePill step={step.state} failure={step.failure} />

          {/* Which pass this is travels with the row rather than standing in a heading over a block of
              them: six rows of a stage that goes round three times are six goes at two cards, and the
              one thing that tells them apart belongs on the row it tells apart. */}
          {passes > 1 && (
            <span className={m.stepPass}>
              {untilDone ? t.scenarios.run.passOfUpTo(step.pass, passes) : t.scenarios.run.passOf(step.pass, passes)}
            </span>
          )}

          {elapsed ? <span className={`${m.stepTime} ${going ? m.stepTimeGoing : ''}`}>{elapsed}</span> : null}
        </span>

        {slots.length > 0 && (
          <span className={m.stepSlots}>
            {slots.map(([name, value]) => (
              <span key={name} className={m.slot}>{`${name}: ${value}`}</span>
            ))}
          </span>
        )}

        {line.trim().length > 0 && <span className={m.stepLine}>{line}</span>}

        {(step.verdictReason || step.error) && (
          <span className={`${m.stepVerdict} ${step.verdict === 'undone' || step.error ? m.stepVerdictBad : ''}`}>
            {step.verdictReason || step.error}
          </span>
        )}

        {step.nudges.length > 0 && step.state === 'done' && (
          <span className={m.stepLine}>{t.scenarios.run.sentBack(step.nudges.length)}</span>
        )}
      </span>
    </div>
  )
}

