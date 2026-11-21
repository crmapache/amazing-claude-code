import { createPortal } from 'react-dom'
import { Menu, type MenuOption } from './Menu'

/** Wide enough for the longest entry in ten languages ("Umbenennen" and the like) with the tick's column. */
const WIDTH = 220

/**
 * The panel's own menu (see Menu), opened by a right click: on a conversation's tab (see Header) and on
 * its row in the history (see History). The same box the model and the mode are chosen in, so it reads as
 * the rest of the panel's menus do and keeps what they learned - the highlight fed by movement, Escape
 * that goes no further than the menu.
 *
 * Two things set it apart, and both come from where it is opened:
 *
 * - It stands at the pointer, its left edge there, the way a context menu does. Menu measures from the
 *   right edge, since everywhere else it hangs off a button's right side.
 * - It is drawn into the body, one step up the stack (`raised`). The history is a sheet that slides in by
 *   a transform, and a fixed box inside a transformed one is laid out against that box rather than the
 *   window: the first version, drawn in place, opened past the panel's right edge - out of sight whenever
 *   the panel was wider than the sheet. And the sheet stands at 41, where an ordinary menu would be under it.
 *
 * Opening it takes the browser's own menu away from that spot - and with it "Copy Session ID", which the
 * IDE puts there (see PanelContextMenu.kt). A tab's menu carries that entry itself, for the tab clicked
 * rather than the one on screen.
 */
export const ContextMenu = ({
  x,
  y,
  title,
  options,
  onPick,
  onClose,
}: {
  /** The pointer, in the window's coordinates. */
  x: number
  y: number
  title: string
  options: MenuOption[]
  onPick: (id: string) => void
  onClose: () => void
}) =>
  createPortal(
    <Menu
      title={title}
      width={WIDTH}
      anchor={{ right: window.innerWidth - x - WIDTH, top: y, bottom: y }}
      options={options}
      // The entries are errands, not a choice of one out of several - nothing is ticked.
      selected=""
      onPick={(id) => {
        onClose()
        onPick(id)
      }}
      onClose={onClose}
      raised
    />,
    document.body,
  )
