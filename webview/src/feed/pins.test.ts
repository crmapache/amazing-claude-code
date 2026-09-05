import { describe, expect, it } from 'vitest'
import { PIN_LIMIT, isPinnable, pinHint, pinLine, pinnedRows, togglePin } from './pins'
import type { FeedRowItem, TextItem, UserItem } from './types'

const sent = (id: string, text: string, extra: Partial<UserItem> = {}): UserItem => ({
  id,
  kind: 'user',
  time: '19:05',
  tokens: [{ kind: 'text', value: text }],
  quotes: [],
  ...extra,
})

const answered = (id: string, text: string): TextItem => ({
  id,
  kind: 'text',
  paragraphs: [{ parts: [{ text }] }],
  source: text,
})

describe('what can be pinned', () => {
  it('takes a message and an answer and nothing else', () => {
    expect(isPinnable(sent('user-1', 'hi'))).toBe(true)
    expect(isPinnable(answered('i-2', 'there'))).toBe(true)
    expect(isPinnable({ id: 'i-3', kind: 'think', thoughts: ['hm'], pending: false })).toBe(false)
  })
})

describe('pinning and unpinning', () => {
  it('pins, and pins the same one off again', () => {
    expect(togglePin([], 'user-1')).toEqual(['user-1'])
    expect(togglePin(['user-1', 'i-2'], 'user-1')).toEqual(['i-2'])
  })

  /**
   * A fourth is refused rather than let in over the oldest: a pin is a mark somebody put there on purpose,
   * and dropping one of three to make room throws away exactly that. Nothing about it is a surprise - the
   * buttons of everything unpinned are dead by then, and their hint asks for one to be taken off first.
   */
  it('takes no fourth, and hands back the very same list', () => {
    const full = ['a', 'b', 'c']
    expect(full).toHaveLength(PIN_LIMIT)
    expect(togglePin(full, 'd')).toBe(full)
  })

  /** Unpinning still works with the strip full - otherwise there would be no way out of it at all. */
  it('lets one go even when the strip is full', () => {
    expect(togglePin(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })
})

describe('the strip', () => {
  const rows: FeedRowItem[] = [sent('user-1', 'first'), answered('i-2', 'second'), sent('user-3', 'third')]

  it('stands in the order of the conversation, not of the pinning', () => {
    expect(pinnedRows(rows, ['user-3', 'user-1']).map((item) => item.id)).toEqual(['user-1', 'user-3'])
  })

  /** A conversation cleared, a journal replayed afresh: the pin names a row that is not there any more. */
  it('drops a pin whose row has left the feed', () => {
    expect(pinnedRows(rows, ['user-1', 'gone'])).toHaveLength(1)
  })

  it('is empty when nothing is pinned', () => {
    expect(pinnedRows(rows, [])).toEqual([])
  })
})

describe('what a pinned message shows', () => {
  it('puts a sent message on a single line, chips wearing their captions', () => {
    const item = sent('user-1', 'put the logos in ', {
      tokens: [
        { kind: 'text', value: 'the logos\nfrom ' },
        { kind: 'chip', chip: { kind: 'file', value: '/Users/max/Downloads/export/logo.svg' } },
      ],
    })

    expect(pinLine(item)).toBe('the logos from logo.svg')
  })

  it('keeps the quote a message was asked over', () => {
    const item = sent('user-1', 'but why?', { quotes: ['the build is green'] })
    expect(pinLine(item)).toBe('> the build is green but why?')
  })

  it('reads an answer as plain text', () => {
    expect(pinLine(answered('i-2', 'The logo is two slanted bars.'))).toBe('The logo is two slanted bars.')
  })

  /**
   * One element draws every hint in the panel and it is 220 pixels wide: text that gets past here unfolds
   * into a strip down the whole window with no way to scroll it (see chipTitle and tooltip.module.css).
   */
  it('cuts both the line and the hint, however much was pasted', () => {
    const item = answered('i-2', Array.from({ length: 400 }, (_, at) => `line ${at}`).join('\n'))

    expect(pinLine(item).length).toBeLessThan(220)
    expect(pinLine(item).endsWith('…')).toBe(true)
    expect(pinHint(item).split('\n').length).toBeLessThanOrEqual(6)
  })
})
