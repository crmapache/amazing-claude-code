import { describe, expect, it } from 'vitest'
import { linkify, paragraphsText, parseInline, parseParagraphs, plainLine } from './markdown'

describe('parseInline', () => {
  /**
   * Italic came late: the panel drew bold and left `*so*` standing with its asterisks on screen, in
   * answers that lean on it - a list where every item opens with an italic subject read as broken
   * markup. What is checked here is mostly the other half: where a lone asterisk or underscore is an
   * ordinary character and must stay one.
   */
  it('reads italic written with asterisks', () => {
    expect(parseInline('the *keys* never leave the Mac')).toEqual([
      { text: 'the ' },
      { text: 'keys', em: true },
      { text: ' never leave the Mac' },
    ])
  })

  it('reads italic written with underscores', () => {
    expect(parseInline('the _keys_ never leave')).toEqual([
      { text: 'the ' },
      { text: 'keys', em: true },
      { text: ' never leave' },
    ])
  })

  it('keeps bold bold', () => {
    expect(parseInline('**Stale docs.** the README promised six')).toEqual([
      { text: 'Stale docs.', strong: true },
      { text: ' the README promised six' },
    ])
  })

  it('reads a piece written as both', () => {
    expect(parseInline('***right here***')).toEqual([{ text: 'right here', strong: true, em: true }])
  })

  it('marks a whole italic run, links and code inside it included', () => {
    expect(parseInline('*see `App.tsx` there*')).toEqual([
      { text: 'see ', em: true },
      { text: 'App.tsx', code: true, em: true },
      { text: ' there', em: true },
    ])
  })

  it('leaves a multiplication alone', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }])
  })

  it('leaves globs alone', () => {
    expect(parseInline('*.ts and *.tsx')).toEqual([{ text: '*.ts and *.tsx' }])
  })

  // The one that would have hurt daily: identifiers are written in prose without backticks all the time.
  it('leaves an underscore inside a word alone', () => {
    expect(parseInline('MAX_LIST_DEPTH is the ceiling')).toEqual([{ text: 'MAX_LIST_DEPTH is the ceiling' }])
  })

  it('leaves a file name with underscores alone', () => {
    expect(parseInline('open my_file_name.ts')).toEqual([{ text: 'open my_file_name.ts' }])
  })

  it('keeps an italic piece out of an address', () => {
    expect(parseInline('https://example.com/a_b_c')).toEqual([
      { text: 'https://example.com/a_b_c', href: 'https://example.com/a_b_c' },
    ])
  })

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

  // What the agent writes after the backticks is a whole info string rather than one word of a language:
  // "markdown ultracode" says which mode the prompt it hands over asks for. Read as one word, the fence
  // was not a fence at all, and the prompt spilled into the answer as headings and bold text.
  it('opens a block on an info string of several words and keeps it whole', () => {
    const paragraphs = parseParagraphs(['Copy this:', '```markdown ultracode', '# A heading', '```'].join('\n'))

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[1]?.codeBlock).toBe(true)
    expect(paragraphs[1]?.info).toBe('markdown ultracode')
    expect(paragraphs[1]?.parts[0]?.text).toBe('# A heading')
    expect(paragraphs[1]?.heading).toBeUndefined()
  })

  // The whole point of the fix: a longer fence is how a block holds a block, and a ready prompt with an
  // example inside it is the commonest thing of that shape.
  it('lets a four-backtick block hold a three-backtick one', () => {
    const paragraphs = parseParagraphs(
      ['````markdown', 'Report in this shape:', '```', '# Audit', '```', '````', 'and that is all'].join('\n'),
    )

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.codeBlock).toBe(true)
    expect(paragraphs[0]?.info).toBe('markdown')
    expect(paragraphs[0]?.parts[0]?.text).toBe(['Report in this shape:', '```', '# Audit', '```'].join('\n'))
    expect(paragraphs[1]?.codeBlock).toBeUndefined()
    expect(paragraphs[1]?.parts[0]?.text).toBe('and that is all')
  })

  // Measured against a real answer: an agent describing this parser wrote a five-backtick example inside an
  // ordinary three-backtick block. By the letter of CommonMark the example ends the block and its second
  // half opens another one - and that one swallowed every finding, heading and line the agent wrote after
  // it. An answer in a chat is written in one pass and never previewed, so an unbalanced fence costs the
  // line it is on rather than the rest of the answer.
  it('does not let a longer fence close a block - the rest of the answer is not its text', () => {
    const paragraphs = parseParagraphs(
      ['```', '`````', 'plain text', '`````', '```', 'and the rest of the answer'].join('\n'),
    )

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.codeBlock).toBe(true)
    expect(paragraphs[0]?.parts[0]?.text).toBe(['`````', 'plain text', '`````'].join('\n'))
    expect(paragraphs[1]?.codeBlock).toBeUndefined()
    expect(paragraphs[1]?.parts[0]?.text).toBe('and the rest of the answer')
  })

  // The same answer once more, in the shape it actually arrived in: an example inside a block, and prose
  // with headings after it. Everything below the block used to end up inside a block of its own, drawn as
  // monospaced text with its asterisks and hashes bare.
  it('leaves the prose after such a block prose, headings and all', () => {
    const paragraphs = parseParagraphs(
      ['```', '`````', 'plain text', '`````', '```', '', '## What is left', '', '**Speed:** not measured'].join('\n'),
    )

    expect(paragraphs.filter((paragraph) => paragraph.codeBlock)).toHaveLength(1)
    expect(paragraphs[1]?.heading).toBe(true)
    expect(paragraphs[2]?.parts[0]).toEqual({ text: 'Speed:', strong: true })
  })

  // A closing fence carries nothing after it. Otherwise the line that opens the nested block inside a
  // prompt - "```json" - would end the outer one halfway through.
  it('does not let a fence with an info string close a block', () => {
    const paragraphs = parseParagraphs(['````', 'the shape:', '```json', '{}', '```', '````'].join('\n'))

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]?.parts[0]?.text).toBe(['the shape:', '```json', '{}', '```'].join('\n'))
  })

  // Mid-answer the closing fence has not arrived yet, and the block has to be a block already - otherwise
  // the code flickers as prose while it is being typed.
  it('keeps an unfinished block a block', () => {
    const paragraphs = parseParagraphs(['```ts', 'const a = 1'].join('\n'))

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]?.codeBlock).toBe(true)
    expect(paragraphs[0]?.info).toBe('ts')
  })

  // The answer arrives letter by letter, so every prefix of it is parsed in turn. The inner fence must not
  // end the block at any of them: mid-stream that turned the rest of the prompt into headings of the
  // answer, and the feed reshuffled itself as the typing went on.
  it('holds the block through every prefix of a streaming answer', () => {
    const answer = ['````markdown ultracode', '# Audit', '', 'In this shape:', '```', '## Findings', '```', '', 'Sort them.', '````'].join('\n')

    for (let length = answer.indexOf('\n') + 1; length <= answer.length; length++) {
      const paragraphs = parseParagraphs(answer.slice(0, length))
      expect(paragraphs[0]?.codeBlock, `at ${length} characters`).toBe(true)
      expect(paragraphs.some((paragraph) => paragraph.heading), `at ${length} characters`).toBe(false)
    }
  })

  // A fence inside a list item is indented as often as not, and those blocks have always read correctly.
  it('reads an indented fence as a fence', () => {
    const paragraphs = parseParagraphs(['    ```bash', '    pnpm test', '    ```'].join('\n'))

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]?.codeBlock).toBe(true)
    expect(paragraphs[0]?.info).toBe('bash')
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

  // A display formula carries `math` on the paragraph rather than on the one part holding its text, and
  // partsText only reads the flag off a part - so this used to come back as bare TeX with no dollars at
  // all, unlike the same formula written inline a few lines below.
  it('keeps the dollars around a formula standing on its own', () => {
    expect(plainLine('$$E = mc^2$$')).toBe('$$E = mc^2$$')
    expect(plainLine('so $E = mc^2$ follows')).toBe('so $E = mc^2$ follows')
  })
})

