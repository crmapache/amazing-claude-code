import { describe, expect, it } from 'vitest'
import { draftKey, restoredDraft, savableDraft } from './draftMemory'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('savableDraft', () => {
  it('keeps words, attachments and quotes as they stand', () => {
    const draft = {
      tokens: [
        { kind: 'text' as const, value: 'look at ' },
        { kind: 'chip' as const, chip: { kind: 'file' as const, value: 'src/App.tsx' } },
      ],
      quotes: [{ id: 'q1', text: 'the answer' }],
    }

    expect(savableDraft(draft)).toEqual(draft)
  })

  /* The bytes are on disk already - megabytes of base64 on every pause in typing is the cost to avoid. */
  it('sends a pasted picture as its path, without the bytes', () => {
    const saved = savableDraft({
      tokens: [{ kind: 'chip', chip: { kind: 'img', value: 'Image #1', data: PNG, path: '/tmp/pasted/a.png' } }],
      quotes: [],
    })

    expect(saved?.tokens).toEqual([{ kind: 'chip', chip: { kind: 'img', value: 'Image #1', path: '/tmp/pasted/a.png' } }])
  })

  /* Its path arrives a moment later, the draft changes, and the next save carries it. */
  it('leaves out a picture whose file has not been written yet', () => {
    const saved = savableDraft({
      tokens: [
        { kind: 'text', value: 'see' },
        { kind: 'chip', chip: { kind: 'img', value: 'Image #1', data: PNG } },
      ],
      quotes: [],
    })

    expect(saved?.tokens).toEqual([{ kind: 'text', value: 'see' }])
  })

  it('says an empty field is empty, whitespace included', () => {
    expect(savableDraft({ tokens: [], quotes: [] })).toBeNull()
    expect(savableDraft({ tokens: [{ kind: 'text', value: '  \n' }], quotes: [] })).toBeNull()
  })
})

describe('restoredDraft', () => {
  it('brings a saved draft back as it was', () => {
    const draft = {
      tokens: [
        { kind: 'text', value: 'fix ' },
        { kind: 'chip', chip: { kind: 'ref', value: 'src/a.ts', range: 'L1-L4' } },
        { kind: 'chip', chip: { kind: 'paste', value: '120 lines', text: 'a\nb' } },
      ],
      quotes: [{ id: 'q', text: 'quoted' }],
    }

    expect(restoredDraft(draft)).toEqual(draft)
  })

  it('keeps a picture whose bytes the IDE read back', () => {
    const chip = { kind: 'img', value: 'Image #1', data: PNG, path: '/p/a.png' }
    expect(restoredDraft({ tokens: [{ kind: 'chip', chip }], quotes: [] })?.tokens).toEqual([{ kind: 'chip', chip }])
  })

  /* The file was swept: the picture comes back as the path the agent can still open, like a reused message. */
  it('turns a picture without bytes into a reference to its file', () => {
    const restored = restoredDraft({
      tokens: [{ kind: 'chip', chip: { kind: 'img', value: 'Image #1', path: '/p/a.png' } }],
      quotes: [],
    })

    expect(restored?.tokens).toEqual([{ kind: 'chip', chip: { kind: 'file', value: '/p/a.png' } }])
  })

  /* Written by another version of the panel: what does not check out is left out, the rest comes back. */
  it('drops what it does not recognise rather than the whole draft', () => {
    const restored = restoredDraft({
      tokens: [
        { kind: 'text', value: 'keep me' },
        { kind: 'hologram', value: 'x' },
        { kind: 'chip', chip: { kind: 'teleport', value: 'y' } },
        { kind: 'chip', chip: { kind: 'img', value: 'Image #2', data: 'javascript:alert(1)' } },
      ],
      quotes: [{ id: 1, text: 'no id' }, 'nonsense'],
    })

    expect(restored).toEqual({ tokens: [{ kind: 'text', value: 'keep me' }], quotes: [] })
  })

  it('reads nonsense as no draft', () => {
    expect(restoredDraft(null)).toBeNull()
    expect(restoredDraft('draft')).toBeNull()
    expect(restoredDraft({ tokens: [], quotes: [] })).toBeNull()
  })
})

describe('draftKey', () => {
  it('is the same for the same draft and empty for none', () => {
    const draft = { tokens: [{ kind: 'text' as const, value: 'a' }], quotes: [] }
    expect(draftKey(draft)).toBe(draftKey({ ...draft }))
    expect(draftKey(null)).toBe('')
  })
})
