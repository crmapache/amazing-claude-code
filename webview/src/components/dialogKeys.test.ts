import { describe, expect, it } from 'vitest'
import { dialogKey } from './dialogKeys'

describe('dialogKey', () => {
  it('lets a focused button take Enter, so Cancel cancels rather than accepts', () => {
    expect(dialogKey('Enter', true)).toBe('own')
  })

  it('accepts on Enter when no button of the question has the focus', () => {
    expect(dialogKey('Enter', false)).toBe('accept')
  })

  it('cancels on Escape wherever the focus is', () => {
    expect(dialogKey('Escape', true)).toBe('cancel')
    expect(dialogKey('Escape', false)).toBe('cancel')
  })

  it('leaves every other key alone', () => {
    expect(dialogKey('Tab', true)).toBeNull()
    expect(dialogKey('a', false)).toBeNull()
  })
})
