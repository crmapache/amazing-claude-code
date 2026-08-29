import { LOCALES } from './i18n'
import { DICTIONARIES } from './i18n/all'
import { en } from './i18n/en'
import { ru } from './i18n/ru'
import { describe, expect, it } from 'vitest'
import {
  columns,
  effortOptions,
  effortShortLabel,
  EFFORT_SAMPLE,
  modeSample,
  MODEL_SAMPLE,
  modelSample,
  modelCatalogue,
  modeOptions,
  modeLabel,
  modeMenuOptions,
  modelLabel,
  modelMenu,
  modelOptions,
  resolvePanelModel,
  modelInForce,
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
    expect(modeLabel(en, 'default')).toBe('Ask permissions')
    expect(modeShortLabel(en, 'default')).toBe('Ask')
    expect(modeShortLabel(en, 'manual')).toBe('Ask')
  })

  it('keeps the outdated name out of the mode list', () => {
    expect(modeOptions(en).map((option) => option.id)).not.toContain('default')
    expect(modeOptions(en).map((option) => option.id)).toContain('manual')
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
    const options = modeMenuOptions(en, { bypass: false, auto: false })

    expect(options.find((option) => option.id === 'auto')?.disabled).toBe(true)
    expect(options.find((option) => option.id === 'bypassPermissions')?.disabled).toBe(true)
  })

  it('leaves an available mode an ordinary item, with no mark', () => {
    const options = modeMenuOptions(en, { bypass: true, auto: true })

    expect(options.find((option) => option.id === 'auto')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'bypassPermissions')?.disabled).toBeUndefined()
  })

  it('does not let the unavailability of auto/bypass touch the other modes', () => {
    const options = modeMenuOptions(en, { bypass: false, auto: false })

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
    expect(modelOptions(en, models).map((option) => option.id)).toEqual(['default', 'sonnet', 'opus-legacy'])
  })

  it('shows the built-in list while there is no catalogue', () => {
    expect(modelOptions(en, null)).toEqual(modelCatalogue(en))
    expect(modelOptions(en, [])).toEqual(modelCatalogue(en))
  })

  /**
   * The CLI answers in English whatever the panel is set to - it has no idea which language this is. So
   * where its list names a model the panel has words for, the panel's own line is used and only the set
   * of models comes from the CLI.
   */
  it('describes a known model in the panel’s language rather than the CLI’s', () => {
    const models = [{ value: 'sonnet', label: 'Sonnet', resolved: 'claude-sonnet-5', description: 'Efficient for routine tasks' }]

    expect(modelOptions(ru, models)[0]?.sub).toBe(ru.models.sonnet.sub)
  })

  /** The caption is as much the panel's own as the line under it - "Default (recommended)" is a sentence. */
  it('names a known model in the panel’s language too', () => {
    const models = [
      { value: 'default', label: 'Default (recommended)', resolved: 'claude-sonnet-5', description: 'Recommended' },
    ]

    expect(modelOptions(ru, models)[0]?.label).toBe(ru.models.default.label)
  })

  it('keeps the CLI’s own words for a model it has never heard of', () => {
    const models = [
      { value: 'opus-legacy', label: 'Opus legacy', resolved: 'claude-opus-4', description: 'Something only the CLI knows' },
    ]

    expect(modelOptions(ru, models)[0]?.sub).toBe('Something only the CLI knows')
    expect(modelOptions(ru, models)[0]?.label).toBe('Opus legacy')
  })

  it('shows an unavailable model but marks it', () => {
    expect(modelOptions(en, models).find((option) => option.id === 'opus-legacy')?.tag).toBe('unavailable')
  })
})

