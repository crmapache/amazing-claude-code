import { describe, expect, it } from 'vitest'
import { compactProgress } from './compact'

describe('compactProgress', () => {
  it('в начале ноль, а не пустая полоса непонятно на сколько', () => {
    expect(compactProgress(0)).toBe(0)
  })

  it('совпадает с числом в терминале: шесть секунд — шесть процентов', () => {
    expect(compactProgress(6_000)).toBe(6)
  })

  it('растёт быстро в начале и еле-еле под конец', () => {
    expect(compactProgress(30_000)).toBe(28)
    expect(compactProgress(60_000)).toBe(49)
    expect(compactProgress(120_000)).toBe(74)
  })

  it('никогда не доходит до ста: сжатие кончается не по секундомеру', () => {
    expect(compactProgress(10 * 60_000)).toBe(95)
    expect(compactProgress(60 * 60_000)).toBe(95)
  })

  it('отрицательное время (часы съехали назад) считает за начало', () => {
    expect(compactProgress(-5_000)).toBe(0)
  })
})
