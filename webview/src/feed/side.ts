import { tokensText } from './tokens'
import type { UserToken } from './types'

/**
 * Side questions - `/btw`, as the terminal and VS Code call it: a quick question beside the work that does
 * not stop it.
 *
 * The CLI answers one out of the conversation's context with no tools, and writes nothing of it into the
 * transcript (see SideQuestion.kt). So the thread is not the conversation's and never shows up in its
 * feed: it lives in the screen it was asked from, one per tab, for as long as the tab does - and is gone
 * after a restart, the way it is gone from a terminal. Nothing else in the panel or the IDE records it.
 *
 * Shared by the panel and the phone: both keep the thread with these same rules, and only the frame around
 * the card differs.
 */

/** The command's name, the one the terminal and VS Code use. */
export const ASIDE_COMMAND = 'btw'

/**
 * The question in a `/btw` line, or null for anything that is not one.
 *
 * A bare `/btw` is an empty question rather than none: it brings the thread back up, as in the terminal.
 * Line breaks inside the question are kept - unlike a model's name after `/model`, a question is prose,
 * and the generic command parsing that splits on whitespace would join its lines into one.
 */
export const asideQuestion = (text: string): string | null => {
  const trimmed = text.trimStart()
  const match = /^\/btw(?=\s|$)/.exec(trimmed)
  return match ? trimmed.slice(match[0].length).trim() : null
}

/**
 * Whether the field holds a side question - by the field's tokens, the way the panel reads a command
 * there (a typed command turns into a chip, see captureCommand).
 */
export const isAsideDraft = (tokens: UserToken[]): boolean => asideQuestion(tokensText(tokens)) !== null

/** Where one exchange stands. */
export type SideState = 'asking' | 'answered' | 'empty' | 'cancelled' | 'failed'

/** Why one ended without an answer - the IDE's words for it (see SideQuestion.Reason). */
export type SideFailure = 'ended' | 'timeout' | 'refused'

/** The CLI retrying its API call - its own counters, and when they arrived, to count the delay down from. */
export interface SideRetry {
  attempt: number
  maxRetries: number
  delayMs: number
  errorStatus?: number
  at: number
}

export interface SideExchange {
  id: string
  question: string
  /** When it was asked, by this screen's clock - what "thinking aside · 4s" counts from. */
  askedAt: number
  state: SideState
  /** The model's answer - or, for `empty`, the CLI's own placeholder saying why there is none. */
  text?: string
  /** The CLI's word about a model that declined and the one that answered instead. */
  notice?: string
  reason?: SideFailure
  /** The CLI's error, for `refused`. */
  message?: string
  retry?: SideRetry
}

export interface SideThread {
  /** Whether the card is on screen. Closing it keeps the thread: a bare `/btw` brings it back. */
  open: boolean
  exchanges: SideExchange[]
}

export const NO_THREAD: SideThread = { open: false, exchanges: [] }

/** How many exchanges one thread keeps - the oldest go first; one still being asked never does. */
export const THREAD_KEPT = 20

/**
 * How many earlier exchanges travel with a new question. Each is context the model reads again, and the
 * IDE cuts at the same number anyway (see SideQuestion.HISTORY_KEPT).
 */
export const HISTORY_SENT = 10

export type SideAction =
  /** A question asked - or one asked again in the place of [replaces], after it failed. */
  | { kind: 'ask'; id: string; question: string; at: number; replaces?: string }
  | {
      kind: 'progress'
      id: string
      status: string
      attempt?: number
      maxRetries?: number
      delayMs?: number
      errorStatus?: number
      at: number
    }
  | {
      kind: 'end'
      id: string
      outcome: 'answered' | 'empty' | 'cancelled' | 'failed'
      text?: string
      notice?: string
      reason?: SideFailure
      message?: string
    }
  | { kind: 'show' }
  | { kind: 'hide' }

/** Keeps the newest [THREAD_KEPT], never dropping one still out - its answer would have nowhere to land. */
const trimmed = (exchanges: SideExchange[]): SideExchange[] => {
  let excess = exchanges.length - THREAD_KEPT
  if (excess <= 0) return exchanges

  return exchanges.filter((exchange) => {
    if (excess > 0 && exchange.state !== 'asking') {
      excess -= 1
      return false
    }
    return true
  })
}

const OUTCOMES = new Set(['answered', 'empty', 'cancelled', 'failed'])

export const sideThread = (thread: SideThread, action: SideAction): SideThread => {
  switch (action.kind) {
    case 'ask': {
      const asked: SideExchange = { id: action.id, question: action.question, askedAt: action.at, state: 'asking' }
      const place = action.replaces ? thread.exchanges.findIndex((exchange) => exchange.id === action.replaces) : -1

      // Asking again stands where the one that failed stood: the thread reads in the order things were
      // asked, and a retry is the same question rather than a new one.
      const exchanges =
        place >= 0
          ? thread.exchanges.map((exchange, index) => (index === place ? asked : exchange))
          : trimmed([...thread.exchanges, asked])

      return { open: true, exchanges }
    }

    case 'progress':
      return {
        ...thread,
        exchanges: thread.exchanges.map((exchange) => {
          if (exchange.id !== action.id || exchange.state !== 'asking') return exchange
          if (action.status !== 'api_retry') return { ...exchange, retry: undefined }

          return {
            ...exchange,
            retry: {
              attempt: action.attempt ?? 1,
              maxRetries: action.maxRetries ?? 0,
              delayMs: action.delayMs ?? 0,
              errorStatus: action.errorStatus,
              at: action.at,
            },
          }
        }),
      }

    case 'end': {
      // An outcome this screen does not know is not drawn as one it does: the question keeps waiting, and
      // the IDE's timeout is still there to end it honestly.
      if (!OUTCOMES.has(action.outcome)) return thread

      return {
        ...thread,
        exchanges: thread.exchanges.map((exchange) =>
          // Only a question still out takes an answer: a second one for the same id - a delivery repeated
          // on the way - must not overwrite what is already on screen.
          exchange.id === action.id && exchange.state === 'asking'
            ? {
                id: exchange.id,
                question: exchange.question,
                askedAt: exchange.askedAt,
                state: action.outcome,
                text: action.text,
                notice: action.notice,
                reason: action.reason,
                message: action.message,
              }
            : exchange,
        ),
      }
    }

    case 'show':
      return thread.open ? thread : { ...thread, open: true }

    case 'hide':
      return thread.open ? { ...thread, open: false } : thread
  }
}

/**
 * The earlier exchanges a new question carries, newest last - only the ones the model genuinely answered.
 *
 * A placeholder, a cancel or an error is not something the model said, and handed back as its answer it
 * would read in the next question's context as though it were. [without] leaves out the one being asked
 * again.
 */
export const sideHistory = (
  thread: SideThread,
  without?: string,
): { question: string; response: string; notice?: string }[] =>
  thread.exchanges
    .filter((exchange) => exchange.id !== without && exchange.state === 'answered' && exchange.text)
    .slice(-HISTORY_SENT)
    .map((exchange) => ({
      question: exchange.question,
      response: exchange.text ?? '',
      ...(exchange.notice ? { notice: exchange.notice } : {}),
    }))
