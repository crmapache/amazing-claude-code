import { de } from './de'
import { en, type Dict } from './en'
import { es } from './es'
import { fr } from './fr'
import { ja } from './ja'
import { ko } from './ko'
import type { Locale } from './locales'
import { pt } from './pt'
import { ru } from './ru'
import { zh } from './zh'

/**
 * Every dictionary at once, for the tests that hold all nine against one another (see i18n.test.ts).
 *
 * For them and for nothing else. The panel and the phone fetch the one they are speaking (see LOADERS in
 * ./index), and anything on screen that imported this would put all nine back into both bundles - about
 * 90 KB gzip of words nobody will read, which on a phone is roughly two fifths of a first load.
 *
 * `Record<Locale, Dict>` for the same reason the loaders are: a language in the picker with no dictionary
 * behind it should not compile.
 */
export const DICTIONARIES: Record<Locale, Dict> = {
  en,
  ru,
  es,
  'pt-BR': pt,
  'zh-Hans': zh,
  de,
  fr,
  ja,
  ko,
}
