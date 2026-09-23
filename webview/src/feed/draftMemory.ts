import type { Quote } from '../components/Quotes'
import { reusableMessage } from './reuse'
import type { Chip, ChipKind, UserToken } from './types'

/**
 * A tab's draft on its way to disk and back - so that what was being written in the input field survives
 * a restart of the IDE, a crash of it, or a reload of the page (see TabMemory on the plugin's side).
 *
 * The field is not text: it is a run of words and chips - files, folders, commands, references, quotes,
 * collapsed pastes and pasted pictures - with the quotes above it. All of that is kept, because all of it
 * was work: a draft coming back without the three files it was about is a draft that has to be written
 * again.
 */
export interface SavedDraft {
  tokens: UserToken[]
  quotes: Quote[]
}

/** Whether a field holds anything worth keeping - a word, an attachment or a quote. */
const holdsAnything = (draft: SavedDraft): boolean =>
  draft.quotes.length > 0 ||
  draft.tokens.some((token) => token.kind === 'chip' || token.value.trim().length > 0)

/**
 * The draft as it goes to the IDE - null for a field that is empty.
 *
 * A pasted picture goes without its bytes. They are on disk already (see PastedFiles on the plugin's
 * side), the chip carries the path, and the IDE reads them back when the draft returns - while
 * megabytes of base64 sent on every pause in typing would be the whole cost of this feature. A picture
 * whose file has not been written yet goes without the chip: the path arrives a moment later, the draft
 * changes with it, and the next save carries it.
 */
export const savableDraft = (draft: SavedDraft): SavedDraft | null => {
  const tokens = draft.tokens.flatMap((token): UserToken[] => {
    if (token.kind !== 'chip' || token.chip.kind !== 'img' || !token.chip.data) return [token]
    if (!token.chip.path) return []

    const { data: _bytes, ...chip } = token.chip
    return [{ kind: 'chip', chip }]
  })

  const saved = { tokens, quotes: draft.quotes }
  return holdsAnything(saved) ? saved : null
}

const CHIP_KINDS: ReadonlySet<ChipKind> = new Set(['file', 'img', 'dir', 'cmd', 'ref', 'quote', 'paste'])

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const chipOf = (raw: unknown): Chip | null => {
  if (typeof raw !== 'object' || raw === null) return null

  const fields = raw as Record<string, unknown>
  const kind = fields.kind as ChipKind
  const value = text(fields.value)
  if (!CHIP_KINDS.has(kind) || value === undefined) return null

  const chip: Chip = { kind, value }
  const range = text(fields.range)
  const data = text(fields.data)
  const path = text(fields.path)
  const body = text(fields.text)
  if (range !== undefined) chip.range = range
  // Only a data URL of a picture: anything else in this field would be handed to the agent as an image.
  if (data !== undefined && data.startsWith('data:image/')) chip.data = data
  if (path !== undefined) chip.path = path
  if (body !== undefined) chip.text = body
  return chip
}

const tokenOf = (raw: unknown): UserToken | null => {
  if (typeof raw !== 'object' || raw === null) return null

  const fields = raw as Record<string, unknown>
  if (fields.kind === 'text') {
    const value = text(fields.value)
    return value === undefined ? null : { kind: 'text', value }
  }

  if (fields.kind !== 'chip') return null
  const chip = chipOf(fields.chip)
  return chip ? { kind: 'chip', chip } : null
}

const quoteOf = (raw: unknown): Quote | null => {
  if (typeof raw !== 'object' || raw === null) return null

  const fields = raw as Record<string, unknown>
  const id = text(fields.id)
  const body = text(fields.text)
  return id !== undefined && body !== undefined ? { id, text: body } : null
}

/**
 * A draft as it comes back from the IDE, made safe to put into the field - null when nothing of it is.
 *
 * Read as untrusted rather than cast: it was written to disk by another version of the panel, maybe a
 * newer one, and a token of a shape this one does not know would break the field it is put into. So
 * every token and quote is checked, and what does not check out is left out rather than failing the
 * whole draft.
 *
 * A pasted picture comes back with its bytes when its file was still there (the IDE reads it back). One
 * whose file is gone - swept after two weeks, or never written - comes back as a reference to that path
 * if there is one, and not at all if there is not: the same rule a sent message follows when it is put
 * back into the field (see reusableMessage).
 */
export const restoredDraft = (raw: unknown): SavedDraft | null => {
  if (typeof raw !== 'object' || raw === null) return null

  const fields = raw as Record<string, unknown>
  const tokens = (Array.isArray(fields.tokens) ? fields.tokens : [])
    .map(tokenOf)
    .filter((token): token is UserToken => token !== null)
  const quotes = (Array.isArray(fields.quotes) ? fields.quotes : [])
    .map(quoteOf)
    .filter((quote): quote is Quote => quote !== null)

  const draft = { tokens: reusableMessage({ tokens }).tokens, quotes }
  return holdsAnything(draft) ? draft : null
}

/** What a draft is compared by, to tell a change worth sending from the same draft said again. */
export const draftKey = (draft: SavedDraft | null): string => (draft ? JSON.stringify(draft) : '')
