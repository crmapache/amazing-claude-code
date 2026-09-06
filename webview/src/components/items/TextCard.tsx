import { RevealProvider } from 'smooth-stream-text/react'
import { paragraphsText } from '../../feed/markdown'
import { useT } from '../../i18n'
import type { TextItem } from '../../feed/types'
import { CopyButton } from './CopyButton'
import { PinButton } from './PinButton'
import { MoreButton } from './MoreButton'
import { Markdown } from './Markdown'
import s from '../feed.module.css'

interface TextCardProps {
  item: TextItem
  /** Open a link from the agent's answer in the system browser rather than inside the webview. */
  onOpenLink: (url: string) => void
  /**
   * Pin this answer over the conversation, or unpin it (see feed/pins.ts). Absent where there is no strip
   * to pin it to - the phone, the same way the reuse button is absent from a message of one's own.
   */
  onPin?: () => void
  pinned: boolean
  /** Whether the strip is already full - the hint says so before the press (see PinButton). */
  pinsFull: boolean
  /**
   * Everything else this answer can do, behind three dots (see MoreButton). Handed in by the phone
   * alone: at the desk each of those actions has a better home than a menu.
   */
  onActions?: () => void
}

/**
 * Past this size the text is shown without the reveal wave. The threshold is well above any live answer:
 * that many characters gather only in a sheet that arrived as a finished piece - a summary after a
 * context compaction, a long file inside an answer.
 */
const REVEAL_LIMIT = 12_000

/**
 * How new text appears: the words come through as a wave from left to right rather than lighting up in a
 * batch.
 *
 * The delay between neighbouring words is deliberately short. The stream arrives here already smoothed,
 * that is, a couple of characters per frame, and every frame gives birth to a portion of the wave: make
 * the pause between them longer than a frame and the queue starts piling up faster than it plays,
 * putting the display a good second behind the answer.
 *
 * The vertical shift is switched off for the same reason of tidiness: with it a word becomes a block for
 * the duration of the animation, and the line around it trembles with rewraps. Opacity with a light blur
 * is enough for "appearing out of nowhere", while the feed stays still.
 */
const REVEAL = {
  unit: 'word',
  durationMs: 340,
  staggerMs: 14,
  blurPx: 4,
  translatePx: 0,
  maxWaveLagMs: 140,
} as const

/**
 * The same wave on a phone, without the blur.
 *
 * A blur is the one part of this animation a device pays real money for: it is a filter on every word
 * separately, that is, a layer of its own per word, redrawn for as long as that word is appearing. A
 * desktop GPU does not notice; a phone, printing an answer word by word, turns it into a stutter - which
 * is exactly what the wave was there to avoid.
 *
 * Opacity and the stagger carry the whole effect anyway: the text still comes through as a wave rather
 * than in batches. The phone client is recognised by the density attribute it sets before the first paint
 * (see mobile/main.tsx and tokens.css) - the same one that makes the cards thumb-sized.
 */
const REVEAL_TOUCH = { ...REVEAL, blurPx: 0 } as const

const isTouchDensity = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.dataset.accDensity === 'touch'

/**
 * A capsule rather than bare text running on with the rest of the feed: it shows at a glance where the
 * technical logs (thoughts, tool calls) ended and the real answer began - the same trick as with a user's
 * message, only from the other side.
 */
export const TextCard = ({ item, onOpenLink, onPin, pinned, pinsFull, onActions }: TextCardProps) => {
  const t = useT()

  /**
   * The reveal wave draws every word as a separate node with an animation of its own - on an ordinary
   * answer that is pretty and costs nothing noticeable, while on a sheet of tens of thousands of words (a
   * summary after a context compaction is exactly that) it turns into tens of thousands of animations at
   * once: the panel froze and then went dark altogether. Long text is shown whole at once - there is
   * nothing to reveal there anyway, it arrives as one piece rather than being printed before one's
   * eyes.
   */
  const length = item.paragraphs.reduce(
    (sum, paragraph) => sum + paragraph.parts.reduce((inner, part) => inner + part.text.length, 0),
    0,
  )
  const reveal = length <= REVEAL_LIMIT

  return (
    <div className={onPin ? `${s.text} ${s.textPinnable}` : s.text} data-copyable>
      {/* In the corner where the copy button has always stood, and beside it rather than instead of it.
          The card has no head to hang them off (a message of one's own has one - see .userActions), so
          the room for them is the card's own right padding, and the second button widens it: hence
          .textPinnable, rather than paying for a button that is not there on every answer. */}
      <div className={s.textActions}>
        {onPin ? <PinButton pinned={pinned} full={pinsFull} className={s.textAction} onPin={onPin} /> : null}
        <CopyButton text={paragraphsText(item.paragraphs)} className={s.textAction} title={t.feed.copyReply} />
        {onActions ? <MoreButton className={s.textAction} label={t.feed.moreActions} onClick={onActions} /> : null}
      </div>

      {/* One wave for the whole card: otherwise every paragraph would start the reveal afresh and the
          text would light up in steps rather than in one motion. */}
      {reveal ? (
        <RevealProvider resetKey={item.id} {...(isTouchDensity() ? REVEAL_TOUCH : REVEAL)}>
          <Markdown paragraphs={item.paragraphs} reveal onOpenLink={onOpenLink} />
        </RevealProvider>
      ) : (
        <Markdown paragraphs={item.paragraphs} onOpenLink={onOpenLink} />
      )}
    </div>
  )
}

