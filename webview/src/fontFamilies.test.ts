import { describe, expect, it } from 'vitest'
import { cssFamily, monospacedFamilies, type Measure } from './fontFamilies'

/**
 * A browser with three fonts installed: a monospaced one, a proportional one, and the fallbacks. Widths per
 * character, the way a real font answers - a family it does not have falls back to the first base named.
 */
const INSTALLED: Record<string, (char: string) => number> = {
  Menlo: () => 24,
  Georgia: (char) => (char === 'i' || char === '1' ? 11 : char === 'W' ? 37 : 27),
}
const BASE: Record<string, (char: string) => number> = {
  monospace: () => 22,
  serif: (char) => (char === 'i' ? 10 : 25),
  'sans-serif': (char) => (char === 'i' ? 9 : 23),
}

const measure: Measure = (font, text) => {
  const families = font.replace(/^\S+\s/, '').split(', ')
  const named = families[0]!.replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1')
  const width = INSTALLED[named] ?? BASE[families[families.length - 1]!] ?? BASE[named]!
  return [...text].reduce((sum, char) => sum + width(char), 0)
}

describe('the fonts the panel can be set in', () => {
  it('keeps the monospaced families the browser can draw', () => {
    expect(monospacedFamilies(['Menlo', 'Georgia'], measure)).toEqual(['Menlo'])
  })

  it('drops a family only the IDE knows, which the browser would quietly replace', () => {
    expect(monospacedFamilies(['JetBrains Mono NL', 'Menlo'], measure)).toEqual(['Menlo'])
  })

  it('drops generic names and repeats, and sorts what is left', () => {
    expect(monospacedFamilies(['Menlo', 'monospace', ' Menlo ', ''], measure)).toEqual(['Menlo'])
  })
})

describe('a family in CSS', () => {
  it('is quoted, with what would close the quotes escaped', () => {
    expect(cssFamily('Fira Code 5')).toBe('"Fira Code 5"')
    expect(cssFamily('Odd "Mono"')).toBe('"Odd \\"Mono\\""')
  })
})
