/**
 * Which of the machine's fonts the panel can be set in (see the font screen in Appearance.tsx).
 *
 * The IDE names every family the system has (see ClaudePanel, `fontFamilies`), and two questions are left
 * that only the page can answer:
 *
 * - Whether its browser can draw the family at all. The IDE's runtime carries fonts of its own, which it
 *   lists beside the system's, and the page's browser does not see them: picked, such a font would change
 *   nothing, without a word.
 * - Whether the family is a monospaced font of letters. The feed is set like a terminal - code, diffs and
 *   tables count on every character being as wide as the next - so the list holds what the IDE's own
 *   console font list holds by default. And a font of pictures (Wingdings 2 on a Mac) can pass for one:
 *   picked, it would turn the whole feed into symbols.
 *
 * All of it is read off text in a canvas: a family the browser cannot find falls back, and its run measures
 * exactly as the fallback's does.
 */

/** How [text] set in [font] - a CSS font shorthand - measures: its width and how far its ink rises. */
export interface Ink {
  width: number
  ascent: number
}

export type Measure = (font: string, text: string) => Ink

/** A canvas's measuring, or null where there is no canvas to ask (tests, a page without a document). */
export const canvasMeasure = (): Measure | null => {
  if (typeof document === 'undefined') return null
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return null

  return (font, text) => {
    context.font = font
    const metrics = context.measureText(text)
    return { width: metrics.width, ascent: metrics.actualBoundingBoxAscent }
  }
}

/**
 * A family's name as it goes into CSS: in double quotes, with what would close them escaped. Unquoted, a name
 * with a digit or a dot in it (`Fira Code 5`, `M+ 1m`) is no valid family at all.
 */
export const cssFamily = (name: string): string => `"${name.replace(/["\\]/g, '\\$&')}"`

/** Generic families the system list never names, and which mean something else in CSS. */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'math', 'emoji'])

/** Large enough for a difference of a fraction of a pixel per character to add up to whole pixels. */
const PROBE = '40px'

/**
 * Characters of very different widths in any proportional font. The period is the one a font of pictures
 * gives away: it draws a symbol there, as wide as it pleases (measured on a Mac: 36 against 20 for H in
 * Wingdings 2, where i, W, m and 1 come out alike).
 */
const RUNS = ['iiiiiiiiii', 'WWWWWWWWWW', 'mmmmmmmmmm', '1111111111', '..........', 'HHHHHHHHHH']

/** Three fallbacks: a family that happens to look like one of them still differs from the other two. */
const BASES = ['monospace', 'serif', 'sans-serif']

const SAMPLE = 'mmmmmmmmmmlli10OoWw'

/** Whether the browser finds [family] rather than falling back. */
const drawable = (family: string, measure: Measure): boolean =>
  BASES.some(
    (base) =>
      measure(`${PROBE} ${cssFamily(family)}, ${base}`, SAMPLE).width !== measure(`${PROBE} ${base}`, SAMPLE).width,
  )

/** Whether every run is as wide as the others - to half a pixel over ten characters. */
const monospaced = (family: string, measure: Measure): boolean => {
  const widths = RUNS.map((run) => measure(`${PROBE} ${cssFamily(family)}, monospace`, run).width)
  return Math.max(...widths) - Math.min(...widths) <= 0.5
}

/**
 * Whether the family draws letters: a period is a dot on the line, well under a capital - a fifth to a
 * quarter of its height in every text font measured, two thirds and more in the fonts of pictures.
 */
const letters = (family: string, measure: Measure): boolean => {
  const font = `${PROBE} ${cssFamily(family)}, monospace`
  const capital = measure(font, 'H').ascent
  return capital > 0 && measure(font, '.').ascent < capital * 0.4
}

/** The families the panel can be set in, in alphabetical order, each once. */
export const monospacedFamilies = (families: readonly string[], measure: Measure): string[] =>
  [...new Set(families.map((family) => family.trim()))]
    .filter((family) => family !== '' && !GENERIC.has(family.toLowerCase()))
    .filter((family) => drawable(family, measure) && monospaced(family, measure) && letters(family, measure))
    .sort((one, other) => one.localeCompare(other))
