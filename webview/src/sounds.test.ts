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

const limit = (id: string, state: 'extra' | 'waiting'): FeedItem => ({ id, kind: 'limit', state, window: '5-hour' })

const task = (id: string, pending: boolean): FeedItem => ({
  id,
  kind: 'task',
  target: 'Explore',
  meta: '',
  duration: '',
  percent: 0,
  log: [],
  pending,
})

const panel = (items: FeedItem[], status: AgentStatus = 'running'): PanelView => ({ items, status })

/** A tab that has already been watched: only what appeared after that sounds. */
const watching = (items: FeedItem[], status: AgentStatus = 'running') => {
  const view = panel(items, status)
  return { memory: rememberPanel(view), view }
}

describe('soundForPanel', () => {
  it('stays silent about what was in the feed before the watching began', () => {
    const { memory, view } = watching([plan('p1'), ask('a1'), error('e1', 'boom')])
    expect(soundForPanel(view, memory)).toBeNull()
  })

  it('calls on the end of a turn', () => {
    const { memory } = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), meta('m1')], 'idle'), memory)).toBe('turnFinished')
  })

  it('stays silent when the person cut the turn short themselves', () => {
    const { memory } = watching([text('t1')])
    const stopped = meta('m1', [`${STOPPED_BY_YOU} · 3s`])
    expect(soundForPanel(panel([text('t1'), stopped], 'idle'), memory)).toBeNull()
  })

  it('calls on a permission, a question and a plan', () => {
    const first = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), perm('perm-1')]), first.memory)).toBe('permission')

    const second = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), ask('a1')]), second.memory)).toBe('question')

    const third = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), plan('p1')]), third.memory)).toBe('plan')
  })

  it('tells an exhausted limit from an ordinary refusal', () => {
    const limited = watching([text('t1')])
    const limitMessage = 'Claude usage limit reached. Your limit will reset at 3pm.'
    expect(soundForPanel(panel([text('t1'), error('e1', limitMessage)]), limited.memory)).toBe('rateLimit')

    const broken = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), error('e2', 'API error')]), broken.memory)).toBe('trouble')
  })

  it('tells a limit that stopped the work from one that is being paid for', () => {
    const stopped = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), limit('l1', 'waiting')]), stopped.memory)).toBe('rateLimit')

    // The work carries on - but from this moment it is billed on top of the plan, which is a different
    // occasion and a sound of its own.
    const paid = watching([text('t1')])
    expect(soundForPanel(panel([text('t1'), limit('l2', 'extra')]), paid.memory)).toBe('extraUsage')
  })

  /** The row appears once per window that runs out, so the sound does too (see rate_limit_event). */
  it('does not repeat the extra usage sound while the state holds', () => {
    const { memory } = watching([text('t1')])
    const paid = panel([text('t1'), limit('l1', 'extra')])

    expect(soundForPanel(paid, memory)).toBe('extraUsage')
    expect(soundForPanel(paid, memory)).toBeNull()
  })

  /** A conversation raised from the history holds limits that ran out long ago. */
  it('stays silent about extra usage in a replayed conversation', () => {
    const { memory } = watching([], 'idle')
    expect(soundForPanel(panel([limit('l1', 'extra')], 'idle'), memory)).toBeNull()
  })

  it('picks the main one out of several occasions at once', () => {
    const { memory } = watching([text('t1')])
    const finished = panel([text('t1'), error('e1', 'API error'), meta('m1')], 'idle')
    expect(soundForPanel(finished, memory)).toBe('trouble')
  })

  it('sounds once: a repeated check of the same feed stays silent', () => {
    const { memory } = watching([text('t1')])
    const withPlan = panel([text('t1'), plan('p1')])

    expect(soundForPanel(withPlan, memory)).toBe('plan')
    expect(soundForPanel(withPlan, memory)).toBeNull()
  })

  it('stays silent on a conversation raised from the history: no turn has run in it for a long time', () => {
    const { memory } = watching([], 'idle')
    const replayed = panel([plan('p1'), ask('a1'), error('e1', 'boom'), meta('m1')], 'idle')

    expect(soundForPanel(replayed, memory)).toBeNull()
  })

  it('speaks about a dead process even in silence, outside a turn', () => {
    const { memory } = watching([text('t1')], 'idle')
    expect(soundForPanel(panel([text('t1'), crash('c1')], 'idle'), memory)).toBe('trouble')
  })

  it('notices the end of a turn even if the status changed before the card', () => {
    const { memory } = watching([text('t1')])
    // The outcome arrives through the same update in which the turn came free: by the time of the check the
    // status is already 'idle', and the only thing to lean on is the previous one.
    expect(soundForPanel(panel([text('t1'), meta('m1')], 'idle'), memory)).toBe('turnFinished')
  })

  /**
   * A skill's own background subagent (/code-review, say) keeps the main stream's turn ending and
   * restarting for as long as it reports back - each restart brings its own meta card. Chiming on every
   * one of them would mean one chime per subagent notification instead of one for the whole review.
   */
  it('stays silent about a turn ending while a background subagent has not reported back yet', () => {
    const { memory } = watching([text('t1'), task('task-1', true)])
    const stillRunning = panel([text('t1'), task('task-1', true), meta('m1')], 'idle')
    expect(soundForPanel(stillRunning, memory)).toBeNull()
  })

  it('calls once the last background subagent has reported back', () => {
    const { memory } = watching([text('t1'), task('task-1', true)])
    const done = panel([text('t1'), task('task-1', false), meta('m1')], 'idle')
    expect(soundForPanel(done, memory)).toBe('turnFinished')
  })

  it('does not let one still-pending subagent silence a turn about an unrelated occasion', () => {
    const { memory } = watching([text('t1'), task('task-1', true)])
    const asked = panel([text('t1'), task('task-1', true), ask('a1')], 'running')
    expect(soundForPanel(asked, memory)).toBe('question')
  })
})

