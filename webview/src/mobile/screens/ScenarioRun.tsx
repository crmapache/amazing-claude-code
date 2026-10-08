import { useMemo, useRef, useState } from 'react'
import { formatTokens } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
import { useTicking } from '../../hooks/useTicking'
import { useLocale, useT } from '../../i18n'
import type { ScenarioRun as Run, ScenarioRunStep } from '../../protocol'
import { Chevron } from '../../components/Chevron'
import { Glance } from '../../components/items/Glance'
import { Roadmap } from '../../components/scenarios/Roadmap'
import { StatePill } from '../../components/scenarios/StatePill'
import { useRunPlace } from '../../components/scenarios/useRunPlace'
import { roadOf } from '../../scenarios/roadmap'
import { cutCardOf, finished, resumable, runWorked, stepWorked, timelineOf } from '../../scenarios/timeline'
import { dayAndHour } from '../../scenarios/moments'
import { outcomeText } from '../scenarios'
import { Back } from './Back'
import { Composer, type OutgoingPrompt } from './Composer'
import type { ProjectFacts } from '../facts'
import type { PhotoRoad } from '../images'
import type { PhoneDictation } from '../useDictation'
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
  /**
   * What the field for the main thread needs - the same composer a chat has, off a conversation (see
   * forConversation) - or null when the machine does not take such words (see CAP_TELL): the page comes from
   * the relay and may be newer than the plugin behind it, which would refuse the message as one it has never
   * heard of.
   */
  tell: { facts: ProjectFacts; photos: PhotoRoad; connected: boolean; voice: PhoneDictation } | null
  /** Words for the main thread of the run while it goes, photos included - see `scenarioTell`. */
  onTell: (prompt: OutgoingPrompt) => void
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
 * How it ended goes the other way - at the bottom, under the last step. The failure and the two doors out
 * of a finished run are the last thing that happened, and standing over the timeline they read as the
 * first: the error of the fifth card above the first, and "continue" before a line of what there is to
 * continue. Read top to bottom, the screen is the night in the order it went.
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
  tell,
  onTell,
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

  // Opened on what is happening, come back to where it was left after a step's screen (see useRunPlace). A
  // question stands at the top, over its answers in the footer; how a run ended stands at the foot here.
  const list = useRef<HTMLDivElement>(null)
  const onScroll = useRunPlace(
    list,
    run?.id ?? '',
    run?.question ? 'top' : run && finished(run.state) ? 'foot' : 'present',
  )

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

        <div className={m.pageList}>
          {problem ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : <p className={m.empty}>{t.common.loading}</p>}
        </div>
      </>
    )
  }

  const over = finished(run.state)
  const elapsed = formatDuration(runWorked(run, now))
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

          {/*
            How long it has genuinely worked (see runWorked) - a pause and a question waiting for a person
            are not in it, so one word serves a going, a paused and a waiting run. A finished one took that.
          */}
          <span className={m.runFact}>
            <span className={m.runFactKey}>{over ? t.scenarios.run.took : t.scenarios.run.active}</span>
            {elapsed}
          </span>

          {run.tokens > 0 && <span className={m.runFact}>{formatTokens(run.tokens)}</span>}
          {run.cost > 0 && <span className={m.runFact}>{`$${run.cost.toFixed(2)}`}</span>}
        </div>

        {/* The road of its cards, where a bar used to be - the same one the run's card draws (see Roadmap). */}
        <div className={m.runHeadRoad}>
          <Roadmap stops={roadOf(run)} state={run.state} />
        </div>
      </header>

      <div className={m.pageList} ref={list} onScroll={onScroll}>
        {/* A refusal of something pressed in the header - holding the run or ending it - stands where the
            header is. One of a finished run's own doors is answered under those doors, below. */}
        {problem && !over ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : null}

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
                <div
                  key={row.key}
                  className={`${m.stageRow} ${row.standing === 'here' ? m.stageHere : ''}`}
                  data-row={row.key}
                  data-ahead={row.standing === 'ahead' || undefined}
                >
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
              // The person's own words as well as the main thread's - the same two voices the desk draws.
              const person = row.note.who === 'person'
              return (
                <div key={row.key} className={`${m.note} ${person ? m.notePerson : ''}`} data-row={row.key}>
                  <span className={m.noteWho}>{person ? t.scenarios.run.youSaid : t.scenarios.run.headSaid}</span>
                  {person ? (
                    <span className={m.notePersonText}>{row.note.text}</span>
                  ) : row.note.text ? (
                    <Glance text={row.note.text} className={m.noteText} />
                  ) : null}
                  {person && !over && !row.note.deliveredAt ? (
                    <span className={m.noteWaiting}>{t.scenarios.run.tellWaiting}</span>
                  ) : null}
                  {row.note.relayed ? (
                    <span className={m.noteRelayed}>
                      <span className={m.noteRelayedLabel}>{t.scenarios.run.passedOn}</span>
                      <Glance text={row.note.relayed} className={m.noteText} />
                    </span>
                  ) : null}
                </div>
              )
            }

            return (
              <StepRow
                key={row.key}
                anchor={row.key}
                step={row.step}
                passes={row.passes}
                untilDone={row.untilDone}
                worked={stepWorked(row.step, now, run)}
                onOpen={() => onOpenStep(row.step)}
              />
            )
          })}
        </div>

        {/* How it ended, under the step it ended on - see the note on this screen. */}
        {run.error || over ? (
          <div className={m.runEnd}>
            {run.error ? <p className={m.noteBad}>{run.error}</p> : null}

            {/* What a finished run says, and the two doors out of it - the same two the panel offers
                (see ScenarioRunTab): pick it up where it stood, or go on with its main thread in an
                ordinary chat. */}
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
                    <button type="button" className={`${m.buttonOption} ${m.buttonOptionAccent}`} onClick={onOpenChat}>
                      <span className={m.buttonOptionLabel}>{t.scenarios.run.after.chat}</span>
                      <span className={m.buttonOptionHint}>{t.scenarios.run.after.chatHint}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* A door that was refused - "continue" on a run that cannot be picked up - answered right
                under the door that was pressed. */}
            {problem && over ? <p className={m.noteBad}>{outcomeText(t, problem)}</p> : null}
          </div>
        ) : null}
      </div>

      {/*
        Words for the main thread, at the foot where the thumb is - the chat's own composer, off a conversation:
        the words, photos, an "@" for a file, dictation. While the run goes and nothing else holds the foot: a
        question standing for the person takes it, and answering it comes first.
      */}
      {!over && !question && tell && (
        <footer className={m.composer}>
          {run.answering ? (
            <span className={m.tellStatus}>
              <span className={m.tellDot} />
              {t.scenarios.run.answering}
            </span>
          ) : null}
          <Composer
            facts={tell.facts}
            photos={tell.photos}
            context={NO_CONTEXT}
            run={NO_RUN}
            running={false}
            since={0}
            queue={NOTHING_QUEUED}
            queueOpen={false}
            onQueueOpen={ignore}
            onUnqueue={ignore}
            connected={tell.connected}
            imageBase={picturesShown(run)}
            quotes={NO_QUOTES}
            onDropQuote={ignore}
            onSend={onTell}
            onQueue={onTell}
            unsent={NOTHING_UNSENT}
            onRetry={ignore}
            onDiscard={ignore}
            onStop={ignore}
            onRun={ignore}
            voice={tell.voice}
            forConversation={false}
            placeholder={t.scenarios.run.tellPlaceholder}
          />
        </footer>
      )}

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
 * One go at one card - and the way into what it said.
 *
 * The whole card is the door to its log, and the chip in its head row says so. The door used to be the
 * word "Log" alone at the end of that row: a line of small text nobody took for a button, standing a few
 * pixels off the line of the pill beside it, and the one target on a screen of cards that had to be hit
 * dead on. A card is the size a thumb has, and it is what the eye is already on when it wants the log.
 * The same rule the live run's card on the list follows - a middle that does nothing reads as broken.
 */
