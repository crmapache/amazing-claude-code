import { describe, expect, it } from 'vitest'
import {
  CLIPBOARD_ATTRIBUTE,
  clipboardHtml,
  clipboardTokens,
  composePrompt,
  imageAttachments,
  tokensText,
  trimTrailingSpace,
} from './tokens'
import type { UserToken } from './types'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

const text = (value: string): UserToken => ({ kind: 'text', value })
const image = (value: string, data = PNG): UserToken => ({ kind: 'chip', chip: { kind: 'img', value, data } })

describe('tokensText', () => {
  it('numbers the images by their place rather than by a caption left over from the paste', () => {
    const tokens = [image('Image #7'), text(' and '), image('Image #2')]
    expect(tokensText(tokens)).toBe('[Image #1] and [Image #2]')
  })

  it('carries the numbering on from how many images have already travelled in the session', () => {
    expect(tokensText([image('Image #1')], 3)).toBe('[Image #4]')
  })

  it('hands an image without bytes over as a file reference: in brackets the agent will not read it', () => {
    const picked: UserToken = { kind: 'chip', chip: { kind: 'img', value: 'assets/logo.png' } }
    expect(tokensText([picked])).toBe('@assets/logo.png')
  })

  it('hands the other attachments over exactly as the agent sees them', () => {
    const tokens: UserToken[] = [
      { kind: 'chip', chip: { kind: 'cmd', value: 'model' } },
      text(' '),
      { kind: 'chip', chip: { kind: 'ref', value: 'src/App.tsx', range: 'L1-L4' } },
      text(' '),
      { kind: 'chip', chip: { kind: 'dir', value: 'src/feed/' } },
      text(' '),
      { kind: 'chip', chip: { kind: 'quote', value: 'ref1', text: 'a piece of code' } },
    ]
    expect(tokensText(tokens)).toBe('/model @src/App.tsx (L1-L4) @src/feed/ "a piece of code"')
  })
})

describe('trimTrailingSpace', () => {
  it('removes the line break the caret stood on: it was invisible in the field', () => {
    expect(trimTrailingSpace([text('one'), text('\n')])).toEqual([text('one')])
  })

  it('takes the whole empty tail off, however many tokens it spans', () => {
    expect(trimTrailingSpace([text('one'), text('\n'), text('\n  ')])).toEqual([text('one')])
  })

  it('cuts the tail inside the token itself without touching the breaks in the middle', () => {
    expect(trimTrailingSpace([text('one\ntwo\n\n')])).toEqual([text('one\ntwo')])
  })

  it('leaves an attachment at the end as it is - it is visible', () => {
    const tokens = [text('look at '), image('Image #1')]
    expect(trimTrailingSpace(tokens)).toEqual(tokens)
  })

  it('lets a message of nothing but spaces come to nothing', () => {
    expect(trimTrailingSpace([text('  \n')])).toEqual([])
  })
})

describe('composePrompt', () => {
  it('lifts the quotes as separate lines above the message itself', () => {
    const draft = { tokens: [text('fix this')], quotes: [{ text: 'const a = 1' }] }
    expect(composePrompt(draft, 0)).toBe('> const a = 1\nfix this')
  })

  it('matches the numbering in the text to the order of the bytes travelling beside it', () => {
    const tokens = [image('Image #1', PNG), text(' versus '), image('Image #2', JPEG)]

    expect(composePrompt({ tokens, quotes: [] }, 0)).toBe('[Image #1] versus [Image #2]')
    expect(imageAttachments(tokens).map((item) => item.mediaType)).toEqual(['image/png', 'image/jpeg'])
  })
})

describe('imageAttachments', () => {
  it('hands the type and the bytes over separately, without the data-url prefix', () => {
    expect(imageAttachments([image('Image #1')])).toEqual([{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }])
  })

  it('skips the attachments without bytes', () => {
    const picked: UserToken = { kind: 'chip', chip: { kind: 'img', value: 'assets/logo.png' } }
    expect(imageAttachments([picked, text('hello')])).toEqual([])
  })
})

describe('the clipboard', () => {
  const tokens = [text('look '), image('Image #1'), text(' here')]

  it('returns the same attachments together with the image bytes', () => {
    expect(clipboardTokens(clipboardHtml(tokens))).toEqual(tokens)
  })

  it('survives the wrapper the browser wraps a paste in', () => {
    const wrapped = `<html><body><!--StartFragment-->${clipboardHtml(tokens)}<!--EndFragment--></body></html>`
    expect(clipboardTokens(wrapped)).toEqual(tokens)
  })

  it('puts readable text beside it - the same the agent will see', () => {
    expect(clipboardHtml(tokens)).toContain('look [Image #1] here')
  })

  it('does not break on angle brackets in the text', () => {
    const html = clipboardHtml([text('a < b > c')])
    expect(html).toContain('a &lt; b &gt; c')
    expect(clipboardTokens(html)).toEqual([text('a < b > c')])
  })

  it('does not recognise someone else clipboard contents as its own', () => {
    expect(clipboardTokens('<b>just some markup</b>')).toBeNull()
    expect(clipboardTokens('')).toBeNull()
  })

  it('rolls back on a corrupted record rather than slipping half of it in', () => {
    expect(clipboardTokens(`<span ${CLIPBOARD_ATTRIBUTE}="not json"></span>`)).toBeNull()
    expect(clipboardTokens(`<span ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent('[]')}"></span>`)).toBeNull()
    expect(
      clipboardTokens(`<span ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent(JSON.stringify([{ kind: 'wat' }]))}"></span>`),
    ).toBeNull()
  })

  it('rejects an image with unparsable bytes entirely: the chip would promise an attachment', () => {
    const broken = [{ kind: 'chip', chip: { kind: 'img', value: 'Image #1', data: 'rubbish' } }]
    expect(
      clipboardTokens(`<span ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent(JSON.stringify(broken))}"></span>`),
    ).toBeNull()
  })
})
