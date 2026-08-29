import type { ReactNode } from 'react'
import { useT } from '../i18n'
import type { VoiceHotkeyCap, VoiceHotkeyGlyph } from '../protocol'
import s from './sideMenu.module.css'

/**
 * A hotkey drawn as the keys it is pressed with - one cap each, the way they read on a keyboard.
 *
 * The signs are drawings rather than characters, and that is the whole point of this file. ⌥ and ⌘ are
 * not in the panel's font: written as text they fell through to whatever the system had, in a size and a
 * weight of their own, next to letters set in ours - which is what a hotkey looked like before. A drawing
 * takes the colour and the size of the line it stands in and looks the same on every machine.
 *
 * Which key carries a sign and which carries a word is decided in the IDE (see HotkeyBinding.kt): a Mac
 * prints ⌥ and ⌘ and spells Ctrl and Shift out, Windows prints its own key, Linux has Super.
 */
export const HotkeyCaps = ({ caps }: { caps: VoiceHotkeyCap[] }) => {
  const t = useT()

  return (
    <>
      {caps.map((cap, index) => (
        <kbd className={s.cap} key={index}>
          {cap.side ? (
            <span className={s.capSide}>{cap.side === 'left' ? t.voice.sideLeft : t.voice.sideRight}</span>
          ) : null}
          <Glyph glyph={cap.glyph} />
          {cap.text ? <span>{cap.text}</span> : null}
        </kbd>
      ))}
    </>
  )
}

/**
 * The sign on a key, or nothing when the key is a word.
 *
 * Stroked at the same weight as the microphone beside it and drawn in `currentColor`, so a cap that is
 * one sign and a cap that is one letter carry the same weight on the screen.
 */
const Glyph = ({ glyph }: { glyph: VoiceHotkeyGlyph }) => {
  switch (glyph) {
    // Both strokes of it: the bar over the right half is as much a part of ⌥ as the slope under it, and
    // the slope alone reads as a stray flourish rather than as a key.
    case 'option':
      return (
        <Sign label="Option">
          <path d="M3 6.5h5.5l7 11H21" />
          <path d="M14 6.5h7" />
        </Sign>
      )

    // The woven loop, not four separate rings: the weave is what the eye recognises, and it survives
    // being drawn small far better than four circles that never touch.
    case 'command':
      return (
        <Sign label="Command">
          <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
        </Sign>
      )

    case 'win':
      return (
        <Sign label="Windows">
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </Sign>
      )

    case 'mouse':
      return (
        <Sign label="Mouse">
          <rect x="6" y="3" width="12" height="18" rx="6" />
          <path d="M12 7v4" />
        </Sign>
      )

    default:
      return null
  }
}

const Sign = ({ label, children }: { label: string; children: ReactNode }) => (
  <svg
    className={s.capGlyph}
    viewBox="0 0 24 24"
    role="img"
    aria-label={label}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)
