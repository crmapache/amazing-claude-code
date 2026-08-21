import { describe, expect, it } from 'vitest'
import { linkify, parseInline, parseParagraphs, plainLine } from './markdown'

describe('parseInline', () => {
  it('turns a bare URL into a link', () => {
    expect(parseInline('look at https://example.com/docs next')).toEqual([
      { text: 'look at ' },
      { text: 'https://example.com/docs', href: 'https://example.com/docs' },
      { text: ' next' },
    ])
  })

  it('does not drag a sentence-ending full stop into the address', () => {
    expect(parseInline('see https://example.com.')).toEqual([
      { text: 'see ' },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: '.' },
    ])
  })

  it('does not drag a wrapping closing bracket into the address', () => {
    expect(parseInline('(https://example.com/docs)')).toEqual([
      { text: '(' },
      { text: 'https://example.com/docs', href: 'https://example.com/docs' },
      { text: ')' },
    ])
  })

  it('keeps a bracket that is part of the address itself', () => {
    expect(parseInline('https://example.com/foo(bar)')).toEqual([
      { text: 'https://example.com/foo(bar)', href: 'https://example.com/foo(bar)' },
    ])
  })

  it('parses a markdown link with separate text', () => {
    expect(parseInline('see [the docs](https://example.com/docs) here')).toEqual([
      { text: 'see ' },
      { text: 'the docs', href: 'https://example.com/docs' },
      { text: ' here' },
    ])
  })

  it('does not confuse a markdown link with a branch highlight [[...]]', () => {
    expect(parseInline('branch [[main]] is ready')).toEqual([
      { text: 'branch ' },
      { text: 'main', mark: true },
      { text: ' is ready' },
    ])
  })
})

