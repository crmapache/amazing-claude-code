import { useEffect, useMemo, useState } from 'react'
import type { AgentEvent, ScenarioRun, ScenarioRunStep } from '../../protocol'
import { formatTokens } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
import { cardOf, finished, progressOf, timelineOf } from '../../scenarios/timeline'
import { useNow } from '../../hooks/useNow'
import { useT } from '../../i18n'
import { Confirm } from '../Confirm'
import { SkeletonBar } from '../Skeleton'
import { StatePill } from './StatePill'
import { StepLog, stepFacts } from './StepLog'
import s from './scenarios.module.css'

/**
 * One run, drawn as the timeline it is walking.
 *
 * Top to bottom, loops written out flat: two cards looped three times are six rows, in the order they
 * will be started. The one question anybody has at midnight is which of them is happening now, and a
 * folded loop cannot answer it - which is why the rows a loop may never reach are drawn as plans rather
 * than left out (see scenarios/timeline.ts).
 *
 * What is deliberately NOT here is any setting of the scenario's. This screen is what happened; where
 * that was decided is the editor, and a card whose text could be changed from inside a run would be a
 * card whose row says something the agent was never told.
 */
export interface ScenarioRunTabProps {
  run: ScenarioRun | null
  /** The log of the step somebody has opened, keyed by the step (see scenarioLog in protocol.ts). */
  log: { key: string; found: boolean; truncated: boolean; events: AgentEvent[] } | null
  onOpenLog: (key: string, conversationId: string) => void
  onCloseLog: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onAnswer: (allow: boolean, text: string) => void
  onOpenLink: (url: string) => void
}

