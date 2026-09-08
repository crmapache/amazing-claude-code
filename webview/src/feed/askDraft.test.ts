import { describe, expect, it } from 'vitest'
import {
  answerFor,
  answersOf,
  askAnswered,
  EMPTY_ASK_DRAFT,
  firstUnanswered,
  openOwnAnswer,
  pasteIntoOwnAnswer,
  togglePick,
  writeOwnAnswer,
} from './askDraft'
import type { AskQuestion } from './types'

const question = (id: string, options: string[], multiSelect = false): AskQuestion => ({
  id,
  title: `Question ${id}`,
  hint: '',
  multiSelect,
  options: options.map((label, index) => ({ id: `o-${index}`, label, sub: '' })),
})

const single = question('q-0', ['Keep it', 'Drop it'])
const many = question('q-1', ['Tests', 'Docs', 'Types'], true)

describe('picking an option', () => {
  it('replaces the answer to an ordinary question', () => {
    const draft = togglePick(togglePick(EMPTY_ASK_DRAFT, single, 'o-0'), single, 'o-1')

    expect(draft.picks['q-0']).toEqual(['o-1'])
  })

  it('adds and removes a tick in a multiSelect one', () => {
    const both = togglePick(togglePick(EMPTY_ASK_DRAFT, many, 'o-0'), many, 'o-2')
    expect(both.picks['q-1']).toEqual(['o-0', 'o-2'])

    expect(togglePick(both, many, 'o-0').picks['q-1']).toEqual(['o-2'])
  })

  /**
   * The two ways of answering a single-choice question cannot both stand: an option pressed after
   * something was typed into Other means the typing is no longer the answer.
   */
  it('switches the Other row off in an ordinary question', () => {
    const typed = writeOwnAnswer(openOwnAnswer(EMPTY_ASK_DRAFT, single), single, 'something else')

    expect(togglePick(typed, single, 'o-0').custom['q-0']).toBeUndefined()
  })

  it('leaves the Other row alone in a multiSelect one - there it is a tick like any other', () => {
    const typed = writeOwnAnswer(openOwnAnswer(EMPTY_ASK_DRAFT, many), many, 'and benchmarks')

    expect(togglePick(typed, many, 'o-0').custom['q-1']).toBe('and benchmarks')
  })
})

describe('the answer in one own words', () => {
  it('opens empty rather than absent - the row is on, nothing is written', () => {
    expect(openOwnAnswer(EMPTY_ASK_DRAFT, single).custom['q-0']).toBe('')
  })

  /** Pressing the open row again must not wipe what is being written into it. */
  it('keeps what was typed when the row is opened a second time', () => {
    const typed = writeOwnAnswer(openOwnAnswer(EMPTY_ASK_DRAFT, single), single, 'half a thought')

    expect(openOwnAnswer(typed, single)).toBe(typed)
  })

  it('takes the answer over from the options of an ordinary question', () => {
    const picked = togglePick(EMPTY_ASK_DRAFT, single, 'o-0')

    expect(openOwnAnswer(picked, single).picks['q-0']).toEqual([])
  })

  it('wins over the ticks when it has words in it', () => {
    const draft = writeOwnAnswer(openOwnAnswer(togglePick(EMPTY_ASK_DRAFT, many, 'o-0'), many), many, 'benchmarks')

    expect(answerFor(many, draft)).toBe('benchmarks')
  })

  it('leaves the ticks answering while it stands empty', () => {
    const draft = openOwnAnswer(togglePick(EMPTY_ASK_DRAFT, many, 'o-0'), many)

    expect(answerFor(many, draft)).toBe('Tests')
  })

  it('takes a pasted path at the caret, spaced away from the words around it', () => {
    const draft = writeOwnAnswer(openOwnAnswer(EMPTY_ASK_DRAFT, single), single, 'look at and say')

    expect(pasteIntoOwnAnswer(draft, single, ['src/App.tsx'], 8, 8).custom['q-0']).toBe(
      'look at src/App.tsx and say',
    )
  })
})

describe('what travels to the agent', () => {
  it('lists the questions in the order they were asked, ticks joined by commas', () => {
    const draft = togglePick(togglePick(togglePick(EMPTY_ASK_DRAFT, single, 'o-1'), many, 'o-0'), many, 'o-1')

    expect(answersOf([single, many], draft)).toEqual([
      { question: 'Question q-0', answer: 'Drop it' },
      { question: 'Question q-1', answer: 'Tests, Docs' },
    ])
  })

  it('is not ready while a single question stands unanswered', () => {
    const half = togglePick(EMPTY_ASK_DRAFT, single, 'o-0')

    expect(askAnswered([single, many], half)).toBe(false)
    expect(askAnswered([single, many], togglePick(half, many, 'o-0'))).toBe(true)
  })

  /** A card without questions cannot be answered at all - see the send button in AskPanel. */
  it('is not ready for a call that carries no questions', () => {
    expect(askAnswered([], EMPTY_ASK_DRAFT)).toBe(false)
  })
})

describe('where the digits point', () => {
  it('goes to the next question still waiting', () => {
    const draft = togglePick(EMPTY_ASK_DRAFT, single, 'o-0')

    expect(firstUnanswered([single, many], draft, 0)).toBe(1)
  })

  it('answers -1 when everything below has been answered', () => {
    const draft = togglePick(togglePick(EMPTY_ASK_DRAFT, single, 'o-0'), many, 'o-0')

    expect(firstUnanswered([single, many], draft, 0)).toBe(-1)
  })

  /**
   * A card built again over a draft - somebody came back to the tab. The digits belong where they left
   * off rather than at the top, which is answered by the same rule from before the first question.
   */
  it('starts at the first unanswered question of a restored draft', () => {
    const draft = togglePick(EMPTY_ASK_DRAFT, single, 'o-0')

    expect(firstUnanswered([single, many], draft)).toBe(1)
    expect(firstUnanswered([single, many], EMPTY_ASK_DRAFT)).toBe(0)
  })
})
