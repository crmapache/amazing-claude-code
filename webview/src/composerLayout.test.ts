import { describe, expect, it } from 'vitest'
import { layoutForRoom, normalizeComposerLayout } from './composerLayout'

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

describe('layoutForRoom', () => {
  it('draws a low panel compact instead of the default layout', () => {
    expect(layoutForRoom('bottom', true)).toBe('compact')
  })

  it('leaves the choice alone once there is height for it', () => {
    expect(layoutForRoom('bottom', false)).toBe('bottom')
  })

  it('does not touch the layouts that spend the height differently', () => {
    for (const layout of ['compact', 'left', 'right'] as const) {
      expect(layoutForRoom(layout, true)).toBe(layout)
      expect(layoutForRoom(layout, false)).toBe(layout)
    }
  })
})
