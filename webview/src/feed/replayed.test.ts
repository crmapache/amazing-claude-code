import { describe, expect, it } from 'vitest'
import { replayedMessage } from './replayed'
import type { Chip, UserToken } from './types'

/**
 * Reading a person's message back out of a transcript.
 *
 * The panel sends chips and gets one string back - that is all a conversation keeps. What is tested
 * here is the way back, and the interesting half of it is what must NOT be recognised: a chip is a
 * claim that a file was handed to the agent, and inventing one out of an `@` in ordinary prose would
 * be worse than showing the line as it was written.
 */

const chips = (tokens: UserToken[]): Chip[] =>
  tokens.flatMap((token) => (token.kind === 'chip' ? [token.chip] : []))

const text = (tokens: UserToken[]): string =>
  tokens.map((token) => (token.kind === 'text' ? token.value : '')).join('')

describe('a message read back out of a transcript', () => {
  it('turns a path into a file chip', () => {
    const { tokens } = replayedMessage('look at @webview/src/App.tsx and tell me')

    expect(chips(tokens)).toEqual([{ kind: 'file', value: 'webview/src/App.tsx' }])
    expect(text(tokens)).toBe('look at  and tell me')
  })

  /** A reference from the editor carries the lines it was sent for - the chip shows them too. */
  it('keeps the range of a reference from the editor', () => {
    const { tokens } = replayedMessage('@src/feed/build.ts (L12-L18) what happens here')

    expect(chips(tokens)).toEqual([{ kind: 'ref', value: 'src/feed/build.ts', range: 'L12-L18' }])
  })

  it('recognises an image the panel numbered', () => {
    const { tokens } = replayedMessage('[Image #2] what is wrong here')

    expect(chips(tokens)).toEqual([{ kind: 'img', value: 'Image #2' }])
  })

  /**
   * The case this guard exists for: `@media`, `@Override`, somebody's handle. A chip promises the agent
   * was given a file, and a wrong promise is worse than plain text.
   */
  it('leaves a word that merely begins with an at sign alone', () => {
    const { tokens } = replayedMessage('the @media rule and @crmapache both stay as they are')

    expect(chips(tokens)).toEqual([])
    expect(text(tokens)).toBe('the @media rule and @crmapache both stay as they are')
  })

  it('drops the punctuation that follows a path rather than swallowing it', () => {
    const { tokens } = replayedMessage('see @relay/README.md, then decide')

    expect(chips(tokens)).toEqual([{ kind: 'file', value: 'relay/README.md' }])
    expect(text(tokens)).toBe('see , then decide')
  })

  /** The lines quoted above a message travel as `> ` and belong in the card's own block. */
  it('takes the quoted lines off the top', () => {
    const { quotes, tokens } = replayedMessage('> the first line\n> the second\nnow answer this')

    expect(quotes).toEqual(['the first line', 'the second'])
    expect(text(tokens)).toBe('now answer this')
  })

  it('leaves a quotation further down the message where it is', () => {
    const { quotes, tokens } = replayedMessage('answer this\n> and this stays in the text')

    expect(quotes).toEqual([])
    expect(text(tokens)).toContain('> and this stays in the text')
  })

  /**
   * A quote of the agent's own words is collapsed back into the chip it was sent as - but only when the
   * agent genuinely said it, which is the whole guard against collapsing a sentence somebody put in
   * quotation marks themselves.
   */
  it('collapses a quotation of the agent back into a chip', () => {
    const answer = 'The queue collapses instead of dropping the oldest, because a feed with a hole in it is worse.'
    const { tokens } = replayedMessage(`"${answer}" why does it work that way?`, [answer])

    expect(chips(tokens)).toEqual([{ kind: 'quote', value: 'ref1', text: answer }])
    expect(text(tokens)).toBe(' why does it work that way?')
  })

  /** The words on screen have no markup in them; the answer they came from is kept as markdown. */
  it('recognises a quotation across the markup it was drawn without', () => {
    const answer = 'The queue **collapses** instead of dropping the oldest, because a feed with a\nhole in it is worse.'
    const quoted = 'The queue collapses instead of dropping the oldest, because a feed with a hole in it is worse.'

    expect(chips(replayedMessage(`"${quoted}"`, [answer]).tokens)).toHaveLength(1)
  })

  it('leaves a quotation nobody said as it was written', () => {
    const written = 'this is a long sentence in quotation marks that the agent never said at all'
    const { tokens } = replayedMessage(`"${written}" - my own words`, ['something else entirely'])

    expect(chips(tokens)).toEqual([])
    expect(text(tokens)).toBe(`"${written}" - my own words`)
  })

  it('numbers several quotes the way the panel does', () => {
    const first = 'The first thing the agent said, at some length so that it counts as a quotation.'
    const second = 'The second thing the agent said, also long enough to be recognised as one.'
    const { tokens } = replayedMessage(`"${first}" and "${second}" - both`, [first, second])

    expect(chips(tokens).map((chip) => chip.value)).toEqual(['ref1', 'ref2'])
  })

  /** Short quotation marks are ordinary punctuation - a name, a word being defined. */
  it('does not touch a short quotation', () => {
    const { tokens } = replayedMessage('the "main" tab', ['the "main" tab'])

    expect(chips(tokens)).toEqual([])
  })

  it('gives back nothing to draw for an empty message', () => {
    expect(replayedMessage('')).toEqual({ tokens: [], quotes: [] })
  })
})
