import { useMemo, useState } from 'react'
import { formatTokens } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
import { useTicking } from '../../hooks/useTicking'
import { useLocale, useT } from '../../i18n'
import type { ScenarioRun as Run, ScenarioRunStep } from '../../protocol'
import { StatePill } from '../../components/scenarios/StatePill'
import { cutCardOf, finished, progressOf, resumable, runElapsed, timelineOf } from '../../scenarios/timeline'
import { dayAndHour } from '../../scenarios/moments'
import { outcomeText } from '../scenarios'
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
  /** Pick a finished run up where it stood - see `scenarioContinue`. */
  onContinue: () => void
  /** Open the main thread's conversation as an ordinary chat, to go on from there by hand. */
  onOpenChat: () => void
  onAnswer: (allow: boolean, text: string) => void
  /** One step's own conversation, on a screen of its own (see ScenarioStep). */
  onOpenStep: (step: ScenarioRunStep) => void
  onBack: () => void
}

/**
 * One run of one scenario, as a phone shows it.
 *
 * The same timeline the panel draws and out of the same functions (see scenarios/timeline.ts): the stages
 * in order, every pass of a loop written out as a row of its own, and what the main thread said wedged in
 * where it said it. A folded loop cannot answer the one question anybody has at midnight - which of those
 * six goes is happening now - and that question is the whole reason this screen exists away from the desk.
 *
 * What it is asking stands at the top, where reading begins, and its options are buttons under it: a card
 * that stopped to ask is a run standing still, and answering it is what this channel exists for. Every
 * step opens its own conversation, cut to the end of it on the way over (see RemoteFeed.trimmedLog).
 *
 * The one thing that honestly does not travel is the line of what a card's agent is saying THIS SECOND: it
 * is the one field of a run that changes four times a second, and carrying it would cost somebody's mobile
 * data for every hour a run lasts (see RemoteFeed.trimmedRun).
 */
