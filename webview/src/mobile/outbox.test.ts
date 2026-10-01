import { describe, expect, it } from 'vitest'
import {
  confirmed,
  held,
  loadUnconfirmed,
  PATIENCE_MS,
  QUIET_MS,
  resendable,
  resent,
  RESEND_WITHIN_MS,
  saveUnconfirmed,
  shownFor,
  stateOf,
  type OutboxStorage,
  type Unconfirmed,
} from './outbox'

/**
 * A message from a phone is kept until the IDE says it has it (see outbox.ts).
 *
 * Written from a report: a conversation started from a phone, the tab named after the first words, and
 * then nothing anywhere - the message itself had been lost on the way, and no screen said so.
 */

const message = (id: string, sentAt = 0, overrides: Partial<Unconfirmed> = {}): Unconfirmed => ({
  id,
  agentId: 'agent',
  projectKey: 'project',
  sessionId: 'tab',
  body: { type: 'prompt', sessionId: 'tab', id, text: `text of ${id}` },
  text: `text of ${id}`,
  firstAt: sentAt,
  sentAt,
  ...overrides,
})

describe('the row above the field', () => {
  it('says nothing while an ordinary answer is still on its way', () => {
    expect(stateOf(message('m-1', 1000), 1000 + QUIET_MS - 1)).toBe('quiet')
  })

  it('says it is sending once the answer is late, and not delivered once it is very late', () => {
    expect(stateOf(message('m-1', 1000), 1000 + QUIET_MS)).toBe('sending')
    expect(stateOf(message('m-1', 1000), 1000 + PATIENCE_MS)).toBe('failed')
  })

  it('shows only the late messages of the conversation on screen', () => {
    const list = [
      message('m-1', 0),
      message('m-2', 0, { sessionId: 'other' }),
      message('m-3', 0, { projectKey: 'other' }),
      message('m-4', PATIENCE_MS),
    ]

    const rows = shownFor(list, 'agent', 'project', 'tab', PATIENCE_MS)

    expect(rows.map((row) => [row.item.id, row.state])).toEqual([['m-1', 'failed']])
  })
})

describe('what is held', () => {
  it('lets a message go the moment the IDE confirms it', () => {
    const list = held(held([], message('m-1')), message('m-2'))

    expect(confirmed(list, 'm-1').map((one) => one.id)).toEqual(['m-2'])
  })

  it('keeps the same list when an answer names nothing it holds', () => {
    const list = held([], message('m-1'))

    expect(confirmed(list, 'unknown')).toBe(list)
  })

  it('holds a message once, however many times it is put in', () => {
    const list = held(held([], message('m-1', 0)), message('m-1', 5))

    expect(list).toHaveLength(1)
    expect(list[0]!.sentAt).toBe(5)
  })

  it('starts the patience over for what went out again', () => {
    const list = resent([message('m-1', 0), message('m-2', 0)], new Set(['m-1']), 9000)

    expect(list.map((one) => one.sentAt)).toEqual([9000, 0])
    expect(list[0]!.firstAt).toBe(0)
  })
})

describe('sending again when the line comes back', () => {
  it('sends again what is recent and leaves older messages to the person', () => {
    const now = RESEND_WITHIN_MS + 10_000
    const list = [message('fresh', now - 5000), message('old', 0), message('elsewhere', now - 5000, { agentId: 'other' })]

    expect(resendable(list, 'agent', now).map((one) => one.id)).toEqual(['fresh'])
  })
})

describe('surviving a reload', () => {
  /** The page's session storage, as far as this module uses it. */
  const memory = () => {
    const values = new Map<string, string>()
    const storage: OutboxStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    }
    return { values, storage: () => storage }
  }

  it('reads back what was held', () => {
    const { storage } = memory()
    saveUnconfirmed([message('m-1', 7)], storage)

    expect(loadUnconfirmed(storage)).toEqual([message('m-1', 7)])
  })

  it('reads nothing out of storage it does not recognise', () => {
    const { values, storage } = memory()

    values.set('acc-unconfirmed', JSON.stringify([{ id: 'm-1' }, 'rubbish']))
    expect(loadUnconfirmed(storage)).toEqual([])

    values.set('acc-unconfirmed', '{not json')
    expect(loadUnconfirmed(storage)).toEqual([])
  })

  it('leaves nothing behind once everything is confirmed', () => {
    const { values, storage } = memory()
    saveUnconfirmed([message('m-1')], storage)
    saveUnconfirmed([], storage)

    expect(values.has('acc-unconfirmed')).toBe(false)
  })

  it('is no worse off when there is no storage at all', () => {
    const broken = () => {
      throw new Error('storage refused')
    }

    expect(loadUnconfirmed(broken)).toEqual([])
    expect(() => saveUnconfirmed([message('m-1')], broken)).not.toThrow()
  })
})
