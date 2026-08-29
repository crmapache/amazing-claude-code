import type { AgentEvent, AgentSystemEvent } from '../protocol'
import { formatDuration } from './tools'
import type { PanelState } from './panelState'
import type { RetryItem, RetryOutcome, RetryReason } from './types'

/**
 * The pause the CLI waits a refused request out in, before repeating it.
 *
 * While it lasts, precisely nothing happens in the conversation - and that is the whole difficulty:
 * neither the start nor the end of the chain has an event of its own beyond the attempts themselves, so
 * the panel has to make out where it began and, by whatever happens next, what it ended with. Kept
 * apart from the rest of the feed's assembly because those rules concern nothing else in it.
 */

/**
 * What the server refused with, as one of four facts rather than as a sentence.
 *
 * The four are the terminal's own division of them, and the sentences beside them say the same things -
 * a person should not meet one overload described two ways in two windows. What they are not is English:
 * the caption is set inside a translated frame (see stream.retryWaiting), so a line taken from the
 * terminal wholesale drew half a Russian sentence.
 *
 * A broken connection falls into the general "API error": it has no response code (see protocol), and
 * the terminal does not tell it from other refusals either.
 */
export const retryReason = (status: number | null | undefined): RetryReason => {
  switch (status) {
    case 429:
      return 'rateLimited'
    case 529:
      return 'overloaded'
    case 401:
    case 403:
      return 'auth'
    default:
      return 'error'
  }
}

/**
 * How short a successful chain has to be to leave no trace.
 *
 * One attempt half a second later is the ordinary life of a network: the work did not stop for it, the
 * person did not even notice, and a card about it in the feed would be noise between real steps. Live it
 * is visible anyway - the card appears on the very first refusal - but in the conversation's history it
 * has no business. Anything that noticeably delayed the turn stays in the feed: otherwise there is no
 * telling afterwards why a turn took five minutes. The boundary is roughly where a pause stops being a
 * hitch and becomes a wait.
 */
const RETRY_TRACE_MS = 5_000

/**
 * The next attempt: one card for the whole chain, with only the figures changing.
 *
 * The event does not say whose request failed - the main conversation's or a subagent's - and there is
 * nowhere to learn it from: a refusal carries neither a task_id nor a parent call. We show it in the
 * shared feed: a server overload concerns the whole conversation anyway rather than one of its branches.
 */
export const applyApiRetry = (state: PanelState, event: AgentSystemEvent, now: number): PanelState => {
  const reason = retryReason(event.error_status)
  const attempt = event.attempt ?? (state.retry ? state.retry.attempt + 1 : 1)
  const maxRetries = event.max_retries ?? state.retry?.maxRetries ?? 0
  const retryAt = now + Math.max(0, event.retry_delay_ms ?? 0)

  if (state.retry) {
    const retry = { ...state.retry, reason, attempt, maxRetries, retryAt }

    return {
      ...state,
      retry,
      items: state.items.map((item) =>
        item.kind === 'retry' && item.id === retry.itemId ? { ...item, reason, attempt, maxRetries, retryAt } : item,
      ),
    }
  }

  const itemId = `retry-${state.seq}`
  const card: RetryItem = {
    id: itemId,
    kind: 'retry',
    reason,
    attempt,
    maxRetries,
    retryAt,
    duration: '',
    pending: true,
  }

  return {
    ...state,
    seq: state.seq + 1,
    items: [...state.items, card],
    retry: { itemId, reason, attempt, maxRetries, retryAt, startedAt: now },
  }
}

/**
 * The chain of retries has ended.
 *
 * There is no separate event for that, neither for a successful end nor for a failed one: the CLI simply
 * stops repeating - either because the request finally went through or because the attempts have run out
 * - so the chain is closed by whoever noticed the first event after it (see closeRetryFor), and it is
 * they who say how it ended.
 */
export const closeRetry = (state: PanelState, outcome: RetryOutcome, now: number): PanelState => {
  const retry = state.retry
  if (!retry) return state

  const elapsed = now - retry.startedAt
  const forget = outcome === 'recovered' && elapsed < RETRY_TRACE_MS

  return {
    ...state,
    retry: undefined,
    items: forget
      ? state.items.filter((item) => item.id !== retry.itemId)
      : state.items.map((item) =>
          item.kind === 'retry' && item.id === retry.itemId
            ? { ...item, pending: false, outcome, duration: formatDuration(elapsed) }
            : item,
        ),
  }
}

/**
 * How the chain of retries ended - by the first event to arrive after it.
 *
 * System events do not break it: the attempts themselves arrive as those, and between attempts internal
 * marks such as a status change travel over the same channel. Everything else means the request got
 * somewhere - and all that is left is to work out whether the model answered. Having run out of attempts,
 * the CLI closes the turn not with its answer but with its own `<synthetic>` placeholder carrying the
 * error's text - that is what tells surrender from success.
 */
export const closeRetryFor = (state: PanelState, event: AgentEvent, now: number): PanelState => {
  if (!state.retry) return state

  switch (event.type) {
    case 'system':
      return state

    // A subscription limit refusal decides nothing by itself: at that moment the turn may either carry on
    // or stop for good - what comes next says which (see rate_limit_event).
    case 'rate_limit_event':
      return state

    // The placeholder is recognised by its internal model name rather than by the absence of a real one:
    // silence about the model is merely silence, and declaring a turn surrendered by it would mean
    // recording ordinary answers as breakages.
    case 'assistant':
      return closeRetry(state, syntheticReply(event.message.model) ? 'failed' : 'recovered', now)

    case 'result':
      return closeRetry(state, event.is_error ? 'failed' : 'recovered', now)

    default:
      return closeRetry(state, 'recovered', now)
  }
}

/**
 * The answer came from the CLI itself rather than from the agent: the same angle-bracket mark as in
 * realModel, but the question here is the opposite - not "what are we working on" but "did this reach
 * the model at all". An unsigned message counts as an ordinary answer: silence about the model is not a
 * sign of breakage.
 */
const syntheticReply = (model: string | undefined): boolean => model !== undefined && model.startsWith('<')
