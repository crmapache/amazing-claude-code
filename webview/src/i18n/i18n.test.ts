import { describe, expect, it } from 'vitest'
import { activeLocale } from '.'
import { DICTIONARIES } from './all'
import { en } from './en'
import { LOCALES, htmlLang, resolveLocale, type Locale } from './locales'

/**
 * The compiler already refuses a dictionary with a missing or misspelled key - every translation is
 * declared as `Dict`, which is `typeof en`. What it cannot see is the rest: a string left empty, a
 * function that ignores the number it was handed, a translation that quietly kept the English word.
 *
 * So this covers what types cannot, and nothing they already do.
 */

type Node = Record<string, unknown>

/** Every leaf of a dictionary, addressed by its path - "menu.rows.history.label". */
const leaves = (node: Node, prefix = ''): Map<string, unknown> => {
  const found = new Map<string, unknown>()

  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      for (const [inner, leaf] of leaves(value as Node, path)) found.set(inner, leaf)
    } else {
      found.set(path, value)
    }
  }

  return found
}

/**
 * A sample value for every argument a string function takes.
 *
 * Numbers rather than strings for everything: the only functions in the dictionary take either a count
 * or a name, and a number reads correctly as both while a string would break `n % 10` in the Russian
 * plural. What is checked is that something non-empty comes out, not what it says.
 */
const call = (fn: (...args: never[]) => string): string =>
  fn(...(Array.from({ length: fn.length }, (_, index) => index + 2) as never[]))

const english = leaves(en)

describe('every dictionary', () => {
  for (const { id } of LOCALES) {
    const dictionary = leaves(DICTIONARIES[id] as unknown as Node)

    describe(id, () => {
      it('has exactly the paths the English one has', () => {
        expect([...dictionary.keys()].sort()).toEqual([...english.keys()].sort())
      })

      it('answers with the same kind of thing at every path', () => {
        for (const [path, value] of english) {
          expect(typeof dictionary.get(path), path).toBe(typeof value)
        }
      })

      it('takes the same arguments at every path that is a function', () => {
        for (const [path, value] of english) {
          if (typeof value !== 'function') continue
          expect((dictionary.get(path) as () => string).length, path).toBe(value.length)
        }
      })

      it('says something everywhere', () => {
        for (const [path, value] of dictionary) {
          const text = typeof value === 'function' ? call(value as (...args: never[]) => string) : String(value)
          expect(text.trim(), path).not.toBe('')
          // A translation half-finished in the editor rather than in the file: the marker outlives the
          // intention, and nothing else on the way to a release would catch it.
          expect(text, path).not.toMatch(/\bTODO\b|\bFIXME\b|�/)
        }
      })
    })
  }
})

/**
 * Where a translation is allowed to be the very same word as the English one.
 *
 * A line left in English is invisible on screen - it just reads as English - so anything identical is
 * treated as a line that was skipped, unless it is written down here with the languages it genuinely
 * coincides in. Naming the languages rather than the path alone is the point: "Plan" being French for
 * "Plan" says nothing about whether the Japanese entry was ever written.
 */
const SHARED_WITH_ENGLISH: Record<string, Locale[]> = {
  // The plugin's own name, a flag's value the CLI knows by that spelling, and a keyboard chord.
  'menu.footer': ['ru', 'uk', 'es', 'pt-BR', 'zh-Hans', 'de', 'fr', 'ja', 'ko'],
  'effort.tags.ultra': ['ru', 'uk', 'es', 'pt-BR', 'zh-Hans', 'de', 'fr', 'ja', 'ko'],
  'selectors.modeHint': ['ru', 'uk', 'es', 'pt-BR', 'zh-Hans', 'de', 'fr', 'ja', 'ko'],
  // Words the Latin languages happen to write exactly as English does.
  'menu.titles.menu.title': ['pt-BR', 'fr'],
  'menu.titles.plugins.title': ['es', 'pt-BR', 'de', 'fr'],
  'menu.titles.feedback.title': ['pt-BR', 'de'],
  'menu.rows.plugins.label': ['es', 'pt-BR', 'de', 'fr'],
  // A duration on a gauge, not a word: "5h" is how Portuguese writes it too.
  'accounts.fiveHour': ['pt-BR'],
  'improvePrompt.label': ['fr'],
  'modes.plan.label': ['es', 'de', 'fr'],
  'modes.plan.short': ['es', 'de', 'fr'],
  'modes.auto.label': ['es', 'pt-BR', 'de', 'fr'],
  'modes.auto.short': ['es', 'pt-BR', 'de', 'fr'],
  'modes.tags.danger': ['fr'],
  'selectors.effort': ['fr'],
  'selectors.mode': ['fr'],
  'feed.limit.label': ['de'],
  'feed.findings.label': ['de'],
  'feed.crash.label': ['fr'],
  'mobile.sessions.agent.offline': ['pt-BR', 'de'],
  'mobile.newSession.effort': ['fr'],
  'mobile.newSession.mode': ['fr'],
  'header.menu': ['pt-BR', 'fr'],
  'header.conversations': ['fr'],
  'remote.relay': ['es', 'pt-BR', 'de'],
  'feedback.kinds.bug.label': ['pt-BR', 'de', 'fr'],
  'feedback.kinds.idea.label': ['es'],
  // "MOUSE" and "Microphone" are spelled the same way in these - one is an English loan word in
  // Brazilian Portuguese, the other simply coincides in French.
  'voice.mouse': ['pt-BR'],
  'voice.device': ['fr'],
  'menu.titles.voiceDevice.title': ['fr'],
}

