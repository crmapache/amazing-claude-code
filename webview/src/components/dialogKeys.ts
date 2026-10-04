import { useEffect, type RefObject } from 'react'

/**
 * What a key does inside a modal question (see Confirm, RewindDialog): Escape takes the question back,
 * Enter presses the main button - unless a button of the question has the focus, which then takes the
 * key itself, the way any button does.
 *
 * The exception is the point. Enter used to accept whatever had the focus: the person who tabbed to
 * Cancel, or clicked one of the choices, pressed Enter and got the irreversible thing instead - a rewind
 * that overwrote files, a scenario deleted. The main button has the focus when a question opens, so a
 * quick Enter accepts exactly as before.
 */
export const dialogKey = (key: string, onOwnButton: boolean): 'accept' | 'cancel' | 'own' | null => {
  if (key === 'Escape') return 'cancel'
  if (key !== 'Enter') return null
  return onOwnButton ? 'own' : 'accept'
}

/**
 * The keys of a modal question, caught in the capture phase and kept from the panel: Escape there stops
 * the turn (see App), and without this, closing the question would also break off work nobody asked to
 * break off. A key a focused button takes is kept from the panel too, but not from the button - the
 * press is its default action, which stopping the event does not cancel.
 */
export const useDialogKeys = (
  dialog: RefObject<HTMLElement | null>,
  onAccept: () => void,
  onCancel: () => void,
): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const onOwnButton =
        target instanceof Element && target.closest('button') !== null && (dialog.current?.contains(target) ?? false)
      const action = dialogKey(event.key, onOwnButton)
      if (!action) return

      event.stopPropagation()
      if (action === 'own') return

      event.preventDefault()
      if (action === 'cancel') onCancel()
      else onAccept()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [dialog, onAccept, onCancel])
}
