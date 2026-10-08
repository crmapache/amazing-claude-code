import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent, AgentSystemEvent } from '../protocol'
import { reducePanel } from './build'
import { MOD_QUESTION, applyModEvent } from './mods'
import { initialPanelState, type PanelState } from './panelState'

/**
 * What a mod says to the screen, folded into a tab - events shaped the way CLI 2.1.293 sent them in a
 * recorded session with mods loaded (ids shortened), and the IDE's own card for a mod's question.
 */

const NOW = 1_700_000_000_000

const system = (fields: Partial<AgentSystemEvent>): AgentSystemEvent => ({ type: 'system', subtype: '', ...fields })

const play = (events: AgentEvent[], state: PanelState = initialPanelState): PanelState =>
  events.reduce((acc, event) => reducePanel(acc, { kind: 'agent', event }, NOW), state)

describe('applyModEvent', () => {
  it('keeps a status line per mod and lets one go when it is cleared', () => {
    const state = play([
      system({ subtype: 'ui_status', plugin: 'clock', text: '12:00' }),
      system({ subtype: 'ui_status', plugin: 'checks', text: '3 passing' }),
      system({ subtype: 'ui_status', plugin: 'clock', text: '12:01' }),
    ])
    expect(state.modStatus).toEqual({ clock: '12:01', checks: '3 passing' })

    const cleared = play(
      [system({ subtype: 'ui_status', plugin: 'clock', text: null }), system({ subtype: 'ui_status', plugin: 'checks' })],
      state,
    )
    expect(cleared.modStatus).toBeUndefined()
  })

  it('names the panes the mods hold open, and forgets them when none is left', () => {
    const state = play([
      system({
        subtype: 'ui_panes',
        panes: [{ id: 'blast-radius', title: 'Blast Radius', plugin: 'blast-radius' }],
      }),
    ])
    expect(state.modPanes).toEqual([{ id: 'blast-radius', title: 'Blast Radius', plugin: 'blast-radius' }])

    expect(play([system({ subtype: 'ui_panes', panes: [] })], state).modPanes).toBeUndefined()
  })

  it('shows a toast for as long as the mod said, or the CLI\'s four seconds', () => {
    expect(play([system({ subtype: 'ui_toast', plugin: 'probe', text: 'done', timeout_ms: 9000 })]).modToast).toEqual({
      plugin: 'probe',
      text: 'done',
      until: NOW + 9000,
    })
    expect(play([system({ subtype: 'ui_toast', plugin: 'probe', text: 'done' })]).modToast?.until).toBe(NOW + 4000)
  })

  it('puts a log line into the feed, under the mod\'s name', () => {
    const state = play([system({ subtype: 'ui_log', plugin: 'probe', text: 'build finished' })])

    expect(state.items).toEqual([{ id: 'i-1', kind: 'modLog', plugin: 'probe', text: 'build finished' }])
  })

  it('passes over words that say nothing', () => {
    const state = play([
      system({ subtype: 'ui_log', plugin: 'probe', text: '  ' }),
      system({ subtype: 'ui_toast', plugin: 'probe', text: '' }),
    ])

    expect(state.items).toEqual([])
    expect(state.modToast).toBeUndefined()
  })

  it('draws a mod\'s question as the same card any question is, saying who asks', () => {
    const question = system({
      subtype: MOD_QUESTION,
      tool_use_id: 'toolu_plugin_1',
      input: {
        questions: [
          {
            question: 'Probe question: pick one',
            header: 'Plugin',
            options: [
              { label: 'Red', description: '' },
              { label: 'Blue', description: '' },
            ],
            multiSelect: false,
          },
        ],
      },
    })
    const state = play([question, question])

    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toMatchObject({ id: 'toolu_plugin_1', kind: 'ask', fromMod: true })
    expect(state.items[0]?.kind === 'ask' && state.items[0].questions[0]?.options.map((option) => option.label)).toEqual([
      'Red',
      'Blue',
    ])
  })

  it('draws no card for a question with nothing to ask', () => {
    expect(play([system({ subtype: MOD_QUESTION, tool_use_id: 'toolu_plugin_2', input: { questions: [] } })]).items).toEqual(
      [],
    )
  })

  /**
   * The lock on everyone else: no event of an ordinary conversation is a mod's, so every one of them goes on
   * through the reducer exactly as it did - and a whole recorded turn leaves none of this behind.
   */
  it('takes no event of an ordinary conversation for a mod\'s', () => {
    const events = readFileSync(join(import.meta.dirname, '../__fixtures__/stream.ndjson'), 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AgentEvent)
    const ordinary = [
      ...events,
      system({ subtype: 'init', slash_commands: ['compact'] }),
      system({ subtype: 'status', status: 'requesting' }),
      system({ subtype: 'thinking_tokens' }),
      system({ subtype: 'task_progress', task_id: 'wf-1' }),
      system({ subtype: 'commands_changed' }),
      system({ subtype: 'api_retry', attempt: 1 }),
    ]

    for (const event of ordinary) {
      if (event.type === 'system') expect(applyModEvent(initialPanelState, event, NOW)).toBeUndefined()
    }

    const state = play(ordinary)
    expect(state.modStatus).toBeUndefined()
    expect(state.modPanes).toBeUndefined()
    expect(state.modToast).toBeUndefined()
    expect(state.items.some((item) => item.kind === 'modLog' || (item.kind === 'ask' && item.fromMod))).toBe(false)
  })
})
