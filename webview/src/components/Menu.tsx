import { useEffect, useRef, useState, type ReactNode } from 'react'
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
   * stands in is exactly the width of an icon. A glyph or a drawing: the card's menu carries the very
   * drawings its buttons used to wear (see UserCard), since ↩ and ⟲ are not in the panel's font.
   */
  icon?: ReactNode
  /**
   * The icon's paint. The default is the accent's, as the tick's is; `dim` is a switch that is off, and an
   * errand drawn in the card's own faint ink.
   */
  iconTone?: 'accent' | 'warn' | 'dim'
  /** The label drawn in this font family - a font's own name in the list of fonts (see Appearance). */
  labelFont?: string
}

const PAST_MENU_ATTRIBUTE = 'data-past-menu'
const PAST_MENU = `[${PAST_MENU_ATTRIBUTE}]`

/**
 * Spread on a control the pointer reaches through an open menu (see the scrim in Menu): it lights up under
 * the pointer and takes the first click, and the menu closes on that click.
 *
 * Only for what is safe to press on the way out of a menu - it scrolls, opens or shows, and the worst a
 * stray click does is put something in front of the person. Nothing that allows, sends or takes away.
 * And never the button a menu is opened from: it would get the click after the menu closed and open it
 * again.
 */
export const pastMenu = { [PAST_MENU_ATTRIBUTE]: true }

/**
 * The control marked with [pastMenu] the pointer stands over beyond a menu's scrim, if any.
 *
 * [stack] is everything under the pointer, topmost first (document.elementsFromPoint), the scrim among it
 * or not - not, while it stands aside. Only what lies right under the scrim counts: a marked control
 * further down is covered there by something else, and the pointer is not over it.
 */
export const controlPastMenu = (stack: readonly Element[], scrim: Element): Element | null =>
  stack.find((element) => element !== scrim)?.closest(PAST_MENU) ?? null

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
  /** One step up the stack and a scrim over the header too - a right-click menu's (see ContextMenu). */
  raised?: boolean
}

export const Menu = ({ title, hint, width, anchor, options, selected, onPick, onClose, raised = false }: MenuProps) => {
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

  /*
   * Escape closes the menu and goes no further. Left to travel, it reached the panel's own handler, and
   * there Escape is Stop: a person backing out of a menu stopped the turn the agent was running (see the
   * keydown handler in App). Capture on the window is the earliest place a key is heard on this page, so
   * the field under the menu does not see it either. A key an input method is assembling a character out
   * of belongs to it, as everywhere in the panel.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  /*
   * The scrim takes every click beside the menu and closes it, so that a click into nowhere does not land
   * on whatever lies under it (a form's backdrop would shut the form). A control a person heads for
   * straight from the menu is the exception: the jump to the latest message took two clicks - one to close
   * the menu, one for itself - and lit nothing under the pointer on the way. Lifting it above the scrim,
   * as the selectors are, cannot work: it stands in the feed's .content, whose translateZ(0) is a stacking
   * context of its own, and no z-index inside one reaches past it.
   *
   * The same goes for whatever in the feed opens a file or a picture - a chip, a path, the line of what the
   * editor showed: the menu is open over a message, and what that message points at is the next thing
   * reached for.
   *
   * So over such a control (see pastMenu) the scrim steps aside, and the control gets the pointer itself:
   * its hover, its hint and the hand cursor (the last two are read from the element under the mouse, see
   * Tooltips and the cursor in App), the picture behind a chip, and then its click - on which the menu
   * closes, as on any click beside it. Asked on every movement, for the same reason as the highlight of
   * the entries: one lost event must not leave the scrim open or shut. Written on the node rather than
   * through state: a movement is no reason to render.
   */
  const scrim = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const own = scrim.current
      if (!own) return
      const control = controlPastMenu(document.elementsFromPoint(event.clientX, event.clientY), own)
      own.style.pointerEvents = control ? 'none' : ''
    }

    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(PAST_MENU)) onClose()
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [onClose])

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
      <div
        ref={scrim}
        className={`${s.menuScrim} ${raised ? s.menuScrimRaised : ''}`}
        onClick={onClose}
        // A right click beside a right-click menu puts it away rather than opening the browser's own on top.
        onContextMenu={
          raised
            ? (event) => {
                event.preventDefault()
                onClose()
              }
            : undefined
        }
      />
      <div
        className={`${s.menu} ${raised ? s.menuRaised : ''}`}
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
              <span
                className={`${s.menuTick} ${option.iconTone === 'warn' ? s.menuIconWarn : option.iconTone === 'dim' ? s.menuIconDim : ''}`}
              >
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
