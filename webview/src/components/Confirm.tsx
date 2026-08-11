import { useEffect, useRef } from 'react'
import s from './shell.module.css'

interface ConfirmProps {
  title: string
  /** Что именно затронет решение — имя агента или команды, как оно в чипе. */
  subject: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Спросить, прежде чем делать необратимое.
 *
 * Клавиши перехватываем в фазе перехвата и гасим: Escape в панели занят — он
 * останавливает ход (см. App), — и без этого закрытие вопроса заодно обрывало
 * бы работу, о которой никто не просил.
 */
export const Confirm = ({ title, subject, confirmLabel, onConfirm, onCancel }: ConfirmProps) => {
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
            Cancel
          </button>
          <button type="button" className={s.confirmAccept} ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
