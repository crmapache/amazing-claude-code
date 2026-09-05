import { memo, useMemo } from 'react'
import { pinHint, pinLine, type PinnedItem } from '../feed/pins'
import { useT } from '../i18n'
import s from './feed.module.css'
import { PinIcon } from './items/PinButton'

/**
 * The name over the agent's own pinned line.
 *
 * A constant rather than a line in the dictionaries, for the same reason the products advertised in the
 * side menu are (see AUTHOR_PRODUCT): a name is the same in all ten languages, and put in a dictionary it
 * would need an exception in SHARED_WITH_ENGLISH for nine of them. The word over one's own line is a word
 * rather than a name, and comes from the dictionary as it always did.
 */
const CLAUDE = 'CLAUDE'

interface PinnedBarProps {
  /** The pinned messages, in the order they stand in the conversation - see pinnedRows. */
  items: readonly PinnedItem[]
  onJump: (id: string) => void
  onUnpin: (id: string) => void
  /**
   * The strip's own element, handed back so the feed can measure it: what it covers, the feed keeps as
   * slack at its top (see .pins and pinsHeight in Feed). Told about its going away too - the callback is
   * given null then, and the slack goes back to nothing.
   */
  boxRef?: (element: HTMLElement | null) => void
}

/**
 * The pinned messages, over the conversation they belong to.
 *
 * Lying over the top of the feed rather than standing above it, and that is about one thing: pinning
 * something must not move what is on screen. A strip in the flow takes its height out of the scroller,
 * so everything being read slides by that much the moment a pin goes up or comes off - and a mark put on
 * a message is not an event in the conversation. What it covers, the feed keeps as slack at its top (see
 * .pins and pinsHeight in Feed), so the shelf lies over empty room rather than over the first message.
 *
 * One line each, cut by the browser at whatever width the panel happens to be, and the rest on hover (see
 * pinLine and pinHint): three pins are a table of contents, not three messages read twice.
 */
export const PinnedBar = ({ items, onJump, onUnpin, boxRef }: PinnedBarProps) => {
  if (items.length === 0) return null

  return (
    <div className={s.pins} ref={boxRef}>
      {items.map((item) => (
        <PinnedRow key={item.id} item={item} onJump={onJump} onUnpin={onUnpin} />
      ))}
    </div>
  )
}

/**
 * One pinned line.
 *
 * memo, and the two walks of the text inside it are memoized again on the item itself: the strip stands
 * over a feed that repaints on every chunk of an answer being printed below it, while a message that was
 * pinned does not change at all - and a pinned paste is a hundred kilobytes to walk.
 *
 * The line and the cross are two buttons side by side rather than one inside the other: a button inside a
 * button is not markup a browser will keep.
 */
const PinnedRow = memo(({
  item,
  onJump,
  onUnpin,
}: {
  item: PinnedItem
  onJump: (id: string) => void
  onUnpin: (id: string) => void
}) => {
  const t = useT()
  const line = useMemo(() => pinLine(item), [item])
  const hint = useMemo(() => pinHint(item), [item])

  return (
    <div className={s.pin}>
      <button
        type="button"
        className={s.pinGo}
        // The whole of what would not fit, and only on hover: the line itself is the reminder, the hint is
        // for when the reminder is not enough to tell two of them apart.
        data-tooltip={hint}
        data-tooltip-at="bottom"
        onClick={() => onJump(item.id)}
      >
        {/* The same shape as the button that made this line - that is what ties the two together. */}
        <PinIcon filled size={11} className={s.pinMark} />
        <span className={s.pinWho}>{item.kind === 'user' ? t.feed.you : CLAUDE}</span>
        <span className={s.pinText}>{line}</span>
      </button>

      <button
        type="button"
        className={s.pinOff}
        aria-label={t.feed.pin.remove}
        data-tooltip={t.feed.pin.remove}
        data-tooltip-at="bottom left"
        onClick={() => onUnpin(item.id)}
      >
        ×
      </button>
    </div>
  )
})

PinnedRow.displayName = 'PinnedRow'
