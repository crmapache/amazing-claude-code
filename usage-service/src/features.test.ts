import { describe, expect, it } from 'vitest'
import { FEATURES, featureLabel, GROUPS, isKnownFeature, SCREENS, SETTINGS } from './features.js'
import { difference, kotlinSet, pluginSource } from './pluginSources.testing.js'
import { PRODUCTS } from './products.js'

/**
 * ACC decides which features it counts (UsageFeatures.kt in this repository); this service words them and
 * keeps out every other id. Read that file here, so a feature added there without a line here - or a line
 * here the plugin no longer names - fails this build rather than being dropped on arrival or reaching the
 * dashboard as a bare identifier.
 *
 * The Codex fork's lists are held to its own file in codexFork.test.ts - a repository of its own, which
 * may be missing or half-way through a port, and whose state should not decide whether these pass.
 */

describe("ACC's features", () => {
  const source = pluginSource('acc', 'UsageFeatures.kt')

  for (const [kotlin, ours] of [
    ['NAMED', FEATURES.acc],
    ['SCREENS', SCREENS.acc],
    ['SETTINGS', SETTINGS.acc],
  ] as const) {
    it(`hold ${kotlin} to the plugin's own list, both ways`, () => {
      const named = kotlinSet(source.text!, kotlin)
      expect(named, `no "val ${kotlin} ... = setOf(" in ${source.path}`).not.toBeNull()
      expect(named!.length).toBeGreaterThan(10)
      expect(difference(named!, Object.keys(ours))).toEqual({ missingHere: [], notInPlugin: [] })
    })
  }
})

describe.each(PRODUCTS)("the %s plugin's feature labels", (product) => {
  it('put every feature in a group that has a title', () => {
    for (const [id, label] of Object.entries(FEATURES[product])) expect(GROUPS[label.group], id).toBeTruthy()
  })
})

describe('the two plugins', () => {
  /** What the fork does not have and what only it has - the rest of each list is shared. */
  const apart = (acc: Record<string, unknown>, acx: Record<string, unknown>) => difference(Object.keys(acc), Object.keys(acx))

  it('differ in their features only where the agent underneath does', () => {
    expect(apart(FEATURES.acc, FEATURES.acx)).toEqual({
      missingHere: ['design_login', 'rewind', 'stop_task'],
      notInPlugin: ['project_trust'],
    })
    expect(apart(SCREENS.acc, SCREENS.acx)).toEqual({
      missingHere: ['claudeConfig', 'settingSources'],
      notInPlugin: ['codexConfig'],
    })
    expect(apart(SETTINGS.acc, SETTINGS.acx)).toEqual({
      missingHere: ['claude_config', 'setting_sources'],
      notInPlugin: ['codex_config', 'project_trust'],
    })
  })

  it("name each one's agent in the wording", () => {
    expect(featureLabel('acc', 'account_add').label).toBe('Add a Claude account')
    expect(featureLabel('acx', 'account_add').label).toBe('Add a Codex account')
    expect(featureLabel('acx', 'screen:accounts').label).toBe('Codex accounts')
    expect(featureLabel('acx', 'setting:executable').label).toBe('Path to Codex')
    for (const product of PRODUCTS) {
      const labels = [
        ...Object.values(FEATURES[product]).map((feature) => feature.label),
        ...Object.values(SCREENS[product]),
        ...Object.values(SETTINGS[product]),
      ]
      const other = product === 'acc' ? /codex/i : /claude/i
      expect(labels.filter((label) => other.test(label)), product).toEqual([])
    }
  })

  it("let each count only its own features through the door", () => {
    expect(isKnownFeature('acx', 'project_trust')).toBe(true)
    expect(isKnownFeature('acx', 'stop_task')).toBe(false)
    expect(isKnownFeature('acc', 'project_trust')).toBe(false)
    expect(isKnownFeature('acx', 'screen:codexConfig')).toBe(true)
    expect(isKnownFeature('acc', 'screen:codexConfig')).toBe(false)
    expect(isKnownFeature('acx', 'setting:claude_config')).toBe(false)
    // An id that only exists on every object, not on the list.
    expect(isKnownFeature('acc', 'constructor')).toBe(false)
    expect(isKnownFeature('acc', 'screen:toString')).toBe(false)
  })
})

describe('the feature labels', () => {
  it('word the screens and the settings from the lists, and anything older by rule', () => {
    expect(featureLabel('acc', 'screen:newChatModel')).toEqual({ group: 'menu', label: 'New chats: model' })
    expect(featureLabel('acc', 'setting:send_key')).toEqual({ group: 'settings', label: 'Send key' })
    // Rows kept before the lists were held at the door can still name something off them.
    expect(featureLabel('acc', 'screen:someOldScreen')).toEqual({ group: 'menu', label: 'Some old screen' })
    expect(featureLabel('acc', 'something_new')).toEqual({ group: 'other', label: 'something_new' })
  })
})
