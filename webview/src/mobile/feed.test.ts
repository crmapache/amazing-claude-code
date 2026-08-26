import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShellMessage } from '../protocol'
import { streamStatus } from '../feed/streamStatus'
import type { CardState } from '../hooks/useCardState'
import { RemoteClock } from './clock'
import { applyMessage, emptyFeed, feedTicks, tickFeed } from './feed'

/** Nothing expanded and nothing answered - the little of a card's state that streamStatus reads. */
const emptyCards: CardState = {
  isOpen: () => false,
  toggle: () => {},
  planDecisions: {},
  decidePlan: () => {},
  answeredAsks: [],
  answerAsk: () => {},
}

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The phone builds a conversation out of the same messages the panel does, with the same reducer.
 *
 * What is worth testing is not the reducer - it has a hundred and sixty tests of its own - but the
 * handful of decisions this file makes around it: what to collect and when to apply it, which number
 * to remember for a reconnect, and what to ignore. Each of those has a way of going wrong that shows
 * up as "the phone shows a slightly different conversation", which is the one outcome that would make
 * the whole feature not worth having.
 */

const message = (body: Partial<ShellMessage> & { type: string }): ShellMessage => body as ShellMessage

// Never `reduce(applyMessage, ...)` directly: reduce hands the index along as a third argument, and
// applyMessage's third argument is the time it stands the clockless messages at.
const apply = (messages: ShellMessage[]) => messages.reduce((feed, one) => applyMessage(feed, one), emptyFeed())

const assistant = (text: string, uuid?: string): ShellMessage =>
  message({
    type: 'agent',
    sessionId: 'main',
    event: { type: 'assistant', message: { content: [{ type: 'text', text }] }, ...(uuid ? { uuid } : {}) },
  })

