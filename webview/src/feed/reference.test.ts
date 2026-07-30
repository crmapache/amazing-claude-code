import { describe, expect, it } from 'vitest'
import { chipLabel, rangeLabel, referenceChip, referenceText } from './reference'

const span = (over: Partial<Parameters<typeof rangeLabel>[0]> = {}) => ({
  path: 'src/useSocket.js',
  startLine: 12,
  startColumn: 5,
  endLine: 18,
  endColumn: 30,
  wholeLines: false,
  ...over,
})

describe('rangeLabel', () => {
  it('прячет колонки, когда выделены целые строки', () => {
    expect(rangeLabel(span({ wholeLines: true }))).toBe('L12-L18')
  })

  it('сжимается до одной строки, если она одна', () => {
    expect(rangeLabel(span({ wholeLines: true, endLine: 12 }))).toBe('L12')
  })

  it('внутри одной строки показывает только колонки', () => {
    expect(rangeLabel(span({ endLine: 12, endColumn: 30 }))).toBe('L12:5-30')
  })

  it('через несколько строк называет и строку, и колонку с обеих сторон', () => {
    expect(rangeLabel(span())).toBe('L12:5-L18:30')
  })
})

describe('reference', () => {
  it('уходит агенту ссылкой на файл, а не текстом', () => {
    expect(referenceText(referenceChip(span()))).toBe('@src/useSocket.js (L12:5-L18:30)')
  })

  it('в плашке остаётся имя файла: полный путь в панель не влезает', () => {
    expect(chipLabel(referenceChip(span({ wholeLines: true })))).toBe('useSocket.js L12-L18')
  })
})
