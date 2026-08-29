import { describe, expect, it } from 'vitest'
import {
  IMPROVE_ATTEMPTS_KEPT,
  improveLanded,
  improveRequest,
  improveResult,
  improveShown,
  improveStarted,
  improveTakenBack,
} from './improve'
import type { ImproveSource } from './improve'
import type { UserToken } from './types'

const text = (value: string): UserToken => ({ kind: 'text', value })
const file = (path: string): UserToken => ({ kind: 'chip', chip: { kind: 'file', value: path } })

describe('improveRequest', () => {
  it('puts a marker where each attachment stands', () => {
    const request = improveRequest([text('look at '), file('src/App.tsx'), text(' please')])

    expect(request?.draft).toBe('look at [[1]] please')
    expect(request?.attachments).toEqual(['[[1]] - the file src/App.tsx'])
  })

  /*
   * Two screenshots one after the other is the ordinary case for this button, and the caption is the only
   * thing that tells them apart - the bytes never leave the panel. Described as "an image" each, they
   * would be two identical lines, and nothing in the answer would say which one had ended up where.
   */
  it('names an image by the caption the person sees', () => {
    const shot = (caption: string): UserToken => ({ kind: 'chip', chip: { kind: 'img', value: caption } })
    const request = improveRequest([shot('Image #1'), text(' before, '), shot('Image #2'), text(' after')])

    expect(request?.attachments).toEqual(['[[1]] - Image #1', '[[2]] - Image #2'])
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

describe('the chain of takes behind the button', () => {
  const mine = [text('find the race in the cart')]
  const theirs = (take: number): UserToken[] => [text(`In this repository: find the race. (Take ${take}.)`)]

  /** A press of the button, with whatever the field holds at that moment. */
  const press = (held: ImproveSource | undefined, field: UserToken[]) =>
    improveStarted(held, improveRequest(field)!, field)

  it('rewrites what was written rather than its own last answer', () => {
    const first = improveLanded(press(undefined, mine), 'take one')
    const second = press(first, theirs(1))

    expect(second.source.draft).toBe('find the race in the cart')
  })

  it('leads back to what was written, however many takes stand between', () => {
    let chain = improveLanded(press(undefined, mine), 'take one')
    chain = improveLanded(press(chain, theirs(1)), 'take two')
    chain = improveLanded(press(chain, theirs(2)), 'take three')

    expect(chain.before).toEqual(mine)
  })

  it('offers no way back until a take has actually landed', () => {
    // A press that comes to nothing leaves the field as it was - and there is nothing to go back from.
    expect(press(undefined, mine).applied).toBe(false)
    expect(improveLanded(press(undefined, mine), 'take one').applied).toBe(true)
  })

  it('keeps the way back open while the next take is being fetched, because the last one still stands', () => {
    const landed = improveLanded(press(undefined, mine), 'take one')

    expect(press(landed, theirs(1)).applied).toBe(true)
  })

  it('remembers the takes pressed past, so the next one is asked to come at it differently', () => {
    let chain = improveLanded(press(undefined, mine), 'take one')
    chain = improveLanded(press(chain, theirs(1)), 'take two')

    expect(chain.attempts).toEqual(['take one', 'take two'])
  })

  it('drops the oldest takes rather than growing the request without bound', () => {
    let chain = press(undefined, mine)
    for (let take = 1; take <= IMPROVE_ATTEMPTS_KEPT + 2; take += 1) chain = improveLanded(chain, `take ${take}`)

    expect(chain.attempts).toHaveLength(IMPROVE_ATTEMPTS_KEPT)
    expect(chain.attempts[0]).toBe('take 3')
  })

  it('reads a step back through the field as being at what was written, not as writing something new', () => {
    const landed = improveLanded(press(undefined, mine), 'take one')
    // Cmd+Z over a take: the same words, and by the same route the panel restores them itself.
    const stepped = improveShown(landed, [text('find the race in the cart')])

    expect(stepped.applied).toBe(false)
    expect(stepped.attempts).toEqual(['take one'])
    expect(stepped.before).toEqual(mine)
  })

  it('reads a step forward through the field as a take standing again', () => {
    const landed = improveLanded(press(undefined, mine), 'take one')
    const back = improveShown(landed, mine)

    expect(improveShown(back, theirs(1)).applied).toBe(true)
  })

  it('tells a draft apart by its attachments, not only by its words', () => {
    const quote: UserToken = { kind: 'chip', chip: { kind: 'quote', value: 'ref1', text: 'a line' } }
    const landed = improveLanded(press(undefined, mine), 'take one')

    expect(improveShown(landed, [...mine, quote]).applied).toBe(true)
  })

  it('still remembers what was turned down after the way back is taken', () => {
    const landed = improveLanded(press(undefined, mine), 'take one')
    const back = improveTakenBack(landed)

    expect(back.applied).toBe(false)
    expect(back.attempts).toEqual(['take one'])
    expect(back.before).toEqual(mine)
    // And the press after it is still a press about the same words rather than a fresh start.
    expect(press(back, mine).attempts).toEqual(['take one'])
  })
})
