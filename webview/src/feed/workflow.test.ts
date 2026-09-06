import { describe, expect, it } from 'vitest'
import { openedAgentOf, workflowView } from './workflow'
import type { FeedItem, TaskItem } from './types'
import type { WorkflowProgress } from '../protocol'

const agent = (over: Partial<Extract<WorkflowProgress, { type: 'workflow_agent' }>>): WorkflowProgress => ({
  type: 'workflow_agent',
  index: 1,
  label: 'review:bugs',
  phaseIndex: 1,
  phaseTitle: 'Review',
  state: 'start',
  ...over,
})

describe('workflowView', () => {
  it('says nothing when there is no report - a Workflow call is drawn as an ordinary task then', () => {
    expect(workflowView(undefined)).toBeUndefined()
    expect(workflowView([])).toBeUndefined()
  })

  it('lays the agents out under the phases they belong to', () => {
    const view = workflowView([
      { type: 'workflow_phase', index: 1, title: 'Review' },
      { type: 'workflow_phase', index: 2, title: 'Verify' },
      agent({ index: 1, startedAt: 10 }),
      agent({ index: 2, label: 'verify:one', phaseIndex: 2, state: 'done', durationMs: 4200 }),
    ])

    expect(view?.phases.map((phase) => [phase.title, phase.agents.map((one) => one.label)])).toEqual([
      ['Review', ['review:bugs']],
      ['Verify', ['verify:one']],
    ])
  })

  it('tells a queued agent from a running one - a fleet past the concurrency cap mostly waits', () => {
    const view = workflowView([agent({ index: 1, startedAt: 10 }), agent({ index: 2 })])

    expect(view?.phases[0]?.agents.map((one) => one.state)).toEqual(['running', 'queued'])
    expect(view?.running).toBe(1)
  })

  it('counts what is going on: running, finished, failed, and how many there are in all', () => {
    const view = workflowView([
      agent({ index: 1, startedAt: 10 }),
      agent({ index: 2, state: 'done' }),
      agent({ index: 3, state: 'done' }),
      agent({ index: 4, state: 'error', error: 'boom' }),
      agent({ index: 5 }),
    ])

    expect({ running: view?.running, done: view?.done, failed: view?.failed, total: view?.total }).toEqual({
      running: 1,
      done: 2,
      failed: 1,
      total: 5,
    })
  })

  it('a skipped agent is not a failed one - it was dropped by hand', () => {
    const view = workflowView([agent({ state: 'error', skipped: true, error: 'user-skip' })])

    expect(view?.phases[0]?.agents[0]?.state).toBe('skipped')
    expect(view?.failed).toBe(0)
  })

  it('keeps what an agent cost and how it was run', () => {
    const view = workflowView([
      agent({ state: 'done', model: 'claude-opus-5', durationMs: 8100, tokens: 30_308, toolCalls: 4, attempt: 2, cached: true }),
    ])

    expect(view?.phases[0]?.agents[0]).toMatchObject({
      model: 'claude-opus-5',
      durationMs: 8100,
      tokens: 30_308,
      toolCalls: 4,
      attempt: 2,
      cached: true,
    })
  })

  it('leaves a first attempt unmarked: every agent has one, and saying so of all of them says nothing', () => {
    expect(workflowView([agent({ attempt: 1 })])?.phases[0]?.agents[0]?.attempt).toBeUndefined()
  })

  it('names an agent by its prompt when the script gave it no label', () => {
    const view = workflowView([agent({ label: undefined, promptPreview: 'Find every call site of readFile' })])

    expect(view?.phases[0]?.agents[0]?.label).toBe('Find every call site of readFile')
  })

  it("gathers agents spawned outside any phase under one nameless heading", () => {
    const view = workflowView([
      { type: 'workflow_phase', index: 1, title: 'Review' },
      agent({ index: 1 }),
      agent({ index: 2, phaseIndex: undefined, phaseTitle: undefined, label: 'loose' }),
    ])

    expect(view?.phases.map((phase) => phase.title)).toEqual(['Review', undefined])
  })

  it("keeps the script's own lines in the order they were printed", () => {
    const view = workflowView([
      { type: 'workflow_log', message: '12 of 40 found' },
      agent({}),
      { type: 'workflow_log', message: '31 of 40 found' },
    ])

    expect(view?.log).toEqual(['12 of 40 found', '31 of 40 found'])
  })
})

/**
 * The window over the output area is opened on a place in the feed rather than on a copy of an agent -
 * see OpenedAgent. Everything here is about that difference.
 */
describe('openedAgentOf', () => {
  const card = (over: Partial<TaskItem> = {}): TaskItem => ({
    id: 'c1',
    kind: 'task',
    target: 'workflow',
    meta: '',
    duration: '',
    percent: 0,
    log: [],
    pending: true,
    workflow: workflowView([agent({ index: 1 }), agent({ index: 2, label: 'review:perf' })]),
    ...over,
  })

  it('finds the agent by its number in the card it belongs to', () => {
    const found = openedAgentOf([card()], { card: 'c1', index: 2 })

    expect(found?.agent.label).toBe('review:perf')
    expect(found?.live).toBe(true)
  })

  /*
   * The run reports as it goes, and the agent that was running when its window was opened finishes a
   * minute later with an answer in hand - which is the whole reason it was opened. A copy taken at the
   * press would still be showing an agent at work.
   */
  it('answers with the agent as the newest report has it', () => {
    const later = card({
      workflow: workflowView([
        agent({ index: 1 }),
        agent({ index: 2, label: 'review:perf', state: 'done', resultPreview: '{"findings":[]}' }),
      ]),
    })

    expect(openedAgentOf([later], { card: 'c1', index: 2 })?.agent.result).toBe('{"findings":[]}')
  })

  /* What the report calls running is only running while the task holding it is - see WorkflowRun. */
  it('carries the task\'s own state, so a dead fleet is not drawn as a working one', () => {
    expect(openedAgentOf([card({ pending: false })], { card: 'c1', index: 2 })?.live).toBe(false)
  })

  it('answers with nothing when the card or the agent is gone from the feed', () => {
    expect(openedAgentOf([card()], { card: 'c9', index: 1 })).toBeUndefined()
    expect(openedAgentOf([card()], { card: 'c1', index: 9 })).toBeUndefined()
    expect(openedAgentOf([] as FeedItem[], { card: 'c1', index: 1 })).toBeUndefined()
    expect(openedAgentOf([card()], undefined)).toBeUndefined()
  })
})
