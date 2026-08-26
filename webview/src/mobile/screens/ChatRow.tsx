import { useRef, useState } from 'react'
import { chatState, type ChatState } from '../projects'
import type { SessionEntry } from './Sessions'
import m from '../mobile.module.css'

interface ChatRowProps {
  session: SessionEntry
  onOpen: () => void
  onHide: () => void
}

/** How far the row slides to uncover the button behind it - the button's own width. */
const REVEAL = 88

/** Past half of it, letting go opens rather than closes. */
const CATCH = REVEAL / 2

/** Enough movement to call it a swipe rather than a tap that wandered. */
const SLOP = 8

/** Idle has no class of its own: the base .chatDot is already the unlit one. */
const DOT: Record<ChatState, string> = {
  crashed: m.dotCrashed ?? '',
  attention: m.dotAttention ?? '',
  running: m.dotRunning ?? '',
  done: m.dotDone ?? '',
  idle: '',
}

/**
 * One conversation in the list, with the swipe that puts it away.
 *
 * Hiding is not closing, and the difference is the whole point: the conversation goes on at the desk,
 * its process untouched - it simply stops taking up a row on a screen the size of a hand. A project
 * with eight conversations open is unusable on a phone long before it is a problem at a keyboard.
 *
 * The gesture is written by hand rather than taken from a library because it is twenty lines and the
 * library would be forty kilobytes over the mobile data of somebody answering one question.
 */
export const ChatRow = ({ session, onOpen, onHide }: ChatRowProps) => {
  const [offset, setOffset] = useState(0)

  /**
   * Where the row stands right now, kept beside the state rather than read out of it.
   *
   * A touch can deliver its move and its end inside one frame - a quick flick does exactly that - and
   * state read from the closure is then still the value from the last render. The gesture ended by
   * measuring against zero and sprang back: the swipe simply did not take, and only sometimes.
   */
  const at = useRef(0)

  /** Where the row stood when this touch began, so a second drag continues rather than restarts. */
  const from = useRef(0)

  const start = useRef<{ x: number; y: number } | null>(null)

  /** Which way this touch turned out to be going: across the row, or down the list. */
  const across = useRef<boolean | null>(null)

  /** A tap that moved is not a tap - without this every swipe would also open the conversation. */
  const moved = useRef(false)

  const slide = (value: number) => {
    at.current = value
    setOffset(value)
  }

  const begin = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return

    start.current = { x: touch.clientX, y: touch.clientY }
    from.current = at.current
    across.current = null
    moved.current = false
  }

  const move = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    const began = start.current
    if (!touch || !began) return

    const dx = touch.clientX - began.x
    const dy = touch.clientY - began.y

    // Decided once per touch and not revisited: a gesture that changes its mind halfway is one that
    // fights the list's own scrolling all the way down.
    if (across.current === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      across.current = Math.abs(dx) > Math.abs(dy)
    }

    if (!across.current) return

    moved.current = true
    slide(Math.min(0, Math.max(-REVEAL, from.current + dx)))
  }

  const end = () => {
    if (across.current) slide(at.current < -CATCH ? -REVEAL : 0)
    start.current = null
    across.current = null
  }

  return (
    <div className={m.chatSlot}>
      <button
        type="button"
        className={m.chatHide}
        // Reachable by the gesture and by nothing else: an always-visible button on every row would be
        // one more thing between a person and the conversation they came here for.
        tabIndex={offset === 0 ? -1 : 0}
        onClick={() => {
          slide(0)
          onHide()
        }}
      >
        Hide
      </button>

      <button
        type="button"
        // Square where the two meet, round on the outside: while the button is uncovered the row and it
        // are one shape rather than two things standing next to each other.
        className={`${m.chat} ${offset === 0 ? '' : m.chatOpen}`}
        // The row gives way rather than slides off: dragged bodily to the left, a short title ends up
        // past the card's left edge and the row a person is deciding about goes blank. Narrowing keeps
        // every word where it was and uncovers the button in the room that frees up.
        style={{ width: `calc(100% - ${-offset}px)` }}
        onTouchStart={begin}
        onTouchMove={move}
        onTouchEnd={end}
        onTouchCancel={end}
        onClick={() => {
          // A swipe that ended on this row, and the first tap afterwards puts it back rather than
          // opening what is underneath.
          if (moved.current || at.current !== 0) {
            slide(0)
            return
          }

          onOpen()
        }}
      >
        {/*
            The same mark the panel's tabs carry, in the same colours and in the same order of precedence
            (see sessionState in App.tsx): a dead process first, then what is waiting for a person, then
            work in progress, then work that is done, and unlit for a conversation that has never done
            anything yet.

            It used to be a word on the right - "waiting", "working" - and a word is what the eye reads
            last on a list of titles; whether anything on this screen needs answering is a question of
            colour, answered before a single title is read.

            Unlit is drawn rather than left out, so a title starts at the same place on every row: a list
            whose text steps left and right by nine pixels reads as broken.
        */}
        <span className={`${m.chatDot} ${DOT[chatState(session)]}`} />

        <span className={m.chatTitle}>{session.title}</span>
      </button>
    </div>
  )
}
