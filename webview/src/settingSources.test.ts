import { describe, expect, it } from 'vitest'
import { en } from './i18n/en'
import { normalizeSettingSources, settingSourcesOptions, settingSourcesSummary } from './settingSources'

describe('normalizeSettingSources', () => {
  it('keeps the three answers the CLI understands', () => {
    expect(normalizeSettingSources('')).toBe('')
    expect(normalizeSettingSources('user,project')).toBe('user,project')
    expect(normalizeSettingSources('user')).toBe('user')
  })

  // A value from an IDE of another version, or one stored by one. Either way it must land on "every
  // layer": narrowing what a conversation loads on the strength of a word nobody recognises is the one
  // mistake this function can make.
  it('takes anything else for every layer', () => {
    expect(normalizeSettingSources(undefined)).toBe('')
    expect(normalizeSettingSources('project')).toBe('')
    expect(normalizeSettingSources('user, project')).toBe('')
    expect(normalizeSettingSources('policy')).toBe('')
  })
})

describe('the screen and the row agree', () => {
  it('names every option the flag accepts, and no other', () => {
    expect(settingSourcesOptions(en).map((option) => option.id)).toEqual(['', 'user,project', 'user'])
  })

  // The row in the settings list and the ticked option on the screen behind it are the same words: a row
  // saying one thing and a tick standing on another reads as a setting that did not take.
  it('writes the value beside the row exactly as the chosen option is written', () => {
    for (const option of settingSourcesOptions(en)) {
      expect(settingSourcesSummary(normalizeSettingSources(option.id), en)).toBe(option.label)
    }
  })
})
