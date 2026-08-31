import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../protocol'
import { reducePanel } from './build'
import { initialPanelState, type PanelAction, type PanelState } from './panelState'

/**
 * A tab opens a past conversation with its end rather than the whole of it, and asks for the rest a page
 * at a time (see ClaudeHistory.opening on the plugin's side). What is checked here is the seam between
 * the two: which message the next page is asked for, where a page that arrives is put, and when the
 * offer to load more should disappear.
 *
 * It matters because the alternative to paging was what shipped: the whole transcript went into the
 * panel at once, in batches of about a megabyte, and on Windows a conversation opened from the history
 * came up empty.
 */

const feed = (actions: PanelAction[], at = 1_000): PanelState =>
  actions.reduce((state, action) => reducePanel(state, action, at), initialPanelState)

const assistant = (body: string, uuid?: string): AgentEvent =>
  ({ type: 'assistant', message: { content: [{ type: 'text', text: body }] }, ...(uuid ? { uuid } : {}) }) as AgentEvent

const replayed = (body: string, uuid: string): PanelAction => ({
  kind: 'agent',
  event: assistant(body, uuid),
  replay: true,
})

const said = (state: PanelState): string[] =>
  state.items.map((item) => {
    if (item.kind === 'text') return `text:${item.source}`
    if (item.kind === 'checkpoint') return `mark:${item.chip}`
    return item.kind
  })

describe('a conversation opened from the history', () => {
  it('anchors the next page on the topmost message it was given', () => {
    const opened = feed([replayed('older', 'u1'), replayed('newer', 'u2')])

    expect(opened.oldestEventUuid).toEqual('u1')
  })

  /**
   * The stream carries a great deal the transcript never keeps - status changes, hook reports, the
   * permission traffic. Anchored on one of those, the request would ask for "everything before a line
   * that is not in the file", and the answer to that is the file's own end: the same messages again.
   */
  it('does not anchor on an event the transcript keeps no record of', () => {
    const opened = feed([
      { kind: 'agent', event: { type: 'system', subtype: 'hook_response', uuid: 'h1' } as never, replay: true },
      replayed('first real one', 'u7'),
    ])

    expect(opened.oldestEventUuid).toEqual('u7')
  })

  it('offers to load more when the replay stopped mid-conversation', () => {
    const opened = feed([replayed('tail', 'u9'), { kind: 'replayFinished', cursor: 'u9' }])

    expect(said(opened)).toEqual(['mark:EARLIER', 'text:tail'])
    expect(opened.oldestEventUuid).toEqual('u9')
    expect(opened.reachedStart).toBe(false)
  })

  /** The whole conversation fitted: there is nothing above it, and nothing to press. */
  it('offers nothing when the beginning is already on screen', () => {
    const opened = feed([replayed('all of it', 'u1'), { kind: 'replayFinished', cursor: null }])

    expect(said(opened)).toEqual(['text:all of it'])
    expect(opened.reachedStart).toBe(true)
  })

  /**
   * A phone is never sent a replay at all - it is handed the end of the result once the reading is over
   * (see RemoteFeed.isReplayLine), so it has a boundary of its own and this message says nothing about
   * it. Saying "the beginning is on screen" to it by default would take its own button away.
   */
  it('leaves the boundary alone when nothing was said about it', () => {
    const opened = feed([replayed('tail', 'u9'), { kind: 'replayFinished' }])

    expect(opened.oldestEventUuid).toEqual('u9')
    expect(opened.reachedStart).toBe(false)
  })
})

describe('a page of earlier messages', () => {
  const opened = feed([replayed('tail', 'u5'), { kind: 'replayFinished', cursor: 'u5' }])

  it('goes above what is on screen, with the mark above it in turn', () => {
    const paged = reducePanel(
      opened,
      { kind: 'historyPage', before: 'u5', entries: [assistant('older', 'u4')], cursor: 'u4' },
      2_000,
    )

    expect(said(paged)).toEqual(['mark:EARLIER', 'text:older', 'text:tail'])
    expect(paged.oldestEventUuid).toEqual('u4')
  })

  it('takes the mark away once the beginning is reached', () => {
    const paged = reducePanel(
      opened,
      { kind: 'historyPage', before: 'u5', entries: [assistant('the very first', 'u1')] },
      2_000,
    )

    expect(said(paged)).toEqual(['text:the very first', 'text:tail'])
    expect(paged.reachedStart).toBe(true)
  })

  /**
   * Numbered on from the feed's own counter. A page built in a state of its own would come back carrying
   * the identifiers the screen is already using, and two cards under one key is a page that half
   * disappears.
   */
  it('gives the loaded messages identifiers of their own', () => {
    const paged = reducePanel(
      opened,
      { kind: 'historyPage', before: 'u5', entries: [assistant('older', 'u4'), assistant('older still', 'u3')] },
      2_000,
    )

    const ids = paged.items.map((item) => item.id)
    expect(new Set(ids).size).toEqual(ids.length)
  })

  /**
   * Two answers to two presses over a lost frame: the second describes a boundary that has already moved,
   * and applying it would put the same messages in twice.
   */
  it('is ignored when it answers a boundary no longer on screen', () => {
    const stale = reducePanel(
      opened,
      { kind: 'historyPage', before: 'u404', entries: [assistant('older', 'u4')], cursor: 'u4' },
      2_000,
    )

    expect(said(stale)).toEqual(['mark:EARLIER', 'text:tail'])
    // Counted all the same: the request was answered, and a screen unlocks its control by this.
    expect(stale.earlierPages).toEqual(1)
  })

  it('is ignored a second time over once the beginning has been reached', () => {
    const first = reducePanel(
      opened,
      { kind: 'historyPage', before: 'u5', entries: [assistant('the very first', 'u1')] },
      2_000,
    )
    const again = reducePanel(
      first,
      { kind: 'historyPage', before: 'u5', entries: [assistant('the very first', 'u1')] },
      3_000,
    )

    expect(again.items.filter((item) => item.kind === 'text')).toHaveLength(2)
    expect(again.earlierPages).toEqual(2)
  })

  /** An answer that brought nothing is an answer: the control has to come back to life after it. */
  it('counts an empty answer', () => {
    const paged = reducePanel(opened, { kind: 'historyPage', before: 'u5', entries: [] }, 2_000)

    expect(paged.earlierPages).toEqual(1)
  })

  /** Live messages keep arriving while someone reads the beginning - they must not move the boundary. */
  it('leaves the boundary where the page put it when live messages follow', () => {
    const paged = reducePanel(
      opened,
      { kind: 'historyPage', before: 'u5', entries: [assistant('older', 'u4')], cursor: 'u4' },
      2_000,
    )
    const live = reducePanel(paged, { kind: 'agent', event: assistant('brand new', 'u6') }, 3_000)

    expect(live.oldestEventUuid).toEqual('u4')
  })
})

