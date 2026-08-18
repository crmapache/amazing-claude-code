import { describe, expect, it } from 'vitest'
import { formatDuration } from './tools'

describe('длительность вызова', () => {
  it('у быстрых вызовов остаются доли секунды', () => {
    expect(formatDuration(340)).toBe('0.3s')
    expect(formatDuration(6_200)).toBe('6.2s')
  })

  it('после десяти секунд доли уже не нужны', () => {
    expect(formatDuration(30_000)).toBe('30s')
  })

  it('минуты идут с секундами, и «60s» среди них не бывает', () => {
    expect(formatDuration(90_000)).toBe('1m 30s')
    expect(formatDuration(59_600 + 60_000)).toBe('2m 00s')
  })

  it('после часа считает часами: «1010m» глазом в часы не переводится', () => {
    expect(formatDuration(3_600_000)).toBe('1h 00m 00s')
    expect(formatDuration(60_608_000)).toBe('16h 50m 08s')
  })

  // Секунды — то единственное, по чему видно, что время идёт: без них длинный
  // ход выглядит замершим на целую минуту.
  it('часы не съедают секунды', () => {
    expect(formatDuration(3_600_000 + 5_000)).toBe('1h 00m 05s')
    expect(formatDuration(3_600_000 + 70_000)).toBe('1h 01m 10s')
  })
})
