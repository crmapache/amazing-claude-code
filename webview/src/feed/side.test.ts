import { describe, expect, it } from 'vitest'
import {
  asideQuestion,
  HISTORY_SENT,
  isAsideDraft,
  NO_THREAD,
  sideHistory,
  sideThread,
  THREAD_KEPT,
  type SideAction,
  type SideThread,
} from './side'

const play = (...actions: SideAction[]): SideThread => actions.reduce(sideThread, NO_THREAD)

const ask = (id: string, question = `q ${id}`, replaces?: string): SideAction => ({
  kind: 'ask',
  id,
  question,
  at: 1000,
  ...(replaces ? { replaces } : {}),
})

const answer = (id: string, text = `a ${id}`): SideAction => ({ kind: 'end', id, outcome: 'answered', text })

describe('reading a side question out of the field', () => {
  it('takes the question after /btw, line breaks and all', () => {
    expect(asideQuestion('/btw what port is it on?')).toBe('what port is it on?')
    expect(asideQuestion('  /btw first line\nsecond line  ')).toBe('first line\nsecond line')
  })

  it('reads a bare /btw as an empty question - it brings the thread back', () => {
    expect(asideQuestion('/btw')).toBe('')
    expect(asideQuestion('/btw   ')).toBe('')
  })

  it('is not fooled by a longer command or by the word elsewhere', () => {
    expect(asideQuestion('/btwx hello')).toBeNull()
    expect(asideQuestion('tell me /btw')).toBeNull()
    expect(asideQuestion('/compact')).toBeNull()
  })

  it('sees the command when it has become a chip', () => {
    expect(isAsideDraft([{ kind: 'chip', chip: { kind: 'cmd', value: 'btw' } }, { kind: 'text', value: ' why?' }])).toBe(true)
    expect(isAsideDraft([{ kind: 'chip', chip: { kind: 'cmd', value: 'compact' } }])).toBe(false)
    expect(isAsideDraft([{ kind: 'text', value: 'hello' }])).toBe(false)
  })
})

describe('the thread', () => {
  it('opens on a question and keeps it waiting until the answer', () => {
    const asked = play(ask('1'))
    expect(asked.open).toBe(true)
    expect(asked.exchanges).toMatchObject([{ id: '1', state: 'asking' }])

    const answered = sideThread(asked, { kind: 'end', id: '1', outcome: 'answered', text: 'PELICAN', notice: 'n' })
    expect(answered.exchanges).toMatchObject([{ id: '1', state: 'answered', text: 'PELICAN', notice: 'n' }])
  })

  it('shows the retry while the API is being retried, and drops it when the work goes on', () => {
    const retrying = play(ask('1'), { kind: 'progress', id: '1', status: 'api_retry', attempt: 2, maxRetries: 10, delayMs: 8000, errorStatus: 529, at: 5000 })
    expect(retrying.exchanges[0]?.retry).toEqual({ attempt: 2, maxRetries: 10, delayMs: 8000, errorStatus: 529, at: 5000 })

    const going = sideThread(retrying, { kind: 'progress', id: '1', status: 'started', at: 6000 })
    expect(going.exchanges[0]?.retry).toBeUndefined()
  })

  // A delivery repeated on the way - a relay reconnecting, say - brings the same answer twice: the second
  // must not overwrite the first on screen.
  it('takes one answer per question', () => {
    const thread = play(ask('1'), answer('1', 'first'), answer('1', 'second'))
    expect(thread.exchanges[0]?.text).toBe('first')
  })

  it('ignores an outcome it does not know rather than drawing it as one it does', () => {
    const thread = play(ask('1'), { kind: 'end', id: '1', outcome: 'exploded' as 'answered' })
    expect(thread.exchanges[0]?.state).toBe('asking')
  })

  it('asks a failed one again in its own place', () => {
    const thread = play(
      ask('1'),
      { kind: 'end', id: '1', outcome: 'failed', reason: 'timeout' },
      ask('2'),
      answer('2'),
      ask('3', 'q 1', '1'),
    )

    expect(thread.exchanges.map((exchange) => exchange.id)).toEqual(['3', '2'])
    expect(thread.exchanges[0]).toMatchObject({ state: 'asking', question: 'q 1' })
    expect(thread.exchanges[0]?.reason).toBeUndefined()
  })

  it('closes without forgetting, and comes back', () => {
    const closed = play(ask('1'), answer('1'), { kind: 'hide' })
    expect(closed.open).toBe(false)
    expect(closed.exchanges).toHaveLength(1)

    expect(sideThread(closed, { kind: 'show' }).open).toBe(true)
  })

  it('stays open while an answer arrives under a closed card - closing is the person deciding', () => {
    const thread = play(ask('1'), { kind: 'hide' }, answer('1'))
    expect(thread.open).toBe(false)
    expect(thread.exchanges[0]?.state).toBe('answered')
  })

  it('keeps the newest exchanges, and never the one still out', () => {
    const actions: SideAction[] = [ask('waiting')]
    for (let n = 0; n < THREAD_KEPT + 5; n += 1) actions.push(ask(String(n)), answer(String(n)))

    const thread = play(...actions)
    expect(thread.exchanges).toHaveLength(THREAD_KEPT)
    expect(thread.exchanges[0]?.id).toBe('waiting')
    expect(thread.exchanges.at(-1)?.id).toBe(String(THREAD_KEPT + 4))
  })
})

describe('what a follow-up carries', () => {
  it('carries only what the model answered, newest last', () => {
    const thread = play(
      ask('1'),
      answer('1'),
      ask('2'),
      { kind: 'end', id: '2', outcome: 'empty', text: '(No answer available)' },
      ask('3'),
      { kind: 'end', id: '3', outcome: 'cancelled' },
      ask('4'),
      { kind: 'end', id: '4', outcome: 'answered', text: 'yes', notice: 'by another model' },
      ask('5'),
    )

    expect(sideHistory(thread)).toEqual([
      { question: 'q 1', response: 'a 1' },
      { question: 'q 4', response: 'yes', notice: 'by another model' },
    ])
  })

  it('leaves out the question being asked again, and stops at the cap', () => {
    const actions: SideAction[] = []
    for (let n = 0; n < HISTORY_SENT + 3; n += 1) actions.push(ask(String(n)), answer(String(n)))
    const thread = play(...actions)

    const history = sideHistory(thread, String(HISTORY_SENT + 2))
    expect(history).toHaveLength(HISTORY_SENT)
    expect(history.at(-1)?.question).toBe(`q ${HISTORY_SENT + 1}`)
  })
})
