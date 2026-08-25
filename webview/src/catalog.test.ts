import { describe, expect, it } from 'vitest'
import {
  EFFORT_OPTIONS,
  EFFORT_SAMPLE,
  MODE_SAMPLE,
  MODEL_SAMPLE,
  MODEL_OPTIONS,
  MODE_OPTIONS,
  modeLabel,
  modeMenuOptions,
  modelLabel,
  modelMenu,
  modelOptions,
  resolvePanelModel,
  switchedModel,
  modeShortLabel,
  nextMode,
  normalizeMode,
  withRefusedMode,
} from './catalog'

describe('permission modes', () => {
  it('brings an old name to the one the mode is called by now', () => {
    // `default` lies in the saved settings of past versions and arrives from the agent.
    expect(normalizeMode('default')).toBe('manual')
  })

  it('leaves the other modes alone', () => {
    for (const mode of ['acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']) {
      expect(normalizeMode(mode)).toBe(mode)
    }
  })

  it('finds a caption by the old name too - otherwise a raw value ends up in the status row', () => {
    expect(modeLabel('default')).toBe('Ask permissions')
    expect(modeShortLabel('default')).toBe('Ask')
    expect(modeShortLabel('manual')).toBe('Ask')
  })

  it('keeps the outdated name out of the mode list', () => {
    expect(MODE_OPTIONS.map((option) => option.id)).not.toContain('default')
    expect(MODE_OPTIONS.map((option) => option.id)).toContain('manual')
  })
})

describe('the Shift+Tab cycle of modes', () => {
  const nothingExtra = { bypass: false, auto: false }

  it('starts the circle where the terminal starts it', () => {
    expect(nextMode('manual', nothingExtra)).toBe('acceptEdits')
    expect(nextMode('acceptEdits', nothingExtra)).toBe('plan')
  })

  it('lets the first mode old name lead on round the circle rather than back into itself', () => {
    // The cycle used to know the mode under the name `default` while the panel already called it `manual` -
    // and the first press switched Ask to Ask, that is, to no effect.
    expect(nextMode('default', nothingExtra)).toBe('acceptEdits')
  })

  it('goes to bypass after the plan when the session is allowed it', () => {
    expect(nextMode('plan', { bypass: true, auto: false })).toBe('bypassPermissions')
  })

  it('lets the circle step over a forbidden bypass', () => {
    expect(nextMode('plan', { bypass: false, auto: true })).toBe('auto')
    expect(nextMode('plan', nothingExtra)).toBe('manual')
  })

  it('goes to auto after bypass, and closes the circle without it', () => {
    expect(nextMode('bypassPermissions', { bypass: true, auto: true })).toBe('auto')
    expect(nextMode('bypassPermissions', { bypass: true, auto: false })).toBe('manual')
  })

  it('brings the modes outside the circle back to the start', () => {
    expect(nextMode('auto', { bypass: true, auto: true })).toBe('manual')
    expect(nextMode('dontAsk', { bypass: true, auto: true })).toBe('manual')
  })
})

describe('the modes the agent refused', () => {
  it('remembers a refusal - the circle does not lead into that mode a second time', () => {
    expect(withRefusedMode([], 'auto')).toEqual(['auto'])
  })

  it('does not double the record on a repeated refusal', () => {
    expect(withRefusedMode(['auto'], 'auto')).toEqual(['auto'])
  })

  it('brings a mode old name to the current one - otherwise the refusal is not recognised', () => {
    expect(withRefusedMode([], 'default')).toEqual(['manual'])
  })
})

describe('the availability of the optional modes in the menu', () => {
  it('shows auto and bypass but marks them unavailable - like a model, rather than dropping them from the list', () => {
    const options = modeMenuOptions({ bypass: false, auto: false })

    expect(options.find((option) => option.id === 'auto')?.disabled).toBe(true)
    expect(options.find((option) => option.id === 'bypassPermissions')?.disabled).toBe(true)
  })

  it('leaves an available mode an ordinary item, with no mark', () => {
    const options = modeMenuOptions({ bypass: true, auto: true })

    expect(options.find((option) => option.id === 'auto')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'bypassPermissions')?.disabled).toBeUndefined()
  })

  it('does not let the unavailability of auto/bypass touch the other modes', () => {
    const options = modeMenuOptions({ bypass: false, auto: false })

    expect(options.find((option) => option.id === 'manual')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'acceptEdits')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'plan')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'dontAsk')?.disabled).toBeUndefined()
  })
})

