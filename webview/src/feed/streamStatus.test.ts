import { describe, expect, it } from 'vitest'
import type { CardState } from '../hooks/useCardState'
import { awaiting, buildAgentTabs } from './streamStatus'
import type { AskItem, FeedItem, PermItem, PlanItem, TaskItem } from './types'
import { initialPanelState } from './build'

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
  mode: 'manual',
  command: '',
  decision: null,
  rememberable: true,
  ...extra,
})

const plan = (id: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  id,
  kind: 'plan',
  steps: 0,
  duration: '',
  paragraphs: [],
  ...extra,
})

const ask = (id: string, extra: Partial<AskItem> = {}): AskItem => ({
  id,
  kind: 'ask',
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

  /**
   * The agent took the question back itself - Stop pressed over a waiting card cancels it along with the
   * turn (see PermissionChannel.Incoming.Withdrawn on the IDE's side). Nobody decided anything, and the
   * conversation must stop saying it is waiting for a person all the same: otherwise the strip, the tab's
   * dot and the phone's list all go on promising a decision that no longer exists.
   */
  it('is not a card the agent has taken back', () => {
    expect(awaiting([perm('p1', { decision: 'withdrawn' })], cards())).toBeUndefined()
    expect(awaiting([plan('pl1')], cards([], { pl1: 'withdrawn' }))).toBeUndefined()
    expect(awaiting([ask('a1')], cards(['a1']))).toBeUndefined()
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

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: 'task-1',
  kind: 'task',
  target: 'Explore',
  meta: 'Find the callers',
  duration: '',
  percent: 0,
  log: [],
  pending: true,
  ...over,
})

const tabsOf = (item: TaskItem) => buildAgentTabs({ ...initialPanelState, items: [item] }, [], new Set())

describe('buildAgentTabs', () => {
  it('names a subagent by the kind of agent it is', () => {
    expect(tabsOf(task())[0]?.label).toBe('agent:Explore')
  })

  /**
   * A workflow has no subagent_type at all, so the chip used to read "agent:agent" over a fleet of nine -
   * both halves of it saying nothing. The count is what a chip that small can usefully carry.
   */
  it('counts the fleet on a workflow chip instead', () => {
    const workflow = { phases: [], log: [], running: 2, done: 7, failed: 0, total: 9 }
    expect(tabsOf(task({ target: 'workflow', workflow }))[0]?.label).toBe('workflow:9')
  })
})
