import { describe, expect, it } from 'vitest'
import {
  MODEL_OPTIONS,
  MODE_OPTIONS,
  modeLabel,
  modelLabel,
  modelOptions,
  modeShortLabel,
  nextMode,
  normalizeMode,
  withRefusedMode,
} from './catalog'

describe('режимы разрешений', () => {
  it('старое имя приводится к тому, которым режим зовётся сейчас', () => {
    // `default` лежит в сохранённых настройках прошлых версий и приходит от агента.
    expect(normalizeMode('default')).toBe('manual')
  })

  it('остальные режимы не трогаются', () => {
    for (const mode of ['acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']) {
      expect(normalizeMode(mode)).toBe(mode)
    }
  })

  it('подпись находится и по старому имени — иначе в строке состояния окажется сырое значение', () => {
    expect(modeLabel('default')).toBe('Ask permissions')
    expect(modeShortLabel('default')).toBe('Ask')
    expect(modeShortLabel('manual')).toBe('Ask')
  })

  it('в списке режимов нет устаревшего имени', () => {
    expect(MODE_OPTIONS.map((option) => option.id)).not.toContain('default')
    expect(MODE_OPTIONS.map((option) => option.id)).toContain('manual')
  })
})

describe('цикл режимов по Shift+Tab', () => {
  const nothingExtra = { bypass: false, auto: false }

  it('начало круга — то же, что в терминале', () => {
    expect(nextMode('manual', nothingExtra)).toBe('acceptEdits')
    expect(nextMode('acceptEdits', nothingExtra)).toBe('plan')
  })

  it('старое имя первого режима ведёт дальше по кругу, а не само в себя', () => {
    // Раньше цикл знал режим под именем `default`, а панель уже звала его
    // `manual` — и первое нажатие переключало Ask на Ask, то есть впустую.
    expect(nextMode('default', nothingExtra)).toBe('acceptEdits')
  })

  it('после плана идёт bypass, когда он разрешён сессии', () => {
    expect(nextMode('plan', { bypass: true, auto: false })).toBe('bypassPermissions')
  })

  it('запрещённый bypass круг перешагивает', () => {
    expect(nextMode('plan', { bypass: false, auto: true })).toBe('auto')
    expect(nextMode('plan', nothingExtra)).toBe('manual')
  })

  it('после bypass идёт auto, а без него круг замыкается', () => {
    expect(nextMode('bypassPermissions', { bypass: true, auto: true })).toBe('auto')
    expect(nextMode('bypassPermissions', { bypass: true, auto: false })).toBe('manual')
  })

  it('режимы вне круга возвращают к началу', () => {
    expect(nextMode('auto', { bypass: true, auto: true })).toBe('manual')
    expect(nextMode('dontAsk', { bypass: true, auto: true })).toBe('manual')
  })
})

describe('режимы, в которых агент отказал', () => {
  it('отказ запоминается — второй раз в этот режим круг не заводит', () => {
    expect(withRefusedMode([], 'auto')).toEqual(['auto'])
  })

  it('повторный отказ не удваивает запись', () => {
    expect(withRefusedMode(['auto'], 'auto')).toEqual(['auto'])
  })

  it('старое имя режима приводится к нынешнему — иначе отказ не узнать', () => {
    expect(withRefusedMode([], 'default')).toEqual(['manual'])
  })
})

describe('каталог моделей', () => {
  const models = [
    { value: 'default', label: 'Default (recommended)', description: 'Opus 5 with 1M context', resolved: 'claude-opus-5[1m]' },
    { value: 'sonnet', label: 'Sonnet', description: 'Sonnet 5', resolved: 'claude-sonnet-5' },
    { value: 'opus-legacy', label: 'Opus 4.1', description: 'legacy', resolved: 'claude-opus-4-1', disabled: true },
  ]

  it('живой каталог CLI важнее встроенного списка', () => {
    expect(modelOptions(models).map((option) => option.id)).toEqual(['default', 'sonnet', 'opus-legacy'])
  })

  it('пока каталога нет, показываем встроенный список', () => {
    expect(modelOptions(null)).toBe(MODEL_OPTIONS)
    expect(modelOptions([])).toBe(MODEL_OPTIONS)
  })

  it('недоступную модель показываем, но помечаем', () => {
    expect(modelOptions(models).find((option) => option.id === 'opus-legacy')?.tag).toBe('unavailable')
  })
})

describe('подпись модели в нижней строке', () => {
  it('из полного идентификатора остаётся имя семейства', () => {
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku')
  })

  it('про миллионное окно говорим отдельно — по имени семейства этого не понять', () => {
    expect(modelLabel('claude-opus-5[1m]')).toBe('Opus 1M')
  })

  it('незнакомую модель показываем как есть, без префикса и суффикса', () => {
    expect(modelLabel('claude-experimental-9')).toBe('experimental-9')
  })
})
