import type { ReactNode } from 'react'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

interface SheetProps {
  title: string
  /** The line under the title, where one is worth a line: what the sheet applies to. */
  meta?: string
  /** A count in the header's own corner, as the command and file lists carry ("4 of 11"). */
  count?: string
  /** How tall it may grow, as a share of the screen. The lists want more of it than the short ones do. */
  height?: string
  /** The row of buttons along the bottom, inside the safe area. Absent on a sheet that only lists. */
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
}

/**
 * The one bottom sheet every sheet in this app is.
 *
 * Six of them now (tabs, the run's settings, a message's actions, commands, files, limits) and they
 * were on their way to being six copies of the same forty lines: a scrim, a grab handle, a header with
 * a cross, a body that scrolls, a footer that respects the home indicator. What differs between them is
 * the content, and everything that does not differ belongs in one place - the first thing to drift
 * otherwise is the one that matters, which is that the sheet stops short of the bottom of the screen.
 *
 * A sheet rather than a screen wherever the answer is "pick one of these and come back". A screen costs
 * the way back and the loss of what is behind it; the two things a phone is worst at.
 */
export const Sheet = ({ title, meta, count, height, footer, onClose, children }: SheetProps) => {
  const t = useT()

  return (
    // The scrim closes it, which is the gesture everyone already has. It is not the sheet: a tap inside
    // the sheet must not count as a tap outside it.
    <div className={m.sheetScrim} onClick={onClose}>
      <div className={m.sheet} style={height ? { maxHeight: height } : undefined} onClick={(event) => event.stopPropagation()}>
        <div className={m.sheetGrab} />

        <div className={m.sheetHead}>
          <span className={m.sheetTitleGroup}>
            <span className={m.sheetTitle}>{title}</span>
            {meta ? <span className={m.sheetMeta}>{meta}</span> : null}
          </span>
          {count ? <span className={m.sheetCount}>{count}</span> : null}
          <button type="button" className={m.sheetClose} aria-label={t.common.close} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={m.sheetBody}>{children}</div>

        {footer ? <div className={m.sheetFooter}>{footer}</div> : null}
      </div>
    </div>
  )
}
