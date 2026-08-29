import { useEffect, useRef } from 'react'
import s from './shell.module.css'
import { useT } from '../i18n'

interface ConfirmProps {
  title: string
  /** What exactly the decision affects - the agent's or the command's name, as it stands in the chip. */
  subject: string
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
export const Confirm = ({ title, subject, confirmLabel, onConfirm, onCancel }: ConfirmProps) => {
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
      <div className={s.menuScrim} onClick={onCancel} />
      <div className={s.confirm} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.confirmTitle}>{title}</div>
        <div className={s.confirmSubject}>{subject}</div>
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
