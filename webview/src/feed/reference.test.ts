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
