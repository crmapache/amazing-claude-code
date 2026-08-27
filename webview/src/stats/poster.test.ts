import { describe, expect, it } from 'vitest'
import { posterName } from './poster'

describe('the shared picture', () => {
  it('is named after the screen it shows and the day it was taken', () => {
    expect(posterName('statistics', '2026-08-26')).toBe('amazing-claude-code-statistics-2026-08-26.png')
    expect(posterName('achievements', '2026-08-26')).toBe('amazing-claude-code-achievements-2026-08-26.png')
  })
})