describe('a language that is left untranslated', () => {
  for (const { id } of LOCALES) {
    if (id === 'en') continue

    it(`${id} does not read as English`, () => {
      const dictionary = leaves(DICTIONARIES[id] as unknown as Node)
      const same = [...english]
        .filter(([, value]) => typeof value === 'string')
        .filter(([path]) => !SHARED_WITH_ENGLISH[path]?.includes(id))
        .filter(([path, value]) => dictionary.get(path) === value)
        .map(([path]) => path)

      expect(same).toEqual([])
    })
  }

  /**
   * A stale exception is worse than none: it goes on excusing a path long after the word stopped
   * coinciding, and the next line skipped there passes unnoticed.
   */
  it('has no exception that is no longer needed', () => {
    const stale: string[] = []

    for (const [path, locales] of Object.entries(SHARED_WITH_ENGLISH)) {
      for (const locale of locales) {
        const dictionary = leaves(DICTIONARIES[locale] as unknown as Node)
        if (dictionary.get(path) !== english.get(path)) stale.push(`${locale}:${path}`)
      }
    }

    expect(stale).toEqual([])
  })
})

describe('resolveLocale', () => {
  it('reads the tags a JetBrains language pack writes', () => {
    expect(resolveLocale('zh_CN')).toBe('zh-Hans')
    expect(resolveLocale('ja_JP')).toBe('ja')
    expect(resolveLocale('ko_KR')).toBe('ko')
  })

  it('reads the tags a browser writes', () => {
    expect(resolveLocale('zh-Hans-CN')).toBe('zh-Hans')
    expect(resolveLocale('pt-PT')).toBe('pt-BR')
    expect(resolveLocale('en-GB')).toBe('en')
    expect(resolveLocale('es-419')).toBe('es')
  })

  /**
   * Traditional Chinese has no dictionary of its own and lands on the Simplified one rather than on
   * English: the two scripts are far closer to each other than either is to a language the reader may
   * not have at all.
   */
  it('sends Traditional Chinese to the Simplified dictionary', () => {
    expect(resolveLocale('zh-TW')).toBe('zh-Hans')
    expect(resolveLocale('zh_HK')).toBe('zh-Hans')
  })

  it('falls back to English rather than to half a screen', () => {
    expect(resolveLocale('sv')).toBe('en')
    expect(resolveLocale('')).toBe('en')
    expect(resolveLocale(null)).toBe('en')
    expect(resolveLocale(undefined)).toBe('en')
  })

  it('gives every locale a tag the browser can pick a font by', () => {
    for (const { id } of LOCALES) expect(htmlLang(id as Locale)).toBe(id)
  })
})

describe('activeLocale', () => {
  it('follows the IDE while nothing has been chosen', () => {
    expect(activeLocale('', 'zh_CN')).toBe('zh-Hans')
    expect(activeLocale(null, 'de')).toBe('de')
  })

  /** Including an explicit English inside a Chinese IDE - a choice is a choice. */
  it('obeys an explicit choice over the IDE', () => {
    expect(activeLocale('en', 'zh_CN')).toBe('en')
    expect(activeLocale('ru', 'ja')).toBe('ru')
  })

  it('falls back to English when neither says anything', () => {
    expect(activeLocale(null, null)).toBe('en')
  })
})