describe('the phone building a conversation', () => {
  it('remembers the number to come back with', () => {
    const feed = apply([
      message({ type: 'status', sessionId: 'main', state: 'running', seq: 7 }),
      assistant('hello'),
    ])

    expect(feed.seq).toBeGreaterThanOrEqual(7)
  })

  /**
   * "Nothing here" and "nothing has arrived" look identical on a screen and mean opposite things: the
   * second one is a conversation the IDE never handed over, and showing it as an empty one invited a
   * first message into a tab that already had a hundred.
   */
  it('knows the difference between an empty conversation and one that has not arrived', () => {
    expect(emptyFeed().loaded).toBe(false)

    const empty = apply([
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
      message({ type: 'restoreFinished', sessionId: 'main', upTo: 0 }),
    ])

    expect(empty.loaded).toBe(true)
    expect(empty.state.items).toHaveLength(0)
  })

  it('counts a live message as having arrived too', () => {
    expect(apply([assistant('hello')]).loaded).toBe(true)
  })

  /**
   * A restore is applied as one change rather than entry by entry: a couple of thousand entries applied
   * one at a time is a couple of thousand renders, on the device least able to afford them.
   */
  it('holds a restored feed back until it is complete', () => {
    const started = applyMessage(
      emptyFeed(),
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
    )

    const collecting = [assistant('one'), assistant('two')].reduce((feed, one) => applyMessage(feed, one), started)

    expect(collecting.restoring).toBe(true)
    expect(collecting.state.items).toHaveLength(0)

    const done = applyMessage(collecting, message({ type: 'restoreFinished', sessionId: 'main', upTo: 12 }))

    expect(done.restoring).toBe(false)
    expect(done.state.items).toHaveLength(2)
    expect(done.seq).toEqual(12)
  })

  /**
   * A journal that has lost its head has to say so: silence there reads as "this is the whole
   * conversation", which is the one thing it is not.
   */
  it('marks a beginning that is no longer kept', () => {
    const feed = apply([
      message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
      assistant('carrying on'),
      message({ type: 'restoreFinished', sessionId: 'main', upTo: 5 }),
    ])

    expect(feed.state.items[0]?.kind).toEqual('checkpoint')
  })

  /** From nothing means the tab holds another conversation's remains rather than a shorter version. */
  it('clears what was there when the restore starts from nothing', () => {
    const withContent = apply([assistant('an older conversation')])

    const restarted = applyMessage(
      withContent,
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
    )

    expect(restarted.state.items).toHaveLength(0)
  })

  /** A partial restore keeps what is already on screen: only the tail is coming. */
  it('keeps what it has when the restore continues from a number', () => {
    const withContent = apply([assistant('what came before')])

    const continued = applyMessage(
      withContent,
      message({ type: 'restoreStarted', sessionId: 'main', from: 4 }),
    )

    expect(continued.state.items).toHaveLength(1)
  })

  /** A person's message reaches the phone as an echo - without it the feed is answers with no questions. */
  it('puts a person\'s message into the feed', () => {
    const feed = apply([
      message({
        type: 'promptEcho',
        sessionId: 'main',
        tokens: [{ kind: 'text', value: 'fix the failing test' }],
        quotes: [],
      }),
    ])

    expect(feed.state.items[0]?.kind).toEqual('user')
  })

  /** The answer being printed when this phone joined - without it a live turn looks frozen. */
  it('shows an answer that was already being printed', () => {
    const feed = apply([
      message({ type: 'streamingText', sessionId: 'main', text: 'Half a sen', thinking: '' }),
    ])

    expect(feed.state.streamingText).toEqual('Half a sen')
  })

  it('takes a permission and lets it be answered', () => {
    const asked = apply([
      message({
        type: 'permission',
        sessionId: 'main',
        id: 'perm-1',
        toolName: 'Write',
        target: 'src/auth.ts',
        command: 'write',
        mode: 'manual',
      }),
    ])

    expect(asked.state.items.some((item) => item.kind === 'perm' && item.decision === null)).toBe(true)

    const answered = applyMessage(
      asked,
      message({ type: 'permissionResolved', sessionId: 'main', id: 'perm-1', decision: 'once' }),
    )

    expect(answered.state.items.some((item) => item.kind === 'perm' && item.decision === null)).toBe(false)
  })

  /** A conversation replaced by another one starts over rather than having a second appended to it. */
  it('starts over when the conversation is reset', () => {
    const feed = apply([assistant('the old conversation'), message({ type: 'sessionReset', sessionId: 'main' })])

    expect(feed.state.items).toHaveLength(0)
  })

  /**
   * The anchor a "load earlier" request is built on (see feed/streamStatus and mobile/App.tsx) - the
   * uuid Claude Code stamps every transcript line with, captured from the very first agent event this
   * feed has ever seen and left alone after that: a live message arriving later is always newer, and
   * only a historyPage response is allowed to push the boundary further back.
   */
  describe('the anchor for loading earlier messages', () => {
    it('is taken from the first agent event', () => {
      const feed = apply([assistant('one', 'u1'), assistant('two', 'u2')])

      expect(feed.oldestEventUuid).toEqual('u1')
    })

    it('is null until an agent event with a uuid has arrived', () => {
      const feed = apply([message({ type: 'status', sessionId: 'main', state: 'running' })])

      expect(feed.oldestEventUuid).toBeNull()
    })

    it('prepends an earlier page and moves the anchor back to it', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        assistant('two', 'u2'),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 5 }),
      ])
      expect(feed.oldestEventUuid).toEqual('u2')

      const paged = applyMessage(
        feed,
        message({
          type: 'historyPage',
          sessionId: 'main',
          entries: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] }, uuid: 'u1' } as never],
          cursor: 'u1',
        }),
      )

      expect(paged.oldestEventUuid).toEqual('u1')
      // The checkpoint stays, now above what was just loaded, because a cursor came back: there is more.
      expect(paged.state.items.map((item) => item.kind)).toEqual(['checkpoint', 'text', 'text'])
    })

    it('drops the placeholder once a page comes back with nothing further to load', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        assistant('two', 'u2'),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 5 }),
      ])

      const paged = applyMessage(
        feed,
        message({
          type: 'historyPage',
          sessionId: 'main',
          entries: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] }, uuid: 'u1' } as never],
        }),
      )

      expect(paged.state.items.some((item) => item.kind === 'checkpoint')).toBe(false)
      expect(paged.state.items.map((item) => item.kind)).toEqual(['text', 'text'])
    })
  })

  /**
   * The protocol grows, and a client that guesses at what it does not know breaks on the next release.
   * Skipping is the whole of the handling.
   */
  it('ignores what it has no screen for', () => {
    const before = apply([assistant('hello')])
    const after = applyMessage(before, message({ type: 'plugins', installed: [], available: [] }))

    expect(after).toBe(before)
  })

  /**
   * The counters, and the two clocks they are caught between.
   *
   * Everything in this state is measured in the IDE's time, because that is what the messages are
   * stamped with. Answering "how long has this been running" against the device's own clock subtracts
   * one machine's time from another's - and that is how a turn came to open at a negative number on a
   * phone whose clock ran ahead of the machine's.
   */
  describe('counting time', () => {
    /** The IDE thinks it is this moment; the phone in the hand is five seconds behind it. */
    const THERE = 1_700_000_000_000
    const HERE = THERE - 5000

    const running = () =>
      applyMessage(
        emptyFeed(),
        message({ type: 'status', sessionId: 'main', state: 'running', seq: 1, at: THERE }),
        THERE,
      )

    it('starts a turn on the clock the messages are stamped with', () => {
      expect(running().state.turnStartedAt).toBe(THERE)
    })

    it('counts against the IDE clock rather than the phone own', () => {
      vi.useFakeTimers()
      vi.setSystemTime(HERE)

      const feed = running()
      const clock = new RemoteClock()
      clock.observe(THERE)

      expect(streamStatus(feed.state, emptyCards, clock.now())).toBe('Claude is thinking · 0.0s')

      // Three seconds later by either clock. Read off the phone's own, the turn is still five seconds
      // short of having begun - which is the negative number people were seeing, and which the floor in
      // formatDuration now flattens into a counter stuck at zero. Neither is the time this turn has run.
      vi.setSystemTime(HERE + 3000)
      expect(streamStatus(feed.state, emptyCards, Date.now())).toBe('Claude is thinking · 0.0s')
      expect(streamStatus(feed.state, emptyCards, clock.now())).toBe('Claude is thinking · 3.0s')
    })

    it('moves the counters once asked to, without a message arriving', () => {
      const feed = running()
      expect(feedTicks(feed)).toBe(true)

      const ticked = tickFeed(feed, THERE + 4000)
      expect(ticked).not.toBe(feed)
      expect(streamStatus(ticked.state, emptyCards, THERE + 4000)).toContain('4.0s')
    })

    /** A finished conversation has nothing to move - and a phone must not wake its screen for nothing. */
    it('does not tick over a conversation that has finished', () => {
      const idle = applyMessage(
        running(),
        message({ type: 'status', sessionId: 'main', state: 'idle', seq: 2, at: THERE + 1000 }),
        THERE + 1000,
      )

      expect(feedTicks(idle)).toBe(false)
      expect(tickFeed(idle, THERE + 9000)).toBe(idle)
    })
  })
})
