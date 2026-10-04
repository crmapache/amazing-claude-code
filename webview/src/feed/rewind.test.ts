import { describe, expect, it } from 'vitest'
import { forkBlocked, forkCodeOf, forkPointAfter, forkTakesCode, lastSeenUuid, newMessageUuid, pathParts, rewindable } from './rewind'
import type { FeedItem, UserItem } from './types'

const user = (id: string, uuid?: string, steering = false): UserItem => ({
  id,
  kind: 'user',
  time: '',
  tokens: [{ kind: 'text', value: id }],
  quotes: [],
  ...(uuid ? { uuid } : {}),
  ...(steering ? { steering: true } : {}),
})

const answer = (id: string): FeedItem => ({ id, kind: 'text', source: id, paragraphs: [] } as unknown as FeedItem)

describe('naming a message', () => {
  // The CLI keeps the name a client sends a message under only when it is a uuid it can write down.
  it('makes a version 4 uuid, a fresh one every time', () => {
    const one = newMessageUuid()
    expect(one).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newMessageUuid()).not.toBe(one)
  })

  it('says the newest named message on screen is the last one seen', () => {
    expect(lastSeenUuid([user('a', 'u-1'), answer('b'), user('c', 'u-2'), answer('d')])).toBe('u-2')
    expect(lastSeenUuid([user('a', 'u-1'), user('c')])).toBe('u-1')
    expect(lastSeenUuid([answer('b')])).toBeUndefined()
  })
})

describe('what can be rewound to', () => {
  it('is a named message of its own, and not one written into a running turn', () => {
    expect(rewindable(user('a', 'u-1'))).toBe('yes')
    expect(rewindable(user('a', 'u-1', true))).toBe('steering')
    expect(rewindable(user('a'))).toBe('unnamed')
  })
})

describe('where a fork from here stops', () => {
  const feed = [user('a', 'u-1'), answer('b'), user('c', 'u-2'), answer('d'), user('e', 'u-3'), answer('f')]

  it('stops before the next message of the person after the row', () => {
    expect(forkPointAfter(feed, 'b')).toEqual({ before: 'u-2', cut: true })
    expect(forkPointAfter(feed, 'a')).toEqual({ before: 'u-2', cut: true })
    expect(forkPointAfter(feed, 'd')).toEqual({ before: 'u-3', cut: true })
  })

  it('carries the conversation whole from the last turn - which is "up to here" exactly', () => {
    expect(forkPointAfter(feed, 'f')).toEqual({ cut: false })
  })

  it('says it could not cut when the next message has no name, rather than pretending', () => {
    expect(forkPointAfter([answer('b'), user('c')], 'b')).toEqual({ cut: false })
  })

  // A message written into a running turn has no clean "before" - the CLI filed it between that turn's steps,
  // and cut there the fork got half the turn, maybe a call without its answer. Rewinding to one is refused for
  // the same reason; the fork cuts at the next message that starts a turn of its own.
  it('cuts before the next message that starts a turn, past ones written into a running one', () => {
    const steered = [user('a', 'u-1'), answer('b'), user('c', 'u-2', true), answer('d'), user('e', 'u-3'), answer('f')]

    expect(forkPointAfter(steered, 'b')).toEqual({ before: 'u-3', cut: true })
  })

  it('carries the conversation whole when only messages written into a running turn come after', () => {
    expect(forkPointAfter([user('a', 'u-1'), answer('b'), user('c', 'u-2', true), answer('d')], 'b')).toEqual({ cut: false })
  })

  it('forks whole when the row is not in the feed', () => {
    expect(forkPointAfter(feed, 'gone')).toEqual({ cut: false })
    expect(forkPointAfter(feed, undefined)).toEqual({ cut: false })
  })
})

describe('pathParts', () => {
  it('splits a path into its name and its folder', () => {
    expect(pathParts('src/components/App.tsx')).toEqual({ name: 'App.tsx', folder: 'src/components' })
    expect(pathParts('~/.claude/projects/p/memory/note.md')).toEqual({ name: 'note.md', folder: '~/.claude/projects/p/memory' })
  })

  it('leaves a file at the root of the project with no folder', () => {
    expect(pathParts('rewind-demo.txt')).toEqual({ name: 'rewind-demo.txt', folder: '' })
  })

  it('reads a Windows path by its own separator', () => {
    expect(pathParts('src\\main\\App.kt')).toEqual({ name: 'App.kt', folder: 'src\\main' })
  })
})

describe('the dialog\'s "In a new tab"', () => {
  const ready = { state: 'ready' as const, files: ['a.ts'], count: 1, insertions: 1, deletions: 0 }

  // One rule for the desk and the phone: the phone used to fork and forget the code, without a word.
  it('takes the code along only when both were chosen and there is code to put back', () => {
    expect(forkTakesCode('both', ready)).toBe(true)
    expect(forkTakesCode('conversation', ready)).toBe(false)
    expect(forkTakesCode('both', { state: 'none' })).toBe(false)
    expect(forkTakesCode('both', undefined)).toBe(false)
  })

  // The code goes back in this tab while its turn carries on writing - refused every time, after the press.
  it('is held while a turn runs only when it would take the code along', () => {
    expect(forkBlocked('both', ready, true)).toBe(true)
    expect(forkBlocked('both', ready, false)).toBe(false)
    expect(forkBlocked('conversation', ready, true)).toBe(false)
  })

  it('reads the IDE\'s word for code it could not put back behind a fork', () => {
    expect(forkCodeOf('FORK_CODE|busy|')).toEqual({ reason: 'busy', detail: '' })
    expect(forkCodeOf('FORK_CODE|other|Failed to rewind: disk full')).toEqual({ reason: 'other', detail: 'Failed to rewind: disk full' })
    expect(forkCodeOf('Something else went wrong')).toBeNull()
  })
})
