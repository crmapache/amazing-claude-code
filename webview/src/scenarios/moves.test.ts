import { describe, expect, it } from 'vitest'
import { en } from '../i18n/en'
import { ru } from '../i18n/ru'
import { clockOf, limitText, moveText } from './moves'

/**
 * The panel's own lines in a run's timeline: the run moved to another account, or waits out a limit.
 *
 * What goes wrong here goes wrong quietly. A move drawn without the account it went to reads as the run going
 * on where it stood, and that is exactly the picture that confused the evening it was written for - the rings
 * of one account at 12% beside a run refused on another.
 */
describe('moveText', () => {
  const resets = new Date(2026, 9, 8, 23, 20).getTime()

  it('names both accounts and the window when a limit moved the run', () => {
    const text = moveText(en, { reason: 'limit', from: 'Main', to: 'Proton', window: 'five_hour', until: resets })

    expect(text).toBe('The 5-hour limit of Main ran out. Moved the run to Proton.')
  })

  it('says until when the run waits when no account had room', () => {
    const text = moveText(en, { reason: 'limit', from: 'Main', to: '', waits: true, window: 'five_hour', until: resets })

    expect(text).toContain('no other account has room')
    expect(text).toContain(clockOf(resets))
  })

  /** A refusal nothing said the end of: the run still waits, and the sentence does not promise a time. */
  it('promises no time it does not know', () => {
    const text = moveText(en, { reason: 'limit', from: 'Main', to: '', waits: true, window: '', until: 0 })

    expect(text).toBe('The usage limit of Main ran out, and no other account has room. The run waits.')
  })

  it('says the person chose the account it moved to', () => {
    expect(moveText(en, { reason: 'choice', from: 'Main', to: 'Work', window: '', until: 0 })).toBe(
      'Moved the run to Work - the account you chose.',
    )
  })

  /** Moving onto the CLI's own sign-in with no name is a move, not a wait - the flag says which, not the empty name. */
  it('tells a move onto an unnamed sign-in from a wait', () => {
    expect(moveText(en, { reason: 'limit', from: 'Main', to: '', window: 'five_hour', until: resets })).toBe(
      `The 5-hour limit of Main ran out. Moved the run to ${en.accounts.defaultName}.`,
    )
  })

  /** An account the run borrowed failed on its own account of things, not on a limit - and is not said to have run out. */
  it('says an account could not take the run rather than that it ran out', () => {
    const text = moveText(en, { reason: 'unfit', from: 'Work', to: 'Proton', window: '', until: 0 })

    expect(text).toBe('Work could not take the run. Moved the run to Proton.')
  })

  /** The CLI's own sign-in with no name given is named by what it is, not left as a gap in the sentence. */
  it('names an unnamed CLI sign-in by what it is', () => {
    const text = moveText(ru, { reason: 'limit', from: '', to: 'Proton', window: 'five_hour', until: resets })

    expect(text).toContain(ru.accounts.defaultName)
    expect(text).toContain('Proton')
  })
})

describe('limitText', () => {
  it('names the account, the window and the moment the run goes on', () => {
    const until = new Date(2026, 9, 8, 23, 20).getTime()

    expect(limitText(en, { account: 'Main', window: 'seven_day', until })).toBe(
      `The weekly limit of Main ran out - the run goes on by itself at ${clockOf(until)}`,
    )
  })
})
