import type { UserToken } from './types'

/**
 * A person's message out of a past conversation, read back into the pieces it was sent as.
 *
 * A message leaves the panel as chips and text - a file, an image, a quote of the agent's own words -
 * and reaches the agent as one string: that is all a transcript keeps (see composePrompt in tokens.ts).
 * Opened from the history, such a message came back as that string, and a conversation full of
 * attachments read as a wall of `@paths`, `[Image #2]` and quotation marks half a screen long, where at
 * the desk it had been a line of compact chips.
 *
 * So the string is read back the way it was written. Only the parts whose shape the panel itself
 * decided are recognised - a leading `> ` line, an `@path`, an image's placeholder - because those
 * cannot be mistaken for something a person typed. A quotation mark is the one exception, and it is
 * guarded by a stronger test than its shape: the words inside it have to have been said by the agent
 * earlier in this very conversation (see [isSaid]).
 */

export interface ReplayedMessage {
  tokens: UserToken[]
  /** The lines quoted above the message itself - `> ` in the transcript, a block in the card. */
  quotes: string[]
}

/**
 * [answered] is what the agent has already said in this conversation, newest last. It is what tells a
 * quote of the agent from a sentence somebody put in quotation marks themselves.
 */
export const replayedMessage = (text: string, answered: string[] = []): ReplayedMessage => {
  const { quotes, body } = takeQuotedLines(text)
  const said = answered.map(normalise).join('\n')

  let quoted = 0
  const tokens: UserToken[] = []

  for (const piece of splitQuotations(body)) {
    if (piece.quotation && isSaid(piece.text, said)) {
      quoted += 1
      tokens.push({ kind: 'chip', chip: { kind: 'quote', value: `ref${quoted}`, text: piece.text } })
      continue
    }

    // A quotation nobody said stays exactly as it was written, quotation marks included.
    tokens.push(...attachmentTokens(piece.quotation ? `"${piece.text}"` : piece.text))
  }

  return { tokens: merge(tokens), quotes }
}

/**
 * The lines a message was sent with quoted above it. They stand at the very top - that is where
 * composePrompt puts them - so the first line that is not one of them ends the block: a `>` further
 * down belongs to whatever the person was writing about.
 */
const takeQuotedLines = (text: string): { quotes: string[]; body: string } => {
  const lines = text.split('\n')
  const quotes: string[] = []

  while (lines.length > 0 && lines[0]?.startsWith('> ')) quotes.push(lines.shift()!.slice(2))

  return { quotes, body: lines.join('\n') }
}

/** Below this a quotation is too short to be told from ordinary punctuation with any confidence. */
const QUOTATION_MIN = 40

const QUOTATION = /"([^"]+)"/g

/** The message cut into the quotations inside it and everything between them. */
const splitQuotations = (text: string): Array<{ text: string; quotation: boolean }> => {
  const pieces: Array<{ text: string; quotation: boolean }> = []
  let at = 0

  for (const match of text.matchAll(QUOTATION)) {
    const inner = match[1] ?? ''
    if (inner.trim().length < QUOTATION_MIN) continue

    const start = match.index ?? 0
    if (start > at) pieces.push({ text: text.slice(at, start), quotation: false })
    pieces.push({ text: inner, quotation: true })
    at = start + match[0].length
  }

  if (at < text.length) pieces.push({ text: text.slice(at), quotation: false })

  return pieces
}

/**
 * Whether the agent said this itself.
 *
 * Compared with the markup taken out of both sides: what was quoted is what was on screen - the words
 * of an answer as they were drawn - while the answer is kept as the markdown it arrived in, so `**a
 * word**` there is `a word` here. Line breaks go the same way: a quotation picked up with the mouse
 * carries the wrapping of the panel it was read in.
 */
const isSaid = (quotation: string, said: string): boolean => {
  const needle = normalise(quotation)
  return needle.length >= QUOTATION_MIN && said.includes(needle)
}

/**
 * Both sides brought down to their words alone.
 *
 * The markup goes (`**bold**` on one side is `bold` on the other), and so do the dashes and bullets: a
 * quotation picked up with the mouse begins with the list marker the panel drew - an em dash where the
 * answer holds a hyphen - and a comparison that counts those as content misses every quoted bullet
 * point, which is most of them.
 */
const normalise = (text: string): string =>
  text.toLowerCase().replace(/[`*_#>\-\u2010-\u2015\u2022\u00b7\s]+/g, ' ').trim()

/** `@path`, `@path (L12-L18)` and an image's placeholder - the shapes the panel itself writes. */
const ATTACHMENT = /\[Image #\d+\]|@\S+/g

/** Trailing punctuation belongs to the sentence rather than to the path it follows. */
const TRAILING = /[.,;:!?)\]}"']+$/

const attachmentTokens = (text: string): UserToken[] => {
  const tokens: UserToken[] = []
  let at = 0

  for (const match of text.matchAll(ATTACHMENT)) {
    const start = match.index ?? 0
    const found = match[0]

    if (found.startsWith('[Image')) {
      if (start > at) tokens.push({ kind: 'text', value: text.slice(at, start) })
      tokens.push({ kind: 'chip', chip: { kind: 'img', value: found.slice(1, -1) } })
      at = start + found.length
      continue
    }

    const path = found.slice(1).replace(TRAILING, '')
    // A word beginning with @ is not a path: `@media`, `@Override`, somebody's handle. A path is
    // recognised by having a directory in it or an extension on the end - and a chip is a promise that
    // the agent was given a file to read, so a wrong one is worse than plain text.
    if (!isPath(path)) continue

    // The range a reference from the editor carries: `@path (L12-L18)`, written by referenceText.
    const rest = text.slice(start + 1 + path.length)
    const range = /^ \((L[^)]*)\)/.exec(rest)

    if (start > at) tokens.push({ kind: 'text', value: text.slice(at, start) })
    tokens.push({
      kind: 'chip',
      chip: range ? { kind: 'ref', value: path, range: range[1] } : { kind: 'file', value: path },
    })
    at = start + 1 + path.length + (range ? range[0].length : 0)
  }

  if (at < text.length) tokens.push({ kind: 'text', value: text.slice(at) })

  return tokens
}

const isPath = (value: string): boolean => value.includes('/') || /\.[A-Za-z0-9]{1,8}$/.test(value)

/** Neighbouring pieces of text become one, and empty ones go: they would draw as gaps in the card. */
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
