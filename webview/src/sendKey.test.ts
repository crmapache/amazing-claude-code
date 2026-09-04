import { describe, expect, it } from 'vitest'
import { enterAction, normalizeSendKey } from './sendKey'

const press = (keys: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}) => ({
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  ...keys,
})

describe('normalizeSendKey', () => {
  it('takes anything unknown for Enter - that is what the panel has always done', () => {
    expect(normalizeSendKey(undefined)).toBe('enter')
    expect(normalizeSendKey('')).toBe('enter')
    expect(normalizeSendKey('shiftEnter')).toBe('enter')
    expect(normalizeSendKey('modEnter')).toBe('modEnter')
  })
})

describe('enterAction with Enter sending', () => {
  it('sends on a bare Enter', () => {
    expect(enterAction('enter', press())).toBe('send')
  })

  it('breaks the line on Shift+Enter', () => {
    expect(enterAction('enter', press({ shiftKey: true }))).toBe('newline')
  })

  it('sends on Cmd/Ctrl+Enter too - the other half of the setting is bound to it', () => {
    expect(enterAction('enter', press({ metaKey: true }))).toBe('send')
    expect(enterAction('enter', press({ ctrlKey: true }))).toBe('send')
    expect(enterAction('enter', press({ ctrlKey: true, shiftKey: true }))).toBe('send')
  })
})

describe('enterAction with Cmd/Ctrl+Enter sending', () => {
  it('sends only with the modifier held', () => {
    expect(enterAction('modEnter', press({ metaKey: true }))).toBe('send')
    expect(enterAction('modEnter', press({ ctrlKey: true }))).toBe('send')
  })

  it('breaks the line on every other Enter, Shift included', () => {
    expect(enterAction('modEnter', press())).toBe('newline')
    expect(enterAction('modEnter', press({ shiftKey: true }))).toBe('newline')
  })
})
