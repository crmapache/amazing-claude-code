import { describe, expect, it } from 'vitest'
import { reusableMessage } from './reuse'
import type { UserToken } from './types'

const text = (value: string): UserToken => ({ kind: 'text', value })

describe('reusableMessage', () => {
  it('gives the ordinary pieces back untouched', () => {
    const tokens: UserToken[] = [
      text('look at '),
      { kind: 'chip', chip: { kind: 'file', value: 'src/App.tsx' } },
      text(' and '),
      { kind: 'chip', chip: { kind: 'dir', value: 'src/feed/' } },
      text(' - the paste is '),
      { kind: 'chip', chip: { kind: 'paste', value: 'pasted', text: 'a log' } },
    ]

    expect(reusableMessage({ tokens })).toEqual({ tokens, lostImages: 0 })
  })

  it('keeps a pasted image whose bytes are still here', () => {
    const tokens: UserToken[] = [
      { kind: 'chip', chip: { kind: 'img', value: 'Image #1', data: 'data:image/png;base64,AA' } },
    ]

    expect(reusableMessage({ tokens })).toEqual({ tokens, lostImages: 0 })
  })

  it('turns an image with only a file under it into that file', () => {
    const result = reusableMessage({
      tokens: [{ kind: 'chip', chip: { kind: 'img', value: 'Image #1', path: '/tmp/acc/shot.png' } }],
    })

    expect(result).toEqual({
      tokens: [{ kind: 'chip', chip: { kind: 'file', value: '/tmp/acc/shot.png' } }],
      lostImages: 0,
    })
  })

  it('leaves out an image that has neither, and says how many', () => {
    const result = reusableMessage({
      tokens: [
        text('before '),
        { kind: 'chip', chip: { kind: 'img', value: 'Image #1' } },
        text(' after'),
        { kind: 'chip', chip: { kind: 'img', value: 'Image #2' } },
      ],
    })

    // The text on either side of the dropped chip is one piece again: two tokens would draw with the gap
    // the chip used to fill still in it.
    expect(result).toEqual({ tokens: [text('before  after')], lostImages: 2 })
  })
})
