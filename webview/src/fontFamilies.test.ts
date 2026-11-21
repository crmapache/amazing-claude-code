import { describe, expect, it } from 'vitest'
import { cssFamily, monospacedFamilies, type Measure } from './fontFamilies'

/**
 * A browser with a few fonts installed, and the fallbacks: a width per character and how far its ink
 * rises, the way a real font answers - a family it does not have falls back to the last base named.
 * Wingdings 2 answers as it did measured on a Mac: i, W, m and 1 alike, the period a wide symbol.
 */
type Glyph = (char: string) => { width: number; ascent: number }
const text = (width: number): Glyph => (char) => ({ width, ascent: char === '.' ? 5 : 29 })
const INSTALLED: Record<string, Glyph> = {
  Menlo: text(24),
  Georgia: (char) => ({ width: char === 'i' || char === '1' || char === '.' ? 11 : char === 'W' ? 37 : 27, ascent: char === '.' ? 5 : 29 }),
  'Wingdings 2': (char) => ({ width: char === '.' ? 36 : char === 'H' ? 20 : 30, ascent: char === '.' ? 22 : 30 }),
  'Picture Mono': () => ({ width: 30, ascent: 28 }),
}
const BASE: Record<string, Glyph> = {
  monospace: text(22),
  serif: (char) => ({ width: char === 'i' ? 10 : 25, ascent: char === '.' ? 5 : 28 }),
  'sans-serif': (char) => ({ width: char === 'i' ? 9 : 23, ascent: char === '.' ? 5 : 27 }),
}

const measure: Measure = (font, run) => {
  const families = font.replace(/^\S+\s/, '').split(', ')
  const named = families[0]!.replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1')
  const glyph = INSTALLED[named] ?? BASE[families[families.length - 1]!] ?? BASE[named]!
  const glyphs = [...run].map(glyph)
  return { width: glyphs.reduce((sum, one) => sum + one.width, 0), ascent: Math.max(...glyphs.map((one) => one.ascent)) }
}

describe('the fonts the panel can be set in', () => {
  it('keeps the monospaced families the browser can draw', () => {
    expect(monospacedFamilies(['Menlo', 'Georgia'], measure)).toEqual(['Menlo'])
  })

  it('drops a font of pictures, however even its widths', () => {
    expect(monospacedFamilies(['Wingdings 2', 'Picture Mono', 'Menlo'], measure)).toEqual(['Menlo'])
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