const StepRow = ({
  anchor,
  step,
  passes,
  untilDone,
  worked,
  onOpen,
}: {
  /** Its key in the timeline, for holding the reading place by (see useRunPlace). */
  anchor: string
  step: ScenarioRunStep
  /** How many passes its stage was given. One means the row has no loop to place itself in. */
  passes: number
  untilDone: boolean
  /** How long it has genuinely worked so far (see stepWorked) - it stands still while the run does. */
  worked: number
  onOpen: () => void
}) => {
  const t = useT()
  const going = step.state === 'running' || step.state === 'asking' || step.state === 'judging'
  const ahead = step.state === 'waiting' || step.state === 'skipped'
  const elapsed = step.startedAt > 0 ? formatDuration(worked) : ''

  /*
   * One line, and which line depends on what there is: what the card finished with once its turn is over,
   * and what it was asked to do before that - which beats a line saying nothing is here. What the agent is
   * saying at this very moment is the desk's third answer and does not reach a phone at all.
   */
  const line = step.summary || step.prompt
  const slots = Object.entries(step.slots).filter(([, value]) => value.length > 0)

  // Only where there is one to open: a step that never ran has no conversation behind it, and a card that
  // looks pressable and answers nothing is worse than one that does not.
  const opens = step.conversationId.length > 0

  const className = [
    m.step,
    opens ? m.stepOpens : '',
    ahead ? m.stepWaiting : '',
    going ? m.stepRunning : '',
    step.state === 'failed' ? m.stepFailed : '',
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
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

          {/* A sign rather than a button of its own - the card is the button - drawn as a chip of the same
              make as the pill, so the two stand on one line. */}
          {opens ? (
            <span className={m.stepLog}>
              {t.scenarios.run.log}
              <Chevron className={m.stepLogChevron} />
            </span>
          ) : null}
        </span>

        {slots.length > 0 && (
          <span className={m.stepSlots}>
            {slots.map(([name, value]) => (
              <span key={name} className={m.slot}>{`${name}: ${value}`}</span>
            ))}
          </span>
        )}

        {line.trim().length > 0 && !ahead && <Glance text={line} lines={3} className={m.stepLine} />}

        {/* The head's reason is markdown like everything it writes; an error is the engine's own words. */}
        {(step.verdictReason || step.error) && (
          <span className={`${m.stepVerdict} ${step.verdict === 'undone' || step.error ? m.stepVerdictBad : ''}`}>
            {step.verdictReason ? <Glance text={step.verdictReason} /> : step.error}
          </span>
        )}

        {step.nudges.length > 0 && step.state === 'done' && (
          <span className={m.stepLine}>{t.scenarios.run.sentBack(step.nudges.length)}</span>
        )}

        {step.takeOver ? <span className={m.stepLine}>{t.scenarios.run.takenOver(step.takeOver)}</span> : null}
      </span>
  )

  return opens ? (
    <button type="button" className={className} onClick={onOpen} data-row={anchor} data-ahead={ahead || undefined}>
      {body}
    </button>
  ) : (
    <div className={className} data-row={anchor} data-ahead={ahead || undefined}>
      {body}
    </div>
  )
}

/** What the composer is given on a run's screen for what only a conversation has (see forConversation). */
const NO_CONTEXT = { percent: 0, used: 0, limit: 0 }
const NO_RUN = { model: '', effort: '', mode: '' }
const NOTHING_QUEUED: [] = []
const NO_QUOTES: string[] = []
const NOTHING_UNSENT: [] = []
const ignore = () => undefined

/**
 * How many pictures the person has already shown the main thread - the new ones are numbered on from here, so
 * "Image #3" in a later message is not the "Image #1" of an earlier one. Read off the words, which name every
 * picture they carried: the phone gets a note's text and not its chips (see RemoteFeed.runBody).
 */
const picturesShown = (run: Run): number =>
  run.notes.reduce((most, note) => {
    if (note.who !== 'person') return most
    const numbers = [...note.text.matchAll(/\[Image #(\d+)\]/g)].map((match) => Number(match[1]))
    return Math.max(most, ...numbers)
  }, 0)