describe('the model catalogue', () => {
  const models = [
    { value: 'default', label: 'Default (recommended)', description: 'Opus 5 with 1M context', resolved: 'claude-opus-5[1m]' },
    { value: 'sonnet', label: 'Sonnet', description: 'Sonnet 5', resolved: 'claude-sonnet-5' },
    { value: 'opus-legacy', label: 'Opus 4.1', description: 'legacy', resolved: 'claude-opus-4-1', disabled: true },
  ]

  it('puts the CLI live catalogue above the built-in list', () => {
    expect(modelOptions(models).map((option) => option.id)).toEqual(['default', 'sonnet', 'opus-legacy'])
  })

  it('shows the built-in list while there is no catalogue', () => {
    expect(modelOptions(null)).toBe(MODEL_OPTIONS)
    expect(modelOptions([])).toBe(MODEL_OPTIONS)
  })

  it('shows an unavailable model but marks it', () => {
    expect(modelOptions(models).find((option) => option.id === 'opus-legacy')?.tag).toBe('unavailable')
  })
})

describe('the model the agent moved to itself', () => {
  const models = [
    { value: 'default', label: 'Default', description: '', resolved: 'claude-opus-5[1m]' },
    { value: 'sonnet', label: 'Sonnet', description: '', resolved: 'claude-sonnet-5' },
  ]

  it('does not count a conversation on the chosen model as a switch', () => {
    expect(switchedModel(models, 'default', 'claude-opus-5[1m]')).toBeUndefined()
    expect(switchedModel(models, 'sonnet', 'claude-sonnet-5')).toBeUndefined()
  })

  it('does not treat a note about the context window as a different model', () => {
    // The catalogue and the stream write it differently, and without this a conversation on its own model
    // would look as though it had run off to someone else's.
    expect(switchedModel(models, 'default', 'claude-opus-5')).toBeUndefined()
  })

  it('makes a move to another model visible', () => {
    expect(switchedModel(models, 'default', 'claude-opus-4-8')).toBe('claude-opus-4-8')
  })

  it('does not invent a discrepancy without a catalogue: what the choice resolves into is unknown', () => {
    expect(switchedModel(null, 'default', 'claude-opus-4-8')).toBeUndefined()
    expect(switchedModel(models, 'unknown-choice', 'claude-opus-4-8')).toBeUndefined()
  })

  it('keeps the tick on the choice while the conversation is on the chosen model', () => {
    expect(modelMenu(models, 'sonnet', undefined)).toMatchObject({ selected: 'sonnet' })
    expect(modelMenu(models, '', undefined)).toMatchObject({ selected: 'default' })
  })

  it('moves the tick onto the catalogue model with the same identifier after a move', () => {
    expect(modelMenu(models, 'default', 'claude-sonnet-5')).toMatchObject({ selected: 'sonnet' })
  })

  it('starts a row of its own for a model missing from the catalogue - otherwise there is nothing to mark', () => {
    const menu = modelMenu(models, 'default', 'claude-opus-4-8')

    expect(menu.selected).toBe('claude-opus-4-8')
    expect(menu.options.at(-1)).toMatchObject({ id: 'claude-opus-4-8', label: 'Opus 4.8' })
    // The catalogue is left alone meanwhile: it is shared by every tab, while one of them moved.
    expect(models).toHaveLength(2)
  })
})

