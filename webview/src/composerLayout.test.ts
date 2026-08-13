import { describe, expect, it } from 'vitest'
import { clampComposerWidth, MIN_COMPOSER_WIDTH, normalizeComposerLayout } from './composerLayout'

describe('clampComposerWidth', () => {
  it('не даёт панели ввода стать уже минимума, в котором ещё влезают все селекторы', () => {
    expect(clampComposerWidth(0, 1600)).toBe(MIN_COMPOSER_WIDTH)
    expect(clampComposerWidth(100, 1600)).toBe(MIN_COMPOSER_WIDTH)
  })

  it('не даёт панели ввода стать шире половины экрана (за вычетом ручки ресайза)', () => {
    expect(clampComposerWidth(2000, 1600)).toBe(797)
    expect(clampComposerWidth(900, 1600)).toBe(797)
  })

  it('пропускает значение как есть, если оно между минимумом и половиной экрана', () => {
    expect(clampComposerWidth(500, 1600)).toBe(500)
  })

  it('на узкой панели минимум побеждает половину экрана — иначе селекторы сломаются', () => {
    expect(clampComposerWidth(1000, 600)).toBe(MIN_COMPOSER_WIDTH)
  })

  it('когда тулвиндоу целиком уже минимума, ширина реального окна (за вычетом ручки) побеждает минимум — иначе панель вылезет за край', () => {
    expect(clampComposerWidth(1000, 300)).toBe(295)
    expect(clampComposerWidth(0, 300)).toBe(295)
  })

  it('оставляет место ручке ресайза (5px, flex:none) — иначе сама ручка и край дока уезжают за viewport под overflow:hidden всей панели', () => {
    // viewportWidth=1000 сам по себе даёт ровно круглые половины (500), поэтому
    // отличие от вычета ручки видно однозначно: не 500, а 500 - 5/2 (округление вниз).
    expect(clampComposerWidth(2000, 1000)).toBe(497)
  })
})

describe('normalizeComposerLayout', () => {
  it('пропускает left и right как есть', () => {
    expect(normalizeComposerLayout('left')).toBe('left')
    expect(normalizeComposerLayout('right')).toBe('right')
  })

  it('всё остальное — включая пусто, мусор и старое/чужое значение — считает «снизу»', () => {
    expect(normalizeComposerLayout('bottom')).toBe('bottom')
    expect(normalizeComposerLayout(undefined)).toBe('bottom')
    expect(normalizeComposerLayout('')).toBe('bottom')
    expect(normalizeComposerLayout('top')).toBe('bottom')
  })
})
