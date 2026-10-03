import { describe, expect, it } from 'vitest'
import { difference, kotlinMapKeys, kotlinSet, pluginSource } from './pluginSources.testing.js'
import {
  CLAUDE_FAMILIES,
  COMMANDS,
  commandName,
  CUSTOM_COMMAND,
  modelName,
  OTHER_MODEL,
  readProduct,
  REPORTED_SETTINGS,
  toolName,
} from './products.js'

/**
 * What tells the two plugins apart, and the names each may put into a report besides its features: the
 * built-in commands, the models, the tools, the settings a report states. Where ACC keeps such a list in
 * its own source, it is read here and held to the one in products.ts, the way features.test.ts does it for
 * the features; the Codex fork's are held to its files in codexFork.test.ts.
 */

describe('the product of a report', () => {
  it("is ACC's when the report does not say", () => {
    expect(readProduct(undefined)).toBe('acc')
  })

  it('is taken when it is one this service counts', () => {
    expect(readProduct('acc')).toBe('acc')
    expect(readProduct('acx')).toBe('acx')
  })

  it('is refused when it is anything else', () => {
    for (const value of ['', 'ACX', 'acz', 'claude', null, 1, true, {}, ['acx']]) expect(readProduct(value), String(value)).toBeNull()
  })
})

describe("ACC's names", () => {
  const report = pluginSource('acc', 'UsageReport.kt')
  const facts = pluginSource('acc', 'UsageFacts.kt')

  it("hold the built-in commands to the plugin's own list, both ways", () => {
    const named = kotlinSet(report.text!, 'BUILT_IN_COMMANDS')
    expect(named, `no "val BUILT_IN_COMMANDS ... = setOf(" in ${report.path}`).not.toBeNull()
    expect(difference(named!, COMMANDS.acc)).toEqual({ missingHere: [], notInPlugin: [] })
  })

  it("hold the settings a report states to the plugin's own, both ways", () => {
    const named = kotlinMapKeys(facts.text!, 'fun settings()')
    expect(named, `no "fun settings()" in ${facts.path}`).not.toBeNull()
    expect(named!.length).toBeGreaterThan(10)
    expect(difference(named!, Object.keys(REPORTED_SETTINGS.acc))).toEqual({ missingHere: [], notInPlugin: [] })
  })
})

describe('the models', () => {
  it("hold ACC's families to the plugin's own list", () => {
    const report = pluginSource('acc', 'UsageReport.kt')
    const named = kotlinSet(report.text!, 'MODEL_FAMILIES')
    expect(named, `no "val MODEL_FAMILIES = setOf(" in ${report.path}`).not.toBeNull()
    expect(difference(named!, CLAUDE_FAMILIES)).toEqual({ missingHere: [], notInPlugin: [] })
  })

  it('keep a Claude family and fold anything else into Other', () => {
    expect(modelName('acc', 'Opus')).toBe('Opus')
    expect(modelName('acc', 'Fable')).toBe('Fable')
    expect(modelName('acc', 'claude-opus-5')).toBe(OTHER_MODEL)
    expect(modelName('acc', 'gpt-5.5')).toBe(OTHER_MODEL)
  })

  it('keep a Codex catalogue id', () => {
    for (const id of ['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.6-luna', 'gpt-5', 'gpt-4.1-mini', 'gpt-oss-120b', 'o3', 'o4-mini', 'codex-mini-latest']) {
      expect(modelName('acx', id), id).toBe(id)
    }
  })

  it('fold into Other whatever is not shaped like one', () => {
    for (const name of [
      'Opus',
      'GPT-5.5',
      'Gpt-5',
      'gpt-',
      'gpt_5',
      'gpt-5..5',
      'gpt-5.',
      'gpt-5-',
      'o',
      'oo3',
      'codex-',
      'my-model',
      'llama-3.1-70b',
      'gpt-5:latest',
      `gpt-${'a'.repeat(37)}`,
      'Other',
    ]) {
      expect(modelName('acx', name), name).toBe(OTHER_MODEL)
    }
    // Forty characters is the most a name may have.
    expect(modelName('acx', `gpt-${'a'.repeat(36)}`)).toBe(`gpt-${'a'.repeat(36)}`)
  })
})

describe('the commands', () => {
  it("keep each plugin's built-ins and fold everything else into custom", () => {
    expect(commandName('acc', 'compact')).toBe('compact')
    expect(commandName('acc', 'my-skill')).toBe(CUSTOM_COMMAND)
    expect(commandName('acx', 'review')).toBe('review')
    expect(commandName('acx', 'side')).toBe('side')
    // A prompt of one's own, a skill, and a command only Claude Code has.
    expect(commandName('acx', 'prompts:fix-the-login')).toBe(CUSTOM_COMMAND)
    expect(commandName('acx', 'deploy-acme')).toBe(CUSTOM_COMMAND)
    expect(commandName('acx', 'cost')).toBe(CUSTOM_COMMAND)
  })
})

describe('the tools', () => {
  it('keep the CLI names and fold every MCP tool into one', () => {
    expect(toolName('Read')).toBe('Read')
    expect(toolName('MCP')).toBe('MCP')
    expect(toolName('mcp__acme__deploy')).toBe('MCP')
    expect(toolName('read_file')).toBe('other')
  })
})
