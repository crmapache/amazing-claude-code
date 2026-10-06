import { describe, expect, it } from 'vitest'
import { answersOf, askReply } from '../feed/askDraft'
import type { AskQuestion } from '../feed/types'
import { canMoveOn, EMPTY_PHONE_ASK, finished, moveOn, onScreen, openOwn, pickOption, writeOwn } from './askSteps'

const question = (id: string, options: string[], multiSelect = false): AskQuestion => ({
  id,
  title: `Question ${id}`,
  hint: '',
  multiSelect,
  options: options.map((label, index) => ({ id: `o-${index}`, label, sub: '' })),
})

const single = question('q-0', ['Keep it', 'Drop it'])
const many = question('q-1', ['Tests', 'Docs', 'Types'], true)

describe('a question on a phone', () => {
  it('moves on from an ordinary question with the one press that answers it', () => {
    const held = pickOption(EMPTY_PHONE_ASK, single, 'o-1')

    expect(onScreen([single, many], held)).toBe(many)
    expect(finished([single], held)).toBe(true)
  })

  // The report: only one of the agent's options could be chosen from a phone - the first tick sent it.
  it('keeps a question that takes several ticks on the screen until the person moves on', () => {
    const ticked = pickOption(pickOption(EMPTY_PHONE_ASK, many, 'o-0'), many, 'o-2')

    expect(onScreen([many], ticked)).toBe(many)
    expect(finished([many], ticked)).toBe(false)

    const moved = moveOn(ticked, many)

    expect(finished([many], moved)).toBe(true)
    expect(askReply(answersOf([many], moved.draft)).answers).toEqual({ 'Question q-1': 'Tests, Types' })
  })

  // The report: a phone could not answer in its own words at all.
  it('answers in one\'s own words, and not with an empty field', () => {
    const opened = openOwn(EMPTY_PHONE_ASK, single)

    expect(canMoveOn(opened, single)).toBe(false)
    expect(moveOn(opened, single)).toBe(opened)

    const written = moveOn(writeOwn(opened, single, 'Neither - rename it'), single)

    expect(finished([single], written)).toBe(true)
    expect(askReply(answersOf([single], written.draft)).text).toBe('Question q-0\nNeither - rename it')
  })

  it('lets an option take the answer back from a field of one\'s own', () => {
    const held = pickOption(writeOwn(openOwn(EMPTY_PHONE_ASK, single), single, 'something'), single, 'o-0')

    expect(askReply(answersOf([single], held.draft)).answers).toEqual({ 'Question q-0': 'Keep it' })
  })

  it('sends nothing until every question is moved past', () => {
    const held = pickOption(EMPTY_PHONE_ASK, single, 'o-0')

    expect(finished([single, many], held)).toBe(false)
  })
})
