import { describe, expect, it } from 'vitest'
import { normalizeThemeChoice, resolveTheme, themeFromAddress } from './theme'

describe('resolveTheme', () => {
  it('follows the IDE while nothing is chosen', () => {
    expect(resolveTheme('', true)).toBe('dark')
    expect(resolveTheme('', false)).toBe('light')
  })

  it('keeps a choice whatever the IDE wears', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('normalizeThemeChoice', () => {
  /* A word a later version may write is not a third theme to this one - it is "the IDE's". */
  it('reads anything it does not know as the IDE', () => {
    expect(normalizeThemeChoice('sepia')).toBe('')
    expect(normalizeThemeChoice(undefined)).toBe('')
    expect(normalizeThemeChoice('light')).toBe('light')
  })
})

describe('themeFromAddress', () => {
  it('reads the theme the IDE wrote beside any other parameter', () => {
    expect(themeFromAddress('?theme=light')).toBe('light')
    expect(themeFromAddress('?lang=ru&theme=dark')).toBe('dark')
  })

  it('says nothing about an address without one', () => {
    expect(themeFromAddress('')).toBeNull()
    expect(themeFromAddress('?theme=neon')).toBeNull()
  })
})
