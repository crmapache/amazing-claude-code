/**
 * The panel's two themes, and the one place that decides which of them is on the screen.
 *
 * The colours themselves live in tokens.css: the dark theme is :root as it stands, the light one is the
 * block under [data-acc-theme='light'] at its foot. Everything here is about who puts that attribute on
 * the root and when - the panel by its setting and its IDE, the phone by the phone.
 */

export type Theme = 'dark' | 'light'

/** What the setting holds: one of the two, or '' for "the IDE's" - the default (see ClaudePreferences.theme). */
export type ThemeChoice = Theme | ''

const THEME_ATTRIBUTE = 'data-acc-theme'

const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light'

/** A word from the IDE or the settings screen, held to what this version knows - anything else is the IDE's. */
export const normalizeThemeChoice = (value: unknown): ThemeChoice => (isTheme(value) ? value : '')

/** The theme a choice amounts to, with the IDE's answer for the choice that defers to it. */
export const resolveTheme = (choice: ThemeChoice, ideDark: boolean): Theme => {
  if (choice) return choice
  return ideDark ? 'dark' : 'light'
}

/**
 * Puts the theme on the root.
 *
 * Dark wears no attribute at all: :root is the dark theme, and a panel nobody has turned light is drawn
 * by the very rules it was drawn by before the light one existed - the calm colours keep the same promise
 * about their own attribute (see useCalmColors).
 */
export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement

  if (theme === 'light') root.setAttribute(THEME_ATTRIBUTE, 'light')
  else root.removeAttribute(THEME_ATTRIBUTE)
}

/**
 * The theme the IDE wrote into the page's address, if it wrote one (see WebviewHost.startUrl).
 *
 * The first frame is painted before the IDE can say anything - the receiver does not exist yet - so the
 * address is the only thing early enough to keep a light IDE from opening its panel on a flash of ink.
 * Everything after the first frame is the `theme` message's to say.
 */
export const themeFromAddress = (search: string): Theme | null => {
  const value = new URLSearchParams(search).get('theme')
  return isTheme(value) ? value : null
}

/**
 * The phone's theme: the phone's own. It follows the system the way every other app on it does, turning
 * with it at dusk rather than on the next reload - the desk's setting is about the screen on the desk, and
 * is never sent here (see RemoteCommands).
 *
 * Returns the way to stop listening, for symmetry with every other subscription; the phone's shell never
 * calls it, since it lives as long as the page does.
 */
export const followSystemTheme = (): (() => void) => {
  const light = window.matchMedia('(prefers-color-scheme: light)')
  const apply = () => applyTheme(light.matches ? 'light' : 'dark')

  apply()
  light.addEventListener('change', apply)
  return () => light.removeEventListener('change', apply)
}
