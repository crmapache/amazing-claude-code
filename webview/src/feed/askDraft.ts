import type { AskQuestion } from './types'

/**
 * What has been picked and written into a question card that is still waiting to be sent.
 *
 * It lives outside the card (see App.askDrafts) rather than inside it, and that placement is the whole
 * reason this file exists. The card is torn down and built again by ordinary things: switching to
 * another tab (the panel above the field is drawn for the tab on screen), and the composer changing its
 * layout, which moves the whole stack of cards between the dock and the side rail. Kept inside, the
 * answers went with it - a question with six options half answered, gone because somebody looked at the
 * next tab or the IDE window came back from being minimised at a different height.
 *
 * So the card is handed a draft and reports a new one, and the rules that decide what a press means live
 * here with a test on them: every one of them is the kind that breaks silently and is noticed only in
 * what the agent was answered.
 */
export interface AskDraft {
  /** The options ticked, by question. One at most for an ordinary question, any number for multiSelect. */
  picks: Record<string, string[]>
  /**
   * The answer written in one's own words, by question.
   *
   * Absent and empty mean different things, and both are used: absent is the Other row switched off (it
   * draws as an option), an empty string is the row open with nothing typed into it yet.
   */
  custom: Record<string, string>
}

export const EMPTY_ASK_DRAFT: AskDraft = { picks: {}, custom: {} }

/**
 * An option pressed.
 *
 * An ordinary question keeps one answer, so the press replaces what was there; multiSelect is a row of
 * ticks and toggles. An ordinary option is also not "your answer": if the Other row was switched on
 * before, its text no longer has the right to be the answer to a single-choice question. In multiSelect
 * Other is a tick like any other, so it lives alongside ordinary options and is left alone.
 */
export const togglePick = (draft: AskDraft, question: AskQuestion, optionId: string): AskDraft => {
  const selected = draft.picks[question.id] ?? []

  if (!question.multiSelect) {
    return { picks: { ...draft.picks, [question.id]: [optionId] }, custom: withoutOwn(draft.custom, question.id) }
  }

  const next = selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId]

  return { ...draft, picks: { ...draft.picks, [question.id]: next } }
}

/**
 * The Other row switched on - an input field opens in its place.
 *
 * Pressing it a second time changes nothing: the row is already open, and resetting it would wipe what
 * has been typed into it. For a single-choice question it takes the answer over from the options above,
 * because there is only one answer to give.
 */
export const openOwnAnswer = (draft: AskDraft, question: AskQuestion): AskDraft => {
  if (draft.custom[question.id] !== undefined) return draft

  return {
    picks: question.multiSelect ? draft.picks : { ...draft.picks, [question.id]: [] },
    custom: { ...draft.custom, [question.id]: '' },
  }
}

/** What is being typed into the Other row. */
export const writeOwnAnswer = (draft: AskDraft, question: AskQuestion, value: string): AskDraft => ({
  ...draft,
  custom: { ...draft.custom, [question.id]: value },
})

/**
 * Pasted paths put into an answer that is being written, at the caret rather than at the end: the answer
 * may well be half written, and appending would put the file after words it has nothing to do with.
 */
export const pasteIntoOwnAnswer = (
  draft: AskDraft,
  question: AskQuestion,
  paths: string[],
  at: number,
  to: number,
): AskDraft => {
  const value = draft.custom[question.id] ?? ''
  const head = value.slice(0, Math.min(at, value.length))
  const tail = value.slice(Math.min(to, value.length))

  return writeOwnAnswer(draft, question, joinPaths(head, paths, tail))
}

/** The answer to one question as it will travel to the agent - the typed text wins over the ticks. */
export const answerFor = (question: AskQuestion, draft: AskDraft): string => {
  const typed = draft.custom[question.id]?.trim()
  if (typed) return typed

  const selected = draft.picks[question.id] ?? []

  return selected
    .map((optionId) => question.options.find((candidate) => candidate.id === optionId)?.label)
    .filter((label): label is string => Boolean(label))
    .join(', ')
}

/**
 * Every question with its answer, in the order they were asked - that order is part of the meaning, and
 * the agent recognises its question by the text rather than by the position (see the askAnswer message).
 */
export const answersOf = (
  questions: AskQuestion[],
  draft: AskDraft,
): { question: string; answer: string }[] =>
  questions.map((question) => ({ question: question.title, answer: answerFor(question, draft) }))

/** Whether there is something to send: every question has been answered. */
export const askAnswered = (questions: AskQuestion[], draft: AskDraft): boolean =>
  questions.length > 0 && questions.every((question) => answerFor(question, draft).length > 0)

/**
 * The first question still waiting for an answer, from [after] onwards - where the digit hotkeys go
 * next. -1 when there is none: the caller decides whether to stay where it is or send.
 *
 * It is also what points the digits on a card that has just been built again - somebody coming back to
 * the tab left off in the middle, not at the top.
 */
export const firstUnanswered = (questions: AskQuestion[], draft: AskDraft, after = -1): number =>
  questions.findIndex((question, index) => index > after && answerFor(question, draft).length === 0)

/** The draft of one question thrown away - the row was switched off, or the question is over. */
const withoutOwn = (custom: Record<string, string>, questionId: string): Record<string, string> => {
  if (custom[questionId] === undefined) return custom

  const next = { ...custom }
  delete next[questionId]
  return next
}

/**
 * The pasted paths put into an answer being written, without gluing them to the words around them: a
 * path stuck to the end of a sentence is a path nothing can open.
 */
const joinPaths = (head: string, paths: string[], tail: string): string => {
  const body = paths.join(' ')
  const before = head && !/\s$/.test(head) ? `${head} ` : head
  const after = tail && !/^\s/.test(tail) ? ` ${tail}` : tail

  return `${before}${body}${after}`
}
