import { describe, expect, it } from 'vitest'
import type { Chip, UserToken } from './types'
import { voiceAppend, voiceGhost, voiceJoin } from './voice'

const text = (value: string): UserToken => ({ kind: 'text', value })

const chip = (): UserToken => ({ kind: 'chip', chip: { kind: 'file', value: 'src/App.tsx' } as Chip })

describe('a dictated phrase joining the draft', () => {
  it('starts an empty field without a space in front of it', () => {
    expect(voiceAppend([], 'add a button')).toEqual([text('add a button')])
  })

  it('is separated from what was already written', () => {
    expect(voiceAppend([text('add a button')], 'in the header')).toEqual([text('add a button in the header')])
  })

  /** The person left the caret after a space, or broke a line: the phrase starts where it stands. */
  it('adds no second space where one already stands', () => {
    expect(voiceAppend([text('add a button ')], 'here')).toEqual([text('add a button here')])
    expect(voiceAppend([text('first line\n')], 'second')).toEqual([text('first line\nsecond')])
  })

  /**
   * Han, kana and Thai write their words together, and a space between two of them is a space in the
   * middle of a word - which then travels to the agent inside the prompt.
   */
  it('runs two phrases together where the script has no spaces', () => {
    expect(voiceJoin('プロダクションを', '削除して')).toBe('プロダクションを削除して')
    expect(voiceJoin('删除', '生产环境')).toBe('删除生产环境')
    expect(voiceJoin('ลบ', 'ฐานข้อมูล')).toBe('ลบฐานข้อมูล')
  })

  /** Korean is not one of them: it spaces its words exactly as English does. */
  it('keeps the space between Korean phrases', () => {
    expect(voiceJoin('버튼을', '추가해')).toBe('버튼을 추가해')
  })

  /** One side in a spaced script is enough to want the space - a run-on join needs both. */
  it('keeps the space where the two phrases are in different scripts', () => {
    expect(voiceJoin('add a button', '見出しに')).toBe('add a button 見出しに')
    expect(voiceJoin('見出しに', 'add a button')).toBe('見出しに add a button')
  })

  /** An attachment is a thing, not a character - there is no last letter to ask about. */
  it('follows an attachment with a space', () => {
    expect(voiceAppend([chip()], 'needs a test')).toEqual([chip(), text(' needs a test')])
  })

  /**
   * Deepgram sends an empty final result for a pause it decided was the end of a phrase. The same array
   * comes back so that a caller can tell "nothing happened" by identity rather than by comparing text.
   */
  it('leaves the draft alone when the phrase is empty', () => {
    const draft = [text('unchanged')]

    expect(voiceAppend(draft, '')).toBe(draft)
    expect(voiceAppend(draft, '   ')).toBe(draft)
  })

  it('trims what the microphone left around the words', () => {
    expect(voiceAppend([], '  add a button  ')).toEqual([text('add a button')])
  })
})

/**
 * The phone's field holds a plain string rather than tokens (see mobile/screens/Composer), and both
 * screens have to join a phrase to it the same way - a rule that differs by screen is a rule somebody
 * finds out about in a sent message.
 */
describe('a phrase joining a plain-text draft', () => {
  it('follows the same rules as the panel', () => {
    expect(voiceJoin('', 'add a button')).toBe('add a button')
    expect(voiceJoin('add a button', 'in the header')).toBe('add a button in the header')
    expect(voiceJoin('add a button ', 'here')).toBe('add a button here')
    expect(voiceJoin('first line\n', 'second')).toBe('first line\nsecond')
  })

  it('leaves the draft alone when the phrase is empty', () => {
    expect(voiceJoin('unchanged', '  ')).toBe('unchanged')
  })
})

describe('the grey tail beside the caret', () => {
  it('shows the words being said', () => {
    expect(voiceGhost('and then')).toBe('and then')
  })

  /** A ghost that blinks in and out on every breath is worse than no ghost at all. */
  it('says nothing while there is nothing to say', () => {
    expect(voiceGhost('   ')).toBe('')
  })
})
