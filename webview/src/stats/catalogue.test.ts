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

/** How many lines each achievement has on the IDE's side: a ladder's arguments, or one for a milestone. */
const kotlinSteps = (): Record<string, number> => {
  const source = readFileSync(
    resolve(__dirname, '../../../src/main/kotlin/io/github/crmapache/amazingclaudecode/stats/Achievements.kt'),
    'utf8',
  )
  const out: Record<string, number> = {}
  for (const match of source.matchAll(/"([a-z-]+)" to ladder\(([^)]*)\)/g)) out[match[1]!] = match[2]!.split(',').length
  for (const match of source.matchAll(/"([a-z-]+)" to milestone\(/g)) out[match[1]!] = 1
  return out
}

describe('the catalogue against the rules', () => {
  it('names exactly the achievements the IDE evaluates, in the same order', () => {
    expect(ACHIEVEMENTS.map((spec) => spec.id)).toEqual(kotlinIds())
  })

  it('agrees with the rules about how many lines each one has', () => {
    // Most have five; a milestone has one and the two ways of saying thanks make two. The card draws a pip
    // for each, so a disagreement here is a card promising steps that are not there.
    const steps = kotlinSteps()
    for (const spec of ACHIEVEMENTS) {
      expect(spec.milestone ? 1 : (spec.steps ?? 5), spec.id).toBe(steps[spec.id])
    }
  })

  it('has an icon for every one of them', () => {
    for (const spec of ACHIEVEMENTS) expect(ACHIEVEMENT_ICONS[spec.id], spec.id).toBeTruthy()
  })
})

describe('the words on a card', () => {
  it('never says the line the card already shows underneath', () => {
    for (const spec of ACHIEVEMENTS) {
      expect(spec.hint, spec.id).not.toMatch(/tier/i)
      expect(spec.hint, spec.id).not.toMatch(/wants/i)
    }
  })

  it('gives every achievement a name of its own, so no two cards read alike', () => {
    const names = ACHIEVEMENTS.map((spec) => spec.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
