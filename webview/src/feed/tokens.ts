import { referenceText } from './reference'
import type { Chip, ChipKind, UserToken } from './types'

/**
 * What the input field's contents mean to the agent - and how they survive the clipboard.
 *
 * This lives apart from the panel because it is needed from two sides: the panel assembles a message
 * with it before sending, and the input field answers a copy with the same thing - and those two
 * answers must not drift apart.
 */

/**
 * Whether something appended to this text would run into it.
 *
 * The one question three different join rules all begin with (see appendChip and appendText in
 * feed/slash.ts, voiceJoin in feed/voice.ts), and the one that breaks quietly: written out separately
 * each time, one of the copies loses the "already ends in a space" half and glues two words together in
 * a message that has already gone.
 *
 * What each of them does about the answer is their own business, and deliberately not shared - a
 * dictated Japanese phrase wants no space at all, while a file path after the same phrase wants one.
 */
export const endsOpen = (text: string): boolean => text.length > 0 && !/\s$/.test(text)

/** An image from the clipboard: the kind that has bytes rather than just a path. */
const isImage = (token: UserToken): boolean =>
  token.kind === 'chip' && token.chip.kind === 'img' && Boolean(token.chip.data)

/** An attachment's text inside a line - exactly what the agent sees in its place. */
export const tokenText = (token: UserToken): string => {
  if (token.kind === 'text') return token.value

  const { chip } = token
  if (chip.kind === 'cmd') return `/${chip.value}`
  if (chip.kind === 'ref') return referenceText(chip)
  // A quote is not a path on disk but the text itself: the agent gets it whole rather than what is
  // visible in the chip.
  if (chip.kind === 'quote') return `"${chip.text ?? ''}"`
  // A collapsed paste is exactly the text that was pasted: it is collapsed into a chip on screen only,
  // and travels to the agent as though it had been typed by hand.
  if (chip.kind === 'paste') return chip.text ?? ''
  // An image without bytes is one chosen in the IDE's dialog rather than pasted from the clipboard.
  // That is an ordinary reference to a file, and it has to travel through @ like any other: inside
  // brackets the agent would see only a name and could not read the file.
  return `@${chip.value}`
}

/**
 * What an attachment means in the clipboard - which is not what it means to the agent.
 *
 * The agent is handed the message: `@path` for a file, `[Image #3]` for bytes that travel beside the
 * text. A person copying that message is taking it somewhere else - a task, a chat, a terminal - and
 * there the only useful thing an attachment can leave behind is the path to what it stood for. So the
 * marker `@` goes (it is this field's syntax and means nothing outside it), and a pasted picture gives
 * the file it was written into (see PastedFiles.kt), falling back to its caption when there is none.
 */
export const clipboardText = (token: UserToken): string => {
  if (token.kind === 'text') return token.value

  const { chip } = token
  if (chip.kind === 'cmd') return `/${chip.value}`
  if (chip.kind === 'quote') return chip.text ?? ''
  if (chip.kind === 'paste') return chip.text ?? ''
  if (chip.kind === 'ref') return chip.range ? `${chip.value} (${chip.range})` : chip.value
  // Bytes from the clipboard: the path if the shell managed to keep them, the caption if it did not - an
  // empty space where an attachment stood would say less than its number does.
  if (chip.data) return chip.path || `[${chip.value}]`

  return chip.value
}

/** A whole message as it goes into the clipboard. */
export const clipboardTextOf = (tokens: UserToken[]): string => tokens.map(clipboardText).join('')

/**
 * The text of a sequence of attachments, with the images numbered.
 *
 * An image's number is recounted from its place in the sequence rather than taken from the chip: the
 * stored one may be stale if the image was inserted not at the end but before an already inserted one -
 * otherwise the agent gets the bytes in one order and the [Image #N] captions in the text in another,
 * and ties them together wrongly. The bytes in imageAttachments go in the same order as the tokens, so
 * the numbering matches here and there always.
 *
 * The count starts not from zero but from offset - how many images have already travelled earlier in
 * this same session.
 */
export const tokensText = (tokens: UserToken[], offset = 0): string => {
  let ordinal = offset

  return tokens
    .map((token) => {
      if (!isImage(token)) return tokenText(token)
      ordinal += 1
      return `[Image #${ordinal}]`
    })
    .join('')
}

/**
 * How many images have already travelled to the agent earlier in this same session - through sent
 * messages and through what already stands in the queue. The numbering carries on from that number
 * rather than starting at zero on every message: otherwise an "Image #1" repeats in line after line,
 * and the number no longer tells which image is meant when there are several over a conversation.
 *
 * Here rather than in the panel because both screens number them now: what is sent from a phone and
 * what is sent from the desk go into the same conversation, and two counters would each start from
 * their own idea of "the first".
 */
export const countSessionImages = (items: { kind: string; tokens?: UserToken[] }[], queued = 0): number => {
  const sent = items.reduce(
    (sum, item) =>
      item.kind === 'user' ? sum + (item.tokens ?? []).filter(isImage).length : sum,
    0,
  )

  return sent + queued
}

/**
 * Trims an empty tail - spaces and newlines - off the end of a sequence.
 *
 * Needed because the input field does not show its last line: a newline at the very end takes up no
 * room, and there is nothing on it but perhaps the caret - the person does not see it as content.
 * Pressed Shift+Enter, changed their mind, sent it - and the feed must not be left with an empty line
 * that was not in the field.
 *
 * The agent does not get such a tail anyway (composePrompt trims the text on both sides), so we trim it
 * here too: the feed shows exactly what was sent.
 */
