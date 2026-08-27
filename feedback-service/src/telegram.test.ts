import { describe, expect, it } from 'vitest'
import { escapeHtml, fitEscaped, MAX_MESSAGE_CHARS, messageOf } from './telegram.js'

/**
 * How a message reads on the other end, and - more to the point - whether it arrives at all.
 *
 * Telegram refuses a whole message whose markup it cannot parse. The text here is written by somebody
 * reporting a bug, so it contains angle brackets, ampersands and code; every test below is about that
 * text not being able to break the message it travels in.
 */

const feedback = (text: string, extra: Partial<Parameters<typeof messageOf>[0]> = {}) =>
  messageOf({ kind: 'bug', text, email: 'you@example.com', environment: 'ACC 0.8.1', files: [], ...extra })

describe('escaping', () => {
  it('takes the three characters that make HTML, and no others', () => {
    expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d')
    // Underscores, asterisks and backticks are what MarkdownV2 would have needed escaped - and what a bug
    // report is full of. They travel as themselves.
    expect(escapeHtml('a_b *c* `d`')).toBe('a_b *c* `d`')
  })

  it('does not let a report close a tag it never opened', () => {
    const { text } = feedback('the panel printed </b><b>this</b>')

    expect(text).toContain('&lt;/b&gt;')
    expect(text).not.toContain('</b><b>this')
  })
})

describe('the head of the message', () => {
  it('names the kind, the versions and where to answer', () => {
    const { text } = feedback('it hangs')

    expect(text).toContain('Bug')
    expect(text).toContain('ACC 0.8.1')
    expect(text).toContain('you@example.com')
    expect(text.endsWith('it hangs')).toBe(true)
  })

  it('says outright when there is nowhere to answer', () => {
    const { text } = feedback('it hangs', { email: '' })

    expect(text).toContain('cannot be answered')
  })

  it('counts the files, so a phone shows there are some', () => {
    const { text } = feedback('here you go', {
      files: [
        { filename: 'a.png', bytes: Buffer.alloc(1) },
        { filename: 'b.png', bytes: Buffer.alloc(1) },
      ],
    })

    expect(text).toContain('2 files')
  })

  it('passes an unknown kind through rather than dropping it', () => {
    const { text } = feedback('hello', { kind: 'something-new' })

    expect(text).toContain('something-new')
  })
})

describe('a message longer than Telegram carries', () => {
  it('fits inside the ceiling and says where the rest went', () => {
    const long = 'x'.repeat(MAX_MESSAGE_CHARS * 2)
    const { text, overflow } = feedback(long)

    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS)
    expect(text).toContain('message.txt')
    expect(overflow).toBe(long)
  })

  it('leaves a message that fits entirely alone', () => {
    const { text, overflow } = feedback('short and to the point')

    expect(overflow).toBeUndefined()
    expect(text).toContain('short and to the point')
  })
})

describe('the ceiling Telegram enforces', () => {
  it('never cuts through an escaped character', () => {
    // Nothing but ampersands: every one of them becomes five characters, so a naive cut of the escaped
    // text lands inside one and the message ends in visible rubbish.
    const { text } = feedback('&'.repeat(MAX_MESSAGE_CHARS))

    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS)
    expect(/&(?!amp;|lt;|gt;)/.test(text)).toBe(false)
  })

  it('keeps the whole thing inside the ceiling even with an enormous environment', () => {
    const { text, overflow } = feedback('the panel hangs', { environment: 'x'.repeat(50_000) })

    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS)
    // The message itself is short, so nothing of it had to be cut - only the head was capped.
    expect(text).toContain('the panel hangs')
    expect(overflow).toBeUndefined()
  })

  it('still fits when every field is oversized at once', () => {
    const { text } = feedback('y'.repeat(20_000), {
      environment: 'x'.repeat(9_000),
      email: 'a'.repeat(9_000),
      kind: 'z'.repeat(9_000),
    })

    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS)
  })

  it('says where the rest went whenever it cut anything', () => {
    const { text, overflow } = feedback('y'.repeat(MAX_MESSAGE_CHARS * 2))

    expect(text).toContain('message.txt')
    expect(overflow).toHaveLength(MAX_MESSAGE_CHARS * 2)
  })
})

describe('fitting text that has to be escaped', () => {
  it('answers with nothing when there is no room', () => {
    expect(fitEscaped('anything', 0)).toBe('')
  })

  it('never overshoots the room it was given', () => {
    for (const room of [1, 5, 17, 64, 200]) {
      expect(fitEscaped('a<b>&c'.repeat(200), room).length).toBeLessThanOrEqual(room)
    }
  })

  it('gives back the whole thing when it fits', () => {
    expect(fitEscaped('plain words', 100)).toBe('plain words')
  })
})
