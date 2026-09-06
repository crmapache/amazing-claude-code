import { useEffect, useState } from 'react'
import { LinkedText } from './LinkedText'
import { modelLabel } from '../../catalog'
import { compactProgress } from '../../feed/compact'
import { plainLine } from '../../feed/markdown'
import { formatTokens } from '../../feed/build'
import { limitWindowName } from '../../feed/usage'
import { useNow } from '../../hooks/useNow'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'
import type {
  CheckpointItem,
  CompactItem,
  CrashItem,
  ErrorItem,
  LimitItem,
  MetaItem,
  ModelSwitchItem,
  RetryItem,
  ThinkItem,
} from '../../feed/types'
import s from '../feed.module.css'
import { Caret } from './Caret'

/**
 * The thoughts of one piece of a turn go into one card, with the last of them showing outside.
 *
 * Outside it is always one line (with an ellipsis after it): this is a train of thought along the way
 * rather than what one comes to the panel for. The whole thought is read with a click - together with
 * every thought that came before it in this same piece of the turn; how many there are the counter says.
 * While a thought is still streaming the chip breathes with the same pulse as CONTEXT during a compaction
 * - the same language of "under way, not finished".
 *
 * The model thinks in the same markdown it writes its answer in, while a line has nothing to make bold:
 * asterisks and hashes in it mean nothing and merely stick out mid-sentence (see plainLine).
 */