describe('parseParagraphs', () => {
  it('marks a heading as heading - the design adds a gap before it apart from ordinary bold text', () => {
    const [heading] = parseParagraphs('## The current state')
    expect(heading?.heading).toBe(true)
    expect(heading?.parts).toEqual([{ text: 'The current state', strong: true }])
  })

  it('leaves an address in a heading a live link rather than a bold line', () => {
    // That is exactly how the agent answers a "which address do I look at the demo on": with the address
    // as a heading, and one wants to click it right there.
    const [heading] = parseParagraphs('## http://localhost:5174/')

    expect(heading?.heading).toBe(true)
    expect(heading?.parts).toEqual([
      { text: 'http://localhost:5174/', href: 'http://localhost:5174/', strong: true },
    ])
  })

  it('leaves code in a heading as code', () => {
    const [heading] = parseParagraphs('### Running `pnpm dev`')

    expect(heading?.parts).toEqual([
      { text: 'Running ', strong: true },
      { text: 'pnpm dev', code: true, strong: true },
    ])
  })

  it('leaves an address inside bold text a link too', () => {
    const [paragraph] = parseParagraphs('Open **http://localhost:5173/** and look')

    expect(paragraph?.parts).toEqual([
      { text: 'Open ' },
      { text: 'http://localhost:5173/', href: 'http://localhost:5173/', strong: true },
      { text: ' and look' },
    ])
  })

  it('does not merge a heading and the next paragraph into one without an empty line', () => {
    const paragraphs = parseParagraphs(['## A section', 'Text right under the heading.'].join('\n'))
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.heading).toBe(true)
    expect(paragraphs[1]?.heading).toBeUndefined()
  })

  it('leaves an ordinary paragraph without empty lines between its lines whole - that is markdown reflow, not a bug', () => {
    const paragraphs = parseParagraphs(['The first line.', 'The second line with no empty line between them.'].join('\n'))
    expect(paragraphs).toHaveLength(1)
  })

  it('lets a numbered item keep its number - that is what a step is referred to by', () => {
    const [first, second] = parseParagraphs(['1. The first step', '2. The second step'].join('\n'))

    expect(first?.marker).toBe('1.')
    expect(second?.marker).toBe('2.')
  })

  it('gives an ordinary item no number - a dash draws it', () => {
    const [bullet] = parseParagraphs('- Simply an item')
    expect(bullet?.bullet).toBe(true)
    expect(bullet?.marker).toBeUndefined()
  })

  it('leaves a nested item nested rather than making it an equal step', () => {
    const [outer, inner] = parseParagraphs(['1. A step', '   - a clarification of the step'].join('\n'))

    expect(outer?.depth).toBe(0)
    expect(inner?.depth).toBe(1)
  })

  it('assembles a line with | and the separator under it into a table rather than leaving raw text', () => {
    const [table] = parseParagraphs(['| model | price |', '|---|---|', '| Haiku | $1.90 |'].join('\n'))

    expect(table?.table).toEqual({
      align: [undefined, undefined],
      header: [[{ text: 'model' }], [{ text: 'price' }]],
      rows: [[[{ text: 'Haiku' }], [{ text: '$1.90' }]]],
    })
    expect(table?.parts).toEqual([])
  })

  it('reads a column alignment from the separator: :--- left, ---: right, :---: centre', () => {
    const [table] = parseParagraphs(['| a | b | c |', '|:---|---:|:---:|', '| 1 | 2 | 3 |'].join('\n'))
    expect(table?.table?.align).toEqual(['left', 'right', 'center'])
  })

  it('parses the table cells with the same parseInline - code and bold inside work', () => {
    const [table] = parseParagraphs(['| file | status |', '|---|---|', '| `a.ts` | **done** |'].join('\n'))

    expect(table?.table?.rows).toEqual([[[{ text: 'a.ts', code: true }], [{ text: 'done', strong: true }]]])
  })

  it('does not turn a | without a separator line under it into a table - it may be just a pipe in the text', () => {
    const [paragraph] = parseParagraphs('output: cmd1 | cmd2')
    expect(paragraph?.table).toBeUndefined()
  })

  it('requires the separator cell count to match the head - otherwise this is not a table', () => {
    const [paragraph] = parseParagraphs(['| a | b |', '|---|'].join('\n'))
    expect(paragraph?.table).toBeUndefined()
  })

  it('treats a table without a single body row (still typing) as a head and an empty row list, not an error', () => {
    const [table] = parseParagraphs(['| a | b |', '|---|---|'].join('\n'))
    expect(table?.table?.rows).toEqual([])
  })

  it('marks a line with > as a quote and leaves no marker in the text', () => {
    const [quote] = parseParagraphs('> checked the data, you are right')
    expect(quote?.quote).toBe(true)
    expect(quote?.parts).toEqual([{ text: 'checked the data, you are right' }])
  })

  it('collects consecutive quote lines into one paragraph, like ordinary text', () => {
    const paragraphs = parseParagraphs(['> the first line', '> the second line'].join('\n'))
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]?.parts).toEqual([{ text: 'the first line the second line' }])
  })

  it('lets an empty quote line (a bare >) split it into separate paragraphs without ending the quote', () => {
    const paragraphs = parseParagraphs(['> the quote first paragraph', '>', '> the quote second paragraph'].join('\n'))
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.quote).toBe(true)
    expect(paragraphs[1]?.quote).toBe(true)
    expect(paragraphs[0]?.parts).toEqual([{ text: 'the quote first paragraph' }])
    expect(paragraphs[1]?.parts).toEqual([{ text: 'the quote second paragraph' }])
  })

  it('leaves a nested "> >" one quote without a doubled marker', () => {
    const [quote] = parseParagraphs('> > a nested answer')
    expect(quote?.quote).toBe(true)
    expect(quote?.parts).toEqual([{ text: 'a nested answer' }])
  })

  it('parses a quote with the same parseInline - code and links inside it work', () => {
    const [quote] = parseParagraphs('> look at `a.ts` and https://example.com')
    expect(quote?.parts).toEqual([
      { text: 'look at ' },
      { text: 'a.ts', code: true },
      { text: ' and ' },
      { text: 'https://example.com', href: 'https://example.com' },
    ])
  })

  it('does not merge a quote without an empty line after it with the next ordinary paragraph', () => {
    const paragraphs = parseParagraphs(['> a quote', 'ordinary text right after'].join('\n'))
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.quote).toBe(true)
    expect(paragraphs[1]?.quote).toBeUndefined()
  })
})

describe('linkify', () => {
  it('turns an address in your own message into a link without touching the rest of the text', () => {
    expect(linkify('see https://example.com/x and that is all')).toEqual([
      { text: 'see ' },
      { text: 'https://example.com/x', href: 'https://example.com/x' },
      { text: ' and that is all' },
    ])
  })

  it('leaves the markup alone - the person wrote the asterisks literally', () => {
    expect(linkify('**bold** text')).toEqual([{ text: '**bold** text' }])
  })
})

describe('plainLine', () => {
  it('strips the markup: on one line there is nothing to emphasise with', () => {
    expect(plainLine('He gave two tests: 1. **The main test** - check the line')).toBe(
      'He gave two tests: 1. The main test - check the line',
    )
    expect(plainLine('## A heading')).toBe('A heading')
    expect(plainLine('fixing `build.ts` and that is all')).toBe('fixing build.ts and that is all')
  })

  it('glues the paragraphs and the breaks into one line', () => {
    expect(plainLine(['First I will look at the file.', '', 'Then I will fix it.'].join('\n'))).toBe(
      'First I will look at the file. Then I will fix it.',
    )
  })

  // An item's number is part of the meaning of an enumeration rather than its styling.
  it('keeps the number of a list item', () => {
    expect(plainLine(['1. the first', '2. the second'].join('\n'))).toBe('1. the first 2. the second')
  })

  it('leaves empty text empty', () => {
    expect(plainLine('')).toBe('')
    expect(plainLine('\n\n')).toBe('')
  })
})
