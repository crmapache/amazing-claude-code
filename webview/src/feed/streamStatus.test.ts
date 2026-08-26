import { describe, expect, it } from 'vitest'
import type { CardState } from '../hooks/useCardState'
import { awaiting } from './streamStatus'
import type { AskItem, FeedItem, PermItem, PlanItem } from './types'

const cards = (answeredAsks: string[] = [], planDecisions: CardState['planDecisions'] = {}): CardState => ({
  isOpen: () => false,
  toggle: () => {},
  planDecisions,
  decidePlan: () => {},
  answeredAsks,
  answerAsk: () => {},
  reset: () => {},
})

const perm = (id: string, extra: Partial<PermItem> = {}): PermItem => ({
  id,
  kind: 'perm',
  target: 'src/app.ts',
  meta: 'Edit',
  command: '',
  decision: null,
  rememberable: true,
  ...extra,
})

const plan = (id: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  id,
  kind: 'plan',
  meta: 'ExitPlanMode',
  duration: '',
  paragraphs: [],
  ...extra,
})

const ask = (id: string, extra: Partial<AskItem> = {}): AskItem => ({
  id,
  kind: 'ask',
  meta: 'AskUserQuestion',
  questions: [{ id: 'q1', title: 'Which way?', hint: '', multiSelect: false, options: [] }],
  ...extra,
})

const text: FeedItem = { id: 't1', kind: 'text', source: 'Looking at the relay.', paragraphs: [] } as FeedItem

/**
 * Which of the three things holds a turn, and which of them a screen must offer to answer.
 *
 * Written down because two screens on a phone ask this question - the strip above the conversation and
 * the decision screen behind it - and when each answered it for itself the strip went by permissions
 * alone. A question then stopped the conversation with nothing anywhere offering to answer it: a
 * question is not drawn in the feed either, so from a phone it was invisible and the work simply stood.
 */
describe('what the turn is standing on', () => {
  it('is nothing at all in an ordinary conversation', () => {
    expect(awaiting([text], cards())).toBeUndefined()
  })

  it('is a question with options, exactly as much as a permission is', () => {
    expect(awaiting([text, ask('a1')], cards())?.id).toBe('a1')
    expect(awaiting([text, perm('p1')], cards())?.id).toBe('p1')
  })

  it('is a plan that has been shown and not answered', () => {
    expect(awaiting([plan('pl1'), text], cards())?.id).toBe('pl1')
  })

  it('is not a question already answered, nor a plan already decided', () => {
    expect(awaiting([ask('a1')], cards(['a1']))).toBeUndefined()
    expect(awaiting([plan('pl1')], cards([], { pl1: 'approve' }))).toBeUndefined()
  })

  /** A conversation opened from the history: the turn that asked ended some time in the past. */
  it('is not a question or a plan replayed out of a past conversation', () => {
    expect(awaiting([ask('a1', { historic: true })], cards())).toBeUndefined()
    expect(awaiting([plan('pl1', { historic: true })], cards())).toBeUndefined()
  })

  it('is not a permission already answered', () => {
    expect(awaiting([perm('p1', { decision: 'once' })], cards())).toBeUndefined()
  })

  /**
   * A permission holds a call happening this second, while a plan and a question hold a turn prepared to
   * wait - so it is offered first, and the two screens agree about which one that is.
   */
  it('is the permission when a plan and a question are waiting beside it', () => {
    expect(awaiting([plan('pl1'), ask('a1'), perm('p1')], cards())?.id).toBe('p1')
  })

  it('is the plan rather than the question when there is no permission', () => {
    expect(awaiting([ask('a1'), plan('pl1')], cards())?.id).toBe('pl1')
  })

  it('is the most recent of its kind', () => {
    expect(awaiting([ask('a1'), ask('a2')], cards())?.id).toBe('a2')
  })

  /** A subagent's own question is answered on its own tab - the main stream is not standing on it. */
  it('is not a subagent question', () => {
    expect(awaiting([ask('a1', { taskId: 'task-1' })], cards())).toBeUndefined()
  })
})
