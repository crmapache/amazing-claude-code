/**
 * Which of the machine's fonts the panel can be set in (see the font screen in Appearance.tsx).
 *
 * The IDE names every family the system has (see ClaudePanel, `fontFamilies`), and two questions are left
 * that only the page can answer:
 *
 * - Whether its browser can draw the family at all. The IDE's runtime carries fonts of its own, which it
 *   lists beside the system's, and the page's browser does not see them: picked, such a font would change
 *   nothing, without a word.
 * - Whether the family is monospaced. The feed is set like a terminal - code, diffs and tables count on
 *   every character being as wide as the next - so the list holds what the IDE's own console font list
 *   holds by default.
 *
 * Both are read off the width of a run of text in a canvas: a family the browser cannot find falls back,
 * and its run measures exactly as the fallback's does.
 */

/** The width of [text] set in [font] - a CSS font shorthand. */
export type Measure = (font: string, text: string) => number

/** A canvas's measuring, or null where there is no canvas to ask (tests, a page without a document). */
export const canvasMeasure = (): Measure | null => {
  if (typeof document === 'undefined') return null
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return null

  return (font, text) => {
    context.font = font
    return context.measureText(text).width
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

/** Letters of very different widths in any proportional font. */
const RUNS = ['iiiiiiiiii', 'WWWWWWWWWW', 'mmmmmmmmmm', '1111111111']

/** Three fallbacks: a family that happens to look like one of them still differs from the other two. */
const BASES = ['monospace', 'serif', 'sans-serif']

const SAMPLE = 'mmmmmmmmmmlli10OoWw'

/** Whether the browser finds [family] rather than falling back. */
const drawable = (family: string, measure: Measure): boolean =>
  BASES.some((base) => measure(`${PROBE} ${cssFamily(family)}, ${base}`, SAMPLE) !== measure(`${PROBE} ${base}`, SAMPLE))

/** Whether every run is as wide as the others - to half a pixel over ten characters. */
const monospaced = (family: string, measure: Measure): boolean => {
  const widths = RUNS.map((run) => measure(`${PROBE} ${cssFamily(family)}, monospace`, run))
  return Math.max(...widths) - Math.min(...widths) <= 0.5
}

/** The families the panel can be set in, in alphabetical order, each once. */
export const monospacedFamilies = (families: readonly string[], measure: Measure): string[] =>
  [...new Set(families.map((family) => family.trim()))]
    .filter((family) => family !== '' && !GENERIC.has(family.toLowerCase()))
    .filter((family) => drawable(family, measure) && monospaced(family, measure))
    .sort((one, other) => one.localeCompare(other))
