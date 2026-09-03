import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react'
import { FieldHistory, deleteWordBackward, isBoundary, isLetterKey, type FieldState } from '../feed/fieldEdits'

type TextField = HTMLInputElement | HTMLTextAreaElement

/**
 * A plain text field with the keys the browser inside the IDE does not give it: Cmd/Ctrl+Backspace for
 * the word before the caret, and an undo history of its own on Cmd/Ctrl+Z, Shift for the step forward,
 * Ctrl+Y as well - the same keys the composer answers, by the same rules (see feed/fieldEdits.ts). Every
 * plain input and textarea of the panel goes through it: the search window's two fields, the feedback
 * form, the improve-prompt instructions, an answer in one's own words, the MCP and plugin forms, the relay
 * address, the Deepgram key and the path to the executable. A field left out is a field where Cmd+Z
 * answers with somebody else's undo.
 *
 * For a controlled field: [value] is what the screen holds and [onChange] is told about every edit,
 * ours included. The DOM is written first and the report follows, so React finds the field already
 * saying what the state says and leaves the caret where the edit put it.
 */
export const useFieldHistory = (
  value: string,
  onChange: (value: string) => void,
): {
  onChange: (event: ChangeEvent<TextField>) => void
  onKeyDown: (event: KeyboardEvent<TextField>) => void
  /** The field set to [next] by a hand other than the keyboard - the × that empties it - as one undo step. */
  replace: (field: TextField, next: string) => void
} => {
  const history = useRef(new FieldHistory())
  /** What the field held before the edit under way - the snapshot an undo goes back to. */
  const held = useRef<FieldState>({ value, start: value.length, end: value.length })
  const lastKind = useRef<'insert' | 'delete' | undefined>(undefined)

  // A value put in from outside - the panel emptying the field - is the new ground, not an edit.
  useEffect(() => {
    if (held.current.value !== value) held.current = { value, start: value.length, end: value.length }
  }, [value])

  const stateOf = (field: TextField): FieldState => ({
    value: field.value,
    start: field.selectionStart ?? field.value.length,
    end: field.selectionEnd ?? field.value.length,
  })

  const apply = (field: TextField, next: FieldState) => {
    field.value = next.value
    field.setSelectionRange(next.start, next.end)
    held.current = next
    lastKind.current = undefined
    // Whatever is typed next is a step of its own, not a tail of what the keys just did (see split).
    history.current.split()
    onChange(next.value)
  }

  const change = (event: ChangeEvent<TextField>) => {
    const next = stateOf(event.currentTarget)
    const before = held.current
    history.current.record(before, isBoundary(before, next, lastKind.current))
    lastKind.current = next.value.length > before.value.length ? 'insert' : 'delete'
    held.current = next
    onChange(next.value)
  }

  const keyDown = (event: KeyboardEvent<TextField>) => {
    if (event.nativeEvent.isComposing) return
    const field = event.currentTarget
    const modifier = event.metaKey || event.ctrlKey
    if (!modifier || event.altKey) return

    const isZ = isLetterKey(event, 'z')
    const isY = isLetterKey(event, 'y')

    if (isZ) {
      event.preventDefault()
      const current = stateOf(field)
      const target = event.shiftKey ? history.current.redo(current) : history.current.undo(current)
      if (target) apply(field, target)
      return
    }

    if (isY && !event.shiftKey) {
      event.preventDefault()
      const target = history.current.redo(stateOf(field))
      if (target) apply(field, target)
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      const before = stateOf(field)
      const next = deleteWordBackward(before)
      if (next.value === before.value) return
      history.current.record(before, true)
      apply(field, next)
    }
  }

  const replace = (field: TextField, next: string) => {
    const before = stateOf(field)
    if (before.value === next) return
    history.current.record(before, true)
    apply(field, { value: next, start: next.length, end: next.length })
  }

  return { onChange: change, onKeyDown: keyDown, replace }
}
