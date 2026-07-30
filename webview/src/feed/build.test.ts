import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../protocol'
import { contextUsage, initialPanelState, reducePanel, type PanelState } from './build'
import type { TextItem, ToolGroupItem } from './types'

/**
 * Поток записан живым прогоном агента, а не придуман: только так видно и порядок
 * событий, и типы, которых мы не ждали.
 */
const streamEvents = (): AgentEvent[] =>
  readFileSync(join(import.meta.dirname, '../__fixtures__/stream.ndjson'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AgentEvent)

const play = (events: AgentEvent[], state = initialPanelState): PanelState =>
  events.reduce((acc, event) => reducePanel(acc, { kind: 'agent', event }, 1_700_000_000_000), state)

const toolUseEvent = (id: string, name: string, input: unknown = {}): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name, input }] },
})

const toolResultEvent = (id: string, content = 'ok'): AgentEvent => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content }] },
})

const textEvent = (text: string): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
})

describe('сборка ленты из потока агента', () => {
  it('доводит разговор до покоя и запоминает сессию', () => {
    const state = play(streamEvents())

    expect(state.sessionId).toBeTruthy()
    expect(state.model).toBeTruthy()
    expect(state.status).toBe('idle')
    // Живой текст должен быть погашен готовым сообщением, иначе ответ удвоится.
    expect(state.streamingText).toBe('')
    expect(state.errors).toEqual([])
  })

  it('превращает вызов инструмента в карточку с результатом', () => {
    const state = play(streamEvents())
    const tools = state.items
      .filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      .flatMap((group) => group.tools)

    expect(tools.length).toBeGreaterThan(0)

    const read = tools.find((tool) => tool.chip === 'READ')
    expect(read).toBeDefined()
    expect(read?.pending).toBe(false)
    expect(read?.isError).toBe(false)
    expect(read?.target).toBe('package.json')
    expect(read?.meta).toContain('lines')
    expect(read?.detail.length).toBeGreaterThan(0)
    expect(read?.duration).toMatch(/s$/)
  })

  it('разбирает ответ в абзацы с кодовыми вставками', () => {
    const state = play(streamEvents())
    const texts = state.items.filter((item): item is TextItem => item.kind === 'text')
    const parts = texts.flatMap((item) => item.paragraphs.flatMap((paragraph) => paragraph.parts))

    expect(texts.length).toBeGreaterThan(0)
    expect(parts.some((part) => part.code === true)).toBe(true)
    expect(parts.map((part) => part.text).join(' ')).toContain('acc-test')
  })

  it('закрывает ход строкой итогов', () => {
    const state = play(streamEvents())
    const meta = state.items.filter((item) => item.kind === 'meta')

    expect(meta.length).toBe(1)
    expect(state.cost).toBeGreaterThan(0)
    expect(contextUsage(state.usage)).toBeGreaterThan(0)
  })

  it('показывает свой ход сразу, не дожидаясь агента', () => {
    const state = reducePanel(
      initialPanelState,
      { kind: 'prompt', tokens: [{ kind: 'text', value: 'привет' }], quotes: [] },
      1_700_000_000_000,
    )

    expect(state.status).toBe('running')
    expect(state.items).toHaveLength(1)
    expect(state.items[0]?.kind).toBe('user')
  })

  it('не рушится на незнакомом событии', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'agent',
      event: { type: 'rate_limit_event' } as unknown as AgentEvent,
    })

    expect(state).toEqual(initialPanelState)
  })

  describe('группировка вызовов инструментов', () => {
    it('собирает подряд идущие вызовы в одну группу, даже через паузу между внутренними шагами хода', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      // t1 уже разрешился — группа на мгновение стала pending:false, но следующий
      // вызов идёт без единого текстового блока между ними и должен лечь в ту же группу.
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)
      state = play([toolResultEvent('t2', 'ok')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.toolName)).toEqual(['Read', 'Bash'])
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.duration).toMatch(/s$/)
    })

    it('текст между вызовами открывает новую группу', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      state = play([textEvent('Нашёл файл.')], state)
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)
      state = play([toolResultEvent('t2', 'ok')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(2)
      expect(groups[0]?.tools).toHaveLength(1)
      expect(groups[1]?.tools).toHaveLength(1)
    })

    it('включает мысль модели в ту же группу, что и вызов рядом', () => {
      let state = play([
        { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'Надо посмотреть файл.' }] } },
      ])
      state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })], state)
      state = play([toolResultEvent('t1', 'line 1')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.chip)).toEqual(['THINK', 'READ'])
    })

    it('закрывает незавершённые вызовы внутри группы при обрыве сессии', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)

      state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_005_000)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.isError).toBe(true)
      expect(groups[0]?.tools.at(-1)?.meta).toBe('· interrupted')
      expect(state.crashed).toBe(true)
    })

    it('вычисляет полный span группы при re-append после resolve (regression)', () => {
      const T0 = 1_700_000_000_000
      // T0: tool1 called
      let state = reducePanel(
        initialPanelState,
        { kind: 'agent', event: toolUseEvent('t1', 'Read', { file_path: 'a.ts' }) },
        T0,
      )
      // T0 + 2s: tool1 resolves
      state = reducePanel(
        state,
        { kind: 'agent', event: toolResultEvent('t1', 'ok') },
        T0 + 2_000,
      )

      let groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.duration).toMatch(/2\.0+s/)

      // T0 + 2.5s: tool2 called (no text between, same group)
      state = reducePanel(
        state,
        { kind: 'agent', event: toolUseEvent('t2', 'Bash', { command: 'ls' }) },
        T0 + 2_500,
      )

      groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools).toHaveLength(2)
      expect(groups[0]?.pending).toBe(true)

      // T0 + 5.5s: tool2 resolves (group should now show full 5.5s span, not just 2s)
      state = reducePanel(
        state,
        { kind: 'agent', event: toolResultEvent('t2', 'ok') },
        T0 + 5_500,
      )

      groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      // Duration should reflect full span from T0 to T0+5.5s, not just the first 2s
      expect(groups[0]?.duration).toMatch(/5\.5+s/)
    })
  })
})
