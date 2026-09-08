import { describe, expect, it } from 'vitest'
import { isCommand, waitsForTheTurn } from './delivery'

describe('waitsForTheTurn', () => {
  it('holds a command back while a turn is running', () => {
    expect(waitsForTheTurn('/compact', true)).toBe(true)
    expect(waitsForTheTurn('  /clear', true)).toBe(true)
  })

  // An ordinary message the CLI does show the agent at its next step, so it goes now.
  it('lets an ordinary message into a running turn', () => {
    expect(waitsForTheTurn('carry on with the refactoring', true)).toBe(false)
    expect(waitsForTheTurn('the path is /tmp/x', true)).toBe(false)
  })

  it('holds nothing back when the agent is free', () => {
    expect(waitsForTheTurn('/compact', false)).toBe(false)
  })

  // The output of a "!" command travels ahead of the message, and a command with that in front of it is
  // no longer the first word of anything - which is exactly how the shell reads it too.
  it('does not see a command behind text that came before it', () => {
    expect(waitsForTheTurn('$ git status\non main\n\n/compact', true)).toBe(false)
  })

  it('tells a command from a message', () => {
    expect(isCommand('/compact now')).toBe(true)
    expect(isCommand('compact /now')).toBe(false)
  })
})
