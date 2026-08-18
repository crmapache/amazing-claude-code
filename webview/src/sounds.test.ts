import { describe, expect, it } from 'vitest'
import { STOPPED_BY_YOU } from './feed/build'
import type { FeedItem } from './feed/types'
import type { AgentStatus } from './protocol'
import {
  NO_SOUND_PREFS,
  isMuted,
  rememberPanel,
  setVolume,
  soundForPanel,
  toggleSound,
  volumeOf,
  type PanelView,
} from './sounds'

const meta = (id: string, stats: string[] = ['Worked 3s']): FeedItem => ({ id, kind: 'meta', stats })

const error = (id: string, message: string): FeedItem => ({ id, kind: 'error', message })

const plan = (id: string): FeedItem => ({ id, kind: 'plan', meta: '', duration: '', paragraphs: [] })

const ask = (id: string): FeedItem => ({ id, kind: 'ask', meta: '', questions: [] })

const perm = (id: string): FeedItem => ({
  id,
  kind: 'perm',
  target: 'rm -rf /',
  meta: '',
  command: 'rm -rf /',
  decision: null,
  rememberable: true,
})

const crash = (id: string): FeedItem => ({ id, kind: 'crash', message: 'exit 1' })

const text = (id: string): FeedItem => ({ id, kind: 'text', paragraphs: [], source: '' })

const panel = (items: FeedItem[], status: AgentStatus = 'running'): PanelView => ({ items, status })

/** Вкладка, за которой уже наблюдали: звучит только то, что появилось после. */
const watching = (items: FeedItem[], status: AgentStatus = 'running') => {
  const view = panel(items, status)
  return { memory: rememberPanel(view), view }
}

describe('soundForPanel', () => {
  it('молчит про то, что было в ленте до начала наблюдения', () => {
    const { memory, view } = watching([plan('p1'), ask('a1'), error('e1', 'boom')])
    expect(soundForPanel(view, memory)).toBeNull()
  })

  it('зовёт на конец хода', () => {
    const { memory } = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), meta('m1')], 'idle'), memory)).toBe('turnFinished')
  })

  it('молчит, когда ход оборвал сам человек', () => {
    const { memory } = watching([text('t1')])
    const stopped = meta('m1', [`${STOPPED_BY_YOU} · 3s`])
    expect(soundForPanel(panel([text('t1'), stopped], 'idle'), memory)).toBeNull()
  })

  it('зовёт на разрешение, вопрос и план', () => {
    const first = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), perm('perm-1')]), first.memory)).toBe('permission')

    const second = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), ask('a1')]), second.memory)).toBe('question')

    const third = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), plan('p1')]), third.memory)).toBe('plan')
  })

  it('отличает исчерпанный лимит от обычного отказа', () => {
    const limited = watching([text('t1')])
    const limitMessage = 'Claude usage limit reached. Your limit will reset at 3pm.'
    expect(soundForPanel(panel([text('t1'), error('e1', limitMessage)]), limited.memory)).toBe('rateLimit')

    const broken = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), error('e2', 'API error')]), broken.memory)).toBe('trouble')
  })

  it('из нескольких поводов разом выбирает главный', () => {
    const { memory } = watching([text('t1')])
    const finished = panel([text('t1'), error('e1', 'API error'), meta('m1')], 'idle')
    expect(soundForPanel(finished, memory)).toBe('trouble')
  })

  it('звучит один раз: повторная проверка той же ленты молчит', () => {
    const { memory } = watching([text('t1')])
    const withPlan = panel([text('t1'), plan('p1')])

    expect(soundForPanel(withPlan, memory)).toBe('plan')
    expect(soundForPanel(withPlan, memory)).toBeNull()
  })

  it('молчит на поднятой из истории переписке: ход в ней давно не идёт', () => {
    const { memory } = watching([], 'idle')
    const replayed = panel([plan('p1'), ask('a1'), error('e1', 'boom'), meta('m1')], 'idle')

    expect(soundForPanel(replayed, memory)).toBeNull()
  })

  it('про умерший процесс говорит даже в тишине, вне хода', () => {
    const { memory } = watching([text('t1')], 'idle')
    expect(soundForPanel(panel([text('t1'), crash('c1')], 'idle'), memory)).toBe('trouble')
  })

  it('замечает конец хода, даже если статус успел смениться раньше карточки', () => {
    const { memory } = watching([text('t1')])
    // Итог приезжает тем же обновлением, в котором ход стал свободным: к моменту
    // проверки статус уже 'idle', и опереться можно только на прошлый.
    expect(soundForPanel(panel([text('t1'), meta('m1')], 'idle'), memory)).toBe('turnFinished')
  })
})

