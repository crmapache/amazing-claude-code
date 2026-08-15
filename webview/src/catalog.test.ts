import { describe, expect, it } from 'vitest'
import {
  MODEL_OPTIONS,
  MODE_OPTIONS,
  modeLabel,
  modeMenuOptions,
  modelLabel,
  modelMenu,
  modelOptions,
  switchedModel,
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

describe('доступность необязательных режимов в меню', () => {
  it('auto и bypass видны, но помечены недоступными — как и модель, а не пропадают из списка', () => {
    const options = modeMenuOptions({ bypass: false, auto: false })

    expect(options.find((option) => option.id === 'auto')?.disabled).toBe(true)
    expect(options.find((option) => option.id === 'bypassPermissions')?.disabled).toBe(true)
  })

  it('доступный режим — обычный пункт, без пометки', () => {
    const options = modeMenuOptions({ bypass: true, auto: true })

    expect(options.find((option) => option.id === 'auto')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'bypassPermissions')?.disabled).toBeUndefined()
  })

  it('остальные режимы недоступность auto/bypass не трогает', () => {
    const options = modeMenuOptions({ bypass: false, auto: false })

    expect(options.find((option) => option.id === 'manual')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'acceptEdits')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'plan')?.disabled).toBeUndefined()
    expect(options.find((option) => option.id === 'dontAsk')?.disabled).toBeUndefined()
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

describe('модель, на которую агент ушёл сам', () => {
  const models = [
    { value: 'default', label: 'Default', description: '', resolved: 'claude-opus-5[1m]' },
    { value: 'sonnet', label: 'Sonnet', description: '', resolved: 'claude-sonnet-5' },
  ]

  it('разговор на выбранной модели переключением не считается', () => {
    expect(switchedModel(models, 'default', 'claude-opus-5[1m]')).toBeUndefined()
    expect(switchedModel(models, 'sonnet', 'claude-sonnet-5')).toBeUndefined()
  })

  it('пометка про окно контекста — не другая модель', () => {
    // Каталог и поток пишут её вразнобой, и без этого разговор на своей же
    // модели выглядел бы сбежавшим на чужую.
    expect(switchedModel(models, 'default', 'claude-opus-5')).toBeUndefined()
  })

  it('уход на другую модель виден', () => {
    expect(switchedModel(models, 'default', 'claude-opus-4-8')).toBe('claude-opus-4-8')
  })

  it('без каталога расхождение не выдумываем: во что разворачивается выбор — неизвестно', () => {
    expect(switchedModel(null, 'default', 'claude-opus-4-8')).toBeUndefined()
    expect(switchedModel(models, 'unknown-choice', 'claude-opus-4-8')).toBeUndefined()
  })

  it('пока разговор на выбранной модели, галочка стоит на выборе', () => {
    expect(modelMenu(models, 'sonnet', undefined)).toMatchObject({ selected: 'sonnet' })
    expect(modelMenu(models, '', undefined)).toMatchObject({ selected: 'default' })
  })

  it('после ухода галочка переезжает на модель каталога с тем же идентификатором', () => {
    expect(modelMenu(models, 'default', 'claude-sonnet-5')).toMatchObject({ selected: 'sonnet' })
  })

  it('модели, которой нет в каталоге, заводится своя строка — иначе отмечать нечего', () => {
    const menu = modelMenu(models, 'default', 'claude-opus-4-8')

    expect(menu.selected).toBe('claude-opus-4-8')
    expect(menu.options.at(-1)).toMatchObject({ id: 'claude-opus-4-8', label: 'Opus' })
    // Каталог при этом не трогаем: он общий на все вкладки, а ушла одна.
    expect(models).toHaveLength(2)
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
