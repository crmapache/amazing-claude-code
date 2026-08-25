import { useState } from 'react'
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
  /**
   * A glyph in the place of the tick - for a menu whose entries are not a choice of one out of several
   * but separate errands (see Thanks.tsx): there is nothing to tick there, while the column the tick
   * stands in is exactly the width of an icon.
   */
  icon?: string
  /** The icon's paint. The default is the accent's, as the tick's is. */
  iconTone?: 'accent' | 'warn'
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
   * The entry under the cursor, by its id - the same way the command hint above the input field does it
   * (see .suggestItemOn in SlashSuggest), and for the same reason: inside the IDE the panel is an
   * offscreen browser, and there CSS :hover does not always fire when the cursor crosses from one entry
   * straight into the next. That is exactly how a menu is used - the cursor never leaves it between the
   * entries - so the highlight simply stayed behind on the entry it started from.
   *
   * The state is fed by movement rather than by entering: mouseenter is a single event, and losing it
   * loses the highlight until the cursor leaves the menu altogether, while a movement is a stream - the
   * very next one puts the highlight right, whatever was dropped before it. What is asked on every one
   * of them is what lies under the cursor now, so the answer cannot go stale.
   *
   * Only one source of truth: the CSS :hover rule for an entry is gone. Both at once is what used to
   * light two entries at a time - the browser's under the cursor, ours on the one before it.
   */
  const [hot, setHot] = useState<string | null>(null)

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
        /* One handler for the whole list rather than one per entry: a disabled entry gets no mouse events
           of its own (the browser swallows them), and here that arrives as a movement over the menu with
           no entry under it - which is precisely "nothing is highlighted". */
        onMouseMove={(event) => {
          const item = event.target instanceof Element ? event.target.closest('[data-menu-entry]') : null
          setHot(item?.getAttribute('data-menu-entry') ?? null)
        }}
        onMouseLeave={() => setHot(null)}
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
              data-menu-entry={option.id}
              /* The chosen entry keeps its own accent under the cursor - it is already marked, and
                 swapping that for the grey of a hover would read as losing the tick. */
              className={[s.menuItem, on && s.menuItemOn, !on && hot === option.id && s.menuItemHot]
                .filter(Boolean)
                .join(' ')}
              // The movement above keeps the highlight true; this one lights the entry the moment the
              // cursor steps into it, without waiting for the next movement inside it.
              onMouseEnter={() => setHot(option.id)}
              onClick={() => onPick(option.id)}
            >
              <span className={`${s.menuTick} ${option.iconTone === 'warn' ? s.menuIconWarn : ''}`}>
                {option.icon ?? (on ? '✓' : '')}
              </span>
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