describe('the caption of the model a tab works on', () => {
  const models = [
    { value: 'default', label: 'Default', description: '', resolved: 'claude-opus-5' },
    { value: 'opus[1m]', label: 'Opus (1M context)', description: '', resolved: 'claude-opus-5[1m]' },
    { value: 'haiku', label: 'Haiku', description: '', resolved: 'claude-haiku-4-5' },
    { value: 'fable', label: 'Fable', description: '', resolved: 'claude-fable-5' },
  ]

  it('expands the choice through the catalogue before the agent has said a word', () => {
    expect(resolvePanelModel({}, models, 'opus[1m]')).toBe('claude-opus-5[1m]')
    expect(resolvePanelModel({}, models, '')).toBe('claude-opus-5')
  })

  /**
   * The complaint this was written for: five to thirty seconds after choosing "Opus (1M context)" the
   * button started naming a bare "Opus" - a model that stands in no menu. The signature under an answer
   * simply has no window mark in it, and taken literally it looked like a model of its own.
   */
  it('keeps the window mark when the answers come signed without it', () => {
    expect(resolvePanelModel({ model: 'claude-opus-5' }, models, 'opus[1m]')).toBe('claude-opus-5[1m]')
    expect(resolvePanelModel({ model: 'opus[1m]' }, models, 'opus[1m]')).toBe('claude-opus-5[1m]')
    expect(switchedModel(models, 'opus[1m]', 'claude-opus-5')).toBeUndefined()
  })

  it('does not take a build date for another model', () => {
    expect(resolvePanelModel({ model: 'claude-haiku-4-5-20251001' }, models, 'haiku')).toBe('claude-haiku-4-5')
    expect(switchedModel(models, 'haiku', 'claude-haiku-4-5-20251001')).toBeUndefined()
  })

  it('names what is genuinely at work once the CLI has swapped the model itself', () => {
    expect(resolvePanelModel({ model: 'claude-opus-4-8' }, models, 'fable')).toBe('claude-opus-4-8')
    expect(switchedModel(models, 'fable', 'claude-opus-4-8')).toBe('claude-opus-4-8')
  })

  it('shows a choice not yet confirmed by the agent - expanded the same way', () => {
    expect(resolvePanelModel({ pendingModel: 'haiku', model: 'claude-fable-5' }, models, 'fable')).toBe(
      'claude-haiku-4-5',
    )
  })
})

describe('the model caption in the bottom row', () => {
  it('names the family and the generation out of a full identifier, without the build date', () => {
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  })

  /**
   * The whole point of the generation being there: the model the CLI swaps a conversation to on its own
   * must not read as the one that was chosen (see ModelSwitchItem).
   */
  it("tells the guard's Opus from the chosen one", () => {
    expect(modelLabel('claude-opus-4-8')).toBe('Opus 4.8')
    expect(modelLabel('claude-opus-5')).toBe('Opus 5')
  })

  it('leaves a bare choice as it is - there is no generation in it', () => {
    expect(modelLabel('opus')).toBe('Opus')
    expect(modelLabel('opusplan')).toBe('Opusplan')
    expect(modelLabel('')).toBe('default')
  })

  it('mentions a million-token window separately - the family name does not tell that', () => {
    expect(modelLabel('claude-opus-5[1m]')).toBe('Opus 5 1M')
  })

  it('shows an unfamiliar model as it is, without a prefix or a suffix', () => {
    expect(modelLabel('claude-experimental-9')).toBe('experimental-9')
  })
})

/**
 * The button measures its width off these samples rather than off what is chosen right now (see Selector
 * in StatusBar.tsx). Let a sample turn out shorter than the genuine caption and it gets clipped with an
 * ellipsis for no reason at all.
 */
describe('the width samples for the selectors', () => {
  it('keeps the model sample no shorter than any caption of the known families', () => {
    const labels = ['default', ...MODEL_OPTIONS.map((option) => modelLabel(option.id))]

    for (const label of labels) expect(label.length).toBeLessThanOrEqual(MODEL_SAMPLE.length)
  })

  it('keeps the effort sample no shorter than any option in the menu', () => {
    for (const option of EFFORT_OPTIONS) expect(option.label.length).toBeLessThanOrEqual(EFFORT_SAMPLE.length)
  })

  it('keeps the mode sample no shorter than any short caption', () => {
    const labels = MODE_OPTIONS.map((option) => modeShortLabel(option.id))

    for (const label of labels) expect(label.length).toBeLessThanOrEqual(MODE_SAMPLE.length)
  })
})
