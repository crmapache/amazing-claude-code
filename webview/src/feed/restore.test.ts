import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../protocol'
import { reducePanel } from './build'
import { initialPanelState, type PanelAction, type PanelState } from './panelState'

/**
 * The claim the whole of the shell's journal rests on: a client that was not there sees the same
 * conversation as one that was.
 *
 * Two feeds are built here out of the same turn. The first the way it happens live - the person's
 * message goes into the feed on the press, the answer arrives delta by delta. The second the way a
 * client joining later gets it - the message as an echo from the journal, the deltas as one fold, then
 * the same finished blocks. What comes out has to be the same feed.
 *
 * Without this the arrangement looks right and is wrong in the one way that matters: a phone showing a
 * conversation that reads differently from the one on the desk is worse than a phone showing nothing.
 */

const live = (actions: PanelAction[], at = 1_000): PanelState =>
  actions.reduce((state, action) => reducePanel(state, action, at), initialPanelState)

const text = (state: PanelState): string[] =>
  state.items.map((item) => {
    if (item.kind === 'user') return `user:${item.tokens.map((token) => (token.kind === 'text' ? token.value : '#')).join('')}`
    if (item.kind === 'text') return `text:${item.source}`
    if (item.kind === 'checkpoint') return `checkpoint:${item.chip}`
    return item.kind
  })

const assistant = (body: string): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text: body }] },
})

const delta = (piece: string): AgentEvent => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text: piece } },
})

describe('a feed restored from the journal', () => {
  it('reads the same as one that was watched from the start', () => {
    const watched = live([
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'rename the field' }], quotes: [] },
      { kind: 'agent', event: delta('Renaming') },
      { kind: 'agent', event: delta(' it now') },
      { kind: 'agent', event: assistant('Renaming it now') },
    ])

    // What a client joining mid-turn is handed: the message out of the journal, the fold of the deltas
    // in one piece, and then the same finished block off the live stream.
    const joined = live([
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'rename the field' }], quotes: [] },
      { kind: 'streamPrimed', text: 'Renaming', thinking: '' },
      { kind: 'agent', event: assistant('Renaming it now') },
    ])

    expect(text(joined)).toEqual(text(watched))
  })

  /**
   * The printing card and the finished one have to be one node to React, or the reveal animation breaks
   * off on the answer's last words. A primed fold has to hand out that identifier exactly as the first
   * delta would.
   */
  it('primes the printing card with an identifier, as the first delta would', () => {
    const primed = live([{ kind: 'streamPrimed', text: 'Half a sen', thinking: '' }])
    const streamed = live([{ kind: 'agent', event: delta('Half a sen') }])

    expect(primed.streamingId).toBeDefined()
    expect(primed.streamingId).toEqual(streamed.streamingId)
    expect(primed.streamingText).toEqual(streamed.streamingText)
  })

  it('primes nothing when there is nothing being printed', () => {
    const primed = live([{ kind: 'streamPrimed', text: '', thinking: '' }])

    expect(primed.streamingId).toBeUndefined()
    expect(primed.seq).toEqual(initialPanelState.seq)
  })

  it('carries a thought that was still being printed', () => {
    const primed = live([{ kind: 'streamPrimed', text: '', thinking: 'weighing two options' }])

    expect(primed.streamingThinking).toEqual('weighing two options')
  })

  /**
   * The times are the times things genuinely happened. Applied with "now" instead, a turn that has been
   * running for a minute comes back as having just started - and the counter beside "Claude is
   * thinking" would restart from zero on every reconnect.
   */
  it('counts a restored turn from when it started, not from when it was restored', () => {
    const started = reducePanel(initialPanelState, { kind: 'status', status: 'running' }, 1_000)

    expect(started.turnStartedAt).toEqual(1_000)
  })

  /**
   * A journal that has lost its head must say so. Silence there reads as "this is the whole
   * conversation", which is the one thing it is not.
   */
  it('marks a beginning that is no longer kept', () => {
    const truncated = live([
      { kind: 'checkpoint', chip: 'EARLIER', target: 'earlier messages are no longer kept' },
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'carry on' }], quotes: [] },
    ])

    expect(text(truncated)).toEqual(['checkpoint:EARLIER', 'user:carry on'])
  })

})
