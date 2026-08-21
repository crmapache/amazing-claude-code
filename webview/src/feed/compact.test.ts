import { describe, expect, it } from 'vitest'
import { compactProgress, deferFollowUpForCompact, isCompactCommand } from './compact'

describe('compactProgress', () => {
  it('starts at zero rather than an empty bar of unclear length', () => {
    expect(compactProgress(0)).toBe(0)
  })

  it('matches the number in the terminal: six seconds, six percent', () => {
    expect(compactProgress(6_000)).toBe(6)
  })

  it('grows fast at the start and barely at all towards the end', () => {
    expect(compactProgress(30_000)).toBe(28)
    expect(compactProgress(60_000)).toBe(49)
    expect(compactProgress(120_000)).toBe(74)
  })

  it('never reaches a hundred: a compaction does not end by a stopwatch', () => {
    expect(compactProgress(10 * 60_000)).toBe(95)
    expect(compactProgress(60 * 60_000)).toBe(95)
  })

  it('counts a negative time (the clock slipped back) as the start', () => {
    expect(compactProgress(-5_000)).toBe(0)
  })
})

describe('isCompactCommand', () => {
  it('recognises the bare command and the same one with an argument', () => {
    expect(isCompactCommand('/compact')).toBe(true)
    expect(isCompactCommand('  /compact focus on auth  ')).toBe(true)
  })

  it('does not confuse it with a similar name or a command not at the line start', () => {
    expect(isCompactCommand('/compaction')).toBe(false)
    expect(isCompactCommand('please /compact')).toBe(false)
    expect(isCompactCommand('/clear')).toBe(false)
  })
})

describe('deferFollowUpForCompact', () => {
  it('defers while the compacting status already stands', () => {
    expect(deferFollowUpForCompact(true, true, 'carry on with the refactoring')).toBe(true)
  })

  it('defers a turn that a /compact began, even before the compacting status', () => {
    expect(deferFollowUpForCompact(false, true, '/compact')).toBe(true)
  })

  it('leaves a free panel nothing to wait for - even if the last message was a /compact', () => {
    expect(deferFollowUpForCompact(false, false, '/compact')).toBe(false)
  })

  it('does not defer a follow-up in an ordinary turn', () => {
    expect(deferFollowUpForCompact(false, true, 'carry on with the refactoring')).toBe(false)
  })
})
