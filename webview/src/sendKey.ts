import type { MenuOption } from './components/Menu'
import type { Dict } from './i18n/en'

/**
 * Which key sends a message out of the input field.
 *
 * `enter` - Enter sends, Shift+Enter breaks the line: what the panel has always done and what a terminal
 * does. `modEnter` - Cmd/Ctrl+Enter sends and a bare Enter breaks the line, which is how a person who
 * writes their prompts as several paragraphs wants it: with Enter sending, every list they type goes out
 * halfway through.
 *
 * Machine-wide, like the layout of the field it belongs to (see ClaudePreferences), and off the phone
 * altogether - there a message goes by a button under the thumb, and nothing about a keyboard applies.
 */
export type SendKey = 'enter' | 'modEnter'

/** The shell sends the choice straight out of the settings - an old or foreign value counts as Enter. */
export const normalizeSendKey = (value: string | undefined): SendKey => (value === 'modEnter' ? 'modEnter' : 'enter')

/**
 * Whether the modifier key is spelled Cmd or Ctrl here.
 *
 * Asked of the browser rather than of the IDE, unlike a voice hotkey's caps (see HotkeyCaps): the panel
 * is drawn by the embedded Chromium on the very machine the IDE runs on, so its own user agent knows the
 * system - the same road the clipboard bridge takes for Linux. The word rather than ⌘: the sign is not in
 * the panel's font, and one that falls through to whatever the system has sits in the middle of a line at
 * a size and weight of its own.
 */
export const modifierName = (): string =>
  typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent) ? 'Cmd' : 'Ctrl'

/** Both keys as they are written beside their option, and in the Send button's tooltip. */
export const sendKeyCap = (key: SendKey): string => (key === 'modEnter' ? `${modifierName()}+Enter` : 'Enter')

/**
 * The two options, named by the key itself - and with no `key` tag beside the name: the tag would print
 * the same word twice in one row, which is the panel's own rule about a hover repeating what it hangs on,
 * one step further in.
 */
export const sendKeyOptions = (t: Dict): MenuOption[] => [
  { id: 'enter', label: t.sendKey.enter, sub: t.sendKey.enterSub },
  { id: 'modEnter', label: t.sendKey.modEnter(modifierName()), sub: t.sendKey.modEnterSub },
]

/** The right-hand side of the row in the settings list - the key itself, not a sentence about it. */
export const sendKeySummary = (key: SendKey): string => sendKeyCap(key)

/** What a press of Enter does in the field, all cases in one place. */
type EnterAction = 'send' | 'newline'

/**
 * Enter, read against the choice above. The rule is here rather than in the composer's key handler
 * because it breaks silently: a wrong answer either sends half a sentence or leaves a field that cannot
 * send at all, and neither shows up until somebody is mid-message.
 *
 * With Enter sending, Cmd/Ctrl+Enter sends too - it is what the other half of the setting is bound to,
 * and a person who has learned it there must not find it dead here. With Cmd/Ctrl+Enter sending, every
 * other Enter breaks the line, Shift+Enter included: there is nothing else left for it to mean.
 */
export const enterAction = (
  key: SendKey,
  event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
): EnterAction => {
  const mod = event.metaKey || event.ctrlKey

  if (key === 'modEnter') return mod ? 'send' : 'newline'
  return event.shiftKey && !mod ? 'newline' : 'send'
}
