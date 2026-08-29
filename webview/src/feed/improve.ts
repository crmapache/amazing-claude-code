import type { Dict } from '../i18n/en'
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
    /*
     * The caption the person is looking at - "Image #6" - rather than a description of it. An image
     * pasted from the clipboard has no name on disk at all, only bytes, and those stay here; the caption
     * is the only thing that tells one screenshot from the next, on their screen and in the answer.
     */
    case 'img':
      return chip.value || 'an image pasted from the clipboard'
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

/**
 * What a tab knows about its rewrites between one press of the sparkle and the next.
 *
 * A little state machine rather than three lines each in three places of the panel, because the rules in
 * it are all of the kind that break without showing: pressed twice, the button has to reach past its own
 * answer to the words it was given, and the way back has to lead to those same words however many takes
 * have stood in the field since. Neither can be seen on the screen until it is wrong.
 */
/**
 * Why the last rewrite came to nothing, as what happened rather than as a sentence about it.
 *
 * The sentence is put together where it is drawn (see [improveNote]). It cannot be put together where
 * this is set: that handler is subscribed once for the panel's whole life, so a sentence built inside it
 * carries the dictionary of the very first render - English, always, because the language arrives after
 * it. The voice errors already work this way (see feed/voice.ts), and this is the same rule.
 */
export type ImproveNote =
  /** The model answered with nothing there was anything to put in the field. */
  | { kind: 'empty' }
  /** The draft moved on while the answer was in flight, so it was left alone. */
  | { kind: 'changed' }
  /** The IDE's own account of what went wrong, when it had one. */
  | { kind: 'said'; text: string }

export const improveNote = (t: Dict, note: ImproveNote): string => {
  switch (note.kind) {
    case 'empty':
      return t.composer.improveEmpty
    case 'changed':
      return t.composer.improveChanged
    default:
      return note.text
  }
}

export interface ImproveSource {
  /** What every press of this chain is a rewrite OF - the first request, kept as it was. */
  source: ImproveRequest
  /** The takes this source has produced, oldest first: what the person has pressed past. */
  attempts: string[]
  /** The field as the person themselves left it - where the way back leads. */
  before: UserToken[]
  /** A take of `before` is standing in the field right now, untouched: there is a way back to offer. */
  applied: boolean
}

/**
 * How many turned-down takes travel with the next press. They are short, but somebody leaning on that
 * button would otherwise grow the request without bound - and the older a take is, the less it says about
 * what is wanted now, so it is the oldest that go.
 */
export const IMPROVE_ATTEMPTS_KEPT = 4

/**
 * The button pressed. Everything a previous press learned is carried over: the words to rewrite, the takes
 * pressed past, and the way back - all three are about the person's own draft, and this press does not
 * change that draft, whatever it hands back.
 *
 * `applied` is carried over rather than lowered because what stands in the field until the answer arrives
 * is still the previous take: if this press comes to nothing, that take is what one is still looking at,
 * and the way back out of it is still the way back.
 */
export const improveStarted = (
  held: ImproveSource | undefined,
  request: ImproveRequest,
  field: UserToken[],
): ImproveSource => ({
  source: held?.source ?? request,
  attempts: held?.attempts ?? [],
  before: held?.before ?? field,
  applied: held?.applied ?? false,
})

/** A take landed in the field: it joins what has been seen, and there is now a way back out of it. */
export const improveLanded = (held: ImproveSource, answer: string): ImproveSource => ({
  ...held,
  attempts: [...held.attempts, answer].slice(-IMPROVE_ATTEMPTS_KEPT),
  applied: true,
})

/**
 * The way back taken: the person's own words stand in the field again.
 *
 * What the chain knows is deliberately kept. Taking one's own words back is the plainest way of saying the
 * take was not wanted, and a next press that had forgotten it would throw the same dice against the same
 * words - which is the one thing this button must not do twice in a row.
 */
export const improveTakenBack = (held: ImproveSource): ImproveSource => ({ ...held, applied: false })

/**
 * The same draft or not. Chips by identity rather than by their contents: within one chain they are the
 * very objects that were put in, and comparing an image's bytes to answer "is this the same field" would
 * be paying a great deal for an answer already known.
 */
const sameDraft = (one: UserToken[], other: UserToken[]): boolean => {
  if (one === other) return true
  if (one.length !== other.length) return false

  return one.every((token, index) => {
    const against = other[index]
    if (token.kind !== against.kind) return false
    if (token.kind === 'text') return against.kind === 'text' && token.value === against.value
    return against.kind === 'chip' && token.chip === against.chip
  })
}

/**
 * The field stepped through its own undo history: the chain stands, and what changes is only whether a
 * take is on the screen or the words it was made from.
 *
 * Kept rather than ended because Cmd+Z is not the person moving on - it is them going back, and going back
 * over a rewrite lands on their own draft. Ending the chain there would forget every take they had turned
 * down and hand the next press the model's own sentence to rewrite, which is the one thing the chain
 * exists to prevent.
 */
export const improveShown = (held: ImproveSource, field: UserToken[]): ImproveSource => {
  const applied = !sameDraft(field, held.before)
  return applied === held.applied ? held : { ...held, applied }
}
