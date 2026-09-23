import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The light theme is exactly as readable as the dark one - held here rather than promised in a comment.
 *
 * tokens.css is read as it is shipped: the dark theme is :root, the light one is :root with the light
 * block over it (see [data-acc-theme='light'] there). Every pair a person actually reads - a step of text
 * on a surface, a coloured word on the panel, white or ink on a filled button - is measured in both, and
 * wherever the dark theme clears one of the WCAG bars (4.5:1 for text, 3:1 for large text and marks) the
 * light theme has to clear the same one. A light palette tuned by eye passes on the surface it was tuned
 * on and fails on the next one over - the first draft read at AA on the panel and not on a grey menu.
 */

const tokens = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of the first rule opened by `selector`, braces balanced. */
const block = (selector: string): Map<string, string> => {
  const start = tokens.indexOf(`${selector} {`)
  expect(start, `${selector} is missing from tokens.css`).toBeGreaterThanOrEqual(0)

  const open = tokens.indexOf('{', start)
  let depth = 0
  let end = open
  for (; end < tokens.length; end++) {
    if (tokens[end] === '{') depth++
    if (tokens[end] === '}' && --depth === 0) break
  }

  const found = new Map<string, string>()
  for (const [, name, value] of tokens.slice(open + 1, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    found.set(name, value.trim())
  }
  return found
}

const dark = block(':root')
const light = new Map([...dark, ...block(":root[data-acc-theme='light']")])

/** A role followed through its var() chain down to the paint - only plain hex paints are compared. */
const paint = (theme: Map<string, string>, role: string): string => {
  let value = theme.get(`--acc-${role}`)
  for (let hops = 0; value?.startsWith('var(') && hops < 8; hops++) {
    value = theme.get(value.slice(4, -1).trim())
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--acc-${role} is not a plain colour: ${value}`)
  return value
}

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

const BARS = [4.5, 3]

/** The pairs the light theme drops below a bar the dark theme clears - empty when it keeps up. */
const regressions = (pairs: [string, string][]): string[] =>
  pairs.flatMap(([ink, ground]) => {
    const before = contrast(paint(dark, ink), paint(dark, ground))
    const after = contrast(paint(light, ink), paint(light, ground))
    const bar = BARS.find((one) => before >= one)

    return bar !== undefined && after < bar
      ? [`${ink} on ${ground}: ${before.toFixed(2)} dark, ${after.toFixed(2)} light (bar ${bar})`]
      : []
  })

const TEXT = ['fg', 'fg-body', 'fg-soft', 'fg-mono', 'fg-dim', 'fg-faint', 'fg-fainter', 'fg-ghost']
const SURFACES = ['bg-sunken', 'bg-deep', 'bg', 'bg-raised', 'bg-card', 'bg-panel', 'bg-control']

/** The paints that are read as words: a link, a warning's text, a count in a colour of its own. */
const COLOURED_WORDS = [
  'accent',
  'accent-hover',
  'accent-light',
  'branch',
  'branch-light',
  'agent',
  'agent-light',
  'warn',
  'warn-light',
  'ok',
  'ok-light',
  'ok-text',
  'bad',
  'bad-light',
  'bad-text',
  'orange',
  'orange-light',
  'quote',
  'extra',
  'heart',
  'meter-green',
]
const WORD_GROUNDS = ['bg', 'bg-raised', 'bg-card', 'bg-panel']

/** The fills a word or an icon stands on in --acc-on-accent. */
const FILLS = ['accent', 'accent-hover', 'accent-active', 'branch', 'warn', 'ok', 'bad', 'agent', 'orange', 'extra']

const pairs = (inks: string[], grounds: string[]): [string, string][] =>
  inks.flatMap((ink) => grounds.map((ground): [string, string] => [ink, ground]))

describe('the light theme', () => {
  it('keeps every step of text as readable on every surface as the dark theme does', () => {
    expect(regressions(pairs(TEXT, SURFACES))).toEqual([])
  })

  it('keeps every coloured word as readable on the panel, the cards and the menu', () => {
    expect(regressions(pairs(COLOURED_WORDS, WORD_GROUNDS))).toEqual([])
  })

  it('keeps what stands on a filled button as readable', () => {
    expect(regressions(pairs(['on-accent'], FILLS))).toEqual([])
  })

  /*
   * The order is what a hover, a card and a control rely on: each is a step past what it sits on. The
   * floating layers (bg-panel) are left out on purpose - white in the light theme rather than mirrored,
   * see tokens.css - and held to the one thing they need instead: standing apart from what sits on them.
   */
  it('keeps the surfaces in the order the dark theme has them, only the other way round', () => {
    const grounds = SURFACES.filter((role) => role !== 'bg-panel')
    const darkSteps = grounds.map((role) => luminance(paint(dark, role)))
    const lightSteps = grounds.map((role) => luminance(paint(light, role)))

    expect(darkSteps).toEqual([...darkSteps].sort((a, b) => a - b))
    expect(lightSteps).toEqual([...lightSteps].sort((a, b) => b - a))
  })

  it('keeps a card and a control visible on a floating layer', () => {
    for (const role of ['bg-card', 'bg-control', 'bg-menu-hover']) {
      expect(contrast(paint(light, role), paint(light, 'bg-panel'))).toBeGreaterThan(1.1)
    }
  })

  /* The light block is read at all - a selector typo would leave the whole test comparing dark with dark. */
  it('actually differs from the dark theme', () => {
    expect(paint(light, 'bg')).not.toBe(paint(dark, 'bg'))
    expect(paint(light, 'on-accent')).not.toBe(paint(dark, 'on-accent'))
  })
})
