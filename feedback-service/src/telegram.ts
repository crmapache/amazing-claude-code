import type { TelegramKeys } from './config.js'

/**
 * Handing a piece of feedback to a Telegram chat.
 *
 * The message itself is short and the attachments follow it as documents. That order matters on a phone:
 * the notification shows the first thing sent, and "a bug in the composer, WebStorm, 0.8.1" is worth
 * seeing there - a file called report.txt is not.
 *
 * HTML rather than MarkdownV2, and that is a decision about whose text this is. MarkdownV2 asks for
 * fifteen characters to be escaped, and a message a person typed contains whatever it contains - one
 * missed underscore and Telegram refuses the whole thing, which would mean losing a bug report because
 * of how it was punctuated. HTML needs three, and they are the three below.
 */

/** Telegram's own ceiling for a message. Anything past it travels as a file instead. */
export const MAX_MESSAGE_CHARS = 4096

export interface Feedback {
  kind: string
  text: string
  email: string
  environment: string
  report?: Buffer
  files: { filename: string; bytes: Buffer }[]
}

export class Telegram {
  constructor(
    private readonly keys: TelegramKeys | null,
    private readonly log: (line: string) => void,
  ) {}

  get enabled(): boolean {
    return this.keys !== null
  }

  /**
   * Send it. The message goes first and its failure is the failure: if the words did not arrive, the
   * files are noise. A document that fails after that is logged and let go - the message names them, and
   * telling the person their whole report failed when the substance of it did arrive would be worse.
   */
  async send(feedback: Feedback): Promise<boolean> {
    if (!this.keys) {
      this.log('feedback arrived but no Telegram is configured - dropping it')
      return false
    }

    const { text, overflow } = messageOf(feedback)

    if (!(await this.call('sendMessage', { chat_id: this.keys.chatId, text, parse_mode: 'HTML' }))) return false

    // The tail of a long message, so nothing a person wrote is lost to a ceiling they never saw.
    if (overflow) await this.document('message.txt', Buffer.from(overflow, 'utf8'))
    if (feedback.report) await this.document('report.txt', feedback.report)

    for (const file of feedback.files) await this.document(file.filename, file.bytes)

    return true
  }

  private async call(method: string, body: unknown): Promise<boolean> {
    const response = await fetch(`https://api.telegram.org/bot${this.keys?.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((error: unknown) => {
      // The reason, never the body: what is in there is somebody's bug report.
      this.log(`telegram ${method} did not answer: ${(error as Error).message}`)
      return null
    })

    if (!response) return false
    if (response.ok) return true

    this.log(`telegram ${method} answered ${response.status}`)
    return false
  }

  private async document(filename: string, bytes: Buffer): Promise<void> {
    if (!this.keys) return

    const form = new FormData()
    form.append('chat_id', this.keys.chatId)
    // Uint8Array rather than the Buffer itself: a Blob built from a Buffer carries its whole backing
    // store in some runtimes, and these buffers are slices of one twenty-megabyte body.
    form.append('document', new Blob([new Uint8Array(bytes)]), filename)

    const response = await fetch(`https://api.telegram.org/bot${this.keys.token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
    }).catch((error: unknown) => {
      this.log(`telegram sendDocument did not answer: ${(error as Error).message}`)
      return null
    })

    if (response && !response.ok) this.log(`telegram sendDocument answered ${response.status}`)
  }
}

/** The three characters that make HTML out of text, and the only escaping this needs. */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const MARKS: Record<string, string> = {
  bug: '🐞 Bug',
  idea: '💡 Idea',
  hello: '👋 Hello',
}

/**
 * The message, and whatever did not fit in it.
 *
 * The head - what kind, from which versions, and where to answer - is never cut: it is what the message is
 * read for. So the person's own words are what gives way, and the whole of them follows as a file.
 *
 * Two things here are less obvious than they look. The head is built from fields the client sent, so every
 * one of them is capped before it is used: an environment string of ten thousand characters would
 * otherwise leave no room for the message and still push the whole thing past Telegram's ceiling, which
 * Telegram answers by refusing it - losing the report entirely. And the cut is made in the original text
 * rather than in the escaped one: "&amp;" cut in the middle is visible rubbish at the end of a message,
 * and the length that matters is the escaped one, so the two have to be reconciled (see [fitEscaped]).
 */
export const messageOf = (feedback: Feedback): { text: string; overflow?: string } => {
  const kind = cap(MARKS[feedback.kind] ?? feedback.kind, MAX_KIND)
  const environment = cap(feedback.environment, MAX_ENVIRONMENT)
  const email = cap(feedback.email, MAX_EMAIL)

  const head = [
    `<b>${escapeHtml(kind)}</b>`,
    environment ? `<i>${escapeHtml(environment)}</i>` : '',
    email ? `✉️ ${escapeHtml(email)}` : '✉️ no address - cannot be answered',
    feedback.files.length > 0 ? `📎 ${feedback.files.length} file${feedback.files.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const whole = escapeHtml(feedback.text)
  const room = MAX_MESSAGE_CHARS - head.length - SEPARATOR.length

  if (whole.length <= room) return { text: head + SEPARATOR + whole }

  const kept = fitEscaped(feedback.text, Math.max(room - CUT_NOTE.length, 0))

  return {
    text: head + SEPARATOR + kept + CUT_NOTE,
    // The whole of what was written, unescaped: it travels as a plain text file.
    overflow: feedback.text,
  }
}

/** A field from the client, at whatever length this message can afford to give it. */
const cap = (text: string, limit: number): string =>
  text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + '…'

/**
 * As much of the original text as fits in `room` characters *after* escaping.
 *
 * Escaping only ever makes text longer, so the answer is at most `room` characters of the original; from
 * there it converges in a step or two, because each pass removes exactly the overshoot it measured.
 */
export const fitEscaped = (text: string, room: number): string => {
  if (room <= 0) return ''

  let take = Math.min(text.length, room)

  for (let guard = 0; guard < 8; guard += 1) {
    const over = escapeHtml(text.slice(0, take)).length - room
    if (over <= 0) return escapeHtml(text.slice(0, take))

    take = Math.max(0, take - over)
  }

  return escapeHtml(text.slice(0, take))
}

const SEPARATOR = '\n\n'

/** What the head may take of the message, field by field. Generous, and finite. */
const MAX_KIND = 40
const MAX_ENVIRONMENT = 220
const MAX_EMAIL = 120

const CUT_NOTE = '\n\n… the rest is attached as message.txt'

const TIMEOUT_MS = 15_000

/** A document may be twenty megabytes on a slow link between here and Telegram. */
const DOCUMENT_TIMEOUT_MS = 120_000
