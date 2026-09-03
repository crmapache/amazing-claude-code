import { describe, expect, it } from 'vitest'
import { reducePanel } from './build'
import { initialPanelState } from './panelState'
import { isUntouchedTab, tabHolding } from './resume'
import type { UserToken } from './types'

/**
 * Where a conversation chosen from the history opens: in the tab on screen, or in one of its own.
 *
 * The rule is silent when it is wrong - a tab reused too eagerly takes the work in it with no warning
 * and nothing to undo - so it is checked here rather than trusted to the screen.
 */

const text = (value: string): UserToken => ({ kind: 'text', value })

describe('an untouched tab', () => {
  it('is a tab nothing has ever arrived into', () => {
    expect(isUntouchedTab({})).toBe(true)
    expect(isUntouchedTab({ panel: initialPanelState, draft: { tokens: [], quotes: [] }, shellRuns: [] })).toBe(true)
  })

  it('is not one that has anything on screen', () => {
    const panel = reducePanel(initialPanelState, { kind: 'prompt', tokens: [text('hi')], quotes: [] })

    expect(isUntouchedTab({ panel })).toBe(false)
  })

  it('is not one that is working right now', () => {
    expect(isUntouchedTab({ panel: { ...initialPanelState, status: 'running' } })).toBe(false)
  })

  it('is not one printing an answer or a thought', () => {
    expect(isUntouchedTab({ panel: { ...initialPanelState, streamingText: 'half a se' } })).toBe(false)
    expect(isUntouchedTab({ panel: { ...initialPanelState, streamingThinking: 'weighing' } })).toBe(false)
  })

  it('is not one with something waiting to be said', () => {
    const queue = [{ id: 'q-1', text: 'and then deploy', attach: '', images: 0 }]

    expect(isUntouchedTab({ panel: { ...initialPanelState, queue } })).toBe(false)
  })

  it('is not one with a command still running in the background', () => {
    const background = [{ id: 'b-1', label: 'pnpm dev', description: 'The dev server', command: 'pnpm dev', duration: '' }]

    expect(isUntouchedTab({ panel: { ...initialPanelState, background } })).toBe(false)
  })

  /**
   * The whole reason the draft is part of this at all: an empty feed with a half-written request in the
   * field is a tab somebody is in the middle of using.
   */
  it('is not one with words in the field', () => {
    expect(isUntouchedTab({ panel: initialPanelState, draft: { tokens: [text('what about ')], quotes: [] } })).toBe(false)
  })

  it('is not one holding an attachment or a quote alone', () => {
    const chip: UserToken = { kind: 'chip', chip: { kind: 'file', value: 'App.tsx' } }

    expect(isUntouchedTab({ draft: { tokens: [chip], quotes: [] } })).toBe(false)
    expect(isUntouchedTab({ draft: { tokens: [], quotes: [{ id: 'q', text: 'this line' }] } })).toBe(false)
  })

  it('is not one holding the output of a command run through "!"', () => {
    expect(isUntouchedTab({ shellRuns: [{ command: 'git status', stdout: '', stderr: '', exitCode: 0 }] })).toBe(false)
  })
})

describe('a conversation already open', () => {
  const tabs = [{ id: 'main' }, { id: 'session-2' }, { id: 'branch-1' }]
  const holds: Record<string, string | undefined> = { main: 'conv-a', 'session-2': 'conv-b' }

  it('is found by the tab that holds it, whichever one that is', () => {
    expect(tabHolding('conv-b', tabs, (tab) => holds[tab])).toBe('session-2')
  })

  it('is nothing when no tab holds it', () => {
    expect(tabHolding('conv-c', tabs, (tab) => holds[tab])).toBeUndefined()
  })

  // A tab that has never been resumed into holds no conversation at all - it must not answer for one.
  it('is nothing for a tab with no conversation behind it', () => {
    expect(tabHolding(undefined as unknown as string, tabs, (tab) => holds[tab])).toBeUndefined()
  })
})
