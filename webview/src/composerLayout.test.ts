import { describe, expect, it } from 'vitest'
import { normalizeComposerLayout } from './composerLayout'

describe('normalizeComposerLayout', () => {
  it('lets left, right and compact through as they are', () => {
    expect(normalizeComposerLayout('left')).toBe('left')
    expect(normalizeComposerLayout('right')).toBe('right')
    expect(normalizeComposerLayout('compact')).toBe('compact')
  })

  it('treats everything else - empty, rubbish and an old or foreign value - as "bottom"', () => {
    expect(normalizeComposerLayout('bottom')).toBe('bottom')
    expect(normalizeComposerLayout(undefined)).toBe('bottom')
    expect(normalizeComposerLayout('')).toBe('bottom')
    expect(normalizeComposerLayout('top')).toBe('bottom')
  })
})
