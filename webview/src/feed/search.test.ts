import { describe, expect, it } from 'vitest'
import type { SearchHit } from '../protocol'
import { chatHits, groupByChat, rowOf, snippetPieces } from './search'
import type { FeedItem } from './types'

const hit = (overrides: Partial<SearchHit>): SearchHit => ({
  conversationId: 'c1',
  uuid: 'u1',
  speaker: 'you',
  at: 0,
  title: 'A talk',
  named: false,
  messages: 0,
  length: 0,
  snippet: '',
  spans: [],
  text: '',
  truncated: false,
  ...overrides,
})

describe('the snippet is cut into painted and plain pieces', () => {
  it('paints by the spans the IDE measured', () => {
    expect(snippetPieces('why the balance is hidden', [[8, 15]])).toEqual([
      { text: 'why the ', hit: false },
      { text: 'balance', hit: true },
      { text: ' is hidden', hit: false },
    ])
  })

  it('tolerates spans that do not fit rather than painting nonsense', () => {
    expect(snippetPieces('short', [[3, 40]])).toEqual([{ text: 'short', hit: false }])
    expect(snippetPieces('ab', [[1, 2], [0, 1]])).toEqual([
      { text: 'a', hit: false },
      { text: 'b', hit: true },
    ])
  })
})

describe('the results are grouped by the conversation they are in', () => {
  it('keeps the order the results arrived in, groups and rows alike', () => {
    const hits = [
      hit({ uuid: 'a', conversationId: 'c1', title: 'One', at: 10, messages: 4 }),
      hit({ uuid: 'x', conversationId: 'c2', title: 'Two', at: 5 }),
      hit({ uuid: 'b', conversationId: 'c1', title: 'One', at: 30 }),
    ]

    const groups = groupByChat(hits)

    expect(groups.map((group) => group.conversationId)).toEqual(['c1', 'c2'])
    expect(groups[0]?.hits.map((one) => one.uuid)).toEqual(['a', 'b'])
    expect(groups[0]?.messages).toBe(4)
    // The heading says when that conversation was last spoken in, not when its best result was.
    expect(groups[0]?.at).toBe(30)
  })

  it('has nothing to group when nothing matched', () => {
    expect(groupByChat([])).toEqual([])
  })
})

describe('the arrows walk the hits of one conversation', () => {
  it('keeps only this conversation, in the order the messages stand in it', () => {
    const hits = [
      hit({ conversationId: 'c2', uuid: 'other', at: 50 }),
      hit({ conversationId: 'c1', uuid: 'late', at: 300 }),
      hit({ conversationId: 'c1', uuid: 'early', at: 100 }),
      hit({ conversationId: 'c1', uuid: 'middle', at: 200 }),
    ]

    expect(chatHits(hits, 'c1').map((one) => one.uuid)).toEqual(['early', 'middle', 'late'])
  })

  it('leaves messages without a time in the order they were found', () => {
    const hits = [hit({ uuid: 'first', at: 0 }), hit({ uuid: 'second', at: 0 }), hit({ uuid: 'timed', at: 5 })]

    expect(chatHits(hits, 'c1').map((one) => one.uuid)).toEqual(['first', 'second', 'timed'])
  })

  it('does not touch the list it was given', () => {
    const hits = [hit({ uuid: 'b', at: 2 }), hit({ uuid: 'a', at: 1 })]
    chatHits(hits, 'c1')

    expect(hits.map((one) => one.uuid)).toEqual(['b', 'a'])
  })
})

describe('a hit is found in the feed', () => {
  const items: FeedItem[] = [
    { id: 'user-1', kind: 'user', time: '10:00', tokens: [{ kind: 'text', value: 'why is the balance hidden?' }], quotes: [] },
    { id: 'i-2', kind: 'text', uuid: 'a1', paragraphs: [], source: 'Because of the role.' },
    { id: 'user-3', kind: 'user', uuid: 'u3', time: '10:01', tokens: [{ kind: 'text', value: 'ok' }], quotes: [] },
  ]

  it('by the transcript name when the feed knows it', () => {
    expect(rowOf(items, hit({ uuid: 'a1', speaker: 'claude' }))).toBe('i-2')
    expect(rowOf(items, hit({ uuid: 'u3' }))).toBe('user-3')
  })

  it('by the words for a live message of one own', () => {
    expect(rowOf(items, hit({ uuid: 'unknown', text: 'why is the balance hidden?' }))).toBe('user-1')
    expect(rowOf(items, hit({ uuid: 'unknown', text: 'why is the', truncated: true }))).toBe('user-1')
    expect(rowOf(items, hit({ uuid: 'unknown', text: 'why is the' }))).toBeUndefined()
  })

  it('never by the words for an answer - those always carry their name', () => {
    expect(rowOf(items, hit({ uuid: 'unknown', speaker: 'claude', text: 'Because of the role.' }))).toBeUndefined()
  })
})