/** What the "copy the whole reply" button puts in the clipboard. */
describe('paragraphsText', () => {
  const copied = (source: string): string => paragraphsText(parseParagraphs(source))

  // The whole point of the fix: the table's text lives in its cells, and a copy built out of the
  // paragraph's parts left an empty line in its place - the table was simply lost.
  it('writes a table out as a table rather than dropping it', () => {
    const source = ['| model | price |', '|---|---|', '| Haiku | $1.90 |', '| Opus | $15 |'].join('\n')

    expect(copied(source)).toBe(
      ['| model | price |', '| --- | --- |', '| Haiku | $1.90 |', '| Opus | $15 |'].join('\n'),
    )
  })

  it('keeps the column alignment and strips the decoration inside the cells', () => {
    const source = ['| file | status |', '|:---|---:|', '| `a.ts` | **done** |'].join('\n')

    expect(copied(source)).toBe(
      ['| file | status |', '| :--- | ---: |', '| a.ts | done |'].join('\n'),
    )
  })

  it('separates a table from the text around it with an empty line', () => {
    const source = ['Measurements:', '| a | b |', '|---|---|', '| 1 | 2 |', 'and that is all'].join('\n')

    expect(copied(source)).toBe(
      ['Measurements:', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'and that is all'].join('\n'),
    )
  })

  it('keeps a code block inside its fences - otherwise it merges with the prose', () => {
    const source = ['Run this:', '```bash', 'pnpm test', '```', 'and look at the output'].join('\n')

    expect(copied(source)).toBe(
      ['Run this:', '', '```bash', 'pnpm test', '```', '', 'and look at the output'].join('\n'),
    )
  })

  // A step is referred to by its number, so a dash in place of it makes the text unreadable.
  it('keeps the numbers and the nesting of a list, and the items of one list stand together', () => {
    const source = ['Steps:', '1. the first', '2. the second', '   - a clarification'].join('\n')

    expect(copied(source)).toBe(
      ['Steps:', '', '1. the first', '2. the second', '  - a clarification'].join('\n'),
    )
  })

  /**
   * A formula is the one inline piece that keeps its markup in a copy - see partsText. Everything else
   * loses it, and a formula stripped of its dollars is a piece of TeX nothing reads back as a formula.
   */
  it('carries a formula out as the formula it was', () => {
    const source = ['$$', 'E = mc^2', '$$'].join('\n')
    expect(copied(source)).toBe(source)
    expect(parseParagraphs(copied(source))).toEqual(parseParagraphs(source))
  })

  it('carries a formula inside a line out with its dollars', () => {
    expect(copied('so $E = mc^2$ follows')).toBe('so $E = mc^2$ follows')
    expect(parseParagraphs(copied('so $E = mc^2$ follows'))).toEqual(parseParagraphs('so $E = mc^2$ follows'))
  })

  it('spells a one-line formula out on three, and reads back the same', () => {
    const source = '$$E = mc^2$$'
    expect(copied(source)).toBe(['$$', 'E = mc^2', '$$'].join('\n'))
    expect(parseParagraphs(copied(source))).toEqual(parseParagraphs(source))
  })

  // On a single newline two paragraphs became one wherever the copied text is read as markdown.
  it('separates the paragraphs with an empty line', () => {
    expect(copied(['First I will look at the file.', '', 'Then I will fix it.'].join('\n'))).toBe(
      'First I will look at the file.\n\nThen I will fix it.',
    )
  })

  it('keeps a quote a quote and leaves ordinary text as it is', () => {
    expect(copied(['> he said so', 'and I checked'].join('\n'))).toBe('> he said so\n\nand I checked')
    expect(copied('fixing `build.ts` and **that is all**')).toBe('fixing build.ts and that is all')
  })

  // The copy is the reason the info string is kept whole: a prompt copied without the word that turns the
  // mode on is a copy of another prompt.
  it('writes the info string back whole', () => {
    const source = ['```markdown ultracode', '# Audit', '```'].join('\n')

    expect(copied(source)).toBe(source)
  })

  // A fence longer than it needs to be is not carried over, and that is the intent rather than a loss: the
  // copy is read as markdown, and five backticks around a text with no backticks in it say what three say.
  it('shortens a fence that was longer than it had to be, and the block stays the same block', () => {
    const source = ['`````', 'plain text', '`````'].join('\n')

    expect(copied(source)).toBe(['```', 'plain text', '```'].join('\n'))
    expect(parseParagraphs(copied(source))).toEqual(parseParagraphs(source))
  })

  // And where the length does carry meaning it is counted back from the text: a four-backtick block inside
  // needs a five-backtick fence around it, however the answer was written.
  it('keeps a fence long enough for the longest run of backticks inside the block', () => {
    const source = ['`````md', 'a', '````', 'inner', '````', '`````'].join('\n')

    expect(copied(source)).toBe(source)
  })

  // Copied out with three backticks, a block that holds a block ended on the first inner fence, and the
  // rest of it turned back into prose wherever the copy was pasted.
  it('fences a block that holds a block with a longer fence', () => {
    const source = ['````markdown', 'the shape:', '```', '# Audit', '```', '````'].join('\n')

    expect(copied(source)).toBe(source)
    // And it survives the round trip: the copy parses back into the same single block.
    expect(parseParagraphs(copied(source))).toEqual(parseParagraphs(source))
  })
})

