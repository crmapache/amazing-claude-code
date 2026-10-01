/**
 * What this phone has sent and the IDE has not yet said it has.
 *
 * A message from a phone goes through a relay and a mobile network, and a frame can be lost on that road
 * without a word: the socket was already dead when Send was pressed, the page went into a pocket half-way,
 * the IDE's own line was down for a minute. Until this existed nothing on either screen said so. A person
 * started a conversation from a phone, wrote into it and saw the tab take its name from the first words -
 * the name is a separate, smaller message - and then nothing at all, at the desk or on the phone, with no
 * error anywhere to say the message itself never arrived.
 *
 * So a message is kept here from the moment it is sent until the IDE answers that it has it (or its echo
 * comes back in the feed, which says the same). Meanwhile:
 *
 * - **Nothing shows for the first moments.** An ordinary round trip is well under [QUIET_MS], and a row
 *   flashing above the field on every message would be noise on a line that works.
 * - **After that it says "Sending", and past [PATIENCE_MS] "Not delivered"** with Retry and a cross - the
 *   text is never simply gone.
 * - **It goes out again by itself when the line comes back**, if it is recent enough that the person
 *   pressing Send still means it ([RESEND_WITHIN_MS]).
 * - **Patience starts when the upload ends, not when Send was pressed.** A message with photos is
 *   megabytes, and over a mobile line that takes longer than [PATIENCE_MS] to leave the phone at all.
 *   Counted from the press, it was "not delivered" while it was still on its way, and Retry sent the
 *   whole of it a second time over the first.
 *
 * Sending again is safe because the IDE takes a message once, by its identifier, and drops every copy
 * after the first (see ArrivedMessages.kt) - a resend of a message that did arrive says nothing twice.
 *
 * Kept in the page's session storage as well as in memory: a phone thrown out of memory in a pocket
 * reloads the page, and a message that had not been confirmed must survive that, or it would be lost in
 * silence exactly as before.
 */

/** One message on its way. */
export interface Unconfirmed {
  /** Its identifier - the IDE answers with it and drops a second copy by it. */
  id: string
  agentId: string
  projectKey: string
  sessionId: string
  /** The command as it was sent, identifier and all - a resend is exactly this again. */
  body: Record<string, unknown>
  /** What the row above the field reads. */
  text: string
  /** When Send was pressed. */
  firstAt: number
  /** When it last went out - the moment the row counts its patience from. */
  sentAt: number
  /**
   * Still leaving this phone: handed to the line, not yet sent out of it. Patience is not counted while
   * it is - see [uploaded].
   */
  uploading?: boolean
}

/** What the row says about it, if anything. */
export type UnconfirmedState = 'quiet' | 'sending' | 'failed'

/** How long an answer may take before anything is said - an ordinary round trip is well inside it. */
export const QUIET_MS = 2_500

/** How long before a message with no answer is called not delivered. */
export const PATIENCE_MS = 12_000

/** How old a message may be and still go out again by itself when the line comes back. */
export const RESEND_WITHIN_MS = 2 * 60_000

/** Never more than this many held at once - past it, the oldest go. */
const KEPT = 20

const STORAGE_KEY = 'acc-unconfirmed'

export const stateOf = (item: Unconfirmed, now: number): UnconfirmedState => {
  const waited = now - item.sentAt
  if (waited < QUIET_MS) return 'quiet'
  return item.uploading || waited < PATIENCE_MS ? 'sending' : 'failed'
}

/** One more message on its way - leaving this phone from this moment, until [uploaded] says it has. */
export const held = (list: readonly Unconfirmed[], item: Unconfirmed): Unconfirmed[] =>
  [...list.filter((one) => one.id !== item.id), { ...item, uploading: true }].slice(-KEPT)

/**
 * It has left this phone, or could not leave at all - either way the waiting for the IDE starts now.
 *
 * A message that could not go (no line, a socket that died half-way) is treated the same: the row says
 * "sending" for the usual moment and then "not delivered", exactly as before uploads were counted, and
 * the line coming back sends it again.
 */
export const uploaded = (list: readonly Unconfirmed[], id: string, now: number): Unconfirmed[] =>
  list.some((one) => one.id === id && one.uploading)
    ? list.map((one) => (one.id === id ? { ...one, uploading: false, sentAt: now } : one))
    : (list as Unconfirmed[])

