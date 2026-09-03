import { describe, expect, it } from 'vitest'
import {
  chipFile,
  chipLabel,
  chipTitle,
  collapsesPaste,
  pasteBody,
  pasteCollapseLines,
  rangeLabel,
  rangePlace,
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

  /**
   * A file's chip says nothing on hover, because there is nothing to say: the caption is the file's own
   * name, and a hint that repeats it with the folders in front spends a hover and covers the line under
   * the chip to tell you what you are already looking at.
   */
  it('says nothing over a file whose name is on the chip already', () => {
    expect(chipTitle({ kind: 'ref', value: 'src/App.tsx', range: 'L12-L18' })).toBe('')
    expect(chipTitle({ kind: 'file', value: 'src/useSocket.js' })).toBe('')
    expect(chipTitle({ kind: 'file', value: 'CLAUDE.md' })).toBe('')
  })

  // Unless the name did not fit: cut in the middle it cannot be read at all, and the hint is then the one
  // place the whole of it exists.
  it('says the whole of a name that had to be cut', () => {
    const long = `src/${'a'.repeat(60)}.ts`
    expect(chipTitle({ kind: 'file', value: long })).toBe(long)
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

  /**
   * The case the folding exists for and used to miss entirely: text copied out of a browser or a log
   * viewer often has no line breaks at all, and one line was below every threshold - while in a field a
   * few hundred pixels wide it is forty lines of wall.
   */
  it('folds a wall of text that arrived as a single line', () => {
    expect(collapsesPaste('one very long line', 2, 12)).toBe(true)
  })

  it('leaves a short paste alone however it was measured', () => {
    expect(collapsesPaste('one line', 5, 3)).toBe(false)
  })

  // The larger of the two counts decides: a text of twenty written lines folds at a threshold of ten
  // even where the field is wide enough to draw it in eight.
  it('takes whichever count is larger', () => {
    expect(collapsesPaste(paste(20), 10, 8)).toBe(true)
  })

  it('never folds when the folding is switched off, whatever it would look like', () => {
    expect(collapsesPaste(paste(50), 0, 400)).toBe(false)
  })

  it('a threshold holds back everything shorter than itself', () => {
    expect(collapsesPaste(paste(9), 10)).toBe(false)
    expect(collapsesPaste(paste(10), 10)).toBe(true)
  })

  it('zero folds nothing, however long the paste', () => {
    expect(collapsesPaste(paste(500), 0)).toBe(false)
  })
})

describe('rangePlace', () => {
  it('reads a whole line, and whole lines, back out of their caption', () => {
    expect(rangePlace('L12')).toEqual({ line: 12 })
    expect(rangePlace('L12-L18')).toEqual({ line: 12, endLine: 18 })
  })

  it('ends a piece of one line on its last character, the way the editor is asked to select it', () => {
    // The caption's end is the column after the last selected character (see SelectionReference.kt).
    expect(rangePlace('L12:5-30')).toEqual({ line: 12, column: 5, endColumn: 29 })
  })

  it('carries both ends of a selection across lines', () => {
    expect(rangePlace('L12:5-L18:30')).toEqual({ line: 12, column: 5, endLine: 18, endColumn: 29 })
  })

  it('reads its own captions back exactly', () => {
    const whole = span({ wholeLines: true })
    expect(rangePlace(rangeLabel(whole))).toEqual({ line: 12, endLine: 18 })
    const cut = span()
    expect(rangePlace(rangeLabel(cut))).toEqual({ line: 12, column: 5, endLine: 18, endColumn: 29 })
  })

  it('makes no selection out of a caret that only stood somewhere', () => {
    expect(rangePlace('L12:5-5')).toEqual({ line: 12, column: 5 })
  })

  it('refuses what is nobody\'s caption', () => {
    expect(rangePlace('12')).toBeNull()
    expect(rangePlace('L12:')).toBeNull()
    expect(rangePlace('lines 12-18')).toBeNull()
  })
})

describe('chipFile', () => {
  it('opens an attached file by its path', () => {
    expect(chipFile({ kind: 'file', value: 'src/useSocket.js' })).toEqual({ path: 'src/useSocket.js' })
  })

  it('opens a reference from the editor on its own selection', () => {
    expect(chipFile(referenceChip(span()))).toEqual({
      path: 'src/useSocket.js',
      line: 12,
      column: 5,
      endLine: 18,
      endColumn: 29,
    })
  })

  it('opens a pasted picture by the file the shell wrote, and not at all when there is none', () => {
    expect(chipFile({ kind: 'img', value: 'Image #3', data: 'data:image/png;base64,AA==', path: '/tmp/acc/shot.png' })).toEqual({ path: '/tmp/acc/shot.png' })
    expect(chipFile({ kind: 'img', value: 'Image #3', data: 'data:image/png;base64,AA==' })).toBeNull()
  })

  it('opens nothing for what is not a file', () => {
    expect(chipFile({ kind: 'dir', value: 'src/' })).toBeNull()
    expect(chipFile({ kind: 'cmd', value: 'compact' })).toBeNull()
    expect(chipFile({ kind: 'quote', value: 'Claude', text: 'a line' })).toBeNull()
    expect(chipFile({ kind: 'paste', value: 'Pasted text', text: 'a\nb' })).toBeNull()
  })

  it('refuses a network path however it got onto the chip', () => {
    expect(chipFile({ kind: 'file', value: '//host/share/x.js' })).toBeNull()
  })
})
