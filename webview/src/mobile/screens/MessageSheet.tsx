import { clipboardMessage } from '../../feed/tokens'
import { paragraphsText } from '../../feed/markdown'
import { isPinnable, pinLine } from '../../feed/pins'
import type { FeedItem } from '../../feed/types'
import { Sheet } from './Sheet'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

interface MessageSheetProps {
  item: FeedItem
  pinned: boolean
  /** Whether the strip over the feed is already full - the pin row says so instead of failing quietly. */
  pinsFull: boolean
  onQuote: (text: string) => void
  onFork: () => void
  onPin: () => void
  onClose: () => void
}

/**
 * What else one message can do: quote it, fork from it, copy it, pin it.
 *
 * A sheet rather than four buttons on the card, and rather than the panel's arrangement. At the desk a
 * quote is made by selecting the words it should be and a fork is a slash command typed into the field -
 * neither exists under a thumb: there is no selection menu on a touchscreen worth the name, and typing
 * a command means losing whatever draft was in the field. So the card carries three dots, and the dots
 * carry the four things.
 *
 * Copying goes through the panel's own rule (see clipboardText): a message travels with the PATHS of
 * what was attached to it rather than with the captions its chips wear, because a caption means
 * something inside this app and nothing in a terminal or a task.
 */
export const MessageSheet = ({
  item,
  pinned,
  pinsFull,
  onQuote,
  onFork,
  onPin,
  onClose,
}: MessageSheetProps) => {
  const t = useT()

  const text = textOf(item)
  const canPin = isPinnable(item) && (pinned || !pinsFull)

  return (
    <Sheet title={t.mobile.message.title} onClose={onClose}>
      {/* What is about to be acted on, in one line under a rule: four verbs with no subject above them
          is a menu one has to remember the way into. */}
      <p className={m.selectedLine}>{isPinnable(item) ? pinLine(item) : text.slice(0, 160)}</p>

      <button
        type="button"
        className={m.sheetAction}
        onClick={() => {
          onQuote(text)
          onClose()
        }}
      >
        <span className={m.sheetActionGlyph} style={{ color: 'var(--acc-c-orchid)' }}>
          ❝
        </span>
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{t.mobile.message.quote}</span>
        </span>
      </button>

      {/* Forking is the one action here that starts something: a conversation of one's own carrying
          everything up to this point. Allowed over the wire for the same reason starting a conversation
          is - it is no more than sending a message, which starts a process too (see RemoteCommands). */}
      <button type="button" className={m.sheetAction} onClick={onFork}>
        <span className={m.sheetActionGlyph} style={{ color: 'var(--acc-branch-light)' }}>
          ⑂
        </span>
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{t.mobile.message.fork}</span>
          <span className={m.sheetActionHint}>{t.mobile.message.forkHint}</span>
        </span>
      </button>

      <button
        type="button"
        className={m.sheetAction}
        onClick={() => {
          void navigator.clipboard?.writeText(text)
          onClose()
        }}
      >
        <span className={m.sheetActionGlyph}>⧉</span>
        <span className={m.sheetActionText}>
          <span className={m.sheetActionName}>{t.mobile.message.copy}</span>
        </span>
      </button>

      {/*
        Pinning, where there is a strip to pin to.

        The phone did not have one, and the reason written down was that a page in a pocket is thrown out
        by the browser - so a pin would not survive being put away. That is true and it is the right price
        here: a pin is a bookmark in something being read, not work that would be lost. What is not
        acceptable is a button that fails silently, so a full strip says so instead of doing nothing.
      */}
      {isPinnable(item) && (
        <button
          type="button"
          className={`${m.sheetAction} ${canPin ? '' : m.sheetActionOff}`}
          disabled={!canPin}
          onClick={() => {
            onPin()
            onClose()
          }}
        >
          <span className={m.sheetActionGlyph}>⚲</span>
          <span className={m.sheetActionText}>
            <span className={m.sheetActionName}>
              {pinned ? t.mobile.message.unpin : t.mobile.message.pin}
            </span>
            {!canPin && <span className={m.sheetActionHint}>{t.mobile.message.pinsFull}</span>}
          </span>
        </button>
      )}
    </Sheet>
  )
}

/**
 * The message as text, by whose message it is.
 *
 * One's own goes through the panel's clipboard rule - paths rather than chip captions - while an answer
 * is its paragraphs flattened, which is what the copy button on the card already hands out.
 */
const textOf = (item: FeedItem): string => {
  if (item.kind === 'user') return clipboardMessage(item)
  if (item.kind === 'text') return paragraphsText(item.paragraphs)

  return ''
}
