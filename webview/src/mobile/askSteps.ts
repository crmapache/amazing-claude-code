import {
  askAnswered,
  answerFor,
  EMPTY_ASK_DRAFT,
  openOwnAnswer,
  togglePick,
  writeOwnAnswer,
  type AskDraft,
} from '../feed/askDraft'
import type { AskQuestion } from '../feed/types'

/**
 * A question with options as a phone answers it: one question on the screen at a time.
 *
 * What is picked and written is the desk's own draft (see feed/askDraft) - the same rules for a tick, for
 * an answer in one's own words and for what travels to the agent. The phone adds one thing the desk has
 * no need of: which questions the person is done with. The desk shows every question at once and has a
 * Send button under them; a phone has room for one question's options at thumb size, so it has to know
 * when to move on - and "answered" is not that. A question that takes several ticks is answered by its
 * first one, and moving on there would leave no way to tick the second; a field of one's own is answered
 * by its first letter.
 *
 * Kept by the application rather than by the screen (see mobile/App.askDrafts): the screen is taken down
 * every time somebody steps back to read the conversation, and half the questions went with it.
 */
export interface PhoneAsk {
  draft: AskDraft
  /** The questions moved past, by id - see [onScreen]. */
  done: string[]
}

export const EMPTY_PHONE_ASK: PhoneAsk = { draft: EMPTY_ASK_DRAFT, done: [] }

/** The question on the screen: the first one not yet moved past. */
export const onScreen = (questions: AskQuestion[], held: PhoneAsk): AskQuestion | undefined =>
  questions.find((question) => !held.done.includes(question.id))

/**
 * An option pressed.
 *
 * An ordinary question is closed by it - two taps from a sofa is what this screen is for, and an ordinary
 * question has exactly one answer to give. A question that takes several is a row of ticks, and moving on
 * is the person's own press (see [moveOn]).
 */
export const pickOption = (held: PhoneAsk, question: AskQuestion, optionId: string): PhoneAsk => {
  const draft = togglePick(held.draft, question, optionId)
  if (question.multiSelect) return { ...held, draft }

  return { draft, done: withDone(held.done, question.id) }
}

/** The answer in one's own words opened - a field in place of the row, and nothing moves on until it is written. */
export const openOwn = (held: PhoneAsk, question: AskQuestion): PhoneAsk => ({
  ...held,
  draft: openOwnAnswer(held.draft, question),
})

export const writeOwn = (held: PhoneAsk, question: AskQuestion, value: string): PhoneAsk => ({
  ...held,
  draft: writeOwnAnswer(held.draft, question, value),
})

/** Whether the question on the screen has something to move on with. */
export const canMoveOn = (held: PhoneAsk, question: AskQuestion): boolean => answerFor(question, held.draft).length > 0

/** On to the next question - only over an answer, so nothing empty is left behind. */
export const moveOn = (held: PhoneAsk, question: AskQuestion): PhoneAsk =>
  canMoveOn(held, question) ? { ...held, done: withDone(held.done, question.id) } : held

/** Whether the whole call is answered and moved past: the answer travels then, and only then. */
export const finished = (questions: AskQuestion[], held: PhoneAsk): boolean =>
  questions.every((question) => held.done.includes(question.id)) && askAnswered(questions, held.draft)

const withDone = (done: string[], questionId: string): string[] =>
  done.includes(questionId) ? done : [...done, questionId]
