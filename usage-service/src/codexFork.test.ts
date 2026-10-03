import { describe, expect, it } from 'vitest'
import { FEATURES, SCREENS, SETTINGS } from './features.js'
import { difference, disagreement, kotlinMapKeys, kotlinSet, pluginSource, waitingFor } from './pluginSources.testing.js'
import { COMMANDS, REPORTED_SETTINGS } from './products.js'

/**
 * The Codex fork's lists (Amazing Codex GUI, "acx"), held to its own sources - the same checks ACC gets in
 * features.test.ts and products.test.ts, kept apart because the fork is a repository of its own.
 *
 * Each check is its own test and decides nothing about the others:
 * - the fork is not checked out beside this repository (or where AMAZING_CODEX_DIR points), or has no such
 *   file yet: the check is skipped, and the note says which file it waits for;
 * - the file is there: the check runs, and on the first difference fails with the ids that differ and the
 *   side they are missing on.
 *
 * While the fork's statistics are still the copy of ACC's being ported to Codex, these fail by design:
 * the service already holds the Codex lists the fork is being ported to (see features.ts, products.ts),
 * and the failure is the list of what is left to port.
 */

describe("the Codex fork's features", () => {
  const source = pluginSource('acx', 'UsageFeatures.kt')

  for (const [kotlin, ours, where] of [
    ['NAMED', FEATURES.acx, 'FEATURES.acx (features.ts)'],
    ['SCREENS', SCREENS.acx, 'SCREENS.acx (features.ts)'],
    ['SETTINGS', SETTINGS.acx, 'SETTINGS.acx (features.ts)'],
  ] as const) {
    it(`hold ${kotlin} to the fork's own list, both ways`, (context) => {
      context.skip(source.text === null, waitingFor(source))

      const named = kotlinSet(source.text!, kotlin)
      expect(named, `no "val ${kotlin} ... = setOf(" in ${source.path}`).not.toBeNull()
      expect(disagreement(kotlin, source, where, difference(named!, Object.keys(ours)))).toBe('')
    })
  }
})

describe("the Codex fork's names", () => {
  const report = pluginSource('acx', 'UsageReport.kt')
  const facts = pluginSource('acx', 'UsageFacts.kt')

  it("hold the built-in commands to the fork's own list, both ways", (context) => {
    context.skip(report.text === null, waitingFor(report))

    const named = kotlinSet(report.text!, 'BUILT_IN_COMMANDS')
    expect(named, `no "val BUILT_IN_COMMANDS ... = setOf(" in ${report.path}`).not.toBeNull()
    expect(disagreement('BUILT_IN_COMMANDS', report, 'COMMANDS.acx (products.ts)', difference(named!, COMMANDS.acx))).toBe('')
  })

  it("hold the settings a report states to the fork's own, both ways", (context) => {
    context.skip(facts.text === null, waitingFor(facts))

    const named = kotlinMapKeys(facts.text!, 'fun settings()')
    expect(named, `no "fun settings()" in ${facts.path}`).not.toBeNull()
    expect(
      disagreement('settings()', facts, 'REPORTED_SETTINGS.acx (products.ts)', difference(named!, Object.keys(REPORTED_SETTINGS.acx))),
    ).toBe('')
  })
})
