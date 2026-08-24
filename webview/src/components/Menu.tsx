import type { Anchor } from './StatusBar'
import s from './shell.module.css'

export interface MenuOption {
  id: string
  label: string
  tag?: string
  danger?: boolean
  sub?: string
  key?: string
  /** Visible but not clickable - unavailable on the current model or account (see modeMenuOptions). */
  disabled?: boolean
}

interface MenuProps {
  title: string
  /** A word about the menu past its title - a key, mostly. Nothing to add is the ordinary case. */
  hint?: string
  width: number
  /** The button the menu was opened from: it stands right above or right below it. */
  anchor: Anchor
  options: MenuOption[]
  selected: string
  onPick: (id: string) => void
  onClose: () => void
}

export const Menu = ({ title, hint, width, anchor, options, selected, onPick, onClose }: MenuProps) => {
  /*
   * The hover highlight is plain CSS :hover and nothing else.
   *
   * It used to be React state fed by mouseenter, because :hover was thought unreliable in JCEF. The
   * state is the unreliable half: JCEF drops a mouseenter often enough that the highlight lit up every
   * other entry, and running both at once was worse still - the browser highlighted the entry under the
   * cursor while the state went on highlighting the one before it, two lit entries at a time. One source
   * of truth, and it is the one that always knows where the cursor is.
   */

  // We stick to the button's right edge but do not let it run off the panel's sides: in the IDE the panel
  // is sometimes narrower than the menu itself.
  const actualWidth = Math.min(width, window.innerWidth - 16)
  const right = Math.min(Math.max(8, anchor.right), Math.max(8, window.innerWidth - actualWidth - 8))

  /*
   * Which way to grow is decided not by the calling code but by the room itself: we compare which there
   * is genuinely more of - above the button or below it. A button in the bottom line almost always opens
   * upwards (the whole feed is above it), a button in the header downwards (there is almost nothing
   * above), while the side rail (MODEL/EFFORT/MODE in left/right, see Composer) adjusts itself to which
   * edge of the screen it
   * happens to be on - without a separate hint for every call site.
   */
  const spaceAbove = anchor.top - 14
  const spaceBelow = window.innerHeight - anchor.bottom - 14
  const openDownward = spaceBelow > spaceAbove

  const verticalStyle = openDownward
    ? { top: `${Math.max(8, anchor.bottom + 6)}px` }
    : { bottom: `${Math.max(8, window.innerHeight - anchor.top + 6)}px` }

  /*
   * The room in the chosen direction is not endless: in compact, for instance, MODE sits not far above
   * the panel's bottom, while its options hold a good hundred pixels of text. Without a ceiling of its
   * own the menu would simply go on growing past the screen - the title and the first entries ran off the
   * edge, out of reach. The max-height in .menu itself (86vh) does not save it: it measures from the
   * whole window rather than from the room genuinely left between the button and the edge. There is
   * deliberately no floor under availableHeight - an artificial minimum would push the menu off the
   * screen just the same when there is less real room than that minimum; the list inside scrolls anyway
   * (see overflow-y in .menu).
   */
  const availableHeight = openDownward ? spaceBelow : spaceAbove
  // No wider than the .menu class's own ceiling (min(640px, 86vh)) - otherwise the inline style silently
  // overrides it for every layout, not only compact.
  const maxHeight = Math.min(640, window.innerHeight * 0.86, Math.max(0, availableHeight))

  return (
    <>
      <div className={s.menuScrim} onClick={onClose} />
      <div
        className={s.menu}
        style={{
          width: `${actualWidth}px`,
          right: `${right}px`,
          maxHeight: `${maxHeight}px`,
          ...verticalStyle,
        }}
      >
        <div className={s.menuHead}>
          <span className={s.menuTitle}>{title}</span>
          {hint ? <span className={s.menuHint}>{hint}</span> : null}
        </div>

        {options.map((option) => {
          const on = option.id === selected
          return (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              className={[s.menuItem, on && s.menuItemOn].filter(Boolean).join(' ')}
              onClick={() => onPick(option.id)}
            >
              <span className={s.menuTick}>{on ? '✓' : ''}</span>
              <div className={s.menuBody}>
                <div className={s.menuRow}>
                  <span className={`${s.menuLabel} ${on ? s.menuLabelOn : ''}`}>{option.label}</span>
                  {option.tag ? (
                    <span className={`${s.menuTag} ${option.danger ? s.menuTagDanger : ''}`}>{option.tag}</span>
                  ) : null}
                </div>
                {option.sub ? <div className={s.menuSub}>{option.sub}</div> : null}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}
