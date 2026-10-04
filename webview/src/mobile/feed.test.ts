import { en } from '../i18n/en'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShellMessage } from '../protocol'
import { streamStatus } from '../feed/streamStatus'
import type { CardState } from '../hooks/useCardState'
import { RemoteClock } from './clock'
import { applyMessage, emptyFeed, feedTicks, restoreOverdue, RESTORE_PATIENCE_MS, settleRestore, tickFeed } from './feed'

/** Nothing expanded and nothing answered - the little of a card's state that streamStatus reads. */
const emptyCards: CardState = {
  isOpen: () => false,
  toggle: () => {},
  planDecisions: {},
  decidePlan: () => {},
  answeredAsks: [],
  answerAsk: () => {},
  reset: () => {},
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
   * The closing half of a restore is one frame like any other and can be lost - a queue that gave up on
   * this device, a frame over the relay's ceiling, a send the socket refused mid-batch. Lost, it used to
   * leave the conversation blank here for ever, with nothing on screen saying why.
   */
  it('does not wait for a restore that stopped arriving', () => {
    const started = applyMessage(
      emptyFeed(),
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
      1_000,
    )

    const collected = applyMessage(started, assistant('what did arrive'), 2_000)
    expect(collected.state.items).toHaveLength(0)

    const later = applyMessage(collected, assistant('half an hour later'), 2_000_000)

    expect(later.restoring).toBe(false)
    expect(later.state.items).toHaveLength(2)
  })

  /** And a restore that is merely slow is still applied in one go, which is the point of holding it. */
  it('goes on holding a restore that is still arriving', () => {
    const started = applyMessage(
      emptyFeed(),
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
      1_000,
    )

    const collecting = [
      [assistant('one'), 8_000],
      [assistant('two'), 15_000],
      [assistant('three'), 22_000],
    ].reduce((feed, [one, at]) => applyMessage(feed, one as ShellMessage, at as number), started)

    expect(collecting.restoring).toBe(true)
    expect(collecting.state.items).toHaveLength(0)
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

  /*
   * A phone handed only the end of a conversation, and a rewind at the desk to a message older than all of it:
   * the rewind says where the journal's cut began, and everything this phone holds came after that.
   */
  it('drops all it holds when a rewind cut further back than its tail reaches', () => {
    const echo = (uuid: string, text: string, seq: number) =>
      message({ type: 'promptEcho', sessionId: 'main', id: uuid, uuid, tokens: [{ kind: 'text', value: text }], seq })
    const feed = apply([
      message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
      { ...echo('u-5', 'fifth', 40) },
      { ...assistant('five'), seq: 41 } as ShellMessage,
      message({ type: 'restoreFinished', sessionId: 'main', upTo: 41 }),
      message({ type: 'rewound', sessionId: 'main', uuid: 'u-2', fromSeq: 12, seq: 42 }),
    ])

    expect(feed.state.items.some((item) => item.kind === 'user' || item.kind === 'text')).toBe(false)
    expect(feed.state.items.at(-1)).toMatchObject({ kind: 'checkpoint', targetKey: 'rewound' })
  })

  /*
   * The journal let its head go while the phone was watching, and the desk rewound to a message older than
   * everything left in it: the cut took all of the journal, from a number above the phone's first. What the
   * phone holds from that number on is dropped, so all of it came after the message.
   */
  it('drops all it holds when the journal let its head go and the cut took the rest', () => {
    const echo = (uuid: string, text: string, seq: number) =>
      message({ type: 'promptEcho', sessionId: 'main', id: uuid, uuid, tokens: [{ kind: 'text', value: text }], seq })
    const feed = apply([
      message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
      echo('u-28', 'from the morning', 2800),
      message({ type: 'restoreFinished', sessionId: 'main', upTo: 2800 }),
      echo('u-30', 'from the afternoon', 3000),
      message({ type: 'rewound', sessionId: 'main', uuid: 'u-25', fromSeq: 2900, seq: 3001 }),
    ])

    expect(feed.state.items.some((item) => item.kind === 'user')).toBe(false)
  })

  /* The same rewind read back from a journal it already cut: what came before the cut is what was kept. */
  it('keeps what it holds from before the cut when the rewind comes in a restore', () => {
    const echo = (uuid: string, text: string, seq: number) =>
      message({ type: 'promptEcho', sessionId: 'main', id: uuid, uuid, tokens: [{ kind: 'text', value: text }], seq })
    const feed = apply([
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
      echo('u-1', 'first', 1),
      { ...assistant('one'), seq: 2 } as ShellMessage,
      message({ type: 'rewound', sessionId: 'main', uuid: 'u-2', fromSeq: 3, seq: 9 }),
      message({ type: 'restoreFinished', sessionId: 'main', upTo: 9 }),
    ])

    expect(feed.state.items.filter((item) => item.kind === 'user')).toHaveLength(1)
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

  /**
   * A message's echo arrives live a moment before the restore that repeats it - the restore was asked for
   * with the number from before it. Applied twice, the phone drew the person's message twice. Written
   * from a resend on a reconnect (see outbox.ts), which lands exactly in that moment every time.
   */
  it('does not draw again what arrived live ahead of the restore that repeats it', () => {
    const echo = (seq: number): ShellMessage =>
      message({ type: 'promptEcho', sessionId: 'main', id: 'm-1', tokens: [{ kind: 'text', value: 'gamma' }], seq })

    const live = apply([assistant('before'), message({ type: 'status', sessionId: 'main', state: 'idle', seq: 4 }), echo(5)])

    const restored = [
      message({ type: 'restoreStarted', sessionId: 'main', from: 4 }),
      echo(5),
      message({ type: 'status', sessionId: 'main', state: 'running', seq: 6 }),
      message({ type: 'restoreFinished', sessionId: 'main', upTo: 6 }),
    ].reduce((feed, one) => applyMessage(feed, one), live)

    expect(restored.state.items.filter((item) => item.kind === 'user')).toHaveLength(1)
    expect(restored.state.status).toBe('running')
    expect(restored.seq).toBe(6)
  })

  /** From scratch nothing is on screen to repeat, and every entry of the restore is drawn. */
  it('draws every entry of a restore from scratch, whatever was there before', () => {
    const echo = message({ type: 'promptEcho', sessionId: 'main', id: 'm-1', tokens: [{ kind: 'text', value: 'gamma' }], seq: 5 })
    const live = apply([echo])

    const restored = [
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
      echo,
      message({ type: 'restoreFinished', sessionId: 'main', upTo: 5 }),
    ].reduce((feed, one) => applyMessage(feed, one), live)

    expect(restored.state.items.filter((item) => item.kind === 'user')).toHaveLength(1)
  })

  /**
   * A restore cut short is the end of the conversation with a gap before it. Kept under what was on
   * screen, the gap stood in the middle of the feed with no way to fill it - pages come from the top.
   */
  it('replaces what it has when a restore from a number is cut short', () => {
    const restore = [
      message({ type: 'restoreStarted', sessionId: 'main', from: 4, truncated: true }),
      assistant('today', 'u40'),
      message({ type: 'restoreFinished', sessionId: 'main', upTo: 90 }),
    ]

    const continued = restore.reduce((feed, one) => applyMessage(feed, one), apply([assistant('yesterday')]))

    expect(continued.state.items).toEqual(apply(restore).state.items)
    expect(continued.state.items[0]?.kind).toEqual('checkpoint')
    expect(continued.state.oldestEventUuid).toEqual('u40')
  })

  /**
   * The number a phone comes back with after a break is what it has drawn, not what has arrived. A line
   * that broke in the middle of a restore used to leave it at the last entry that arrived; the IDE began
   * the next restore from there, and the half that had been held went with the old one.
   */
  it('comes back from what it has drawn when a restore is broken off', () => {
    const collecting = [
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
      message({ type: 'agent', sessionId: 'main', seq: 11, event: { type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] } } }),
      message({ type: 'agent', sessionId: 'main', seq: 12, event: { type: 'assistant', message: { content: [{ type: 'text', text: 'two' }] } } }),
    ].reduce((feed, one) => applyMessage(feed, one, 1_000), emptyFeed())

    expect(collecting.restoring).toBe(true)
    expect(collecting.seq).toEqual(0)
  })

  /**
   * A restore whose closing half was lost, in a conversation where nothing else is happening: there is no
   * next message to notice the silence, and the screen stood on "Loading the conversation…" for good.
   * The screen asks the clock instead.
   */
  it('lets the clock end a restore that went quiet', () => {
    const collecting = [
      message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
      message({ type: 'agent', sessionId: 'main', seq: 11, event: { type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] } } }),
    ].reduce((feed, one) => applyMessage(feed, one, 1_000), emptyFeed())

    expect(restoreOverdue(collecting, 1_000 + RESTORE_PATIENCE_MS)).toBe(false)
    expect(restoreOverdue(collecting, 1_001 + RESTORE_PATIENCE_MS)).toBe(true)

    const settled = settleRestore(collecting, 1_001 + RESTORE_PATIENCE_MS)

    expect(settled.loaded).toBe(true)
    expect(settled.restoring).toBe(false)
    expect(settled.state.items).toHaveLength(1)
    expect(settled.seq).toEqual(11)
    // Nothing to end twice: a timer that fires late changes nothing.
    expect(settleRestore(settled, 5_000_000)).toBe(settled)
  })

  /** The closing half of a restore that the silence already ended applies nothing a second time. */
  it('takes the closing half of a restore already ended by its silence', () => {
    const settled = settleRestore(
      [
        message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
        assistant('one'),
      ].reduce((feed, one) => applyMessage(feed, one, 1_000), emptyFeed()),
      30_000,
    )

    const closed = applyMessage(settled, message({ type: 'restoreFinished', sessionId: 'main', upTo: 20 }), 31_000)

    expect(closed.state.items).toHaveLength(1)
    expect(closed.seq).toEqual(20)
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

  /**
   * A model changed by hand is not a swap the agent made behind one's back, and the phone has to be
   * told which of the two it is watching - it has no model button of its own to work it out from.
   * Without that it kept counting from the model the stream had named before the change, and the first
   * answer signed with the new one arrived on the phone as "switched by Claude Code, not by you" over
   * a change the person had just made at the desk.
   */
  it('says nothing about a model the person changed themselves', () => {
    const feed = apply([
      message({ type: 'agent', sessionId: 'main', event: { type: 'system', subtype: 'init', model: 'claude-fable-5' } }),
      assistant('on fable'),
      message({ type: 'model', sessionId: 'main', model: 'claude-opus-5[1m]', applied: true }),
      message({
        type: 'agent',
        sessionId: 'main',
        event: { type: 'assistant', message: { model: 'claude-opus-5[1m]', content: [{ type: 'text', text: 'on opus' }] } },
      }),
    ])

    expect(feed.state.items.filter((item) => item.kind === 'model')).toEqual([])
  })

  /**
   * The queue belongs to the conversation rather than to this page. It used to be a piece of the thread
   * screen's own state, worked through by an effect there - and a page in a pocket is thrown out by the
   * browser without warning, taking with it a message that was then neither sent nor waiting anywhere.
   */
  it('shows the queue the IDE is holding, and empties it when the IDE says so', () => {
    let feed = apply([
      assistant('working on it'),
      message({
        type: 'queue',
        sessionId: 'main',
        items: [{ id: 'q1', text: 'and then deploy', attach: '2 refs', images: 1 }],
      }),
    ])

    expect(feed.state.queue).toEqual([{ id: 'q1', text: 'and then deploy', attach: '2 refs', images: 1 }])

    feed = applyMessage(feed, message({ type: 'queue', sessionId: 'main', items: [] }))

    expect(feed.state.queue).toEqual([])
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

      expect(feed.state.oldestEventUuid).toEqual('u1')
    })

    it('is unset until an agent event with a uuid has arrived', () => {
      const feed = apply([message({ type: 'status', sessionId: 'main', state: 'running' })])

      expect(feed.state.oldestEventUuid).toBeUndefined()
    })

    /**
     * The stream carries a great deal the transcript never keeps - hook reports, status events, the
     * permission traffic. Anchored on one of those, the request asks for "everything before a line that
     * is not in the file", and the IDE answers with the file's own last page: the tap brought back the
     * messages already on screen (see ClaudeHistory.page).
     */
    it('is not taken from an event the transcript does not keep', () => {
      const hook = message({
        type: 'agent',
        sessionId: 'main',
        event: { type: 'system', subtype: 'hook_event', uuid: 'sys-1' },
      })

      const feed = apply([hook, assistant('one', 'u1')])

      expect(feed.state.oldestEventUuid).toEqual('u1')
    })

    it('prepends an earlier page and moves the anchor back to it', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        assistant('two', 'u2'),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 5 }),
      ])
      expect(feed.state.oldestEventUuid).toEqual('u2')

      const paged = applyMessage(
        feed,
        message({
          type: 'historyPage',
          sessionId: 'main',
          before: 'u2',
          entries: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] }, uuid: 'u1' } as never],
          cursor: 'u1',
        }),
      )

      expect(paged.state.oldestEventUuid).toEqual('u1')
      // The checkpoint stays, now above what was just loaded, because a cursor came back: there is more.
      expect(paged.state.items.map((item) => item.kind)).toEqual(['checkpoint', 'text', 'text'])
    })

    /**
     * The identifiers of the cards are positions in a feed (see push in panelState), so a page built in a
     * state of its own comes back numbered from zero - the very numbers the screen is already using. The
     * page used to be filtered against those numbers as though they meant "the same card", and most of
     * what was loaded disappeared on the way in.
     */
    it('keeps every card of a page whose numbering meets what is already on screen', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        assistant('three', 'u3'),
        assistant('four', 'u4'),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 5 }),
      ])

      const paged = applyMessage(
        feed,
        message({
          type: 'historyPage',
          sessionId: 'main',
          before: 'u3',
          entries: [
            { type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] }, uuid: 'u1' } as never,
            { type: 'assistant', message: { content: [{ type: 'text', text: 'two' }] }, uuid: 'u2' } as never,
          ],
          cursor: 'u1',
        }),
      )

      expect(paged.state.items.filter((item) => item.kind === 'text')).toHaveLength(4)
      expect(new Set(paged.state.items.map((item) => item.id)).size).toEqual(paged.state.items.length)
    })

    // A frame can go missing, the person taps again, and both answers arrive: applied twice, the same
    // messages would stand in the conversation twice over.
    /**
     * The guard against applying a page twice goes by the boundary on screen, and that boundary moves
     * with every page applied - except the one that reaches the beginning, where there is no new
     * boundary to move to. A person who taps, loses the frame, taps again and receives both answers saw
     * the first messages of the conversation twice.
     */
    it('ignores a second copy of the page that reached the beginning', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        assistant('the newest', 'u9'),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 5 }),
      ])

      const page = message({
        type: 'historyPage',
        sessionId: 'main',
        before: 'u9',
        entries: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'the very first' }] }, uuid: 'u1' }],
        cursor: undefined,
      })

      const once = applyMessage(feed, page)
      const twice = applyMessage(once, page)

      expect(once.state.items.filter((item) => item.kind === 'text')).toHaveLength(2)
      expect(twice.state.items.filter((item) => item.kind === 'text')).toHaveLength(2)
      expect(twice.state.reachedStart).toBe(true)
    })

    it('ignores a page that answers a boundary no longer on screen', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        assistant('two', 'u2'),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 5 }),
      ])

      const stale = applyMessage(
        feed,
        message({
          type: 'historyPage',
          sessionId: 'main',
          before: 'u9',
          entries: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] }, uuid: 'u1' } as never],
          cursor: 'u1',
        }),
      )

      expect(stale.state.items.filter((item) => item.kind === 'text')).toHaveLength(1)
      expect(stale.state.oldestEventUuid).toEqual('u2')
      // Counted all the same: the request was answered, and the screen unlocks its button by this.
      expect(stale.state.earlierPages).toEqual(1)
    })

    it('counts an answer that brought nothing, so the placeholder can be tapped again', () => {
      const feed = apply([assistant('two', 'u2')])

      const paged = applyMessage(feed, message({ type: 'historyPage', sessionId: 'main', before: 'u2', entries: [] }))

      expect(paged.state.earlierPages).toEqual(1)
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
          before: 'u2',
          entries: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] }, uuid: 'u1' } as never],
        }),
      )

      expect(paged.state.items.some((item) => item.kind === 'checkpoint')).toBe(false)
      expect(paged.state.items.map((item) => item.kind)).toEqual(['text', 'text'])
    })

    /**
     * A subagent's own events are kept in a file of their own rather than in the conversation's, so
     * anchored on one of them the request named a line the conversation's file does not hold - and was
     * answered with the file's newest page, the messages already on screen.
     */
    it('is not taken from a subagent\'s event', () => {
      const subagent = message({
        type: 'agent',
        sessionId: 'main',
        event: {
          type: 'assistant',
          parent_tool_use_id: 'toolu_1',
          message: { content: [{ type: 'text', text: 'inside' }] },
          uuid: 'sub-1',
        },
      })

      const feed = apply([subagent, assistant('one', 'u1')])

      expect(feed.state.oldestEventUuid).toEqual('u1')
    })

    /**
     * A tab running a workflow, opened on a phone: its recent traffic is the fleet's progress, and none of
     * it can be named for a request. The mark over the feed used to be a caption over nothing; the feed
     * asks for the newest page on disk instead, and that page is what it can name from then on.
     */
    it('takes the newest page on disk over a feed with nothing to name', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        message({
          type: 'agent',
          sessionId: 'main',
          event: { type: 'system', subtype: 'task_progress', task_id: 'wf', workflow_progress: [] },
        }),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 40 }),
      ])
      expect(feed.state.oldestEventUuid).toBeUndefined()

      const paged = applyMessage(
        feed,
        message({
          type: 'historyPage',
          sessionId: 'main',
          entries: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'launching' }] }, uuid: 'u7' } as never],
          cursor: 'u7',
        }),
      )

      expect(paged.state.items.filter((item) => item.kind === 'text')).toHaveLength(1)
      expect(paged.state.oldestEventUuid).toEqual('u7')
      expect(paged.state.items[0]?.kind).toEqual('checkpoint')
    })

    /**
     * And if something that can be named arrived while that page travelled, the page holds it too - the
     * newest page on disk is exactly where it went. Applied, it would stand twice; counted as answered,
     * the screen asks again from the name it now has.
     */
    it('ignores the newest page on disk once something on screen can be named', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 40 }),
        assistant('arrived live', 'u9'),
      ])

      const paged = applyMessage(
        feed,
        message({
          type: 'historyPage',
          sessionId: 'main',
          entries: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'arrived live' }] }, uuid: 'u9' } as never],
          cursor: 'u9',
        }),
      )

      expect(paged.state.items.filter((item) => item.kind === 'text')).toHaveLength(1)
      expect(paged.state.earlierPages).toEqual(1)
      expect(paged.state.lastPageRows).toEqual(0)
    })
  })

  describe('a past conversation opened in the tab', () => {
    const replayed = (text: string, uuid: string): ShellMessage =>
      message({
        type: 'agent',
        sessionId: 'main',
        replay: true,
        event: { type: 'assistant', message: { content: [{ type: 'text', text }] }, uuid },
      })

    /**
     * Opened from the history into a fresh tab, the journal is whole and the restore is not cut - so the
     * phone had no mark of its own, showed the replayed page with nothing above it, and could not load the
     * rest while the desk beside it could. The replay says what is above it; the phone now listens.
     */
    it('takes the replay\'s word about what lies above it', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
        replayed('page top', 'u50'),
        replayed('page end', 'u60'),
        message({ type: 'replayFinished', sessionId: 'main', cursor: 'u50' }),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 9 }),
      ])

      expect(feed.state.items[0]?.kind).toEqual('checkpoint')
      expect(feed.state.oldestEventUuid).toEqual('u50')
    })

    it('knows when the replay reached the beginning', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0 }),
        replayed('the whole of it', 'u1'),
        message({ type: 'replayFinished', sessionId: 'main' }),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 3 }),
      ])

      expect(feed.state.reachedStart).toBe(true)
      expect(feed.state.items.some((item) => item.kind === 'checkpoint')).toBe(false)
    })

    /**
     * A restore cut short holds the end of the replay: the top of the page it was cut from lies above a gap,
     * and anchored there the next page would skip what is between. The phone keeps its own boundary.
     */
    it('keeps its own boundary when it was handed only the end of the replay', () => {
      const feed = apply([
        message({ type: 'restoreStarted', sessionId: 'main', from: 0, truncated: true }),
        replayed('page end', 'u60'),
        message({ type: 'replayFinished', sessionId: 'main', cursor: 'u50' }),
        message({ type: 'restoreFinished', sessionId: 'main', upTo: 9 }),
      ])

      expect(feed.state.oldestEventUuid).toEqual('u60')
      expect(feed.state.items.filter((item) => item.kind === 'checkpoint')).toHaveLength(1)
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

      expect(streamStatus(en, feed.state, emptyCards, clock.now())).toBe('Claude is thinking · 0.0s')

      // Three seconds later by either clock. Read off the phone's own, the turn is still five seconds
      // short of having begun - which is the negative number people were seeing, and which the floor in
      // formatDuration now flattens into a counter stuck at zero. Neither is the time this turn has run.
      vi.setSystemTime(HERE + 3000)
      expect(streamStatus(en, feed.state, emptyCards, Date.now())).toBe('Claude is thinking · 0.0s')
      expect(streamStatus(en, feed.state, emptyCards, clock.now())).toBe('Claude is thinking · 3.0s')
    })

    it('moves the counters once asked to, without a message arriving', () => {
      const feed = running()
      expect(feedTicks(feed)).toBe(true)

      const ticked = tickFeed(feed, THERE + 4000)
      expect(ticked).not.toBe(feed)
      expect(streamStatus(en, ticked.state, emptyCards, THERE + 4000)).toContain('4.0s')
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
