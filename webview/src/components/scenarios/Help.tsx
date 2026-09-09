import { useEffect, useRef } from 'react'
import { useT } from '../../i18n'
import { CrossIcon } from './icons'
import s from './scenarios.module.css'

/**
 * Four lines about what a scenario is, and not a fifth.
 *
 * Everything here answers a question somebody actually has on this screen - what is it, what happens when
 * I press play, where does it live, what do I get - and a page nobody reads answers none of them.
 */
export const Help = ({ onClose }: { onClose: () => void }) => {
  const t = useT()
  const close = useRef(onClose)
  close.current = onClose

  // Escape closes this before the panel sees it: there it stops the turn, and a window somebody opened to
  // read should not break off work nobody asked to break off (the search window is guarded the same way).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close.current()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <>
      <div className={s.helpScrim} onClick={onClose} />
      <div className={s.help} role="dialog" aria-modal="true" aria-label={t.scenarios.help.title}>
        <div className={s.helpHead}>
          <span className={s.helpTitle}>{t.scenarios.help.title}</span>
          <button type="button" className={s.iconButton} aria-label={t.common.close} onClick={onClose}>
            <CrossIcon />
          </button>
        </div>
        <div className={s.helpList}>
          {([
            ['what', t.scenarios.help.what],
            ['asks', t.scenarios.help.asks],
            ['run', t.scenarios.help.run],
            ['kept', t.scenarios.help.kept],
            ['watch', t.scenarios.help.watch],
          ] as const).map(([id, line]) => (
            <p key={id}>
              <span className={s.helpLead}>{line.lead}</span> {line.text}
            </p>
          ))}
        </div>
      </div>
    </>
  )
}
