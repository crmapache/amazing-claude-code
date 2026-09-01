import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import { en, type Dict } from './en'
import { CJK_LOCALES, DEFAULT_LOCALE, htmlLang, resolveLocale, type Locale } from './locales'

export type { Dict } from './en'
export { DEFAULT_LOCALE, LOCALES, nativeName, resolveLocale, type Locale, type LocaleInfo } from './locales'

/**
 * How each dictionary is fetched - one at a time, and only the one being spoken.
 *
 * All of them used to be imported outright, and both bundles carried all of them: the phone downloaded
 * every set of words it would never draw, about 90 KB gzip and roughly two fifths of everything it fetches
 * on a first load, over somebody's mobile data.
 *
 * Nothing on screen waits for this. Both clients begin in English by construction - the panel learns the
 * language from `init` and the phone from a fact over the relay, and neither has arrived at first paint -
 * so the fetch happens inside a gap that was already there.
 *
 * `Record<Locale, ...>` rather than a partial map, exactly as the static list was: a language offered in
 * the picker with no dictionary behind it is a screen half-translated, and this is the one place that can
 * refuse to compile over it.
 */
const LOADERS: Record<Locale, () => Promise<Dict>> = {
  en: async () => en,
  ru: async () => (await import('./ru')).ru,
  uk: async () => (await import('./uk')).uk,
  es: async () => (await import('./es')).es,
  'pt-BR': async () => (await import('./pt')).pt,
  'zh-Hans': async () => (await import('./zh')).zh,
  de: async () => (await import('./de')).de,
  fr: async () => (await import('./fr')).fr,
  ja: async () => (await import('./ja')).ja,
  ko: async () => (await import('./ko')).ko,
}

/** What has been fetched so far. English is here from the start - it is the fallback for everything. */
const loaded: Partial<Record<Locale, Dict>> = { en }

/**
 * The words for a locale, for code that has no React around it - the crash screen above the provider,
 * chiefly.
 *
 * Answers with what has been fetched, and with English until it has. That is not a compromise for the
 * crash screen: by the time anything has crashed the panel has long since fetched its language, and a
 * panel that has not is one showing English anyway.
 */
export const dictOf = (locale: Locale): Dict => loaded[locale] ?? en

/**
 * The words for a locale, fetched if they are not here yet.
 *
 * Reads the cache during the render and asks for a repaint when a fetch lands, rather than holding the
 * dictionary in state: state would draw one frame in the old language on every switch, which is the one
 * thing this must not cost.
 */
export const useDict = (locale: Locale): Dict => {
  const [, repaint] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    if (loaded[locale]) return

    let wanted = true
    void LOADERS[locale]()
      .then((dict) => {
        loaded[locale] = dict
        if (wanted) repaint()
      })
      // A chunk that will not load leaves English on screen, which is what was already there.
      .catch(() => undefined)

    return () => {
      wanted = false
    }
  }, [locale])

  return dictOf(locale)
}

interface LocaleValue {
  locale: Locale
  t: Dict
}

const LocaleContext = createContext<LocaleValue>({ locale: DEFAULT_LOCALE, t: en })

/**
 * The language of everything below it.
 *
 * Also the one place `<html lang>` is written, which is not decoration: Chinese and Japanese share code
 * points and draw a number of them differently, and the browser picks the shape by this attribute alone.
 * A Chinese panel on a machine whose fallback lands on a Japanese family is readable and subtly wrong -
 * exactly the kind of wrong that reads as "this was not made for me".
 */
export const LocaleProvider = ({ locale, children }: { locale: Locale; children: ReactNode }) => {
  const t = useDict(locale)
  const value = useMemo<LocaleValue>(() => ({ locale, t }), [locale, t])

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale)
    // And whether this is one of the square-box scripts, for the styles that have to know (see base.css).
    document.documentElement.toggleAttribute('data-cjk', CJK_LOCALES.has(locale))
  }, [locale])

  return createElement(LocaleContext.Provider, { value }, children)
}

/** The words. The hook everything on screen reads its text through. */
export const useT = (): Dict => useContext(LocaleContext).t

/** The tag itself - for `Intl`, which needs the language rather than the words. */
export const useLocale = (): Locale => useContext(LocaleContext).locale

/**
 * Which language the panel ends up in, given the saved choice and what the IDE is set to.
 *
 * An empty choice is not "English" but "whatever the IDE speaks": somebody working in a Chinese IDE
 * should not have to discover that a switch exists before the panel talks to them - that is the whole
 * complaint this was built for. An explicit choice always wins, including an explicit English.
 */
export const activeLocale = (chosen: string | null | undefined, ide: string | null | undefined): Locale =>
  chosen ? resolveLocale(chosen) : resolveLocale(ide)
