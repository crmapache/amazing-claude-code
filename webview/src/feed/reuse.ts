import type { UserItem, UserToken } from './types'

/**
 * A sent message, taken back into the input field to be corrected and sent again.
 *
 * This is what the first request for it asked for in different words: somebody drafts their prompts in a
 * text file, pastes them into the panel, and on noticing a slip has no way back to what they sent - the
 * card in the feed is text on a screen, and retyping the attachments by hand is the part that hurts.
 * Copying it out is only half an answer: a path pasted back into the field is a path, not a chip, and an
 * image has no text form at all.
 *
 * So the message goes back as the pieces it was made of. Almost all of them survive the trip untouched -
 * a file, a folder, a command, a quote and a paste each carry everything they need inside the chip. The
 * one exception is a pasted image, and it is the reason this file exists rather than a one-line map.
 */
export interface Reuse {
  tokens: UserToken[]
  /**
   * How many pasted images cannot come back. Their bytes live in the feed only while the panel that sent
   * them is the panel on screen: a conversation read off the disk keeps the caption "[Image #2]" and
   * nothing else - the transcript never held the picture (see replayedMessage).
   *
   * Counted rather than passed on silently, because silence here is a lie the person acts on: a message
   * whose picture is gone looks complete in the field, goes out with a caption pointing at nothing, and
   * gets an answer about an image the agent was never shown.
   */
  lostImages: number
}

/**
 * The message as the field can take it back.
 *
 * A pasted image with its bytes still here goes back as itself - it will travel as an attachment again.
 * One that has only the file the shell wrote under it (see PastedFiles.kt) goes back as that file: the
 * agent reads it with a tool instead of being handed the bytes, which is a step down but a step that
 * genuinely carries the picture - and it is exactly what copying the message into the clipboard has
 * always given (see clipboardText). One that has neither is left out and counted.
 */
export const reusableMessage = (item: Pick<UserItem, 'tokens'>): Reuse => {
  const tokens: UserToken[] = []
  let lostImages = 0

  for (const token of item.tokens) {
    if (token.kind !== 'chip' || token.chip.kind !== 'img') {
      tokens.push(token)
      continue
    }

    const { chip } = token
    if (chip.data) {
      tokens.push(token)
      continue
    }

    if (chip.path) {
      tokens.push({ kind: 'chip', chip: { kind: 'file', value: chip.path } })
      continue
    }

    lostImages += 1
  }

  return { tokens: merge(tokens), lostImages }
}

/**
 * Neighbouring pieces of text become one, and the empty ones go.
 *
 * Needed because of the images left out above: dropping a chip from the middle of a sentence leaves the
 * text on either side of it as two tokens with nothing between them, and the field would draw them as
 * two - with the gap the chip used to fill still there.
 */
const merge = (tokens: UserToken[]): UserToken[] => {
  const merged: UserToken[] = []

  for (const token of tokens) {
    if (token.kind !== 'text') {
      merged.push(token)
      continue
    }

    const last = merged.at(-1)
    if (last?.kind === 'text') merged[merged.length - 1] = { kind: 'text', value: last.value + token.value }
    else merged.push(token)
  }

  return merged.filter((token) => token.kind !== 'text' || token.value !== '')
}
