/**
 * Which key presses the clipboard bridge may act on, and which paste events it may serve.
 *
 * Split out of clipboard.ts and held by a test because it breaks silently and on one system only: the
 * bridge exists for Linux alone (see the header of clipboard.ts), so anything wrong here is invisible on
 * a Mac and is reported as "the panel pastes text by itself".
 *
 * That is exactly what happened. Inside the embedded browser on Linux an ordinary Shift+V arrived as a
 * paste command - the modifiers a key press carries across that boundary are not always the ones that
 * were pressed - and the browser's own clipboard there is empty, so the paste came through as a paste
 * with nothing in it. Which is precisely the case the bridge was built to fill in: it filled it with the
 * IDE's clipboard, and a person typing a capital V got yesterday's copied text instead.
 *
 * Hence the rule this file exists for: **a press that types a character is typing, not pasting.** It is
 * stated in terms of what actually happened - a character went into the field, a real shortcut was
 * pressed - rather than in terms of which modifiers the event claims to carry, because it is the claim
 * that turned out to be untrustworthy.
 */

/** As much of a keyboard event as any decision here needs. */
export interface KeyLike {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * How long after a press the character it typed is still considered to belong to it.
 *
 * Generous on purpose: the browser types the character in the same task as the press, and the only thing
 * a wider window costs is that a paste pressed within a quarter of a second of typing a letter is left
 * to the browser. A paste that did not happen is asked for again; a paste nobody asked for is text
 * appearing in a message under somebody's hands.
 */
export const TYPING_WINDOW_MS = 250

/** Ctrl/Cmd+V and Shift+Insert - a habit from Linux, where the latter is just as common. */
export const isPasteShortcut = (event: KeyLike): boolean => {
  if (event.altKey) return false
  if (event.code === 'KeyV') return (event.ctrlKey || event.metaKey) && !event.shiftKey

  return event.code === 'Insert' && event.shiftKey && !event.ctrlKey && !event.metaKey
}

/** The last key press, as far as a paste is concerned. */
export interface LastKey {
  at: number
  shortcut: boolean
  /** The character the press writes, if it writes one - what has to be put back when it is swallowed. */
  text: string
}

/**
 * Whether an empty paste event should be filled in from the IDE's clipboard.
 *
 * A paste with no key press behind it is served: that is the context menu, and it is a real paste. A
 * paste that follows a real shortcut is served for the obvious reason. What is refused is the third
 * case - a paste arriving on the heels of a press that is not a paste shortcut at all, which is the
 * Shift+V above and nothing else.
 */
export const servesPaste = (last: LastKey | null, now: number): boolean =>
  last === null || last.shortcut || now - last.at > TYPING_WINDOW_MS

/**
 * Whether a press put no character into the field.
 *
 * Two things hang on this, and both are the same question. A paste asked for by a shortcut is dropped
 * when the press turns out to have typed something - the modifiers lied, and the clipboard the IDE is
 * still fetching (up to a second and a half on X11) must not land on top of it. And a character the
 * browser swallowed in favour of a paste it invented is put back only when nothing typed it after all,
 * so that a letter never arrives twice.
 *
 * A character typed later than the window is somebody carrying on writing beside a genuine paste, and
 * says nothing about the press.
 */
export const typedNothing = (keyAt: number, typedAt: number | null): boolean =>
  typedAt === null || typedAt < keyAt || typedAt - keyAt > TYPING_WINDOW_MS

/**
 * Whether an input event counts as typing.
 *
 * Everything that inserts is typing except the paste itself - including composition, which is how an
 * input method types. The bridge's own paste arrives as insertFromPaste and must not be read as somebody
 * at the keyboard.
 */
export const isTyping = (inputType: string): boolean =>
  inputType.startsWith('insert') && !inputType.startsWith('insertFromPaste')