/**
 * How much a page is worth to the person who pressed for it - see PanelState.lastPageRows.
 *
 * A page is a slab of the transcript, and much of what is in it draws nothing on screen: a burst of calls
 * is one folded row however many it holds, a task list lives in a panel of its own, a call's result only
 * closes a card that already stands. Counted in entries, a page could arrive in full and move nothing -
 * which is exactly what the press looked like from the outside.
 */
describe('what a page of earlier messages is worth on screen', () => {
  const opened = feed([replayed('tail', 'u5'), { kind: 'replayFinished', cursor: 'u5' }])

  const called = (id: string, name: string, uuid: string): AgentEvent =>
    ({
      type: 'assistant',
      uuid,
      message: { content: [{ type: 'tool_use', id, name, input: { file_path: '/tmp/a.ts' } }] },
    }) as AgentEvent

  const returned = (id: string, uuid: string): AgentEvent =>
    ({
      type: 'user',
      uuid,
      message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'done' }] },
    }) as AgentEvent

  it('counts a whole burst of calls as the single row it draws', () => {
    const paged = reducePanel(
      opened,
      {
        kind: 'historyPage',
        before: 'u5',
        cursor: 'u1',
        entries: [
          called('t1', 'Read', 'a1'),
          returned('t1', 'r1'),
          called('t2', 'Grep', 'a2'),
          returned('t2', 'r2'),
          called('t3', 'Bash', 'a3'),
          returned('t3', 'r3'),
        ],
      },
      2_000,
    )

    expect(said(paged)).toEqual(['mark:EARLIER', 'toolGroup', 'text:tail'])
    expect(paged.lastPageRows).toEqual(1)
  })

  /** The task list is drawn in a pinned panel over the input field, so a page of it moves nothing. */
  it('counts nothing for a page the feed does not draw', () => {
    const wroteTodos = (id: string, uuid: string): AgentEvent =>
      ({
        type: 'assistant',
        uuid,
        message: {
          content: [
            {
              type: 'tool_use',
              id,
              name: 'TodoWrite',
              input: { todos: [{ content: 'one', status: 'pending' }] },
            },
          ],
        },
      }) as AgentEvent

    const paged = reducePanel(
      opened,
      {
        kind: 'historyPage',
        before: 'u5',
        cursor: 'u1',
        entries: [wroteTodos('t1', 'a1'), wroteTodos('t2', 'a2')],
      },
      2_000,
    )

    expect(paged.lastPageRows).toEqual(0)
  })

  /** A subagent's launch is a row of its own now - see TaskCard and FeedRowItem. */
  it('counts a subagent launch as the row it draws', () => {
    const paged = reducePanel(
      opened,
      {
        kind: 'historyPage',
        before: 'u5',
        cursor: 'u1',
        entries: [called('t1', 'Task', 'a1'), called('t2', 'Task', 'a2')],
      },
      2_000,
    )

    expect(paged.lastPageRows).toEqual(2)
  })

  /** An answer dropped as stale added nothing, and has to say so or the screen would stop asking. */
  it('counts nothing for an answer that was not applied', () => {
    const stale = reducePanel(
      opened,
      { kind: 'historyPage', before: 'u404', entries: [assistant('older', 'u4')], cursor: 'u4' },
      2_000,
    )

    expect(stale.lastPageRows).toEqual(0)
  })

  /**
   * A call at the page's own edge has its result in the part of the conversation already on screen, where
   * nobody is left to apply it. Without closing it, the card spins for the rest of the tab's life.
   */
  it('closes a call the page left without a result', () => {
    const paged = reducePanel(
      opened,
      { kind: 'historyPage', before: 'u5', cursor: 'u1', entries: [called('t1', 'Read', 'a1')] },
      2_000,
    )

    const group = paged.items.find((item) => item.kind === 'toolGroup')
    expect(group?.kind === 'toolGroup' && group.pending).toBe(false)
    expect(group?.kind === 'toolGroup' && group.tools[0].pending).toBe(false)
  })
})
