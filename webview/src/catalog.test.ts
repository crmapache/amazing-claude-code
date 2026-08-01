import { describe, expect, it } from 'vitest'
import { MODE_OPTIONS, modeLabel, modeShortLabel, nextMode, normalizeMode, withRefusedMode } from './catalog'

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