/** The IDE has it - it is no longer anybody's worry. */
export const confirmed = (list: readonly Unconfirmed[], id: string): Unconfirmed[] =>
  list.some((one) => one.id === id) ? list.filter((one) => one.id !== id) : (list as Unconfirmed[])

/** Given up on by the person - the cross on its row. */
export const dropped = confirmed

/** These went out again just now - their patience starts over, once the upload is done (see [uploaded]). */
export const resent = (list: readonly Unconfirmed[], ids: ReadonlySet<string>, now: number): Unconfirmed[] =>
  list.map((one) => (ids.has(one.id) ? { ...one, sentAt: now, uploading: true } : one))

/**
 * What goes out again by itself now that the line to [agentId] is back.
 *
 * Only what is recent: a message pressed two minutes ago is still meant, while one from an hour ago may
 * well not be - that one waits on its row for the person to press Retry.
 */
export const resendable = (list: readonly Unconfirmed[], agentId: string, now: number): Unconfirmed[] =>
  list.filter((one) => one.agentId === agentId && now - one.firstAt < RESEND_WITHIN_MS)

/** The rows one conversation shows above its field, oldest first. */
export const shownFor = (
  list: readonly Unconfirmed[],
  agentId: string,
  projectKey: string,
  sessionId: string,
  now: number,
): { item: Unconfirmed; state: Exclude<UnconfirmedState, 'quiet'> }[] =>
  list.flatMap((item) => {
    if (item.agentId !== agentId || item.projectKey !== projectKey || item.sessionId !== sessionId) return []
    const state = stateOf(item, now)
    return state === 'quiet' ? [] : [{ item, state }]
  })

/** Where it is kept between two lives of the page - the page's own session storage, unless a test says otherwise. */
export type OutboxStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const pageStorage = (): OutboxStorage => window.sessionStorage

/** What was held when the page was last alive - see the note at the top on why it is kept at all. */
export const loadUnconfirmed = (storage: () => OutboxStorage = pageStorage): Unconfirmed[] => {
  try {
    const raw = storage().getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // An upload in flight died with the page that was doing it. Left marked, its row would say
    // "sending" forever over a message nothing is sending.
    return Array.isArray(parsed) ? parsed.filter(isUnconfirmed).map(({ uploading: _gone, ...one }) => one) : []
  } catch {
    return []
  }
}

/**
 * Write the list down for the page's next life.
 *
 * A message with photos is megabytes, and a page's session storage holds about five of them in all. When
 * the whole list does not fit, the heaviest go first until the rest does: those stay in memory for as
 * long as the page lives, and every other message keeps its place on the disk. Giving up on the write
 * altogether would be worse than it looks - it leaves the PREVIOUS list on the disk, and a page reloaded
 * later would send again messages the IDE has long since confirmed.
 */
export const saveUnconfirmed = (list: readonly Unconfirmed[], storage: () => OutboxStorage = pageStorage): void => {
  const lightestFirst = [...list].sort((a, b) => weightOf(a) - weightOf(b))

  for (let kept = lightestFirst.length; kept >= 0; kept -= 1) {
    const saved = new Set(lightestFirst.slice(0, kept))
    try {
      if (saved.size === 0) storage().removeItem(STORAGE_KEY)
      else storage().setItem(STORAGE_KEY, JSON.stringify(list.filter((one) => saved.has(one))))
      return
    } catch {
      // Storage full or refused: try again without the heaviest one left.
    }
  }
}

const weightOf = (item: Unconfirmed): number => JSON.stringify(item.body).length

const isUnconfirmed = (value: unknown): value is Unconfirmed => {
  if (typeof value !== 'object' || value === null) return false
  const one = value as Record<string, unknown>
  return (
    typeof one.id === 'string' &&
    typeof one.agentId === 'string' &&
    typeof one.projectKey === 'string' &&
    typeof one.sessionId === 'string' &&
    typeof one.text === 'string' &&
    typeof one.firstAt === 'number' &&
    typeof one.sentAt === 'number' &&
    typeof one.body === 'object' &&
    one.body !== null
  )
}
