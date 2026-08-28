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
 * Below this height the default layout has nothing left to give the feed - see [layoutForRoom].
 *
 * The number is the sum of what the bottom layout cannot shrink: the header, three lines of the input
 * field, the row with the usage and the buttons, and the status line under it. A panel taller than this
 * shows a conversation; a shorter one shows a composer and nothing else.
 */
export const LOW_PANEL_QUERY = '(max-height: 300px)'

/**
 * The layout the panel is actually drawn with, as opposed to the one the person chose.
 *
 * Dragged to the bottom or the top edge, a tool window gets about two hundred pixels from the platform -
 * and the default layout spends all of them on itself, leaving the feed exactly nothing. The panel then
 * looks like the "it came up empty" of the complaints, except brought on by a drag rather than by
 * anything going wrong.
 *
 * Compact is the answer that already exists for that room (see the type above): the selectors move into
 * the tool row, the status line goes, the field starts at two lines. So a low panel is drawn compact
 * instead - the choice itself is untouched, and the panel returns to it the moment there is height for
 * it again. The other layouts are left alone: left/right spend the height on a rail rather than on rows,
 * and compact is already what this would switch to.
 */
export const layoutForRoom = (chosen: ComposerLayout, low: boolean): ComposerLayout =>
  low && chosen === 'bottom' ? 'compact' : chosen

/**
 * The side rail with MODEL/EFFORT/MODE, the usage and the buttons - running the panel's full height, on
 * the left for left and on the right for right (see App.tsx and Composer.tsx). The column's width is
 * derived from its contents rather than set by hand: unlike the former layout, left/right have no
 * resize handle of their own any more.
 */
export const isSideComposerLayout = (layout: ComposerLayout): boolean => layout === 'left' || layout === 'right'
