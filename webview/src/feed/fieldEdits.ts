/**
 * The keys a plain text field owes the person and does not get from the browser inside the IDE - apart
 * from the DOM, so a test can hold them (see hooks/useFieldHistory.ts for the wiring).
 *
 * JCEF does not forward macOS's native "by word" and "by line" combinations with Cmd to a field, and
 * Cmd+Z there is answered by whichever undo happens to be in force rather than the field's own - the
 * composer found both out the hard way and does the two by hand (see handleKeyDown in Composer.tsx).
 * The search window's fields are plain inputs, and the same hands are lent to them here: the word
 * before the caret, and an undo history of the field's own, coalescing typing the way the composer's
 * does.
 */

/** A text field as an undo remembers it: the text and where the selection stood in it. */
export interface FieldState {
  value: string
  start: number
  end: number
}

const isSpace = (char: string): boolean => /\s/.test(char)
const isWordChar = (char: string): boolean => /[\p{L}\p{N}_]/u.test(char)

/**
 * The text with the word before the selection taken out - what Cmd+Backspace does in the composer.
 *
 * A selection goes first, whole. Without one, the spaces before the caret go along with the run before
 * them: a run of letters and digits, or a run of punctuation - "src/useSocket.js" loses "js", then ".",
 * then "useSocket", the way an editor walks it, rather than the whole path at one press.
 */
export const deleteWordBackward = (state: FieldState): FieldState => {
  const { value, start, end } = state
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), start, end: start }

  let at = start
  while (at > 0 && isSpace(value[at - 1]!)) at -= 1
  if (at > 0) {
    const wordy = isWordChar(value[at - 1]!)
    while (at > 0 && !isSpace(value[at - 1]!) && isWordChar(value[at - 1]!) === wordy) at -= 1
  }

  return { value: value.slice(0, at) + value.slice(end), start: at, end: at }
}

/** How long a pause between keystrokes still counts as the same typing - the composer's own figure. */
export const UNDO_COALESCE_MS = 700

/** How many steps are kept: a field is a line or a paragraph, and nobody undoes further back than this. */
const UNDO_LIMIT = 200

/**
 * The undo history of one field, in the composer's shape: consecutive typing is merged into one step,
 * everything else - a space, a paste, a deletion of a word, a change of direction - gets a boundary of
 * its own, and a new edit throws the redo steps away.
 */
export class FieldHistory {
  private readonly undone: FieldState[] = []
  private readonly redone: FieldState[] = []
  private lastEditAt = 0

  /** What stood in the field before the edit being applied now. */
  record(before: FieldState, boundary: boolean, now = Date.now()): void {
    const coalesce = !boundary && this.undone.length > 0 && now - this.lastEditAt < UNDO_COALESCE_MS
    if (!coalesce) {
      this.undone.push(before)
      if (this.undone.length > UNDO_LIMIT) this.undone.shift()
    }
    this.lastEditAt = now
    this.redone.length = 0
  }

  /**
   * The typing that follows starts a step of its own, however soon it comes: after a word taken out by
   * the keys, an undo or the × the next keystroke must not melt into that step - or one undo later
   * jumps over both, and the word comes back together with the letters typed after it.
   */
  split(): void {
    this.lastEditAt = 0
  }

  /** The step back from [current], or nothing when there is none. */
  undo(current: FieldState): FieldState | undefined {
    const previous = this.undone.pop()
    if (previous === undefined) return undefined
    this.redone.push(current)
    return previous
  }

  /** The step forward from [current], or nothing when there is none. */
  redo(current: FieldState): FieldState | undefined {
    const next = this.redone.pop()
    if (next === undefined) return undefined
    this.undone.push(current)
    return next
  }

  get canUndo(): boolean {
    return this.undone.length > 0
  }

  get canRedo(): boolean {
    return this.redone.length > 0
  }
}

/**
 * Whether an edit from [before] to [after] begins a new undo step rather than joining the typing before
 * it: anything but a single character typed in, a space typed in (a word is done), or a change of
 * direction between typing and deleting.
 */
export const isBoundary = (before: FieldState, after: FieldState, lastKind: 'insert' | 'delete' | undefined): boolean => {
  const delta = after.value.length - before.value.length
  if (Math.abs(delta) !== 1) return true
  const kind = delta > 0 ? 'insert' : 'delete'
  if (lastKind !== undefined && kind !== lastKind) return true
  return kind === 'insert' && isSpace(after.value[after.start - 1] ?? '')
}

/**
 * Whether the key pressed is the letter asked for, whatever the layout writes on it.
 *
 * A layout renames the key: with a Ukrainian or a Russian one in force, Cmd/Ctrl+Z arrives as "я" and
 * Cmd/Ctrl+Y as "н" - the letters that key prints there. Asked by name alone, undo and redo worked in
 * English and stayed silent for everyone else, and silently: the browser's own undo took over, and it
 * knows nothing about the chips in the field. The physical key answers as well, and either answer
 * counts - a layout that moves the letter elsewhere (Dvorak) writes it on the key it moved it to, and
 * the person means the letter they see. The same reason holds off a Mac with Alt held, where the
 * character is "ç" and only the key itself is still recognisable.
 *
 * [letter] is a lowercase Latin letter - the one written in the shortcut people are told about.
 */
export const isLetterKey = (event: { key: string; code: string }, letter: string): boolean =>
  event.key.toLowerCase() === letter || event.code === `Key${letter.toUpperCase()}`
