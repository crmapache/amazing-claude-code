import { useEffect, useRef, useState } from 'react'
import { LinkedText } from './LinkedText'
import { compactProgress } from '../../feed/compact'
import { plainLine } from '../../feed/markdown'
import type {
  CheckpointItem,
  CompactItem,
  CrashItem,
  ErrorItem,
  MetaItem,
  RetryItem,
  ThinkItem,
} from '../../feed/types'
import s from '../feed.module.css'

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
  const last = item.thoughts.at(-1) ?? ''

  return (
    <div className={s.think}>
      <button type="button" className={s.thinkHead} onClick={onToggle}>
        <span className={`${s.caret} ${open ? s.caretOpen : ''}`}>▶</span>
        <span className={`${s.toolChip} ${s.chipThink} ${item.pending ? s.thinkPending : ''}`}>THINK</span>
        {/* An expanded card names itself with a number rather than with the last thought: that thought
            stands a line below, and repeating it as a heading serves nothing. */}
        <span className={s.thinkText}>
          {open ? `${item.thoughts.length} ${item.thoughts.length === 1 ? 'thought' : 'thoughts'}` : plainLine(last)}
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
export const CheckpointRow = ({ item, onLoadEarlier }: { item: CheckpointItem; onLoadEarlier?: () => void }) =>
  onLoadEarlier ? (
    <button type="button" className={`${s.checkpoint} ${s.checkpointButton}`} onClick={onLoadEarlier}>
      <span className={s.checkpointChip}>{item.chip}</span>
      <span className={s.checkpointTarget}>tap to load more</span>
      <div className={s.dashed} />
    </button>
  ) : (
    <div className={s.checkpoint}>
      <span className={s.checkpointChip}>{item.chip}</span>
      <span className={s.checkpointTarget}>{item.target}</span>
      <div className={s.dashed} />
    </div>
  )

/** How often the compaction bar grows: more often serves nothing, the curve is gentle as it is. */
const COMPACT_TICK_MS = 500

/**
 * How much of a compaction is behind - by a stopwatch from the first message about it.
 *
 * The time is counted from the card's appearance rather than from any mark in the event: the card is
 * created by the very message the CLI announces the compaction's start with, so that is its start.
 */
const useCompactProgress = (pending: boolean): number => {
  const startedAt = useRef<number | null>(null)
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    if (!pending) return

    const from = startedAt.current ?? Date.now()
    startedAt.current = from

    const tick = () => setPercent(compactProgress(Date.now() - from))
    tick()

    const timer = window.setInterval(tick, COMPACT_TICK_MS)
    return () => window.clearInterval(timer)
  }, [pending])

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
  const percent = useCompactProgress(item.pending)

  return (
    <div className={s.compact}>
      <span className={`${s.compactLabel} ${item.pending ? s.pending : ''}`}>CONTEXT</span>
      <span className={s.compactText}>{item.target}</span>
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

/** How many seconds are left until the next attempt - never below zero. */
const secondsLeft = (retryAt: number): number => Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))

/**
 * The countdown to the next attempt. While the pause lasts, this is the one figure in the whole panel
 * that says the conversation has not died but is waiting.
 */
const useRetryCountdown = (item: RetryItem): number => {
  const [left, setLeft] = useState(() => secondsLeft(item.retryAt))

  useEffect(() => {
    if (!item.pending) return

    const tick = () => setLeft(secondsLeft(item.retryAt))
    tick()

    const timer = window.setInterval(tick, RETRY_TICK_MS)
    return () => window.clearInterval(timer)
  }, [item.pending, item.retryAt])

  return left
}

/** The attempts as a number: "1 attempt", but "4 attempts". */
const attempts = (count: number): string => (count === 1 ? '1 attempt' : `${count} attempts`)

/** How a chain of retries ended - in words rather than in colour: colour is not read by everyone. */
const retryOutcomeText = (item: RetryItem): string => {
  switch (item.outcome) {
    case 'recovered':
      return `went through after ${attempts(item.attempt)}`
    case 'failed':
      return `gave up after ${attempts(item.attempt)}`
    default:
      return `stopped after ${attempts(item.attempt)}`
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
  const left = useRetryCountdown(item)
  const attemptOf = item.maxRetries ? `attempt ${item.attempt}/${item.maxRetries}` : `attempt ${item.attempt}`

  return (
    <div className={s.retry}>
      <span className={`${s.retryLabel} ${item.pending ? s.pending : ''}`}>RETRY</span>
      <span className={s.retryText}>
        {item.label} · {item.pending ? attemptOf : retryOutcomeText(item)}
      </span>
      {/* The countdown has run out - the attempt is under way, and what we wait for now is an answer rather than a pause. */}
      <span className={s.retryCount}>
        {item.pending ? (left > 0 ? `retrying in ${left}s` : 'retrying…') : item.duration}
      </span>
      <div className={s.spacer} />
    </div>
  )
}

/** A turn's result - an interrupted one included: it differs by its caption rather than by the row's look. */
export const MetaRow = ({ item }: { item: MetaItem }) => (
  <div className={s.meta}>
    {item.stats.map((stat, index) => (
      <span key={index}>{stat}</span>
    ))}
  </div>
)

/** The process died on its own - an unambiguous mark rather than a silent "idle". */
export const CrashRow = ({ item }: { item: CrashItem }) => (
  <div className={s.crash}>
    <span className={s.crashLabel}>SESSION</span>
    <span className={s.crashText}>{item.message}</span>
  </div>
)

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