/**
 * The dollar is an ordinary character in an answer about code, so most of what is checked here is the
 * other half: where a formula must NOT be read. The measurement behind it is in markdown.ts - across
 * every transcript on this machine not one run of `$$` was mathematics.
 */
describe('formulas inside a line', () => {
  it('reads a formula written between dollars', () => {
    expect(parseInline('so $E = mc^2$ follows')).toEqual([
      { text: 'so ' },
      { text: 'E = mc^2', math: true },
      { text: ' follows' },
    ])
  })

  it('reads a formula written the TeX way', () => {
    expect(parseInline('so \\(a^2 + b^2\\) follows')).toEqual([
      { text: 'so ' },
      { text: 'a^2 + b^2', math: true },
      { text: ' follows' },
    ])
  })

  // Unlike a bare dollar, `\(...\)` cannot be mistaken for a price or a shell variable, so it is not held
  // to the "not glued to a letter" rule at all - a formula written this way and stuck to the word beside
  // it is still read as a formula rather than left as text with its backslashes bare.
  it('reads a formula written the TeX way even glued to the word beside it', () => {
    expect(parseInline('written as a\\(x\\)b in the file')).toEqual([
      { text: 'written as a' },
      { text: 'x', math: true },
      { text: 'b in the file' },
    ])
  })

  it('reads two formulas in one line', () => {
    expect(parseInline('$x$ and $y$')).toEqual([
      { text: 'x', math: true },
      { text: ' and ' },
      { text: 'y', math: true },
    ])
  })

  // The one that would have hurt daily. A price is written with a dollar in front of it, twice in a
  // sentence as often as once.
  it('leaves prices alone', () => {
    expect(parseInline('it costs $5 and $10 a month')).toEqual([{ text: 'it costs $5 and $10 a month' }])
  })

  // Two prices glued together with no space between them: the closing dollar of the first sits right
  // against the digit that opens the second. Refused by `beside`, in every alphabet the panel writes
  // numbers in, rather than by a second, ASCII-only digit check inside the pattern itself.
  it('leaves two prices stuck together with no space between them alone', () => {
    expect(parseInline('$5$10')).toEqual([{ text: '$5$10' }])
  })

  it('leaves shell variables alone', () => {
    expect(parseInline('read $HOME and $PATH')).toEqual([{ text: 'read $HOME and $PATH' }])
  })

  it('leaves a template literal alone', () => {
    expect(parseInline('written as $${cost} in the string')).toEqual([{ text: 'written as $${cost} in the string' }])
  })

  it('leaves an escaped dollar alone', () => {
    expect(parseInline('costs \\$5 today')).toEqual([{ text: 'costs \\$5 today' }])
  })

  // Backticks win by standing first in the line, so a dollar inside code is code as it always was.
  it('leaves a dollar inside backticks to the code span', () => {
    expect(parseInline('run `echo $PATH` first')).toEqual([
      { text: 'run ' },
      { text: 'echo $PATH', code: true },
      { text: ' first' },
    ])
  })

  /**
   * The one the harness caught, and the shape of it is ordinary prose: a price, a comma, and a path in
   * backticks a few words later. The closing dollar was the one in front of HOME, and everything between
   * went to the renderer - the code span along with it.
   */
  it('leaves a price alone when a path in backticks follows it', () => {
    expect(parseInline('the retry $10, `$HOME` and $PATH are read the same')).toEqual([
      { text: 'the retry $10, ' },
      { text: '$HOME', code: true },
      { text: ' and $PATH are read the same' },
    ])
  })

  // The same trap as the backtick one above, minus the word character next to the close that catches
  // that one: nothing but digits and punctuation sits on either side, so a code span or a bold run
  // between two accidental dollars used to be handed to KaTeX whole, backticks or asterisks and all.
  it('leaves a code span or bold text alone when nothing but punctuation sits against the dollars', () => {
    expect(parseInline('cost $10,`config`$ done')).toEqual([
      { text: 'cost $10,' },
      { text: 'config', code: true },
      { text: '$ done' },
    ])
    expect(parseInline('cost $10,**config**$ done')).toEqual([
      { text: 'cost $10,' },
      { text: 'config', strong: true },
      { text: '$ done' },
    ])
  })

  // A single asterisk is left alone on purpose: it is also how multiplication is written inside a formula,
  // and there is no telling the two apart from the shape alone - unlike a backtick or a genuine `**bold**`
  // pair, neither of which has a meaning in LaTeX.
  it('still reads a formula that multiplies with a bare asterisk', () => {
    expect(parseInline('so $a*b*c$ follows')).toEqual([
      { text: 'so ' },
      { text: 'a*b*c', math: true },
      { text: ' follows' },
    ])
  })

  it('refuses a formula with a letter against it', () => {
    expect(parseInline('written as a$b$c in the file')).toEqual([{ text: 'written as a$b$c in the file' }])
  })

  // A letter outside the Basic Multilingual Plane - a math double-struck capital, here - is a surrogate
  // pair, two UTF-16 code units for one character. Read one code unit at a time, either half looks like
  // no letter at all, and a formula glued right onto one of these used to be drawn as a formula anyway.
  it('refuses a formula with a letter outside the basic multilingual plane against it', () => {
    expect(parseInline('written as \u{1d54f}$b$c in the file')).toEqual([
      { text: 'written as \u{1d54f}$b$c in the file' },
    ])
    expect(parseInline('written as a$b$\u{1d54f} in the file')).toEqual([
      { text: 'written as a$b$\u{1d54f} in the file' },
    ])
  })

  it('reads a formula against a bracket or a comma', () => {
    expect(parseInline('for ($x$), then')).toEqual([
      { text: 'for (' },
      { text: 'x', math: true },
      { text: '), then' },
    ])
  })

  // The standard LaTeX way to print a literal dollar sign inside a formula. Read naively, that `\$`
  // looked like the close, and the formula broke in half with the tail spilled into the surrounding text.
  it('keeps an escaped dollar inside a formula together with the rest of it', () => {
    expect(parseInline('it is $\\text{costs } \\$5$ a month')).toEqual([
      { text: 'it is ' },
      { text: '\\text{costs } \\$5', math: true },
      { text: ' a month' },
    ])
  })

  // The same escaped dollar, but sitting right at the edge of the body rather than in the middle: the
  // border check used to see only half of the `\$` pair and closed the formula one character early.
  it('keeps an escaped dollar at the start of a formula together with the rest of it', () => {
    expect(parseInline('it is $\\$5 \\text{today}$ a month')).toEqual([
      { text: 'it is ' },
      { text: '\\$5 \\text{today}', math: true },
      { text: ' a month' },
    ])
  })

  it('keeps an escaped dollar at the end of a formula together with the rest of it', () => {
    expect(parseInline('it is $\\text{costs } 5\\$$ a month')).toEqual([
      { text: 'it is ' },
      { text: '\\text{costs } 5\\$', math: true },
      { text: ' a month' },
    ])
  })

  it('reads a formula that is nothing but an escaped dollar', () => {
    expect(parseInline('it is $\\$$ a month')).toEqual([
      { text: 'it is ' },
      { text: '\\$', math: true },
      { text: ' a month' },
    ])
  })

  // Nothing sits between the two closing/opening dollars, but each formula still stands on its own: the
  // content class refuses a bare `$` inside a body, so the search cannot stretch from the first into the
  // second.
  it('reads two formulas written back to back with no space between them', () => {
    expect(parseInline('$x$$y$')).toEqual([
      { text: 'x', math: true },
      { text: 'y', math: true },
    ])
  })

  it('refuses a formula longer than a formula ever is', () => {
    const long = 'x'.repeat(2001)
    expect(parseInline(`$${long}$`)).toEqual([{ text: `$${long}$` }])
  })
})

