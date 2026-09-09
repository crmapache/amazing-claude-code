import { useEffect, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { CrossIcon } from './icons'
import s from './scenarios.module.css'

/**
 * The layer the hub's three forms stand on.
 *
 * All three used to be cards wedged into the scroll, and that is what they were wrong about: a form that
 * opens inside a list pushes the list down under whoever was reading it, and the new-scenario one holds
 * the screen for half a minute while a model reads the project. On a layer of its own nothing below it
 * moves, and closing it puts the eye back where it was.
 *
 * The same steps of the ladder the help and the confirmation already use, because the three are never
 * open at once (see holiday.module.css, where the whole ladder is written down).
 */
export const Overlay = ({
  title,
  subtitle,
  foot,
  children,
  onClose,
}: {
  title: string
  subtitle?: string
  /** The row at the bottom: a word about what will happen on the left, the buttons on the right. */
  foot?: ReactNode
  children: ReactNode
  onClose: () => void
}) => {
  const t = useT()

  /*
   * Escape closes it, in the capture phase and ahead of the panel's own handler.
   *
   * That one stops the turn on screen, and a form closed with the key that also stopped a conversation
   * behind it would be a keystroke nobody could take back.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <>
      <div className={s.overlayScrim} onClick={onClose} role="presentation" />
      <div className={s.overlay} role="dialog" aria-label={title}>
        <div className={s.overlayHead}>
          <div className={s.overlayTitles}>
            <span className={s.overlayTitle}>{title}</span>
            {subtitle ? <span className={s.overlaySubtitle}>{subtitle}</span> : null}
          </div>
          <button
            type="button"
            className={s.iconButton}
            aria-label={t.common.cancel}
            onClick={onClose}
          >
            <CrossIcon />
          </button>
        </div>

        <div className={s.overlayBody}>{children}</div>

        {foot ? <div className={s.overlayFoot}>{foot}</div> : null}
      </div>
    </>
  )
}
