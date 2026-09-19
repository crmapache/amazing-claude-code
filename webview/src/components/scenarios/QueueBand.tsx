import type { ScenarioQueued, ScenarioQueueState, ScenarioRunSummary } from '../../protocol'
import { namedRun, queueMarks, queueStanding, type QueueStanding } from '../../scenarios/queue'
import { useT } from '../../i18n'
import { CrossIcon, DownIcon, UpIcon } from './icons'
import s from './scenarios.module.css'

/**
 * What is lined up to run one after another, and what the queue is doing about it.
 *
 * The band is read top to bottom in the order the questions come: where the queue stands right now, then
 * the turns waiting in the order they will be taken. A turn is a row with its scenario's name, what it
 * was asked, what it is waiting for, and the three things one does to a turn - move it, change what it
 * waits for, drop it.
 *
 * The stop is the only loud thing here, and deliberately so: a queue that stopped at midnight is the one
 * state on this screen where the night's remaining work is standing still and only a person can start it
 * again.
 */
export const QueueBand = ({
  queue,
  unread,
  live,
  past,
  onOpenRun,
  onRemove,
  onMove,
  onMode,
  onGoOn,
  onClear,
}: {
  queue: ScenarioQueueState | null
  /** The file could not be read at all, which is a different thing from an empty queue. */
  unread: boolean
  /** What is going right now, so a queue's own run can be named and opened. */
  live: ScenarioRunSummary[]
  /** The runs that are over, so the one a stop names can be told apart from a run of the same scenario going now. */
  past: ScenarioRunSummary[]
  onOpenRun: (runId: string) => void
  onRemove: (entry: ScenarioQueued) => void
  onMove: (entry: ScenarioQueued, by: number) => void
  onMode: (entry: ScenarioQueued, afterSuccess: boolean) => void
  onGoOn: () => void
  onClear: () => void
}) => {
  const t = useT()

  /*
   * Said rather than left as an empty screen, exactly as the scheduled hours say it.
   *
   * An unreadable file draws what an empty queue draws - nothing - so somebody whose file was damaged
   * reads it as "the night I lined up is gone" and lines it all up again; and that does not save either,
   * because nothing is ever written over a list that could not be read.
   */
  if (unread) {
    return (
      <div className={s.section}>
        <div className={s.emptyShelf}>
          <span className={s.emptyTitle}>{t.scenarios.queue.unread}</span>
        </div>
      </div>
    )
  }

  const waiting = queue?.waiting ?? []
  const standing = queueStanding(queue, live, past)
  const marks = queueMarks(waiting)

  return (
    <>
      {/* Where the queue stands. Drawn above the turns because it is what decides whether any of them
          will be taken at all. */}
      {standing.kind === 'held' ? (
        <div className={s.queueHeld}>
          <span className={s.queueHeldDot} />
          {/* The run it stopped on opens from here, like the one it stands behind does: "which run?" is the
              first question a stop raises, and a name alone answers it wrongly as soon as a run of the same
              scenario is going beside it. A turn that would not start has no run to open - its row says why. */}
          {standing.runId ? (
            <button
              type="button"
              className={`${s.queueHeldText} ${s.queueHeldOpen}`}
              onClick={() => onOpenRun(standing.runId)}
            >
              <HeldWords standing={standing} />
            </button>
          ) : (
            <span className={s.queueHeldText}>
              <HeldWords standing={standing} />
            </span>
          )}
          <span className={s.queueHeldButtons}>
            {waiting.length > 0 ? (
              <button
                type="button"
                className={`${s.button} ${s.buttonWarn}`}
                onClick={onGoOn}
                data-tooltip={
                  standing.after
                    ? t.scenarios.queue.goOnBehindHint(namedRun(standing.after.scenarioName, standing.afterMark))
                    : undefined
                }
              >
                {standing.after ? t.scenarios.queue.goOnBehind : t.scenarios.queue.goOn}
              </button>
            ) : null}
            <button type="button" className={s.button} onClick={onClear}>
              {t.scenarios.queue.clear}
            </button>
          </span>
        </div>
      ) : null}

      {standing.kind === 'going' ? (
        <div className={s.queueGoing}>
          <span className={s.queueGoingDot} />
          <button type="button" className={s.queueGoingText} onClick={() => onOpenRun(standing.run.id)}>
            <span className={s.queueGoingTitle}>{t.scenarios.queue.goingNow}</span>
            <span className={s.queueGoingName}>{namedRun(standing.run.scenarioName, standing.mark)}</span>
          </button>
          <span className={s.queueGoingFact}>
            {t.scenarios.run.cards(standing.run.done, standing.run.total)}
          </span>
        </div>
      ) : null}

      {waiting.length === 0 ? (
        <div className={s.section}>
          <div className={s.emptyShelf}>
            <span className={s.emptyText}>
              <span className={s.emptyTitle}>{t.scenarios.queue.empty}</span>
              <span className={s.emptyNote}>{t.scenarios.queue.emptyNote}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className={s.section}>
          <div className={s.queueRows}>
            {waiting.map((entry, at) => (
              <QueueRow
                key={entry.id}
                entry={entry}
                at={at}
                mark={marks[entry.id] ?? ''}
                last={at === waiting.length - 1}
                /* The first turn is the one the queue is actually waiting on, and only for it does
                   "what it waits for" describe anything happening right now. */
                next={at === 0}
                onRemove={() => onRemove(entry)}
                onMove={(by) => onMove(entry, by)}
                onMode={(afterSuccess) => onMode(entry, afterSuccess)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

const HeldWords = ({ standing }: { standing: Extract<QueueStanding, { kind: 'held' }> }) => {
  const t = useT()

  return (
    <>
      <span className={s.queueHeldTitle}>{t.scenarios.queue.stopped}</span>
      <span className={s.queueHeldWhy}>
        {t.scenarios.queue.stoppedOn(namedRun(standing.name, standing.mark), whyWords(standing.why, t))}
      </span>
    </>
  )
}

const QueueRow = ({
  entry,
  at,
  mark,
  last,
  next,
  onRemove,
  onMove,
  onMode,
}: {
  entry: ScenarioQueued
  at: number
  mark: string
  last: boolean
  next: boolean
  onRemove: () => void
  onMove: (by: number) => void
  onMode: (afterSuccess: boolean) => void
}) => {
  const t = useT()
  const answers = Object.entries(entry.inputs ?? {}).filter(([, value]) => value.trim().length > 0)

  return (
    <div className={`${s.queueRow} ${entry.scope === 'project' ? s.railProject : s.railUser}`}>
      {/* The place in the line, in a gutter of its own - the same shape the timetable puts its hour in.
          A queue is about order, and order read off a number is read without counting rows. */}
      <span className={s.queueGutter}>
        <span className={s.queuePlace}>{at + 1}</span>
      </span>

      <span className={s.queueText}>
        <span className={s.queueName}>
          {entry.scenarioName}
          {mark ? <span className={s.queueMark}>{mark}</span> : null}
        </span>
        <span className={s.queueFacts}>
          {/*
            What this turn waits for, and it is a button rather than a word: the queue is where somebody
            reads the whole night at once, which is the moment they realise the third one need not wait
            for the second. Opening a form to change one word would be the long way round.
          */}
          <button
            type="button"
            className={`${s.queueWaits} ${entry.afterSuccess ? '' : s.queueWaitsAny}`}
            onClick={() => onMode(!entry.afterSuccess)}
            data-tooltip={entry.afterSuccess ? t.scenarios.queue.switchToAny : t.scenarios.queue.switchToSuccess}
          >
            {entry.afterSuccess ? t.scenarios.queue.waitsForSuccess : t.scenarios.queue.waitsForAnything}
          </button>

          {/* A turn that could not be raised keeps its place and wears the reason: dropped silently, it
              would be work somebody asked for that simply never happened. */}
          {entry.failure ? (
            <span className={s.queueFailed}>{t.scenarios.queue.wouldNotStart(whyWords(entry.failure, t))}</span>
          ) : null}

          {answers.map(([name, value]) => (
            <span key={name} className={s.factChip}>{`${name}: ${value}`}</span>
          ))}
        </span>
      </span>

      <span className={s.queueActions}>
        <button
          type="button"
          className={s.iconButton}
          disabled={next}
          data-tooltip={t.scenarios.queue.moveUp}
          aria-label={t.scenarios.queue.moveUp}
          onClick={() => onMove(-1)}
        >
          <UpIcon />
        </button>
        <button
          type="button"
          className={s.iconButton}
          disabled={last}
          data-tooltip={t.scenarios.queue.moveDown}
          aria-label={t.scenarios.queue.moveDown}
          onClick={() => onMove(1)}
        >
          <DownIcon />
        </button>
        <button
          type="button"
          className={`${s.iconButton} ${s.iconDanger}`}
          data-tooltip={t.scenarios.queue.remove}
          aria-label={t.scenarios.queue.remove}
          onClick={onRemove}
        >
          <CrossIcon />
        </button>
      </span>
    </div>
  )
}

/**
 * Why the queue stopped, in words.
 *
 * Two kinds of reason arrive here under one name: how a run ended, and why a turn would not start at all.
 * The IDE has no words of its own - the panel speaks ten languages and it speaks one - so both travel as
 * names and are looked up in the two dictionaries that already hold them.
 */
const whyWords = (why: string, t: ReturnType<typeof useT>): string => {
  const states = t.scenarios.runStates as Record<string, string>
  const outcomes = t.scenarios.outcomes as Record<string, string>

  return states[why] ?? outcomes[why] ?? t.scenarios.queue.stoppedUnknown
}
