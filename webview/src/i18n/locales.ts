/**
 * The languages the panel speaks, and how a tag from outside is brought to one of them.
 *
 * Ten rather than one because half the reviews our competitors get are written in Chinese while their
 * interface - and, until now, ours - is English throughout. The list is deliberately closed: a locale
 * exists here only when there is a dictionary behind it, so an unknown tag falls back to English rather
 * than to a screen half in one language and half in another.
 */

export type Locale = 'en' | 'ru' | 'uk' | 'es' | 'pt-BR' | 'zh-Hans' | 'de' | 'fr' | 'ja' | 'ko'

export interface LocaleInfo {
  id: Locale
  /**
   * The language's name in itself - "Русский", "简体中文".
   *
   * This is what stands in the picker, and it is not a nicety: somebody who landed in a language they
   * cannot read has to find their own way back, and "Chinese" written in Chinese is unreadable to
   * exactly the person who needs to leave it.
   */
  native: string
  /** The same name in English, as the sub-line - so the list is navigable from either side. */
  english: string
}

/** The order the picker shows: English first, then by how many people the panel expects to serve. */
export const LOCALES: LocaleInfo[] = [
  { id: 'en', native: 'English', english: 'English' },
  { id: 'zh-Hans', native: '简体中文', english: 'Chinese (Simplified)' },
  { id: 'ru', native: 'Русский', english: 'Russian' },
  { id: 'uk', native: 'Українська', english: 'Ukrainian' },
  { id: 'es', native: 'Español', english: 'Spanish' },
  { id: 'pt-BR', native: 'Português (Brasil)', english: 'Portuguese (Brazil)' },
  { id: 'de', native: 'Deutsch', english: 'German' },
  { id: 'fr', native: 'Français', english: 'French' },
  { id: 'ja', native: '日本語', english: 'Japanese' },
  { id: 'ko', native: '한국어', english: 'Korean' },
]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * The ones written in square boxes: Han, kana and hangul.
 *
 * Typed as a set of [Locale], so the compiler is the thing that keeps it honest: another language added
 * above without a decision about this one does not compile, and a tag renamed here is renamed there.
 * The style rules ask for it through `data-cjk` on the root rather than by naming the tags again in CSS
 * (see base.css) - a fourth handwritten copy of this list would go stale in silence, and what fails then
 * is letter-spacing prised between two Han characters, which reads as a rendering fault.
 */
export const CJK_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['zh-Hans', 'ja', 'ko'])

/** The language's own name, for a caption that has to say which one is meant. */
export const nativeName = (locale: Locale): string =>
  LOCALES.find((entry) => entry.id === locale)?.native ?? locale

/**
 * A tag from anywhere - the IDE's language pack, a saved setting, a query parameter - brought to one of
 * the ten.
 *
 * Java writes locales with an underscore ("zh_CN"), the web with a hyphen, and both add subtags we have
 * no separate dictionary for. So the tag is normalised and read from the left: the script and the region
 * only matter where we have two dictionaries to tell apart, and we have none - one Portuguese, one
 * Chinese.
 *
 * Traditional Chinese resolves to the Simplified dictionary rather than to English on purpose: the two
 * are far closer to one another than either is to English, and a reader in Taipei is better served by a
 * script they read slowly than by a language they may not read at all.
 */
export const resolveLocale = (tag: string | null | undefined): Locale => {
  const normalised = (tag ?? '').trim().toLowerCase().replace(/_/g, '-')
  if (!normalised) return DEFAULT_LOCALE

  const primary = normalised.split('-')[0]

  if (primary === 'zh') return 'zh-Hans'
  if (primary === 'pt') return 'pt-BR'

  const exact = LOCALES.find((entry) => entry.id.toLowerCase() === normalised)
  if (exact) return exact.id

  const byPrimary = LOCALES.find((entry) => entry.id.toLowerCase().split('-')[0] === primary)
  return byPrimary?.id ?? DEFAULT_LOCALE
}

/**
 * What goes into `<html lang>`.
 *
 * Not decoration: Chinese and Japanese share code points and draw several of them differently, and the
 * browser picks the variant by this attribute alone. Without it a Chinese screen on a machine whose font
 * fallback lands on a Japanese family shows characters that are subtly the wrong shape - readable, and
 * wrong in the way that makes a product feel foreign.
 */
export const htmlLang = (locale: Locale): string => locale