export const trimTrailingSpace = (tokens: UserToken[]): UserToken[] => {
  const trimmed = [...tokens]

  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]
    if (!last || last.kind !== 'text') break

    const value = last.value.trimEnd()
    trimmed.pop()
    if (value) {
      trimmed.push({ kind: 'text', value })
      break
    }
  }

  return trimmed
}

/** The whole message: the quotes on separate lines above, and the field itself below. */
export const composePrompt = (
  { tokens, quotes }: { tokens: UserToken[]; quotes: { text: string }[] },
  imageOffset: number,
): string => {
  const parts: string[] = []

  for (const quote of quotes) parts.push(`> ${quote.text}`)

  const body = tokensText(tokens, imageOffset).trim()
  if (body) parts.push(body)

  return parts.join('\n')
}

const DATA_URL = /^data:([^;]+);base64,(.+)$/

/** The bytes of images pasted from the clipboard - what genuinely travels to the agent as an attachment. */
export const imageAttachments = (tokens: UserToken[]): { mediaType: string; data: string }[] =>
  tokens.flatMap((token) => {
    if (token.kind !== 'chip' || token.chip.kind !== 'img' || !token.chip.data) return []
    const match = token.chip.data.match(DATA_URL)
    return match?.[1] && match[2] ? [{ mediaType: match[1], data: match[2] }] : []
  })

// --- The clipboard ----------------------------------------------------------

/**
 * The mark of our own content in the clipboard.
 *
 * Attachments in the input field are not text but chips, and an image's bytes do not live in the field
 * itself: they are tied to a live node. Copying such a thing the ordinary way is impossible - the
 * browser would put the chip's visible caption into the clipboard along with the icon and the cross of
 * its delete button, and that would later paste back as a meaningless string.
 *
 * So alongside the readable text we put a full description of the attachments into the clipboard -
 * images' bytes included. text/html was chosen as the carrier: it is the only format besides plain text
 * that reliably survives the system clipboard, so pasting works after an IDE restart and in another
 * window, not only while the same webview is alive.
 */
export const CLIPBOARD_ATTRIBUTE = 'data-acc-tokens'

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The readable half of what goes into the clipboard - the same text, but said in markup.
 *
 * A newline is not a line break in HTML: it is whitespace, and whitespace there collapses into a single
 * space. So a message written in lines arrived in whoever was pasted into as one long paragraph - and
 * that is most of the places a person carries a message to, because an editor, a messenger, a task
 * tracker all prefer text/html over the plain text lying beside it. The plain half was right all along,
 * which is why this broke quietly: paste into a terminal and the lines are there, paste into anything
 * that renders and they are gone.
 *
 * Breaks are spelled out with <br> rather than left to `white-space`: the property is set here too, but
 * it is the first thing an application strips when it cleans up someone else's markup, and a <br> is the
 * one thing every one of them understands. The property earns its place on what is left - the runs of
 * spaces and the indentation of a list, which without it collapse just as the newlines did.
 */
const clipboardBody = (text: string): string => escapeHtml(text).replace(/\n/g, '<br>')

/** What goes into text/html: the attachments' description in an attribute, the readable text inside. */
export const clipboardHtml = (tokens: UserToken[]): string =>
  `<span style="white-space:pre-wrap" ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent(JSON.stringify(tokens))}">${clipboardBody(tokensText(tokens))}</span>`

const CHIP_KINDS: ChipKind[] = ['file', 'img', 'dir', 'cmd', 'ref', 'quote', 'paste']

const isChip = (value: unknown): value is Chip => {
  if (typeof value !== 'object' || value === null) return false

  const chip = value as Record<string, unknown>
  if (typeof chip.value !== 'string') return false
  if (!CHIP_KINDS.includes(chip.kind as ChipKind)) return false

  for (const field of ['range', 'data', 'text'] as const) {
    if (chip[field] !== undefined && typeof chip[field] !== 'string') return false
  }

  // An image whose bytes do not parse is broken: no attachment would travel to the agent, while the
  // chip would promise otherwise. Such a paste is better handed over as plain text.
  return !(chip.kind === 'img' && chip.data !== undefined && !DATA_URL.test(chip.data as string))
}

const isToken = (value: unknown): value is UserToken => {
  if (typeof value !== 'object' || value === null) return false

  const token = value as Record<string, unknown>
  if (token.kind === 'text') return typeof token.value === 'string'
  return token.kind === 'chip' && isChip(token.chip)
}

/**
 * Takes the attachments back out of the clipboard.
 *
 * The attribute's value is encoded, so there can be no quotation marks inside - we read it with an
 * expression rather than raise a whole document parser for it. Anything that does not look like our own
 * record is returned as "nothing": the paste then goes the ordinary way, as plain text, rather than
 * breaking the field.
 */
export const clipboardTokens = (html: string): UserToken[] | null => {
  const match = html.match(new RegExp(`${CLIPBOARD_ATTRIBUTE}="([^"]*)"`))
  if (!match?.[1]) return null

  const parsed = ((): unknown => {
    try {
      return JSON.parse(decodeURIComponent(match[1] as string))
    } catch {
      return null
    }
  })()

  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isToken)) return null

  return parsed
}
