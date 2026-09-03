import type { PanelState } from './panelState'
import type { UserToken } from './types'

/**
 * Everything a tab has managed to collect - by which we tell a tab nobody has touched from a tab
 * somebody is working in.
 *
 * The pieces come from three different places in App.tsx (the feed's own state, the draft in the field,
 * the output of commands run through "!"), and that is precisely why the rule lives here rather than
 * there: it decides whether a past conversation lands on top of somebody's work, and getting it wrong is
 * silent - the work is gone by the time anyone notices.
 */
export interface TabTraces {
  /** Absent means the tab has no state at all yet: nothing has ever arrived into it. */
  panel?: Pick<PanelState, 'items' | 'streamingText' | 'streamingThinking' | 'status' | 'queue' | 'background'>
  /** What stands in the input field right now - text, attachments, quotes. */
  draft?: { tokens: UserToken[]; quotes: unknown[] }
  /** The commands run in this tab through "!" since the last message - they travel with the next one. */
  shellRuns?: unknown[]
}

/**
 * Whether a past conversation may open in this tab without taking anything away.
 *
 * A tab is untouched when there is nothing on its screen, nothing waiting to be said and nothing written
 * into the field. The draft counts as much as the feed does: a half-written request is work too, and it
 * belongs to the tab rather than to the panel, so opening a past conversation over it would carry the
 * words off with the tab they were written in.
 */
export const isUntouchedTab = ({ panel, draft, shellRuns }: TabTraces): boolean => {
  if (draft && (draft.tokens.length > 0 || draft.quotes.length > 0)) return false
  if (shellRuns && shellRuns.length > 0) return false
  if (!panel) return true

  return (
    panel.items.length === 0 &&
    panel.streamingText === '' &&
    panel.streamingThinking === '' &&
    panel.status === 'idle' &&
    panel.queue.length === 0 &&
    panel.background.length === 0
  )
}

/**
 * The tab this conversation is already open in, if any.
 *
 * A history is a list of everything, open tabs included, and picking one that is already on the strip
 * means "take me there" rather than "give me a second copy". Two tabs on one conversation are not merely
 * untidy: both hold a process of the same transcript, and what is written into one does not exist for
 * the other.
 */
export const tabHolding = (
  conversationId: string,
  tabs: readonly { id: string }[],
  conversationOf: (tab: string) => string | undefined,
): string | undefined => {
  // Without this a tab that holds no conversation answers for one that has no name: two nothings compare
  // equal, and the press would land on whichever tab came first instead of opening what was chosen.
  if (!conversationId) return undefined

  return tabs.find((tab) => conversationOf(tab.id) === conversationId)?.id
}
