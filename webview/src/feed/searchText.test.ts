import { describe, expect, it } from 'vitest'
import { foldWord, matchSpans, wordsOf } from './searchText'

describe('words are cut the way the IDE cuts them', () => {
  // The same examples as TextIndexTest on the IDE's side: the two rules have to agree.
  it('cuts camel case, digits and underscores into parts, and keeps the whole', () => {
    const terms = wordsOf('oldestEventUuid utf8 HTTPServer snake_case Ёлка café').map((word) => word.term)

    expect(terms).toContain('oldesteventuuid')
    expect(terms).toEqual(expect.arrayContaining(['oldest', 'event', 'uuid']))
    expect(terms).toEqual(expect.arrayContaining(['utf', '8']))
    expect(terms).toEqual(expect.arrayContaining(['http', 'server']))
    expect(terms).toEqual(expect.arrayContaining(['snake', 'case']))
    expect(terms).toContain('елка')
    expect(terms).toContain('cafe')
  })

  it('folds as the index folds', () => {
    expect(foldWord('Ёлка')).toBe('елка')
    expect(foldWord('Café')).toBe('cafe')
    expect(foldWord('Deepgram')).toBe('deepgram')
  })

  it('paints the matched words where they stand, a part inside a painted run only once', () => {
    const text = 'the oldestEventUuid moved, event by event'

    expect(matchSpans(text, [{ term: 'event', paint: 5 }])).toEqual([
      [10, 15],
      [27, 32],
      [36, 41],
    ])
    expect(matchSpans(text, [{ term: 'oldesteventuuid', paint: 15 }, { term: 'event', paint: 5 }])).toEqual([
      [4, 19],
      [27, 32],
      [36, 41],
    ])
    expect(matchSpans(text, [])).toEqual([])
  })

  // The same examples as TextIndexTest on the IDE's side: the paint is the term's own say.
  it('paints only as far as the term says - the typed part of a word found by its beginning', () => {
    const text = 'the useSelection hook and the UserCard chip'

    expect(matchSpans(text, [{ term: 'useselection', paint: 3 }, { term: 'use', paint: 3 }, { term: 'usercard', paint: 3 }, { term: 'user', paint: 3 }])).toEqual([
      [4, 7],
      [30, 33],
    ])
    expect(matchSpans('почему Deepgram молчит', [{ term: 'deepgram', paint: 6 }])).toEqual([[7, 13]])
  })

  it('keeps to whole runs and to the typed case when the term asks for it', () => {
    const text = 'a Member of the team, every member, and the memberCard'

    expect(matchSpans(text, [{ term: 'member', paint: 6, whole: true }])).toEqual([
      [2, 8],
      [28, 34],
    ])
    expect(matchSpans(text, [{ term: 'member', paint: 6, text: 'Member' }])).toEqual([[2, 8]])
    expect(matchSpans(text, [{ term: 'member', paint: 6, text: 'member' }])).toEqual([
      [28, 34],
      [44, 50],
    ])
    expect(matchSpans(text, [{ term: 'member', paint: 3, text: 'mem' }])).toEqual([
      [28, 31],
      [44, 47],
    ])
  })
})