describe('the model the agent moved to itself', () => {
  const models = [
    { value: 'default', label: 'Default', description: '', resolved: 'claude-opus-5[1m]' },
    { value: 'sonnet', label: 'Sonnet', description: '', resolved: 'claude-sonnet-5' },
  ]

  it('does not count a conversation on the chosen model as a switch', () => {
    expect(modelInForce(models, 'default', 'claude-opus-5[1m]')).toBeUndefined()
    expect(modelInForce(models, 'sonnet', 'claude-sonnet-5')).toBeUndefined()
  })

  it('does not treat a note about the context window as a different model', () => {
    // The catalogue and the stream write it differently, and without this a conversation on its own model
    // would look as though it had run off to someone else's.
    expect(modelInForce(models, 'default', 'claude-opus-5')).toBeUndefined()
  })

  it('makes a move to another model visible', () => {
    expect(modelInForce(models, 'default', 'claude-opus-4-8')).toBe('claude-opus-4-8')
  })

  it('does not invent a discrepancy without a catalogue: what the choice resolves into is unknown', () => {
    expect(modelInForce(null, 'default', 'claude-opus-4-8')).toBeUndefined()
    expect(modelInForce(models, 'unknown-choice', 'claude-opus-4-8')).toBeUndefined()
  })

  it('keeps the tick on the choice while the conversation is on the chosen model', () => {
    expect(modelMenu(en, models, 'sonnet', undefined)).toMatchObject({ selected: 'sonnet' })
    expect(modelMenu(en, models, '', undefined)).toMatchObject({ selected: 'default' })
  })

  it('moves the tick onto the catalogue model with the same identifier after a move', () => {
    expect(modelMenu(en, models, 'default', 'claude-sonnet-5')).toMatchObject({ selected: 'sonnet' })
  })

  it('starts a row of its own for a model missing from the catalogue - otherwise there is nothing to mark', () => {
    const menu = modelMenu(en, models, 'default', 'claude-opus-4-8')

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
    expect(modelInForce(models, 'opus[1m]', 'claude-opus-5')).toBeUndefined()
  })

  it('does not take a build date for another model', () => {
    expect(resolvePanelModel({ model: 'claude-haiku-4-5-20251001' }, models, 'haiku')).toBe('claude-haiku-4-5')
    expect(modelInForce(models, 'haiku', 'claude-haiku-4-5-20251001')).toBeUndefined()
  })

  it('names what is genuinely at work once the CLI has swapped the model itself', () => {
    expect(resolvePanelModel({ model: 'claude-opus-4-8' }, models, 'fable')).toBe('claude-opus-4-8')
    expect(modelInForce(models, 'fable', 'claude-opus-4-8')).toBe('claude-opus-4-8')
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
 * ellipsis for no reason at all; let it turn out longer than any caption that can occur and the button
 * carries columns nothing will ever fill - which is what put the three of them onto two lines.
 */
describe('the width samples for the selectors', () => {
  it('keeps the model sample no shorter than any caption of the known families', () => {
    const labels = ['default', ...modelCatalogue(en).map((option) => modelLabel(option.id))]

    for (const label of labels) expect(label.length).toBeLessThanOrEqual(MODEL_SAMPLE.length)
  })

  /**
   * Once the CLI's catalogue is there, it and not the built-in shape says how wide the button has to be:
   * these are the only captions anyone in this installation can choose.
   */
  it('measures the model button by the catalogue the CLI sent', () => {
    const models = [
      { value: 'default', label: 'Default', description: '', resolved: 'claude-sonnet-5' },
      { value: 'opus', label: 'Opus', description: '', resolved: 'claude-opus-5' },
    ]

    expect(modelSample(models)).toBe('Sonnet 5')
  })

  it('falls back to the built-in shape while the catalogue is unknown', () => {
    expect(modelSample(null)).toBe(MODEL_SAMPLE)
    expect(modelSample([])).toBe(MODEL_SAMPLE)
  })

  /**
   * The menu's own words, not the button's: what the button says is the short caption (see
   * effortShortLabel), and that is what has to fit into the room the sample holds.
   */
  it('keeps the effort sample no shorter than any caption the button can show', () => {
    for (const option of effortOptions(en)) {
      expect(columns(effortShortLabel(option.label)), option.id).toBeLessThanOrEqual(columns(EFFORT_SAMPLE))
    }
  })

  /** The short form is a caption and nothing else - the value the CLI is given stays as it is. */
  it('shortens only the one effort value that is longer than the rest', () => {
    expect(effortShortLabel('ultracode')).toBe('ultra')

    for (const option of effortOptions(en)) {
      if (option.id !== 'ultracode') expect(effortShortLabel(option.label)).toBe(option.label)
    }
  })

  /**
   * No column stands empty whatever is chosen: the widest caption is exactly as wide as the room. A
   * sample wider than every caption is room nothing can fill - on three buttons at once, in a row that has
   * to fit into a panel somebody dragged narrow.
   */
  it('holds no more room than the widest caption needs', () => {
    expect(columns(EFFORT_SAMPLE)).toBe(
      Math.max(...effortOptions(en).map((option) => columns(effortShortLabel(option.label)))),
    )

    for (const { id } of LOCALES) {
      const dictionary = DICTIONARIES[id]

      expect(columns(modeSample(dictionary)), id).toBe(
        Math.max(...modeOptions(dictionary).map((option) => columns(modeShortLabel(dictionary, option.id)))),
      )
    }
  })

  /**
   * In every language, not only in English: the captions are translated while the button is not redrawn
   * per language, and a Han character takes two columns for one character - measured by length, the
   * Chinese sample came out narrower than the caption it is supposed to hold (see columns).
   */
  it('keeps the mode sample no shorter than any short caption, in every language', () => {
    for (const { id } of LOCALES) {
      const dictionary = DICTIONARIES[id]
      const sample = columns(modeSample(dictionary))

      for (const option of modeOptions(dictionary)) {
        expect(columns(modeShortLabel(dictionary, option.id)), `${id}: ${option.id}`).toBeLessThanOrEqual(sample)
      }
    }
  })

  it('counts a full-width character as the two columns it is drawn in', () => {
    expect(columns('Ask')).toBe(3)
    expect(columns('不问')).toBe(4)
    expect(columns('確認')).toBe(4)
    expect(columns('안 물음')).toBe(7)
  })
})
