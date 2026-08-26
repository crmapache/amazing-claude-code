import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from './catalogue'
import { ACHIEVEMENT_ICONS } from './icons'

/**
 * The two halves of one list: the rules on the IDE's side (Achievements.kt) and the words on this one.
 * They are keyed by the same ids, and this is what keeps them so - an achievement added to one and not
 * the other fails here rather than showing up as a card with no name or a name with no figure.
 */
const kotlinIds = (): string[] => {
  const source = readFileSync(
    resolve(__dirname, '../../../src/main/kotlin/io/github/crmapache/amazingclaudecode/stats/Achievements.kt'),
    'utf8',
  )
  return [...source.matchAll(/"([a-z-]+)" to (?:ladder|milestone)\(/g)].map((match) => match[1]!)
}

describe('the catalogue against the rules', () => {
  it('names exactly the achievements the IDE evaluates, in the same order', () => {
    expect(ACHIEVEMENTS.map((spec) => spec.id)).toEqual(kotlinIds())
  })

  it('has an icon for every one of them', () => {
    for (const spec of ACHIEVEMENTS) expect(ACHIEVEMENT_ICONS[spec.id], spec.id).toBeTruthy()
  })
})
