import { describe, expect, it } from 'vitest'
import { parseInline } from './markdown'

describe('parseInline', () => {
  it('превращает голый URL в ссылку', () => {
    expect(parseInline('смотри https://example.com/docs дальше')).toEqual([
      { text: 'смотри ' },
      { text: 'https://example.com/docs', href: 'https://example.com/docs' },
      { text: ' дальше' },
    ])
  })

  it('не утаскивает точку в конце предложения в адрес', () => {
    expect(parseInline('см. https://example.com.')).toEqual([
      { text: 'см. ' },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: '.' },
    ])
  })

  it('не утаскивает закрывающую скобку обрамления в адрес', () => {
    expect(parseInline('(https://example.com/docs)')).toEqual([
      { text: '(' },
      { text: 'https://example.com/docs', href: 'https://example.com/docs' },
      { text: ')' },
    ])
  })

  it('сохраняет скобку, если она часть самого адреса', () => {
    expect(parseInline('https://example.com/foo(bar)')).toEqual([
      { text: 'https://example.com/foo(bar)', href: 'https://example.com/foo(bar)' },
    ])
  })

  it('разбирает markdown-ссылку с отдельным текстом', () => {
    expect(parseInline('см. [доку](https://example.com/docs) тут')).toEqual([
      { text: 'см. ' },
      { text: 'доку', href: 'https://example.com/docs' },
      { text: ' тут' },
    ])
  })

  it('не путает markdown-ссылку с подсветкой ветки [[...]]', () => {
    expect(parseInline('ветка [[main]] готова')).toEqual([
      { text: 'ветка ' },
      { text: 'main', mark: true },
      { text: ' готова' },
    ])
  })
})
