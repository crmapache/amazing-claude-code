import type { MenuOption } from './components/Menu'

/**
 * Where the input field sits. bottom - at the bottom, full width, as before. compact - at the bottom
 * too, but a dense layout for limited height (the panel in the IDE's bottom dock): without a separate
 * status line and an expanded task list, with as much room as possible given to the feed. left/right -
 * a narrow side column running the panel's full height with MODEL/EFFORT/MODE, the usage and the
 * buttons (the same rail compact uses - see isSideComposerLayout), while the feed and the input field
 * sit on the other side, one above the other.
 */
export type ComposerLayout = 'left' | 'bottom' | 'right' | 'compact'

export const COMPOSER_LAYOUT_OPTIONS: MenuOption[] = [
  { id: 'bottom', label: 'Default' },
  { id: 'compact', label: 'Compact' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
]

/** The shell sends the layout straight out of the settings - an old or foreign value counts as "bottom". */
export const normalizeComposerLayout = (value: string | undefined): ComposerLayout =>
  value === 'left' || value === 'right' || value === 'compact' ? value : 'bottom'

/**
 * The side rail with MODEL/EFFORT/MODE, the usage and the buttons - running the panel's full height, on
 * the left for left and on the right for right (see App.tsx and Composer.tsx). The column's width is
 * derived from its contents rather than set by hand: unlike the former layout, left/right have no
 * resize handle of their own any more.
 */
export const isSideComposerLayout = (layout: ComposerLayout): boolean => layout === 'left' || layout === 'right'
