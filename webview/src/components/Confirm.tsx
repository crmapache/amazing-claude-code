import { useEffect, useRef } from 'react'
import s from './shell.module.css'
import { useT } from '../i18n'

interface ConfirmProps {
  title: string
  /** What exactly the decision affects - the agent's or the command's name, as it stands in the chip. */
  subject: string
  /**
   * What pressing the button will cost, when that takes a sentence to say.
   *
   * Apart from [subject] because the two are different kinds of thing and are set differently: a subject
   * is a name and is cut to one line, while this wraps. Most of these questions need no note at all - the
   * name answers "what exactly" and the title answers "what happens" - but stopping a scenario run also
   * throws away every stage after the one it is on, and a dialog that says less than the button it guards
   * is not worth the press.
   */
  note?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Ask before doing something irreversible.
 *
 * The keys are intercepted in the capture phase and suppressed: Escape in the panel is taken - it stops
 * the turn (see App) - and without this, closing the question would also break off work nobody asked to
 * break off.
 */
export const Confirm = ({ title, subject, note, confirmLabel, onConfirm, onCancel }: ConfirmProps) => {
  const t = useT()
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    confirmRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return

      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') onCancel()
      else onConfirm()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onConfirm, onCancel])

  return (
    <>
      <div className={s.confirmScrim} onClick={onCancel} />
      <div className={s.confirm} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.confirmTitle}>{title}</div>
        <div className={s.confirmSubject}>{subject}</div>
        {note ? <div className={s.confirmNote}>{note}</div> : null}
        <div className={s.confirmActions}>
          <button type="button" className={s.confirmCancel} onClick={onCancel}>
            {t.chrome.confirm.cancel}
          </button>
          <button type="button" className={s.confirmAccept} ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