describe('the tick boxes and the volume', () => {
  it('sounds everything at full volume by default', () => {
    expect(isMuted(NO_SOUND_PREFS, 'plan')).toBe(false)
    expect(volumeOf(NO_SOUND_PREFS, 'plan')).toBe(100)
  })

  it('lets an unticked box remember the configured volume', () => {
    const quiet = setVolume(NO_SOUND_PREFS, 'plan', 70)
    const off = toggleSound(quiet, 'plan')

    expect(isMuted(off, 'plan')).toBe(true)
    expect(volumeOf(off, 'plan')).toBe(70)

    const backOn = toggleSound(off, 'plan')
    expect(isMuted(backOn, 'plan')).toBe(false)
    expect(volumeOf(backOn, 'plan')).toBe(70)
  })

  it('lets a zero on the slider untick the box itself', () => {
    const silent = setVolume(NO_SOUND_PREFS, 'plan', 0)

    expect(isMuted(silent, 'plan')).toBe(true)
    expect(volumeOf(silent, 'plan')).toBe(0)
  })

  it('lets a slider raised from zero bring the tick back itself', () => {
    const back = setVolume(setVolume(NO_SOUND_PREFS, 'plan', 0), 'plan', 30)

    expect(isMuted(back, 'plan')).toBe(false)
    expect(volumeOf(back, 'plan')).toBe(30)
  })

  it('lets the slider switch on a sound that a tick box switched off too', () => {
    const off = toggleSound(setVolume(NO_SOUND_PREFS, 'plan', 70), 'plan')
    const back = setVolume(off, 'plan', 45)

    expect(isMuted(back, 'plan')).toBe(false)
    expect(volumeOf(back, 'plan')).toBe(45)
  })

  it('brings one switched off by a zero back to full: otherwise the tick would bring silence back', () => {
    const backOn = toggleSound(setVolume(NO_SOUND_PREFS, 'plan', 0), 'plan')

    expect(isMuted(backOn, 'plan')).toBe(false)
    expect(volumeOf(backOn, 'plan')).toBe(100)
  })

  it('does not store full volume: silence in the settings means "as it is"', () => {
    const loud = setVolume(setVolume(NO_SOUND_PREFS, 'plan', 40), 'plan', 100)
    expect(loud.volumes.plan).toBeUndefined()
    expect(volumeOf(loud, 'plan')).toBe(100)
  })

  it('keeps the volume within its banks', () => {
    expect(volumeOf(setVolume(NO_SOUND_PREFS, 'plan', 240), 'plan')).toBe(100)
    expect(volumeOf(setVolume(NO_SOUND_PREFS, 'plan', -40), 'plan')).toBe(0)
  })

  it('does not touch the neighbouring sounds', () => {
    const prefs = toggleSound(setVolume(NO_SOUND_PREFS, 'plan', 20), 'question')

    expect(volumeOf(prefs, 'trouble')).toBe(100)
    expect(isMuted(prefs, 'trouble')).toBe(false)
    expect(isMuted(prefs, 'question')).toBe(true)
    expect(volumeOf(prefs, 'plan')).toBe(20)
  })
})