export const ScenarioRun = ({
  run,
  problem,
  onPause,
  onResume,
  onStop,
  onContinue,
  onOpenChat,
  onAnswer,
  onOpenStep,
  onBack,
}: ScenarioRunProps) => {
  const t = useT()
  const locale = useLocale()
  const [answer, setAnswer] = useState('')

  /*
   * The clock, ticking only while something is actually running - and reading the IDE's time rather than
   * this phone's (see hooks/useNow): every stamp on a run was made on the machine it ran on, and
   * subtracting one clock from another is how a step that began a minute ago comes out having begun in
   * the future.
   */
  const now = useTicking(run !== null && !finished(run.state))

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

        <div className={m.scenarioList}>
          {problem ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : <p className={m.empty}>{t.common.loading}</p>}
        </div>
      </>
    )
  }

  const over = finished(run.state)
  const progress = progressOf(run)
  const share = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const elapsed = formatDuration(runElapsed(run, now))
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
              {over ? t.scenarios.run.took : run.state === 'paused' ? t.scenarios.run.openFor : t.scenarios.run.runningShort}
            </span>
            {elapsed}
          </span>

          {run.tokens > 0 && <span className={m.runFact}>{formatTokens(run.tokens)}</span>}
          {run.cost > 0 && <span className={m.runFact}>{`$${run.cost.toFixed(2)}`}</span>}
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

      <div className={m.scenarioList}>
        {problem ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : null}
        {run.error ? <p className={m.noteBad}>{run.error}</p> : null}

        {/* What a finished run says first, and the two doors out of it - the same two the panel offers
            over its timeline (see ScenarioRunTab): pick it up where it stood, or go on with its main
            thread in an ordinary chat. */}
        {over && (
          <div className={m.afterCard}>
            <p className={m.afterText}>
              {run.state === 'done'
                ? t.scenarios.run.after.done
                : run.state === 'stopped'
                  ? t.scenarios.run.after.stopped(cutCardOf(run))
                  : t.scenarios.run.after.failed(cutCardOf(run))}
            </p>
            <div className={m.afterButtons}>
              {resumable(run) && (
                <button type="button" className={m.buttonOption} onClick={onContinue}>
                  <span className={m.buttonOptionLabel}>{t.scenarios.run.after.carryOn}</span>
                  <span className={m.buttonOptionHint}>{t.scenarios.run.after.carryOnHint}</span>
                </button>
              )}
              {run.headConversationId.length > 0 && (
                <button type="button" className={m.buttonOption} onClick={onOpenChat}>
                  <span className={m.buttonOptionLabel}>{t.scenarios.run.after.chat}</span>
                  <span className={m.buttonOptionHint}>{t.scenarios.run.after.chatHint}</span>
                </button>
              )}
            </div>
          </div>
        )}

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

            <p className={m.askNote}>{t.scenarios.run.nothingSpent}</p>
          </div>
        )}

        <div className={m.timeline}>
          {rows.map((row) => {
            if (row.kind === 'stage') {
              return (
                <div key={row.key} className={`${m.stageRow} ${row.standing === 'here' ? m.stageHere : ''}`}>
                  <span className={m.stageRowTitle}>{row.title || t.scenarios.stage}</span>
                  <span className={m.stageRowVerdict}>
                    {row.standing === 'done'
                      ? t.scenarios.run.stageDone(formatDuration(row.took))
                      : row.standing === 'here'
                        ? t.scenarios.run.stageHere
                        : t.scenarios.run.stageNotReached}
                  </span>
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
                passes={row.passes}
                untilDone={row.untilDone}
                now={now}
                onOpen={() => onOpenStep(row.step)}
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

          {/*
            An answer in one's own words, under the options rather than above them: on a question with
            choices the buttons are the answer anybody actually gives, and the field is the way out when
            neither of them is right.
          */}
          <input
            className={m.askField}
            value={answer}
            placeholder={t.scenarios.run.answerPlaceholder}
            autoCapitalize="sentences"
            onChange={(event) => setAnswer(event.target.value)}
          />

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

          {question.options.length > 0 && answer.trim().length > 0 && (
            <button
              type="button"
              className={m.buttonPrimary}
              onClick={() => {
                onAnswer(true, answer)
                setAnswer('')
              }}
            >
              {t.scenarios.run.send}
            </button>
          )}
        </footer>
      )}
    </>
  )
}

/**
 * One go at one card - and now a way into what it said.
 *
 * It used to be a plain row, because there was nothing behind it to open: a step's conversation is read
 * off the machine's disk, and that was refused over the wire. It is not any more (see RemoteCommands),
 * so the row is a button and says so.
 */
const StepRow = ({
  step,
  passes,
  untilDone,
  now,
  onOpen,
}: {
  step: ScenarioRunStep
  /** How many passes its stage was given. One means the row has no loop to place itself in. */
  passes: number
  untilDone: boolean
  now: number
  onOpen: () => void
}) => {
  const t = useT()
  const going = step.state === 'running' || step.state === 'asking' || step.state === 'judging'
  const ahead = step.state === 'waiting' || step.state === 'skipped'
  const elapsed =
    step.startedAt > 0 ? formatDuration((step.finishedAt > 0 ? step.finishedAt : now) - step.startedAt) : ''

  /*
   * One line, and which line depends on what there is: what the card finished with once its turn is over,
   * and what it was asked to do before that - which beats a line saying nothing is here. What the agent is
   * saying at this very moment is the desk's third answer and does not reach a phone at all.
   */
  const line = step.summary || step.prompt
  const slots = Object.entries(step.slots).filter(([, value]) => value.length > 0)

  return (
    <div
      className={[
        m.step,
        ahead ? m.stepWaiting : '',
        going ? m.stepRunning : '',
        step.state === 'failed' ? m.stepFailed : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={m.stepText}>
        <span className={m.stepHead}>
          <span className={m.stepTitle}>{step.title}</span>

          {ahead ? null : <StatePill step={step.state} failure={step.failure} />}

          {/* Which pass this is travels with the row rather than standing in a heading over a block of
              them: six rows of a stage that goes round three times are six goes at two cards, and the
              one thing that tells them apart belongs on the row it tells apart. */}
          {passes > 1 && (
            <span className={m.stepPass}>
              {untilDone ? t.scenarios.run.passOfUpTo(step.pass, passes) : t.scenarios.run.passOf(step.pass, passes)}
            </span>
          )}

          {elapsed ? <span className={`${m.stepTime} ${going ? m.stepTimeGoing : ''}`}>{elapsed}</span> : null}

          {/* Only where there is one to open: a step that never ran has no conversation behind it, and a
              row that looks pressable and answers nothing is worse than a row that does not. */}
          {step.conversationId ? (
            <button type="button" className={m.stepLog} onClick={onOpen}>
              {t.scenarios.run.log}
              <span className={m.taskRowChevron}>›</span>
            </button>
          ) : null}
        </span>

        {slots.length > 0 && (
          <span className={m.stepSlots}>
            {slots.map(([name, value]) => (
              <span key={name} className={m.slot}>{`${name}: ${value}`}</span>
            ))}
          </span>
        )}

        {line.trim().length > 0 && !ahead && <span className={m.stepLine}>{line}</span>}

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
