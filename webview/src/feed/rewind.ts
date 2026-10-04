import type { RewindCode, RewindRefusal } from '../protocol'
import type { FeedItem, UserItem } from './types'

/**
 * Cutting a conversation back to one of the person's messages, and forking from a point in it - the
 * panel's side of what Rewind.kt does with the CLI.
 *
 * Everything here is about naming messages. The CLI rewinds and forks by a message's uuid, and it takes the
 * uuid a client sends a message under for its own line in the transcript (measured on 2.1.280, see
 * ClaudeSession.sendPrompt). So the panel names every message it sends on the press, and the card in the
 * feed carries that name from its first second - long before anything has been written to disk.
 */

/**
 * A fresh uuid in the shape the CLI writes, version 4.
 *
 * Not `crypto.randomUUID`: it exists only in a secure context, and the page inside the IDE is served by a
 * resource handler of the plugin's own rather than over https. `getRandomValues` has no such condition.
 */
export const newMessageUuid = (): string => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The newest named message on this screen - what a rewind says it has seen (`lastSeen` in protocol.ts).
 *
 * The CLI refuses to cut anything newer than the target unless it is told the asker has seen it: a message
 * sent from a phone while the dialog stood open at the desk would otherwise be dropped unread. Told the
 * newest one here, it cuts what this screen shows and refuses over anything it does not.
 */
export const lastSeenUuid = (items: readonly FeedItem[]): string | undefined => {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (item?.kind === 'user' && item.uuid) return item.uuid
  }
  return undefined
}

/**
 * Whether a message of one's own can be rewound to.
 *
 * - `yes` - it has a name the CLI knows it by;
 * - `steering` - it was written into a running turn: the CLI handed it to the agent between two steps of
 *   that turn, so the feed and the CLI disagree about where it stands, and there is no clean "before" to
 *   cut back to. The turn's own first message is the place to rewind to instead;
 * - `unnamed` - it was sent before the panel named its messages, and there is nothing to name it by.
 */
export const rewindable = (item: UserItem): 'yes' | 'steering' | 'unnamed' => {
  if (!item.uuid) return 'unnamed'
  if (item.steering) return 'steering'
  return 'yes'
}

/**
 * Where a fork "from here" stops - here being the row [itemId] of [items], an answer the person selected
 * text in or a message of their own.
 *
 * Everything up to and including that turn, and nothing after: the fork is cut before the next message of
 * the person's that starts a turn of its own. One written into a running turn is part of that turn (see
 * rewindable) - the CLI filed it between the turn's steps, and cut there the fork got half a turn, maybe a call
 * without its answer. When there is none the turn is the last one, and the fork carries the conversation
 * whole - which is then exactly "up to here". When the next message has no name to cut it by, the fork
 * carries the whole conversation too, and says so (`cut: false`) rather than claiming a point it did not stop at.
 */
export const forkPointAfter = (
  items: readonly FeedItem[],
  itemId: string | undefined,
): { before?: string; cut: boolean } => {
  const at = itemId ? items.findIndex((item) => item.id === itemId) : -1
  if (at < 0) return { cut: false }

  for (let index = at + 1; index < items.length; index++) {
    const item = items[index]
    if (item?.kind !== 'user' || item.steering) continue
    return item.uuid ? { before: item.uuid, cut: true } : { cut: false }
  }

  return { cut: false }
}

/**
 * A fork asked to stop at a message came up with all of the parent instead - the code the IDE says it with
 * (see ClaudeSession.FORK_WHOLE), worded by the error row in the person's language.
 */
export const FORK_WHOLE = 'FORK_WHOLE'

/**
 * A file the rewind would put back, as its name and the folder it is in - the dialog shows the name first
 * (see RewindDialog). Either separator: on Windows the CLI says its paths with its own.
 */
export const pathParts = (path: string): { name: string; folder: string } => {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut < 0 ? { name: path, folder: '' } : { name: path.slice(cut + 1), folder: path.slice(0, cut) }
}

/** What a rewind puts back - the three the terminal's `/rewind` offers. */
export type RewindChoice = 'conversation' | 'code' | 'both'

/**
 * Whether the dialog's "In a new tab" puts the code back in this tab as well - the files are one for both tabs.
 * One rule for the desk and the phone, and the IDE does both halves on one command (see the `code` of
 * newSession): the phone used to make the fork and forget the code without a word.
 */
export const forkTakesCode = (choice: RewindChoice, code: RewindCode | undefined): boolean =>
  choice === 'both' && code?.state === 'ready'

/**
 * Whether "In a new tab" has to wait: while a turn runs here it keeps writing files, and putting them back
 * under it is refused every time (see ClaudeSession.rewind) - said before the press rather than after it.
 * Forking the conversation alone is never held.
 */
export const forkBlocked = (choice: RewindChoice, code: RewindCode | undefined, running: boolean): boolean =>
  running && forkTakesCode(choice, code)

/**
 * The code a fork could not take along, as the IDE says it into the tab's feed - a code the panel words
 * (see Rewind.forkCodeError): `FORK_CODE|<reason>|<detail>`.
 */
export const FORK_CODE = 'FORK_CODE'

export const forkCodeOf = (message: string): { reason: RewindRefusal; detail: string } | null => {
  if (!message.startsWith(`${FORK_CODE}|`)) return null
  const [, reason = 'other', ...rest] = message.split('|')
  return { reason: reason as RewindRefusal, detail: rest.join('|') }
}
