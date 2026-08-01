import { describe, expect, it } from 'vitest'
import { MODE_OPTIONS, modeLabel, modeShortLabel, normalizeMode } from './catalog'

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
