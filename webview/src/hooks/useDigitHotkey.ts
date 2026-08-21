import { useEffect, useRef } from 'react'

/** "1"…"9" in order: the tenth option and beyond live without a hotkey, there are no more digits. */
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export const MAX_DIGIT_HOTKEYS = DIGITS.length

/**
 * Where a pressed digit would land if it were not intercepted: into text or into nothing.
 *
 * The "in your own words" answer field inside the panel itself and any other ordinary input field always
 * take a digit for themselves - there it is part of the answer. The message field (the only
 * contentEditable in the panel) gives it up to the hotkey, but only while it is empty: a started draft is
 * a sign that the person is typing, and a digit in it is a digit.
 */
const typedInto = (target: EventTarget | null, composerEmpty: boolean): boolean => {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return true
  return element.isContentEditable && !composerEmpty
}

/**
 * The digits pick an option in the panel that is holding the turn: a permission and the agent's question.
 * Exactly the same habit as in a terminal, where an answer is chosen by number rather than with a mouse.
 *
 * Nobody's focus is taken from anybody in the process: the panel appears when the person is most likely
 * already standing with their caret in the message field, and pulling it out of there would mean losing
 * the first letters of someone who has just started typing. Instead a digit goes to the hotkey only while
 * the field is empty - that is, while there is nothing to lose.
 */
export const useDigitHotkey = (
  count: number,
  onPick: (index: number) => void,
  { enabled, composerEmpty }: { enabled: boolean; composerEmpty: boolean },
): void => {
  /**
   * The action itself lives in a ref rather than in the dependencies: in the question panel it is
   * reassembled on every repaint (and that happens on every chunk of a printing answer), and the window
   * listener would be removed and added again several times a second for nothing.
   */
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    if (!enabled || count === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (typedInto(event.target, composerEmpty)) return

      const index = DIGITS.indexOf(event.key)
      if (index < 0 || index >= count) return

      event.preventDefault()
      pick.current(index)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [count, enabled, composerEmpty])
}