describe('галочки и громкость', () => {
  it('по умолчанию звучит всё и на полную', () => {
    expect(isMuted(NO_SOUND_PREFS, 'plan')).toBe(false)
    expect(volumeOf(NO_SOUND_PREFS, 'plan')).toBe(100)
  })

  it('снятая галочка помнит настроенную громкость', () => {
    const quiet = setVolume(NO_SOUND_PREFS, 'plan', 70)
    const off = toggleSound(quiet, 'plan')

    expect(isMuted(off, 'plan')).toBe(true)
    expect(volumeOf(off, 'plan')).toBe(70)

    const backOn = toggleSound(off, 'plan')
    expect(isMuted(backOn, 'plan')).toBe(false)
    expect(volumeOf(backOn, 'plan')).toBe(70)
  })

  it('ноль на ползунке сам снимает галочку', () => {
    const silent = setVolume(NO_SOUND_PREFS, 'plan', 0)

    expect(isMuted(silent, 'plan')).toBe(true)
    expect(volumeOf(silent, 'plan')).toBe(0)
  })

  it('поднятый с нуля ползунок сам возвращает галочку', () => {
    const back = setVolume(setVolume(NO_SOUND_PREFS, 'plan', 0), 'plan', 30)

    expect(isMuted(back, 'plan')).toBe(false)
    expect(volumeOf(back, 'plan')).toBe(30)
  })

  it('ползунком включается и звук, выключенный галочкой', () => {
    const off = toggleSound(setVolume(NO_SOUND_PREFS, 'plan', 70), 'plan')
    const back = setVolume(off, 'plan', 45)

    expect(isMuted(back, 'plan')).toBe(false)
    expect(volumeOf(back, 'plan')).toBe(45)
  })

  it('выключенный нулём возвращается на полную: иначе галочка вернула бы тишину', () => {
    const backOn = toggleSound(setVolume(NO_SOUND_PREFS, 'plan', 0), 'plan')

    expect(isMuted(backOn, 'plan')).toBe(false)
    expect(volumeOf(backOn, 'plan')).toBe(100)
  })

  it('полную громкость не хранит: молчание настроек и значит «как есть»', () => {
    const loud = setVolume(setVolume(NO_SOUND_PREFS, 'plan', 40), 'plan', 100)
    expect(loud.volumes.plan).toBeUndefined()
    expect(volumeOf(loud, 'plan')).toBe(100)
  })

  it('громкость держится в своих берегах', () => {
    expect(volumeOf(setVolume(NO_SOUND_PREFS, 'plan', 240), 'plan')).toBe(100)
    expect(volumeOf(setVolume(NO_SOUND_PREFS, 'plan', -40), 'plan')).toBe(0)
  })

  it('соседние звуки не задевает', () => {
    const prefs = toggleSound(setVolume(NO_SOUND_PREFS, 'plan', 20), 'question')

    expect(volumeOf(prefs, 'trouble')).toBe(100)
    expect(isMuted(prefs, 'trouble')).toBe(false)
    expect(isMuted(prefs, 'question')).toBe(true)
    expect(volumeOf(prefs, 'plan')).toBe(20)
  })
})
