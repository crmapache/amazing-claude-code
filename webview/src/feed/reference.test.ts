import { describe, expect, it } from 'vitest'
import {
  chipLabel,
  chipTitle,
  collapsesPaste,
  pasteBody,
  pasteCollapseLines,
  rangeLabel,
  referenceChip,
  referenceText,
} from './reference'

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
  it('hides the columns when whole lines are selected', () => {
    expect(rangeLabel(span({ wholeLines: true }))).toBe('L12-L18')
  })

  it('shrinks to one line if it is a single one', () => {
    expect(rangeLabel(span({ wholeLines: true, endLine: 12 }))).toBe('L12')
  })

  it('shows only the columns within a single line', () => {
    expect(rangeLabel(span({ endLine: 12, endColumn: 30 }))).toBe('L12:5-30')
  })

  it('names both the line and the column on both sides across several lines', () => {
    expect(rangeLabel(span())).toBe('L12:5-L18:30')
  })
})

describe('reference', () => {
  it('travels to the agent as a file reference rather than as text', () => {
    expect(referenceText(referenceChip(span()))).toBe('@src/useSocket.js (L12:5-L18:30)')
  })

  it('leaves the file name in the chip: a full path does not fit into the panel', () => {
    expect(chipLabel(referenceChip(span({ wholeLines: true })))).toBe('useSocket.js L12-L18')
  })

  it('takes a folder name rather than the emptiness after the last slash', () => {
    expect(chipLabel({ kind: 'dir', value: 'src/components/' })).toBe('components')
  })

  it('takes the first words of the text for a paste from the clipboard', () => {
    const text = 'Work through the analytics module and draw up a plan for the remaining tasks'
    expect(chipLabel({ kind: 'paste', value: 'paste1', text })).toBe('Work through the analytics module and dr…')
  })

  it('does not let a long word (a link, say) stretch the chip - it is clipped by characters', () => {
    const text = 'Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project'
    expect(chipLabel({ kind: 'paste', value: 'paste1', text })).toBe('Use the claude_design MCP (https://api.a…')
  })
})

/**
 * The hint is a reminder of what is inside, not a place to read it: it is drawn 220 pixels wide with the
 * pointer passing straight through, so a long text in it becomes an unreadable strip down the window with
 * no way to scroll it. The text itself is read by expanding the paste in the message.
 */
describe('chipTitle', () => {
  const lines = (n: number) => Array.from({ length: n }, (_, at) => `line ${at + 1}`).join('\n')

  it('keeps a short paste whole - there is nothing to cut', () => {
    expect(chipTitle({ kind: 'paste', value: 'paste1', text: lines(3) })).toBe('line 1\nline 2\nline 3')
  })

  it('takes only the first lines of a long paste, saying that it goes on', () => {
    expect(chipTitle({ kind: 'paste', value: 'paste1', text: lines(120) })).toBe(
      'line 1\nline 2\nline 3\nline 4\nline 5\n…',
    )
  })

  it('shortens a line that is long by itself - one line must stay one line', () => {
    const title = chipTitle({ kind: 'paste', value: 'paste1', text: `${'x'.repeat(400)}\nsecond` })
    expect(title).toBe(`${'x'.repeat(70)}…\nsecond`)
  })

  it('holds a quote to a ceiling as well', () => {
    const title = chipTitle({ kind: 'quote', value: 'ref1', text: 'q'.repeat(900) })
    expect(title).toBe(`${'q'.repeat(400)}…`)
  })

  it('leaves a path and its range alone: they are the thing itself, not words about it', () => {
    expect(chipTitle({ kind: 'ref', value: 'src/App.tsx', range: 'L12-L18' })).toBe('src/App.tsx L12-L18')
  })
})

describe('pasteBody', () => {
  it('gives a whole paste whole - the counts then say nothing was left out', () => {
    const body = pasteBody('first\nsecond\nthird')
    expect(body).toEqual({ text: 'first\nsecond\nthird', shownLines: 3, lines: 3 })
  })

  it('cuts a huge one on a line boundary rather than mid-line', () => {
    const line = `${'x'.repeat(99)}\n`
    const body = pasteBody(line.repeat(300))

    expect(body.lines).toBe(300)
    expect(body.shownLines).toBe(200)
    expect(body.text.endsWith('x')).toBe(true)
    expect(body.text).toBe(line.repeat(200).trimEnd())
  })
})

describe('pasteCollapseLines', () => {
  it('nothing chosen means the default rather than "never fold"', () => {
    expect(pasteCollapseLines(undefined)).toBe(2)
    expect(pasteCollapseLines('')).toBe(2)
  })

  it('a chosen zero is a choice - it switches folding off', () => {
    expect(pasteCollapseLines('0')).toBe(0)
  })

  it('a value from another version does not become a surprise', () => {
    expect(pasteCollapseLines('nonsense')).toBe(2)
    expect(pasteCollapseLines('-3')).toBe(2)
  })
})

describe('collapsesPaste', () => {
  const paste = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n')

  it('by default any paste with a line break folds - as the field always did', () => {
    expect(collapsesPaste(paste(2), 2)).toBe(true)
    expect(collapsesPaste('one line', 2)).toBe(false)
  })

  it('a trailing newline does not make a line of its own', () => {
    // A line copied out of a terminal almost always ends in one.
    expect(collapsesPaste('one line\n', 2)).toBe(false)
  })

  it('a threshold holds back everything shorter than itself', () => {
    expect(collapsesPaste(paste(9), 10)).toBe(false)
    expect(collapsesPaste(paste(10), 10)).toBe(true)
  })

  it('zero folds nothing, however long the paste', () => {
    expect(collapsesPaste(paste(500), 0)).toBe(false)
  })
})
