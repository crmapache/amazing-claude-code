import { chipLabel } from './reference'
import type { Chip, UserToken } from './types'

/**
 * Handing the input field to a rewriter and taking it back.
 *
 * The field is not text: it is text with live attachments in it - a file, an image with its bytes, a
 * quote out of the answer above. A rewriter that saw the field as one string would hand back a string,
 * and every attachment in it would be gone: what came back would be a caption where a chip used to be.
 *
 * So the chips travel as markers. Each one is replaced by [[1]], [[2]] and so on, the rewriter is told
 * what stands behind each marker, and the answer is read back against the same list. A marker may move -
 * a sentence rearranged around an attachment is exactly what one presses the button for - but it cannot
 * be lost: whatever the answer failed to mention goes back at the end (see [improveResult]).
 *
 * This lives apart from the panel because it is the one piece of the feature with rules of its own, and
 * those rules are worth a test rather than an eye.
 */

/** What stands in the draft in an attachment's place. */
const marker = (index: number): string => `[[${index + 1}]]`

const MARKERS = /\[\[(\d+)\]\]/g

export interface ImproveRequest {
  /** The draft with every attachment replaced by its marker - this is what gets rewritten. */
  draft: string
  /** One line per marker, saying what stands behind it, in the same order. */
  attachments: string[]
  /** The attachments themselves, by marker number - the answer is read back against this. */
  chips: Chip[]
  /**
   * A slash command at the very start is not part of the message and is not rewritten: it says where the
   * message goes, and a rewriter that moved it would turn a command into a word (see commandChip). It is
   * held aside and put back in front of the answer exactly as it was.
   */
  command: Chip | null
}

/** What the rewriter is told about a marker. Enough to place it, and no more than that. */
const detail = (chip: Chip): string => {
  switch (chip.kind) {
    case 'file':
      return `the file ${chip.value}`
    case 'dir':
      return `the folder ${chip.value}`
    // An image pasted from the clipboard has no name on disk at all - only bytes, which stay here.
    case 'img':
      return chip.value ? `the image ${chip.value}` : 'an image pasted from the clipboard'
    case 'cmd':
      return `the command /${chip.value}`
    case 'ref':
      return chip.range ? `lines ${chip.range} of ${chip.value}` : `a piece of ${chip.value}`
    // The text of a quote and of a paste is not sent: it can be a whole file, it adds nothing to the
    // decision the rewriter is making (where the marker reads best), and it is the person's own.
    case 'quote':
      return `a quote from the conversation - ${chipLabel(chip)}`
    case 'paste':
      return `a pasted block of text - ${chipLabel(chip)}`
  }
}

/**
 * The field as the rewriter sees it, or null when there is nothing to rewrite.
 *
 * Null covers a draft that is only attachments: three files and not a word is not a prompt anybody can
 * improve, and a button that answers such a press with the same three files back reads as broken.
 */
export const improveRequest = (tokens: UserToken[]): ImproveRequest | null => {
  const first = tokens[0]
  const command = first?.kind === 'chip' && first.chip.kind === 'cmd' ? first.chip : null
  const body = command ? tokens.slice(1) : tokens

  const chips: Chip[] = []
  let draft = ''

  for (const token of body) {
    if (token.kind === 'text') {
      draft += token.value
      continue
    }

    chips.push(token.chip)
    draft += marker(chips.length - 1)
  }

  // Words of one's own rather than markers: the markers are all that is left when the attachments are
  // taken out, and they are not a sentence.
  if (draft.replace(MARKERS, ' ').trim() === '') return null

  return {
    draft: draft.trim(),
    attachments: chips.map((chip, index) => `${marker(index)} - ${detail(chip)}`),
    chips,
    command,
  }
}

/**
 * What a model puts around an answer however plainly it was asked not to: a fence, and quotes around the
 * whole of it. Stripped rather than left in, because both would travel to the agent as characters of the
 * message.
 */
const unwrap = (answer: string): string => {
  let text = answer.trim()

  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(text)
  if (fenced) text = fenced[1].trim()

  // Only when the quotes hold the whole answer: a message that opens and closes on a quotation is being
  // wrapped, while one that merely starts with a quoted word is not.
  const quoted = /^"([\s\S]*)"$/.exec(text)
  if (quoted && !quoted[1].includes('"')) text = quoted[1].trim()

  return text
}

/**
 * The answer as the field's contents again, or null when there is nothing usable in it.
 *
 * Every attachment comes back exactly once. A marker the rewriter dropped is not lost with it - the chip
 * goes to the end of the message instead, where it is visible and can be moved by hand; a marker it
 * repeated is honoured once, because a second copy of an image is not a second image; a number it made
 * up stands for nothing and is simply removed.
 */
export const improveResult = (request: ImproveRequest, answer: string): UserToken[] | null => {
  const text = unwrap(answer)
  if (text === '') return null

  const tokens: UserToken[] = []
  const used = new Set<number>()

  /** Adjacent pieces of text are one token: that is the shape the field itself reports (see extractTokens). */
  const addText = (value: string) => {
    if (value === '') return
    const last = tokens.at(-1)
    if (last?.kind === 'text') last.value += value
    else tokens.push({ kind: 'text', value })
  }

  let cursor = 0
  for (const match of text.matchAll(MARKERS)) {
    const at = match.index ?? 0
    const index = Number(match[1]) - 1
    const chip = request.chips[index]

    addText(text.slice(cursor, at))
    cursor = at + match[0].length

    if (chip === undefined || used.has(index)) continue
    used.add(index)
    tokens.push({ kind: 'chip', chip })
  }

  addText(text.slice(cursor))

  const dropped = request.chips.filter((_, index) => !used.has(index))
  for (const chip of dropped) {
    const last = tokens.at(-1)
    if (last?.kind === 'text' && last.value.length > 0 && !/\s$/.test(last.value)) addText(' ')
    else if (last?.kind === 'chip') addText(' ')
    tokens.push({ kind: 'chip', chip })
  }

  // The field's contents end in a space by habit - that is where the caret stands after an attachment,
  // and it is what keeps the next typed word from sticking to a chip.
  const last = tokens.at(-1)
  if (last?.kind === 'chip') addText(' ')

  if (request.command) {
    return [{ kind: 'chip', chip: request.command }, { kind: 'text', value: ' ' }, ...tokens]
  }

  return tokens
}