describe('formulas standing on their own', () => {
  it('reads one written over three lines', () => {
    expect(parseParagraphs(['Then:', '', '$$', 'E = mc^2', '$$'].join('\n'))).toEqual([
      { parts: [{ text: 'Then:' }] },
      { math: true, parts: [{ text: 'E = mc^2' }] },
    ])
  })

  it('reads one written on a single line', () => {
    expect(parseParagraphs('$$E = mc^2$$')).toEqual([{ math: true, parts: [{ text: 'E = mc^2' }] }])
  })

  it('reads the TeX brackets too', () => {
    expect(parseParagraphs(['\\[', 'a^2 + b^2 = c^2', '\\]'].join('\n'))).toEqual([
      { math: true, parts: [{ text: 'a^2 + b^2 = c^2' }] },
    ])
  })

  /**
   * The rule the printing of an answer rests on: a formula exists only once it has closed. Halfway
   * through it is the text it looks like, so nothing is parsed, drawn and thrown away on every frame -
   * and nothing flickers on the way.
   */
  it('leaves an unfinished formula as text', () => {
    expect(parseParagraphs(['$$', '\\frac{a}{b'].join('\n'))).toEqual([
      { parts: [{ text: '$$ \\frac{a}{b' }] },
    ])
  })

  it('does not look for the closing delimiter past a blank line', () => {
    expect(parseParagraphs(['$$', 'a = b', '', 'Never mind.', '$$'].join('\n'))).toEqual([
      { parts: [{ text: '$$ a = b' }] },
      { parts: [{ text: 'Never mind. $$' }] },
    ])
  })

  it('does not swallow a code block below it', () => {
    const source = ['$$', '```ts', 'const a = 1', '```'].join('\n')
    expect(parseParagraphs(source)).toEqual([
      { parts: [{ text: '$$' }] },
      { codeBlock: true, info: 'ts', parts: [{ text: 'const a = 1' }] },
    ])
  })

  it('leaves a dollar pair inside a code block alone', () => {
    const source = ['```ts', 'const s = `$${cost}`', '```'].join('\n')
    expect(parseParagraphs(source)).toEqual([
      { codeBlock: true, info: 'ts', parts: [{ text: 'const s = `$${cost}`' }] },
    ])
  })

  /**
   * Two formulas on one line used to let the lazy quantifier backtrack past the first close, and the
   * capture ran from the first `$$` to the last - "and" included - one garbled string handed to the
   * renderer instead of two clean ones. Barred from doing that, the line no longer reads as a single
   * formula at all, and is left as text rather than shown mangled.
   */
  it('does not merge two formulas written on the same line into one', () => {
    // Not a display formula (the whole line is not one), so it falls to inline parsing - which reads the
    // doubled dollars as two ordinary single-dollar formulas each, sharing the boundary between them: "a^2"
    // and "b^2" both come out as clean, separate formulas rather than one string with "and" inside it.
    expect(parseParagraphs('$$a^2$$ and $$b^2$$')).toEqual([
      {
        parts: [
          { text: '$' },
          { text: 'a^2', math: true },
          { text: '$ and $' },
          { text: 'b^2', math: true },
          { text: '$' },
        ],
      },
    ])
    // `\[...\]` has no inline reading at all, so a line that is not a formula on its own stays plain text.
    expect(parseParagraphs('\\[a^2\\] and \\[b^2\\]')).toEqual([{ parts: [{ text: '\\[a^2\\] and \\[b^2\\]' }] }])
  })

  // A table cell is parsed with the same parseInline as any other piece of text (see parseTableAt), so a
  // formula written inside one already works - checked here so a future change to tables or to inline
  // parsing cannot break it silently.
  it('reads a formula written inside a table cell', () => {
    const source = ['| name | formula |', '|---|---|', '| energy | $E = mc^2$ |'].join('\n')
    const [table] = parseParagraphs(source)

    expect(table?.table?.rows).toEqual([[[{ text: 'energy' }], [{ text: 'E = mc^2', math: true }]]])
  })

  it('carries a formula inside a table cell out through a copy and back', () => {
    const source = ['| name | formula |', '|---|---|', '| energy | $E = mc^2$ |'].join('\n')
    const copied = paragraphsText(parseParagraphs(source))

    expect(copied).toBe(['| name | formula |', '| --- | --- |', '| energy | $E = mc^2$ |'].join('\n'))
    expect(parseParagraphs(copied)).toEqual(parseParagraphs(source))
  })
})
