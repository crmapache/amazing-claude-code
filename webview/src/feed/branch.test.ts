import { describe, expect, it } from 'vitest'
import { withBranch, type BranchFacts } from './branch'

/** Nothing said yet - the panel's first frame. */
const NOTHING: BranchFacts = {}

describe('the branch and its pull request', () => {
  it('lets the branch arrive in its own message, apart from the PR - without wiping a known PR', () => {
    const held = withBranch(NOTHING, { pullRequest: '42', pullRequestUrl: 'https://github.com/x/y/pull/42' })
    const next = withBranch(held, { gitBranch: 'feature/foo' })

    expect(next).toEqual({
      gitBranch: 'feature/foo',
      pullRequest: '42',
      pullRequestUrl: 'https://github.com/x/y/pull/42',
    })
  })

  it('lets the PR arrive in its own message, apart from the branch - without wiping a known branch', () => {
    const held = withBranch(NOTHING, { gitBranch: 'main' })
    const next = withBranch(held, { pullRequest: '7', pullRequestUrl: 'https://github.com/x/y/pull/7' })

    expect(next.gitBranch).toBe('main')
    expect(next.pullRequest).toBe('7')
  })

  it('lets an empty string from a fresh PR check clear the old number rather than keep it', () => {
    const held = withBranch(NOTHING, { pullRequest: '42', pullRequestUrl: 'https://github.com/x/y/pull/42' })
    const next = withBranch(held, { pullRequest: '', pullRequestUrl: '' })

    expect(next.pullRequest).toBe('')
    expect(next.pullRequestUrl).toBe('')
  })
})
