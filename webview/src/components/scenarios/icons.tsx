import type { ReactNode } from 'react'

/**
 * The three marks on a shelf row - and the cross on every other icon button of these screens - drawn
 * rather than typed.
 *
 * They used to be ◷, ⧉ and ×, which read fine and were three different fonts: the first two are not in
 * the panel's console font and fall through to whatever the system has, each at its own size, weight
 * and vertical position. The button centred the LINE BOX of the glyph, and the ink inside it sat where
 * that font put it - measured in the harness, the clock's ink two pixels below the button's centre, the
 * two squares half a pixel above it, the cross one below. Three buttons in a row, three heights, and the
 * one in the middle looked like the one that was wrong. Which font it falls through to is the IDE's
 * choice too (--acc-mono is the console font from its settings), so the same row stood differently on
 * every machine.
 *
 * Drawn on one 16-unit grid at one stroke, the three centre by construction and weigh the same, and no
 * font gets a say. The grid and the stroke are ScenariosMark's, the mark on the button that opens this
 * screen; the size is the pin's and the reuse arrow's in the feed (see PinIcon, ReuseArrow).
 */
const ICON_SIZE = 12

const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 16 16"
    width={ICON_SIZE}
    height={ICON_SIZE}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

/** A run waiting for its hour: a clock face with the hands at a little past two. */
export const ClockIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.8V8l2.2 1.5" />
  </Icon>
)

/** A copy of a scenario: two sheets, the front one whole and the back one behind it. */
export const DuplicateIcon = () => (
  <Icon>
    <rect x="5.6" y="5.6" width="7.4" height="7.4" rx="1.4" />
    <path d="M3 10.4V4.4A1.4 1.4 0 0 1 4.4 3h6" />
  </Icon>
)

/** Delete, remove, close: the same cross wherever an icon button of these screens takes something away. */
export const CrossIcon = () => (
  <Icon>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </Icon>
)