export const ThinkRow = ({ item, open, onToggle }: { item: ThinkItem; open: boolean; onToggle: () => void }) => {
  const t = useT()
  const last = item.thoughts.at(-1) ?? ''

  return (
    <div className={s.think}>
      <button type="button" className={s.thinkHead} onClick={onToggle}>
        <Caret open={open} />
        <span className={`${s.toolChip} ${s.chipThink} ${item.pending ? s.thinkPending : ''}`}>{t.feed.think.chip}</span>
        {/* An expanded card names itself with a number rather than with the last thought: that thought
            stands a line below, and repeating it as a heading serves nothing. */}
        <span className={s.thinkText}>
          {open ? t.feed.think.thoughts(item.thoughts.length) : plainLine(last)}
        </span>
        {item.thoughts.length > 1 && !open ? <span className={s.thinkCount}>{item.thoughts.length}</span> : null}
      </button>

      {open ? (
        <div className={s.thinkBody}>
          {/* Keyed by index: thoughts are only appended at the end and never change places - their order
              is what tells them apart. */}
          {item.thoughts.map((thought, index) => (
            <p key={index} className={s.thinkFull}>
              {plainLine(thought)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * `onLoadEarlier` turns the mark into a button - only ever given for the EARLIER chip (see Feed.tsx), the
 * one that names a genuine gap rather than a moment in the conversation (FORK, CLEAR). A tap fetches the
 * next page of what came before it; the row stays a plain mark until there is something to fetch with.
 */
export const CheckpointRow = ({ item, onLoadEarlier }: { item: CheckpointItem; onLoadEarlier?: () => void }) => {
  const t = useT()
  // A mark the panel worded itself says it in today's language; one carrying the conversation's own
  // words (a fork's name, a compaction's summary) says them as they are.
  const target = item.targetKey ? t.feed.checkpoint[item.targetKey] : item.target

  return onLoadEarlier ? (
    // The row sits inside the button rather than being it: a fingertip's worth of height belongs to the
    // target, and the mark itself has to stand in the middle of that height, not at its top.
    <button type="button" className={s.checkpointButton} onClick={onLoadEarlier}>
      <span className={s.checkpoint}>
        <span className={s.checkpointChip}>{item.chip}</span>
        <span className={s.checkpointTarget}>{t.feed.checkpoint.loadEarlier}</span>
        <span className={s.dashed} />
      </span>
    </button>
  ) : (
    <div className={s.checkpoint}>
      <span className={s.checkpointChip}>{item.chip}</span>
      <span className={s.checkpointTarget}>{target}</span>
      <span className={s.dashed} />
    </div>
  )
}

/** How often the compaction bar grows: more often serves nothing, the curve is gentle as it is. */
const COMPACT_TICK_MS = 500

/**
 * How much of a compaction is behind - counted from the moment it began (see CompactItem.startedAt).
 *
 * From the mark in the feed rather than from a stopwatch started when this card was drawn. A stopwatch
 * belongs to the card on screen, and the card is rebuilt whenever the feed is: coming back to the IDE
 * after a break, a panel restored from the journal, a phone joining mid-compaction. Every one of those
 * used to send the percentage back to zero while the compaction it describes carried on.
 *
 * `now` comes from the clock the mark was written by (see hooks/useNow) - on a phone that is a different
 * machine, and the difference read against the wrong one is however much the two disagree.
 */
const useCompactProgress = (item: CompactItem): number => {
  const now = useNow()
  const [percent, setPercent] = useState(() => compactProgress(now() - item.startedAt))

  useEffect(() => {
    if (!item.pending) return

    const tick = () => setPercent(compactProgress(now() - item.startedAt))
    tick()

    const timer = window.setInterval(tick, COMPACT_TICK_MS)
    return () => window.clearInterval(timer)
  }, [item.pending, item.startedAt, now])

  return percent
}

/**
 * A context compaction. While it runs, a percentage stands after the caption - the whole panel's only
 * account of what is happening (the status line under the feed stays silent at that moment, so as not to
 * say the same thing twice).
 *
 * The percentage is computed from the time elapsed: how much of a compaction is behind the CLI tells
 * nobody, its own terminal interface included - that one draws the same curve (see compactProgress). So
 * the figure promises no exact share but
 * shows that work is under way and roughly how long it has been going.
 */
export const CompactRow = ({ item }: { item: CompactItem }) => {
  const t = useT()
  const percent = useCompactProgress(item)

  return (
    <div className={s.compact}>
      <span className={`${s.compactLabel} ${item.pending ? s.pending : ''}`}>{t.feed.compact.label}</span>
      <span className={s.compactText}>{compactText(t, item)}</span>
      {item.pending ? <span className={s.compactPercent}>{percent}%</span> : null}
      <div className={s.spacer} />
    </div>
  )
}

/**
 * How often the countdown to the next attempt is recomputed. More often than once a second serves
 * nothing: the figure itself moves in seconds, and extra repaints of the feed during an answer cost
 * dearly.
 */
const RETRY_TICK_MS = 1000

/**
 * How many seconds are left until the next attempt - never below zero.
 *
 * `now` comes from the clock the moment of the attempt was written by rather than from this device's
 * (see hooks/useNow): on a phone those are two different machines, and the countdown read against the
 * wrong one is off by however much the two disagree.
 */
const secondsLeft = (retryAt: number, now: number): number => Math.max(0, Math.ceil((retryAt - now) / 1000))

/**
 * The countdown to the next attempt. While the pause lasts, this is the one figure in the whole panel
 * that says the conversation has not died but is waiting.
 */
const useRetryCountdown = (item: RetryItem): number => {
  const now = useNow()
  const [left, setLeft] = useState(() => secondsLeft(item.retryAt, now()))

  useEffect(() => {
    if (!item.pending) return

    const tick = () => setLeft(secondsLeft(item.retryAt, now()))
    tick()

    const timer = window.setInterval(tick, RETRY_TICK_MS)
    return () => window.clearInterval(timer)
  }, [item.pending, item.retryAt, now])

  return left
}

/** The attempts as a number: "1 attempt", but "4 attempts". */
/** How a chain of retries ended - in words rather than in colour: colour is not read by everyone. */
const retryOutcomeText = (t: Dict, item: RetryItem): string => {
  switch (item.outcome) {
    case 'recovered':
      return t.feed.retry.recovered(item.attempt)
    case 'failed':
      return t.feed.retry.failed(item.attempt)
    default:
      return t.feed.retry.stopped(item.attempt)
  }
}

/**
 * The pause before a repeated API request (see RetryItem).
 *
 * It is built like the context compaction row and stands in the same place in the feed: this is the same
 * conversation about "nothing is happening right now, and here is why". While the pause lasts the label
 * breathes and a countdown ticks on the right; once it is all over, how long the whole chain took stays
 * in its place.
 */
export const RetryRow = ({ item }: { item: RetryItem }) => {
  const t = useT()
  const left = useRetryCountdown(item)
  const attemptOf = item.maxRetries
    ? t.feed.retry.attemptOf(item.attempt, item.maxRetries)
    : t.feed.retry.attempt(item.attempt)

  return (
    <div className={s.retry}>
      <span className={`${s.retryLabel} ${item.pending ? s.pending : ''}`}>{t.feed.retry.label}</span>
      <span className={s.retryText}>
        {t.feed.retry.reason[item.reason]} · {item.pending ? attemptOf : retryOutcomeText(t, item)}
      </span>
      {/* The countdown has run out - the attempt is under way, and what we wait for now is an answer rather than a pause. */}
      <span className={s.retryCount}>
        {item.pending ? (left > 0 ? t.feed.retry.retryingIn(left) : t.feed.retry.retrying) : item.duration}
      </span>
      <div className={s.spacer} />
    </div>
  )
}

/** A turn's result - an interrupted one included: it differs by its caption rather than by the row's look. */
export const MetaRow = ({ item }: { item: MetaItem }) => {
  const t = useT()
  // Drawn from `outcome`, never from `stats`: that one is the English marker the IDE reads, and it is
  // the same string in every language on purpose (see MetaItem).
  const text = item.outcome
    ? item.outcome.state === 'stopped'
      ? t.feed.result.stopped(item.outcome.duration)
      : item.outcome.state === 'movedAccount'
        ? t.feed.result.movedAccount(item.outcome.duration)
        : item.outcome.state === 'restarted'
          ? t.feed.result.restarted
          : t.feed.result.worked(item.outcome.duration)
    : ''

  return <div className={s.meta}>{text ? <span>{text}</span> : null}</div>
}

/**
 * The conversation was moved to another model by the CLI itself (see ModelSwitchItem).
 *
 * The row is built like the compaction and the retry ones - the same conversation about something that
 * happened to the conversation rather than in it - and it is deliberately not red: nothing has broken,
 * the work goes on, merely on a different model.
 *
 * The reason stands in the CLI's own words, with its link left alive: that link is the one thing that can
 * be done about it (the article explains what the safeguards flagged and how to send feedback). Without a
 * reason - a swap noticed by the signature under an answer rather than announced - the row says only what
 * it honestly knows: the model has changed, and the person did not do it.
 */
export const ModelSwitchRow = ({
  item,
  onOpenLink,
}: {
  item: ModelSwitchItem
  onOpenLink: (url: string) => void
}) => {
  const t = useT()

  return (
  <div className={s.modelSwitch}>
    <span className={s.modelSwitchLabel}>{t.feed.modelSwitch.label}</span>
    <div className={s.modelSwitchBody}>
      <p className={s.modelSwitchLine}>
        {item.from ? (
          <>
            <span className={s.modelSwitchFrom}>{modelLabel(item.from)}</span>
            <span className={s.modelSwitchArrow}>→</span>
          </>
        ) : null}
        <span className={s.modelSwitchTo}>{modelLabel(item.to)}</span>
        <span className={s.modelSwitchNote}>{t.feed.modelSwitch.note}</span>
      </p>
      {item.reason ? (
        <p className={s.modelSwitchReason}>
          <LinkedText text={item.reason} onOpenLink={onOpenLink} />
        </p>
      ) : null}
    </div>
  </div>
  )
}

/**
 * What a compaction card says: the panel's own words, built from the figures the CLI gave.
 *
 * `target` is only ever the CLI's own line (the error of a failed compaction) and is shown as it came.
 */
const compactText = (t: Dict, item: CompactItem): string => {
  if (!item.outcome) return item.target
  if (item.outcome.state === 'running') return t.feed.compact.running

  const { manual = false, before, after, took = '' } = item.outcome
  return before === undefined
    ? t.feed.compact.done(manual)
    : t.feed.compact.doneWith(manual, formatTokens(before), after === undefined ? '' : formatTokens(after), took)
}

/** How often the waiting row checks whether the window has reset: to the minute is close enough. */
const LIMIT_TICK_MS = 10_000

/** How long is left until the reset, in words. Null once the moment has passed. */
const untilReset = (resetsAt: number | undefined, now: number): string | null => {
  if (resetsAt === undefined) return null

  const minutes = Math.ceil((resetsAt - now) / 60_000)
  if (minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

/** The reset time as a clock reading: what one compares against one's own day. */
const resetClock = (resetsAt: number): string =>
  new Date(resetsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * The subscription limit ran out (see LimitItem). Deliberately not red: nothing has broken.
 *
 * `extra` says the work goes on for money - the row is the mark of the moment that started, and it stays
 * in the feed for good. `waiting` says the work has stopped until the window resets, and that row
 * removes itself the moment it does: what it promised has happened, and standing there afterwards it
 * would be claiming the opposite of the truth.
 */
export const LimitRow = ({ item }: { item: LimitItem }) => {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (item.state !== 'waiting' || item.resetsAt === undefined) return

    const timer = window.setInterval(() => setNow(Date.now()), LIMIT_TICK_MS)
    return () => window.clearInterval(timer)
  }, [item.state, item.resetsAt])

  const left = untilReset(item.resetsAt, now)
  if (item.state === 'waiting' && item.resetsAt !== undefined && left === null) return null

  const named = limitWindowName(t, item.window)

  return (
    <div className={`${s.limit} ${item.state === 'extra' ? s.limitExtra : ''}`}>
      <span className={s.limitLabel}>{item.state === 'extra' ? t.feed.limit.extraLabel : t.feed.limit.label}</span>
      <span className={s.limitText}>
        {item.state === 'extra' ? t.feed.limit.extra(named) : t.feed.limit.waiting(named)}
      </span>
      {item.state === 'waiting' && item.resetsAt !== undefined && left ? (
        <span className={s.limitWhen}>{t.feed.limit.resetAt(resetClock(item.resetsAt), left)}</span>
      ) : null}
      <div className={s.spacer} />
    </div>
  )
}

/** The process died on its own - an unambiguous mark rather than a silent "idle". */
export const CrashRow = ({ item }: { item: CrashItem }) => {
  const t = useT()

  return (
    <div className={s.crash}>
      <span className={s.crashLabel}>{t.feed.crash.label}</span>
      <span className={s.crashText}>
        {item.exitCode === undefined ? t.feed.crash.text : t.feed.crash.textWithCode(item.exitCode)}
      </span>
    </div>
  )
}

/**
 * A refusal from the agent or the process - in its place in the chronology (see ErrorItem). The cross
 * stays: an error that has been read can be removed at once rather than waiting for it to travel upwards
 * by itself.
 */
export const ErrorRow = ({
  item,
  onDismiss,
  onOpenLink,
}: {
  item: ErrorItem
  onDismiss: () => void
  /** Open an address out of an error's text in the system browser. */
  onOpenLink: (url: string) => void
}) => (
  <p className={s.error}>
    {/* An address inside an error is usually the one thing that can be done about it: "check
        https://status.claude.com" asks one to go and look. So it stays a link, as in the agent's answer
        (see LinkedText). */}
    <span className={s.errorText}>
      <LinkedText text={item.message} onOpenLink={onOpenLink} />
    </span>
    <button type="button" className={s.errorDismiss} onClick={onDismiss}>
      ×
    </button>
  </p>
)
