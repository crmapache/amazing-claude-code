import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FEATURES, featureLabel, GROUPS } from './features.js'

/**
 * The plugin decides which features are counted (UsageFeatures.kt); this service only words them. Read
 * that file here, so a feature added there without a line here fails this build rather than reaching the
 * dashboard as a bare identifier.
 */

const kotlin = readFileSync(
  fileURLToPath(new URL('../../src/main/kotlin/io/github/crmapache/amazingclaudecode/usage/UsageFeatures.kt', import.meta.url)),
  'utf8',
)

const namedInPlugin = (): string[] => {
  const block = kotlin.split('val NAMED: Set<String> = setOf(')[1]?.split(')')[0] ?? ''
  return [...block.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]!)
}

describe('the feature labels', () => {
  it('word every feature the plugin names', () => {
    const named = namedInPlugin()
    expect(named.length).toBeGreaterThan(20)
    expect(named.filter((id) => !FEATURES[id])).toEqual([])
  })

  it('word nothing the plugin no longer names', () => {
    const named = new Set(namedInPlugin())
    expect(Object.keys(FEATURES).filter((id) => !named.has(id))).toEqual([])
  })

  it('put every feature in a group that has a title', () => {
    for (const [id, label] of Object.entries(FEATURES)) expect(GROUPS[label.group], id).toBeTruthy()
  })

  it('word the screens and the settings by rule', () => {
    expect(featureLabel('screen:newChatModel')).toEqual({ group: 'menu', label: 'New chat model' })
    expect(featureLabel('setting:send_key')).toEqual({ group: 'settings', label: 'Send key' })
    expect(featureLabel('something_new')).toEqual({ group: 'other', label: 'something_new' })
  })
})