export const ScenarioRunTab = ({
  run,
  log,
  onOpenLog,
  onCloseLog,
  onPause,
  onResume,
  onStop,
  onAnswer,
  onOpenLink,
}: ScenarioRunTabProps) => {
  const t = useT()
  const clock = useNow()
  const [confirmStop, setConfirmStop] = useState(false)
  const [answer, setAnswer] = useState('')
  /** Which step's window is open. Held here rather than read off [log]: the log arrives a moment later. */
  const [opened, setOpened] = useState('')

  /*
   * The clock, ticking only while something is actually running.
   *
   * A finished run measures nothing - every duration on it is the difference between two stamps - so a
   * timer left going would redraw a page nobody is watching change once a second.
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
      <div className={s.root}>
        <div className={s.head}>
          <div className={s.headTitles}>
            <span className={s.title}>{t.scenarios.run.title}</span>
          </div>
        </div>
        <div className={s.body}>
          <SkeletonBar width="60%" />
        </div>
      </div>
    )
  }

  const over = finished(run.state)
  const progress = progressOf(run)
  const elapsed = formatDuration((run.finishedAt > 0 ? run.finishedAt : now) - run.startedAt)
  const share = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  /**
   * The step whose window is open, found again on every draw rather than kept as a copy.
   *
   * The run goes on reporting, and the step that was running when it was opened finishes a minute later
   * with the answer somebody opened it for - the very thing the window is for. Named by its key, it is
   * found afresh; copied, it would be a photograph of a step in the middle of its work.
   */
  const openedStep = opened === HEAD ? null : run.steps.find((step) => step.key === opened) ?? null
  const openedCard = openedStep ? cardOf(run.snapshot, openedStep) : null

  const openStep = (step: ScenarioRunStep) => {
    setOpened(step.key)
    onOpenLog(step.key, step.conversationId)
  }

  const closeLog = () => {
    setOpened('')
    onCloseLog()
  }

  /*
   * The log takes the whole tab, in place of the timeline rather than over it.
   *
   * A step that read half a repository is pages long, and a window inset from the panel's edges gives
   * that text less room than the panel has while hiding the timeline anyway. The way back is the chevron
   * the editor already uses, in the corner it already uses.
   */
  if (opened) {
    return (
      <StepLog
        kind={opened === HEAD ? 'head' : 'step'}
        title={opened === HEAD ? run.scenarioName : openedStep?.title ?? ''}
        facts={
          openedStep
            ? stepFacts(openedStep.startedAt, openedStep.finishedAt, openedStep.tokens, openedStep.cost)
            : stepFacts(run.startedAt, run.finishedAt, run.tokens, run.cost)
        }
        prompt={openedCard ? openedStep?.prompt ?? '' : ''}
        events={log && log.key === opened ? log.events : null}
        found={log?.found ?? false}
        truncated={log?.truncated ?? false}
        onOpenLink={onOpenLink}
        onBack={closeLog}
      />
    )
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        <div className={s.headTitles}>
          <span className={s.title}>{run.scenarioName}</span>
          <span className={s.hint}>{t.scenarios.run.startedAt(new Date(run.startedAt).toLocaleString())}</span>
        </div>
        <span className={s.headSpace} />

        {/* The head is the only participant with no row of its own, and "why did it decide that" is the
            question people actually have in the morning. */}
        <button
          type="button"
          className={s.button}
          disabled={run.headConversationId.length === 0}
          onClick={() => {
            setOpened(HEAD)
            onOpenLog(HEAD, run.headConversationId)
          }}
        >
          {t.scenarios.run.head}
        </button>

        {over ? null : run.state === 'paused' ? (
          <button type="button" className={`${s.button} ${s.buttonMain}`} onClick={onResume}>
            {t.scenarios.run.resume}
          </button>
        ) : (
          <button type="button" className={s.button} onClick={onPause}>
            {t.scenarios.run.pause}
          </button>
        )}

        {over ? null : (
          <button type="button" className={`${s.button} ${s.buttonDanger}`} onClick={() => setConfirmStop(true)}>
            {t.scenarios.run.stop}
          </button>
        )}
      </div>

      <div className={s.runBar}>
        <StatePill state={run.state} failure={run.failure} />

        <span className={s.runSegment}>
          <span className={s.progress}>
            <span
              className={[
                s.progressFill,
                run.state === 'done' ? s.progressDone : '',
                run.state === 'failed' ? s.progressFailed : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ width: `${share}%` }}
            />
          </span>
          <span className={s.runValue}>{t.scenarios.run.cards(progress.done, progress.total)}</span>
        </span>

        {/*
          Three words for one number, because the number means three things. A finished run took that
          long; a going one has been going that long; a paused one has merely been open that long -
          nothing is being spent, and "running for" over a run that is standing still is a small lie.
        */}
        <span className={s.runSegment}>
          <span className={s.runKey}>
            {over ? t.scenarios.run.took : run.state === 'paused' ? t.scenarios.run.open : t.scenarios.run.running}
          </span>
          <span className={s.runValue}>{elapsed}</span>
        </span>

        {run.tokens > 0 ? (
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

      <div className={s.body}>
        {run.error ? <div className={s.outcome}>{run.error}</div> : null}

        {/*
          The question the run is standing on - only ever here when the scenario said to wait for a
          person rather than to let the head decide (see HeadSettings.onQuestion). Nothing is being spent
          while it stands: the card's turn is open and its clock is not running.
        */}
        {run.question ? (
          <div className={s.question}>
            <div className={s.questionTitle}>{run.question.title || run.question.tool}</div>

            {/*
              The call's own arguments, and only where they say something the title does not.
              A question with options carries the question itself in there, its options and their
              descriptions - all of it already on the screen above and below, in words rather than in
              JSON. A permission is the other way round: the command, the path, the text being written
              are the whole of what is being decided.
            */}
            {run.question.detail && run.question.options.length === 0 ? (
              <div className={s.questionDetail}>{run.question.detail}</div>
            ) : null}

            {/*
              The options as buttons, the way the panel puts the same question in an ordinary chat: what
              was offered is what gets pressed. Typed into the field instead, the label has to be spelled
              exactly right to be recognised as the choice (see CardQuestion.chosen) - and a question
              with two answers on it is not a question anybody should have to write an answer to.
            */}
            {run.question.options.length > 0 ? (
              <div className={s.questionOptions}>
                {run.question.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`${s.button} ${s.buttonMain}`}
                    onClick={() => {
                      onAnswer(true, option)
                      setAnswer('')
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={s.questionRow}>
              <input
                className={s.field}
                value={answer}
                placeholder={t.scenarios.run.answerPlaceholder}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <button
                type="button"
                className={`${s.button} ${s.buttonMain}`}
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
              {run.question.options.length === 0 ? (
                <button
                  type="button"
                  className={s.button}
                  onClick={() => {
                    onAnswer(false, answer)
                    setAnswer('')
                  }}
                >
                  {t.scenarios.run.deny}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={s.timeline}>
          {rows.map((row) => {
            if (row.kind === 'stage') {
              return (
                <div key={row.key} className={s.stageRow}>
                  <span>{row.title || t.scenarios.stage}</span>
                </div>
              )
            }

            if (row.kind === 'note') {
              return (
                <div key={row.key} className={s.note}>
                  <span className={s.noteWho}>{t.scenarios.run.headSaid}</span>
                  <span className={s.noteText}>{row.note.text}</span>
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
                onOpen={() => openStep(row.step)}
              />
            )
          })}
        </div>
      </div>

      {confirmStop ? (
        <Confirm
          title={t.scenarios.run.stopTitle}
          subject={run.scenarioName}
          note={t.scenarios.run.stopSubject}
          confirmLabel={t.scenarios.run.stop}
          onConfirm={() => {
            setConfirmStop(false)
            onStop()
          }}
          onCancel={() => setConfirmStop(false)}
        />
      ) : null}
    </div>
  )
}

/** The head has no step of its own, so its log is opened under a name no step can carry. */
const HEAD = '__head__'

const StepRow = ({
  step,
  index,
  passes,
  untilDone,
  now,
  onOpen,
}: {
  step: ScenarioRunStep
  index: number
  /** How many passes its stage was given. One means the row has no loop to place itself in. */
  passes: number
  untilDone: boolean
  now: number
  onOpen: () => void
}) => {
  const t = useT()
  const going = step.state === 'running' || step.state === 'asking' || step.state === 'judging'
  const elapsed =
    step.startedAt > 0 ? formatDuration((step.finishedAt > 0 ? step.finishedAt : now) - step.startedAt) : ''

  /*
   * One line, and which line depends on what there is.
   *
   * While a turn is open it is what the agent is saying right now, because that is the difference between
   * a step thinking for four minutes and a step that has hung. When the turn is over it is what the agent
   * finished with. Before either it is what the card was asked to do, which beats a line saying nothing
   * is here.
   */
  const line = step.said || step.summary || step.prompt

  const slots = Object.entries(step.slots).filter(([, value]) => value.length > 0)

  return (
    <button
      type="button"
      className={[
        s.step,
        step.state === 'waiting' ? s.stepWaiting : '',
        step.state === 'skipped' ? s.stepSkipped : '',
        going ? s.stepRunning : '',
        step.state === 'failed' ? s.stepFailed : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onOpen}
    >
      <span className={s.stepNumber}>{index + 1}</span>
      <span className={s.stepText}>
        <span className={s.stepHead}>
          <span className={s.stepTitle}>{step.title}</span>
          {/*
            Which pass this is travels with the row rather than standing in a heading over a block of
            them: six rows of a stage that goes round three times are six goes at two cards, and the one
            thing that tells them apart belongs on the row it tells apart.
          */}
          {passes > 1 ? (
            <span className={s.stagePass}>
              {untilDone ? t.scenarios.run.passOfUpTo(step.pass, passes) : t.scenarios.run.passOf(step.pass, passes)}
            </span>
          ) : null}
          <StatePill step={step.state} failure={step.failure} />
          <span className={s.stepSpace} />
          {elapsed ? (
            <span className={`${s.stepTime} ${going ? s.stepTimeGoing : ''}`}>{elapsed}</span>
          ) : null}
        </span>

        {slots.length > 0 ? (
          <span className={s.stepSlots}>
            {slots.map(([name, value]) => (
              <span key={name} className={s.slot}>{`${name}: ${value}`}</span>
            ))}
          </span>
        ) : null}

        {line.trim().length > 0 ? (
          <span className={`${s.stepLine} ${step.said ? s.stepSaying : ''}`}>{line}</span>
        ) : null}

        {step.verdictReason || step.error ? (
          <span className={`${s.stepVerdict} ${step.verdict === 'undone' || step.error ? s.stepVerdictBad : ''}`}>
            {step.verdictReason || step.error}
          </span>
        ) : null}

        {step.nudges.length > 0 && step.state === 'done' ? (
          <span className={s.stepLine}>{t.scenarios.run.sentBack(step.nudges.length)}</span>
        ) : null}
      </span>
    </button>
  )
}
