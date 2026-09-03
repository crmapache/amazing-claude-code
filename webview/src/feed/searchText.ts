/**
 * How a text is cut into words for the search - the panel's half of one rule.
 *
 * The other half is Words in TextIndex.kt on the IDE's side, where the messages are found: it says
 * which words it matched, folded the way it folds them, and the feed paints those words in the text on
 * screen. The two have to cut and fold alike or the feed paints nothing - this is the case of Frame.kt
 * and frame.ts, written twice because there is no code shared between Kotlin and a browser page.
 * Change one, change the other; the tests on both sides hold the same examples.
 *
 * A word is a run of letters and digits. An underscore ends a word, and a change of case or of kind
 * inside a run makes the parts words as well as the whole: `oldestEventUuid` is itself and also
 * oldest, Event and Uuid. Folded means lower case, accents dropped and ё as е.
 */

import type { PaintedTerm } from '../protocol'

export interface WordSpan {
  term: string
  start: number
  end: number
  /** A run of its own, as opposed to a camel-case part of a longer one - what "Whole words" keeps to. */
  whole: boolean
}

const WORD = /[\p{L}\p{N}]+/gu

/** Anything past plain ASCII - the only case where accents can be there to strip. */
const BEYOND_ASCII = /[^\x20-\x7e]/

export const foldWord = (word: string): string => {
  const lowered = word.toLowerCase()
  const plain = BEYOND_ASCII.test(lowered) ? lowered.normalize('NFD').replace(/\p{M}/gu, '') : lowered
  return plain.includes('ё') ? plain.replaceAll('ё', 'е') : plain
}

/** Every word in the text, whole runs and their parts, with where each stands. */
export const wordsOf = (text: string): WordSpan[] => {
  const words: WordSpan[] = []

  for (const match of text.matchAll(WORD)) {
    const start = match.index
    const run = match[0]
    const whole = foldWord(run)
    words.push({ term: whole, start, end: start + run.length, whole: true })

    const parts = partsOf(run)
    if (parts.length < 2) continue
    for (const [from, to] of parts) {
      const part = foldWord(run.slice(from, to))
      if (part !== whole) words.push({ term: part, start: start + from, end: start + to, whole: false })
    }
  }

  return words
}

const isUpper = (c: string): boolean => c !== c.toLowerCase() && c === c.toUpperCase()
const isLower = (c: string): boolean => c !== c.toUpperCase() && c === c.toLowerCase()
const isDigit = (c: string): boolean => /\p{N}/u.test(c)

/** Where a run breaks into parts - the same three cases as Words.partsOf on the IDE's side. */
const partsOf = (run: string): [number, number][] => {
  const parts: [number, number][] = []
  let from = 0

  for (let index = 1; index < run.length; index += 1) {
    const previous = run[index - 1]!
    const current = run[index]!
    const next = run[index + 1]

    const breaks =
      (isUpper(current) && (isLower(previous) || isDigit(previous))) ||
      (isUpper(current) && isUpper(previous) && next !== undefined && isLower(next)) ||
      isDigit(current) !== isDigit(previous)

    if (breaks) {
      parts.push([from, index])
      from = index
    }
  }

  parts.push([from, run.length])
  return parts
}

/**
 * Where the words in [terms] stand in the text - what to paint.
 *
 * A word is painted when it is one of the terms: the IDE names the terms it matched in full, a term it
 * found by its beginning ("deepgr" for deepgram) included, so an exact comparison is the right one. How
 * much of the word is painted is the term's own say (see PaintedTerm): the typed part of a word found by
 * its beginning, the whole of one found by a typo. Under the field's switches a word has to stand as
 * asked as well - as a run of its own, or in the case that was typed - and the term says that too. A
 * part standing inside a run already painted adds nothing.
 */
export const matchSpans = (text: string, terms: readonly PaintedTerm[]): [number, number][] => {
  if (terms.length === 0) return []
  const wanted = new Map(terms.map((term) => [term.term, term]))
  const spans: [number, number][] = []

  for (const word of wordsOf(text)) {
    const painted = wanted.get(word.term)
    if (!painted) continue
    if (painted.whole && !word.whole) continue
    const end = Math.min(word.end, word.start + painted.paint)
    if (painted.text !== undefined && text.slice(word.start, end) !== painted.text.slice(0, end - word.start)) continue
    const last = spans[spans.length - 1]
    if (last && last[0] <= word.start && end <= last[1]) continue
    spans.push([word.start, end])
  }

  return spans
}
