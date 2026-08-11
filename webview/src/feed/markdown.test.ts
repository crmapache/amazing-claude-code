import { describe, expect, it } from 'vitest'
import { linkify, parseInline, parseParagraphs } from './markdown'

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

describe('parseParagraphs', () => {
  it('помечает заголовок heading — макет добавляет зазор перед ним отдельно от обычного жирного текста', () => {
    const [heading] = parseParagraphs('## Текущее состояние')
    expect(heading?.heading).toBe(true)
    expect(heading?.parts).toEqual([{ text: 'Текущее состояние', strong: true }])
  })

  it('адрес в заголовке остаётся живой ссылкой, а не жирной строкой', () => {
    // Ровно так агент и отвечает на «на каком адресе смотреть демку»: адресом
    // заголовком, и кликать по нему хочется прямо там.
    const [heading] = parseParagraphs('## http://localhost:5174/')

    expect(heading?.heading).toBe(true)
    expect(heading?.parts).toEqual([
      { text: 'http://localhost:5174/', href: 'http://localhost:5174/', strong: true },
    ])
  })

  it('код в заголовке остаётся кодом', () => {
    const [heading] = parseParagraphs('### Запуск `pnpm dev`')

    expect(heading?.parts).toEqual([
      { text: 'Запуск ', strong: true },
      { text: 'pnpm dev', code: true, strong: true },
    ])
  })

  it('адрес внутри жирного тоже остаётся ссылкой', () => {
    const [paragraph] = parseParagraphs('Открывай **http://localhost:5173/** и смотри')

    expect(paragraph?.parts).toEqual([
      { text: 'Открывай ' },
      { text: 'http://localhost:5173/', href: 'http://localhost:5173/', strong: true },
      { text: ' и смотри' },
    ])
  })

  it('без пустой строки заголовок и следующий абзац не сливаются в один', () => {
    const paragraphs = parseParagraphs(['## Раздел', 'Текст сразу под заголовком.'].join('\n'))
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.heading).toBe(true)
    expect(paragraphs[1]?.heading).toBeUndefined()
  })

  it('обычный абзац без пустой строки между строками остаётся одним целым — это ожидаемый markdown-рефлоу, не баг', () => {
    const paragraphs = parseParagraphs(['Первая строка.', 'Вторая строка без пустой строки между ними.'].join('\n'))
    expect(paragraphs).toHaveLength(1)
  })

  it('нумерованный пункт сохраняет свой номер — по нему на шаг и ссылаются', () => {
    const [first, second] = parseParagraphs(['1. Первый шаг', '2. Второй шаг'].join('\n'))

    expect(first?.marker).toBe('1.')
    expect(second?.marker).toBe('2.')
  })

  it('обычный пункт номера не получает — его рисует тире', () => {
    const [bullet] = parseParagraphs('- Просто пункт')
    expect(bullet?.bullet).toBe(true)
    expect(bullet?.marker).toBeUndefined()
  })

  it('вложенный пункт остаётся вложенным, а не становится равным шагом', () => {
    const [outer, inner] = parseParagraphs(['1. Шаг', '   - уточнение к шагу'].join('\n'))

    expect(outer?.depth).toBe(0)
    expect(inner?.depth).toBe(1)
  })
})

describe('linkify', () => {
  it('делает ссылкой адрес в собственном сообщении, не трогая остальной текст', () => {
    expect(linkify('см. https://example.com/x и всё')).toEqual([
      { text: 'см. ' },
      { text: 'https://example.com/x', href: 'https://example.com/x' },
      { text: ' и всё' },
    ])
  })

  it('разметку не трогает — человек написал звёздочки буквально', () => {
    expect(linkify('**жирный** текст')).toEqual([{ text: '**жирный** текст' }])
  })
})
