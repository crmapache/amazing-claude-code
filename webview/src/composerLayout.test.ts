import { describe, expect, it } from 'vitest'
import { normalizeComposerLayout } from './composerLayout'

describe('normalizeComposerLayout', () => {
  it('пропускает left, right и compact как есть', () => {
    expect(normalizeComposerLayout('left')).toBe('left')
    expect(normalizeComposerLayout('right')).toBe('right')
    expect(normalizeComposerLayout('compact')).toBe('compact')
  })

  it('всё остальное — включая пусто, мусор и старое/чужое значение — считает «снизу»', () => {
    expect(normalizeComposerLayout('bottom')).toBe('bottom')
    expect(normalizeComposerLayout(undefined)).toBe('bottom')
    expect(normalizeComposerLayout('')).toBe('bottom')
    expect(normalizeComposerLayout('top')).toBe('bottom')
  })
})
