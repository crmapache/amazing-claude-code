import { describe, expect, it } from 'vitest'
import { linkify, parseInline, parseParagraphs, plainLine } from './markdown'

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

  it('строка с | и разделитель под ней собираются в таблицу, а не остаются сырым текстом', () => {
    const [table] = parseParagraphs(['| модель | цена |', '|---|---|', '| Haiku | $1.90 |'].join('\n'))

    expect(table?.table).toEqual({
      align: [undefined, undefined],
      header: [[{ text: 'модель' }], [{ text: 'цена' }]],
      rows: [[[{ text: 'Haiku' }], [{ text: '$1.90' }]]],
    })
    expect(table?.parts).toEqual([])
  })

  it('выравнивание столбца читается из разделителя: :--- слева, ---: справа, :---: по центру', () => {
    const [table] = parseParagraphs(['| a | b | c |', '|:---|---:|:---:|', '| 1 | 2 | 3 |'].join('\n'))
    expect(table?.table?.align).toEqual(['left', 'right', 'center'])
  })

  it('ячейки таблицы разбираются тем же parseInline — код и жирное внутри работают', () => {
    const [table] = parseParagraphs(['| файл | статус |', '|---|---|', '| `a.ts` | **готово** |'].join('\n'))

    expect(table?.table?.rows).toEqual([[[{ text: 'a.ts', code: true }], [{ text: 'готово', strong: true }]]])
  })

  it('| без строки-разделителя под ней таблицей не становится — это может быть просто пайп в тексте', () => {
    const [paragraph] = parseParagraphs('вывод: cmd1 | cmd2')
    expect(paragraph?.table).toBeUndefined()
  })

  it('число ячеек разделителя должно совпасть с шапкой — иначе это не таблица', () => {
    const [paragraph] = parseParagraphs(['| a | b |', '|---|'].join('\n'))
    expect(paragraph?.table).toBeUndefined()
  })

  it('таблица без единой строки тела (ещё печатается) — шапка и пустой список строк, не ошибка', () => {
    const [table] = parseParagraphs(['| a | b |', '|---|---|'].join('\n'))
    expect(table?.table?.rows).toEqual([])
  })

  it('строка с > помечается цитатой, сам маркер в тексте не остаётся', () => {
    const [quote] = parseParagraphs('> checked the data, you are right')
    expect(quote?.quote).toBe(true)
    expect(quote?.parts).toEqual([{ text: 'checked the data, you are right' }])
  })

  it('подряд идущие строки цитаты собираются в один абзац, как обычный текст', () => {
    const paragraphs = parseParagraphs(['> первая строка', '> вторая строка'].join('\n'))
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]?.parts).toEqual([{ text: 'первая строка вторая строка' }])
  })

  it('пустая строка цитаты (голое >) разбивает её на отдельные абзацы, не завершая цитату целиком', () => {
    const paragraphs = parseParagraphs(['> первый абзац цитаты', '>', '> второй абзац цитаты'].join('\n'))
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.quote).toBe(true)
    expect(paragraphs[1]?.quote).toBe(true)
    expect(paragraphs[0]?.parts).toEqual([{ text: 'первый абзац цитаты' }])
    expect(paragraphs[1]?.parts).toEqual([{ text: 'второй абзац цитаты' }])
  })

  it('вложенное «> >» остаётся одной цитатой без раздвоенного маркера', () => {
    const [quote] = parseParagraphs('> > вложенный ответ')
    expect(quote?.quote).toBe(true)
    expect(quote?.parts).toEqual([{ text: 'вложенный ответ' }])
  })

  it('цитата разбирается тем же parseInline — код и ссылки внутри неё работают', () => {
    const [quote] = parseParagraphs('> смотри `a.ts` и https://example.com')
    expect(quote?.parts).toEqual([
      { text: 'смотри ' },
      { text: 'a.ts', code: true },
      { text: ' и ' },
      { text: 'https://example.com', href: 'https://example.com' },
    ])
  })

  it('цитата без пустой строки после себя не сливается со следующим обычным абзацем', () => {
    const paragraphs = parseParagraphs(['> цитата', 'обычный текст следом'].join('\n'))
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.quote).toBe(true)
    expect(paragraphs[1]?.quote).toBeUndefined()
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

describe('plainLine', () => {
  it('снимает разметку: в одну строку выделять нечем', () => {
    expect(plainLine('Он дал два теста: 1. **Основной тест** — проверить строку')).toBe(
      'Он дал два теста: 1. Основной тест — проверить строку',
    )
    expect(plainLine('## Заголовок')).toBe('Заголовок')
    expect(plainLine('правлю `build.ts` и всё')).toBe('правлю build.ts и всё')
  })

  it('склеивает абзацы и переносы в одну строку', () => {
    expect(plainLine(['Сначала посмотрю файл.', '', 'Потом поправлю его.'].join('\n'))).toBe(
      'Сначала посмотрю файл. Потом поправлю его.',
    )
  })

  // Номер пункта — часть смысла перечисления, а не его оформление.
  it('оставляет номер пункта списка', () => {
    expect(plainLine(['1. первое', '2. второе'].join('\n'))).toBe('1. первое 2. второе')
  })

  it('пустой текст остаётся пустым', () => {
    expect(plainLine('')).toBe('')
    expect(plainLine('\n\n')).toBe('')
  })
})
