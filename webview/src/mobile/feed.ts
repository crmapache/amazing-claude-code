import { reducePanel } from '../feed/build'
import { initialPanelState, type PanelAction, type PanelState } from '../feed/panelState'
import type { ShellMessage } from '../protocol'
import type { UserToken } from '../feed/types'

/**
 * Turning the shell's messages into a conversation, on the phone.
 *
 * The same reducer the panel uses, fed the same messages. That is the whole point of the journal being
 * a list of ready messages rather than a format of its own: a second client does not need a second
 * understanding of what a conversation is, and two understandings would disagree the first week.
 *
 * What is not here is everything the panel does around the feed - the composer's draft, the sound
 * watch, the tabs. Those belong to a screen rather than to a conversation.
 */

export interface MobileFeed {
  state: PanelState
  /** The last journal number applied, which is what a reconnect asks to continue from. */
  seq: number
  /** True between restoreStarted and restoreFinished: the entries are collected, then applied at once. */
  restoring: boolean
  /**
   * Whether the IDE has said anything about this conversation yet.
   *
   * An empty feed means two different things - "this conversation is empty" and "nothing has arrived
   * yet" - and a screen that shows them alike sends someone looking for a bug that is not there. It
   * did exactly that: a conversation whose journal never made it across came up looking like a fresh
   * one, with an invitation to say something.
   */
  loaded: boolean
  pending: Array<{ action: PanelAction; at?: number }>
  /**
   * The uuid of the oldest message on screen - Claude Code's own transcript stamps every line with one,
   * and it is what a request for an earlier page is anchored on (see historyPage below): the journal's
   * catch-up and the transcript on disk share no numbering of their own, so a position would drift the
   * moment the two diverge, which is on the very first status message. Null until the first agent event
   * has arrived - there is nothing to anchor on before that.
   */
  oldestEventUuid: string | null
}

export const emptyFeed = (): MobileFeed => ({
  state: initialPanelState,
  seq: 0,
  restoring: false,
  loaded: false,
  pending: [],
  oldestEventUuid: null,
})

/**
 * Apply one message from the shell.
 *
 * Returns the same feed when nothing changed, so a screen can skip a render on the many messages that
 * are about other conversations or about the project rather than the feed.
 */
export const applyMessage = (feed: MobileFeed, message: ShellMessage): MobileFeed => {
  const at = message.at
  const seq = message.seq ?? feed.seq

  const collect = (action: PanelAction): MobileFeed => {
    if (feed.restoring) {
      return { ...feed, seq, pending: [...feed.pending, { action, at }] }
    }

    return { ...feed, seq, loaded: true, state: reducePanel(feed.state, action, at) }
  }

  switch (message.type) {
    case 'restoreStarted': {
      // `from` of zero means this client had nothing, so whatever is on screen is not a shorter version
      // of what is coming - it is a different conversation's remains.
      const state = message.from === 0 ? initialPanelState : feed.state
      // Worded differently from the panel's mark on purpose: at the desk the beginning is genuinely
      // gone, while here it usually still exists on the machine and simply was not sent - a phone is
      // handed the end of a conversation rather than a working day of it (see ClaudeSessionHub.CatchUp).
      const pending: Array<{ action: PanelAction; at?: number }> = message.truncated
        ? [
            {
              action: {
                kind: 'checkpoint',
                chip: 'EARLIER',
                target: 'earlier messages are not shown on the phone',
              },
            },
          ]
        : []

      return { ...feed, state, restoring: true, pending }
    }

    case 'restoreFinished': {
      const state = feed.pending.reduce(
        (panel, entry) => reducePanel(panel, entry.action, entry.at),
        feed.state,
      )

      return { ...feed, state, seq: message.upTo, restoring: false, loaded: true, pending: [] }
    }

    case 'agent': {
      const applied = collect({ kind: 'agent', event: message.event, replay: message.replay })
      // The very first agent event this feed has ever seen is, at that moment, the oldest one there is -
      // set once and left alone from then on: everything arriving after it, live, is by definition newer,
      // and only a historyPage response (see below) is allowed to push the boundary further back.
      if (applied.oldestEventUuid !== null) return applied
      const uuid = (message.event as { uuid?: unknown }).uuid
      return typeof uuid === 'string' ? { ...applied, oldestEventUuid: uuid } : applied
    }

    case 'historyPage': {
      let pageState = initialPanelState
      for (const event of message.entries) {
        pageState = reducePanel(pageState, { kind: 'agent', event, replay: true }, message.at)
      }

      // Defensive rather than expected: the uuid boundary this page was fetched with should not overlap
      // what is already on screen, but a stale request racing a fresher one is cheaper to filter here
      // than to reason your way out of.
      const existingIds = new Set(feed.state.items.map((item) => item.id))
      const older = pageState.items.filter((item) => !existingIds.has(item.id))

      // The placeholder is rebuilt rather than kept: it has to move to stand above whatever was just
      // loaded, and it disappears the moment there is nothing further back to fetch (no cursor).
      const rest = feed.state.items.filter((item) => !(item.kind === 'checkpoint' && item.chip === 'EARLIER'))
      const checkpoint: typeof feed.state.items = message.cursor
        ? [{ id: 'earlier', kind: 'checkpoint', chip: 'EARLIER', target: 'earlier messages are not shown on the phone' }]
        : []

      return {
        ...feed,
        oldestEventUuid: message.cursor ?? feed.oldestEventUuid,
        state: { ...feed.state, items: [...checkpoint, ...older, ...rest] },
      }
    }

    case 'promptEcho':
      return collect({
        kind: 'prompt',
        tokens: (message.tokens ?? []) as UserToken[],
        quotes: message.quotes ?? [],
        steering: message.steering,
      })

    case 'status':
      return collect({ kind: 'status', status: message.state })

    case 'error':
      return collect({ kind: 'error', message: message.message })

    case 'permission':
      return collect({
        kind: 'permission',
        id: message.id,
        target: message.target,
        command: message.command,
        mode: message.mode,
        reason: message.reason,
        rememberable: message.rememberable,
        taskId: message.agentId,
      })

    case 'permissionResolved':
      return collect({ kind: 'permissionResolved', id: message.id, decision: message.decision })

    case 'context':
      return collect({ kind: 'context', used: message.used, max: message.max })

    case 'processExited':
      return collect({ kind: 'processExited', exitCode: message.exitCode })

    case 'replayFinished':
      return collect({ kind: 'replayFinished' })

    case 'streamingText':
      return collect({ kind: 'streamPrimed', text: message.text, thinking: message.thinking })

    case 'sessionReset':
      // Still loaded: the conversation was wiped rather than never heard about, and saying "loading"
      // over a tab that is genuinely empty now would wait for something that is not coming.
      return { ...emptyFeed(), seq, loaded: feed.loaded }

    default:
      // Everything else is about the project or about a screen the phone does not have. Skipped rather
      // than mishandled: the protocol grows, and a client that guesses at what it does not know is a
      // client that breaks on the next release.
      return feed
  }
}
