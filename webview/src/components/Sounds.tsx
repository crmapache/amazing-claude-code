import { useEffect, useRef } from 'react'
import type { SoundId } from '../protocol'
import { SOUNDS, isMuted, volumeOf, type SoundPrefs } from '../sounds'
import s from './shell.module.css'

interface SoundsProps {
  prefs: SoundPrefs
  onToggle: (sound: SoundId) => void
  onVolume: (sound: SoundId, volume: number) => void
  /** Play the sound right now - by its name alone there is no telling what one will hear. */
  onPreview: (sound: SoundId) => void
  onClose: () => void
}

/**
 * The keys a slider is genuinely moved with. Releasing any other key changes no volume - and there is
 * nothing for it to sound about: tabbing into the list, a person would get a sound merely from landing
 * on a slider.
 */
const MOVING_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

/**
 * Which occasions call with a sound and how loudly. The list is short and entirely in view: these are
 * not settings for every occasion but the six moments where the panel waits for a person.
 */
export const Sounds = ({ prefs, onToggle, onVolume, onPreview, onClose }: SoundsProps) => {
  /**
   * The end of the fiddling with a slider is caught on the window rather than on the slider itself.
   *
   * Having dragged a slider to its edge, one moves the hand past that edge - and the mouse release no
   * longer goes to it. An ordinary browser would deliver the event to whoever the gesture began on, but
   * the IDE's embedded one renders offscreen and does not carry such a capture through to the page:
   * full volume stayed the one setting that could not be heard. A listener on the window fires wherever
   * the hand is released (tabs are rearranged the same way - see Header).
   */
  const release = useRef<(() => void) | null>(null)

  /**
   * The listener is set at the gesture's start and outlives every frame of it, while by the end the
   * volume is a different one - so it plays through today's wrapper rather than the one that existed at
   * the start. Otherwise, having dragged a slider down to twenty per cent, one hears the previous
   * hundred.
   */
  const preview = useRef(onPreview)
  preview.current = onPreview

  const stopWatchingRelease = () => {
    if (!release.current) return
    window.removeEventListener('mouseup', release.current)
    release.current = null
  }

  const previewOnRelease = (sound: SoundId) => {
    stopWatchingRelease()

    const onUp = () => {
      stopWatchingRelease()
      preview.current(sound)
    }

    release.current = onUp
    window.addEventListener('mouseup', onUp)
  }

  // The panel is closed mid-gesture too: a hanging listener would outlive it.
  useEffect(() => stopWatchingRelease, [])

  return (
    <>
      <div className={s.menuScrim} onClick={onClose} />
      <div className={s.sounds}>
        <div className={s.historyHead}>
          <span className={s.historyLabel}>SOUNDS</span>
          <span className={s.historyHint}>when the panel calls you</span>
        </div>

        <div className={s.soundsBody}>
          {SOUNDS.map((sound) => {
            const on = !isMuted(prefs, sound.id)
            const volume = volumeOf(prefs, sound.id)

            return (
              <div key={sound.id} className={s.soundRow}>
                <div className={s.soundTop}>
                  <button
                    type="button"
                    className={s.soundToggle}
                    onClick={() => onToggle(sound.id)}
                    aria-pressed={on}
                  >
                    <span className={`${s.soundCheck} ${on ? s.soundCheckOn : ''}`}>{on ? '✓' : ''}</span>
                    <span className={s.soundText}>
                      <span className={`${s.soundLabel} ${on ? s.soundLabelOn : ''}`}>{sound.label}</span>
                      <span className={s.soundHint}>{sound.hint}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={s.soundPreview}
                    aria-label={`Play ${sound.label}`}
                    data-tooltip="Play it"
                    onClick={() => onPreview(sound.id)}
                  >
                    ▶
                  </button>
                </div>

                <div className={s.soundVolume}>
                  {/* The slider governs the checkbox too: a switched-off sound and zero volume are one
                      and the same, so dragging it to zero clears the checkbox and raising it back
                      restores it. For a switched-off sound the slider is dimmed but alive: the sound can
                      be turned on with it as well, straight at the volume one wants. */}
                  <input
                    type="range"
                    className={`${s.soundSlider} ${on ? '' : s.soundSliderOff}`}
                    min={0}
                    max={100}
                    step={1}
                    value={volume}
                    aria-label={`${sound.label} volume`}
                    onChange={(event) => onVolume(sound.id, Number(event.target.value))}
                    // Hear the result at once rather than guess how much quieter it has become. Only at
                    // the gesture's end: one per cent at a time would be a mush.
                    onMouseDown={() => previewOnRelease(sound.id)}
                    onKeyUp={(event) => {
                      if (MOVING_KEYS.has(event.key)) onPreview(sound.id)
                    }}
                  />
                  <span className={`${s.soundPercent} ${on ? '' : s.soundPercentOff}`}>{volume}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
