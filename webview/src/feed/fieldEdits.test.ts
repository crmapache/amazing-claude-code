import { describe, expect, it } from 'vitest'
import { FieldHistory, UNDO_COALESCE_MS, deleteWordBackward, isBoundary, isLetterKey } from './fieldEdits'

const at = (value: string, caret = value.length) => ({ value, start: caret, end: caret })

describe('the word before the caret goes at one press', () => {
  it('takes the spaces before the caret along with the word before them', () => {
    expect(deleteWordBackward(at('find the socket  '))).toEqual(at('find the '))
    expect(deleteWordBackward(at('find the'))).toEqual(at('find '))
  })

  it('walks a path the way an editor does - punctuation and letters apart', () => {
    expect(deleteWordBackward(at('src/useSocket.js'))).toEqual(at('src/useSocket.'))
    expect(deleteWordBackward(at('src/useSocket.'))).toEqual(at('src/useSocket'))
    expect(deleteWordBackward(at('src/useSocket'))).toEqual(at('src/'))
  })

  it('takes a selection whole, and nothing at the start', () => {
    expect(deleteWordBackward({ value: 'one two three', start: 4, end: 7 })).toEqual({ value: 'one  three', start: 4, end: 4 })
    expect(deleteWordBackward(at('', 0))).toEqual(at('', 0))
    expect(deleteWordBackward(at('one two', 0))).toEqual(at('one two', 0))
  })

  it('leaves what stands after the caret alone', () => {
    expect(deleteWordBackward({ value: 'one two three', start: 7, end: 7 })).toEqual({ value: 'one  three', start: 4, end: 4 })
  })
})

describe('the history coalesces typing and keeps everything else apart', () => {
  it('merges keystrokes within the pause and splits on a space', () => {
    const history = new FieldHistory()
    history.record(at(''), true, 1000)
    history.record(at('f'), false, 1100)
    history.record(at('fi'), false, 1200)
    // "fin" was typed as one run: a single step back lands on the empty field.
    expect(history.undo(at('fin'))).toEqual(at(''))
    expect(history.redo(at(''))).toEqual(at('fin'))
  })

  it('starts a new step after the pause', () => {
    const history = new FieldHistory()
    history.record(at(''), true, 1000)
    history.record(at('f'), false, 1000 + UNDO_COALESCE_MS + 1)
    expect(history.undo(at('fi'))).toEqual(at('f'))
    expect(history.undo(at('f'))).toEqual(at(''))
    expect(history.undo(at(''))).toBeUndefined()
  })

  it('starts a new step right after a split, however soon the typing comes', () => {
    const history = new FieldHistory()
    // The word before the caret taken out by the keys, and typing straight after it.
    history.record(at('find the '), true, 1000)
    history.split()
    history.record(at('find '), false, 1020)
    expect(history.undo(at('find r'))).toEqual(at('find '))
    expect(history.undo(at('find '))).toEqual(at('find the '))
  })

  it('throws the redo steps away on a new edit', () => {
    const history = new FieldHistory()
    history.record(at(''), true, 1000)
    expect(history.undo(at('a'))).toEqual(at(''))
    expect(history.canRedo).toBe(true)
    history.record(at(''), true, 5000)
    expect(history.canRedo).toBe(false)
  })

  it('tells a boundary from typing', () => {
    expect(isBoundary(at('fi'), at('fin'), 'insert')).toBe(false)
    expect(isBoundary(at('fin'), at('fin '), 'insert')).toBe(true)
    expect(isBoundary(at('fin'), at('fi'), 'insert')).toBe(true)
    expect(isBoundary(at('fi'), at('f'), 'delete')).toBe(false)
    expect(isBoundary(at('fi'), at('fi socket'), 'insert')).toBe(true)
  })
})

describe('the letter of a shortcut is read off the key, not off the layout', () => {
  it('knows the letter by its name', () => {
    expect(isLetterKey({ key: 'z', code: 'KeyZ' }, 'z')).toBe(true)
    expect(isLetterKey({ key: 'Z', code: 'KeyZ' }, 'z')).toBe(true)
    expect(isLetterKey({ key: 'y', code: 'KeyY' }, 'z')).toBe(false)
  })

  it('knows it by the key itself when the layout names it otherwise', () => {
    // A Ukrainian and a Russian layout print "я" on the Z key and "н" on the Y one.
    expect(isLetterKey({ key: 'я', code: 'KeyZ' }, 'z')).toBe(true)
    expect(isLetterKey({ key: 'н', code: 'KeyY' }, 'y')).toBe(true)
    expect(isLetterKey({ key: 'я', code: 'KeyZ' }, 'y')).toBe(false)
  })

  it('follows the letter a layout has moved elsewhere', () => {
    // Dvorak writes Z on the physical slash key - the person means the letter they see.
    expect(isLetterKey({ key: 'z', code: 'Slash' }, 'z')).toBe(true)
  })

  it('takes the character of a dead key for the key underneath', () => {
    // Alt held on a Mac turns C into "ç"; the key itself is the only thing left to go by.
    expect(isLetterKey({ key: 'ç', code: 'KeyC' }, 'c')).toBe(true)
  })
})
