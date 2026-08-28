import { describe, expect, it } from 'vitest'
import { improveRequest, improveResult } from './improve'
import type { UserToken } from './types'

const text = (value: string): UserToken => ({ kind: 'text', value })
const file = (path: string): UserToken => ({ kind: 'chip', chip: { kind: 'file', value: path } })

describe('improveRequest', () => {
  it('puts a marker where each attachment stands', () => {
    const request = improveRequest([text('look at '), file('src/App.tsx'), text(' please')])

    expect(request?.draft).toBe('look at [[1]] please')
    expect(request?.attachments).toEqual(['[[1]] - the file src/App.tsx'])
  })

  it('refuses a draft that is nothing but attachments', () => {
    expect(improveRequest([file('a.ts'), text(' '), file('b.ts')])).toBeNull()
  })

  it('holds a leading slash command aside', () => {
    const request = improveRequest([
      { kind: 'chip', chip: { kind: 'cmd', value: 'review' } },
      text(' this thing'),
    ])

    expect(request?.command?.value).toBe('review')
    expect(request?.draft).toBe('this thing')
    expect(request?.chips).toEqual([])
  })
})

describe('improveResult', () => {
  const request = improveRequest([text('fix '), file('src/App.tsx'), text(' now')])!

  it('puts the attachment back where the answer moved it', () => {
    expect(improveResult(request, 'In [[1]], fix the button.')).toEqual([
      { kind: 'text', value: 'In ' },
      { kind: 'chip', chip: { kind: 'file', value: 'src/App.tsx' } },
      { kind: 'text', value: ', fix the button.' },
    ])
  })

  it('keeps an attachment the answer forgot', () => {
    expect(improveResult(request, 'Fix the button.')).toEqual([
      { kind: 'text', value: 'Fix the button. ' },
      { kind: 'chip', chip: { kind: 'file', value: 'src/App.tsx' } },
      { kind: 'text', value: ' ' },
    ])
  })

  it('honours a repeated marker once and drops a made-up one', () => {
    expect(improveResult(request, 'Fix [[1]] and [[1]] and [[9]].')).toEqual([
      { kind: 'text', value: 'Fix ' },
      { kind: 'chip', chip: { kind: 'file', value: 'src/App.tsx' } },
      { kind: 'text', value: ' and  and .' },
    ])
  })

  it('strips a fence and wrapping quotes the answer arrived in', () => {
    expect(improveResult(request, '```\nFix [[1]].\n```')?.[0]).toEqual({ kind: 'text', value: 'Fix ' })
    expect(improveResult(request, '"Fix [[1]]."')?.[0]).toEqual({ kind: 'text', value: 'Fix ' })
  })

  it('puts the slash command back in front', () => {
    const withCommand = improveRequest([
      { kind: 'chip', chip: { kind: 'cmd', value: 'review' } },
      text(' this thing'),
    ])!

    expect(improveResult(withCommand, 'Review the checkout flow.')).toEqual([
      { kind: 'chip', chip: { kind: 'cmd', value: 'review' } },
      { kind: 'text', value: ' ' },
      { kind: 'text', value: 'Review the checkout flow.' },
    ])
  })

  it('has nothing to apply when the answer is empty', () => {
    expect(improveResult(request, '   ')).toBeNull()
  })
})
