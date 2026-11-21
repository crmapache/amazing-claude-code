import { useLayoutEffect, useRef, useState } from 'react'
import { useFieldHistory } from '../hooks/useFieldHistory'

/**
 * The longest name the field takes. The IDE holds the same line (SessionTitle.OWN_MAX_LENGTH): the strip
 * cuts a name long before this, and a pasted paragraph has no business in every list of tabs.
 */
const NAME_MAX = 100

/**
 * The field a conversation's name is typed into, standing where the name stood: on its tab (see naming in
 * Header) and on its row in the history (see History). One field for both, so that a name is typed the same
 * way wherever it is typed - the keys included.
 *
 * A component of its own rather than a piece of the strip or the list, for the reason OwnAnswer is one: the
 * keys the embedded browser does not give a plain field come from a hook (see useFieldHistory), and a hook
 * cannot be called inside a loop.
 *
 * Enter keeps the name, Escape keeps the old one, and the focus leaving keeps what was typed - the way
 * a rename field behaves in the IDE around it and everywhere else.
 */
export const NameField = ({
  title,
  label,
  className,
  onDone,
}: {
  title: string
  label: string
  className: string
  /**
   * The name typed, or null when the naming was called off, and whether a key ended it (Enter or Escape)
   * rather than the focus leaving - see onReturnToInput in Header.
   */
  onDone: (name: string | null, byKey: boolean) => void
}) => {
  const [value, setValue] = useState(title)
  const field = useFieldHistory(value, setValue)
  const input = useRef<HTMLInputElement>(null)
  /** Enter unmounts the field, and the blur that follows must not count as a second answer. */
  const done = useRef(false)

  const finish = (name: string | null, byKey: boolean) => {
    if (done.current) return
    done.current = true
    onDone(name, byKey)
  }

  // The whole name selected, as every rename field opens: typing replaces it, an arrow keeps it.
  useLayoutEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  return (
    <input
      ref={input}
      className={className}
      value={value}
      maxLength={NAME_MAX}
      aria-label={label}
      spellCheck={false}
      onChange={field.onChange}
      onKeyDown={(event) => {
        // Every key here is the field's own. The tab around it opens on Enter and Space - Space would
        // never reach the name at all - and the panel stops the agent on Escape and changes the mode on
        // Shift+Tab (see App).
        event.stopPropagation()
        // Enter confirms an input method's candidate and Escape throws its half-typed character away:
        // neither is an answer to the naming (see composer-field in the rules).
        if (event.nativeEvent.isComposing) return

        if (event.key === 'Enter') {
          event.preventDefault()
          finish(value, true)
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          finish(null, true)
          return
        }

        field.onKeyDown(event)
      }}
      onBlur={() => finish(value, false)}
      // A press inside the field places the caret rather than starting a drag of the tab, a click does not
      // pick the tab (or open the history's row) again, and a double click selects a word rather than
      // opening the field anew.
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
