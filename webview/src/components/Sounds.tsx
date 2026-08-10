import { useEffect, useRef } from 'react'
import type { SoundId } from '../protocol'
import { SOUNDS, isMuted, volumeOf, type SoundPrefs } from '../sounds'
import s from './shell.module.css'

interface SoundsProps {
  prefs: SoundPrefs
  onToggle: (sound: SoundId) => void
  onVolume: (sound: SoundId, volume: number) => void
  /** Проиграть звук прямо сейчас — иначе по названию не понять, что услышишь. */
  onPreview: (sound: SoundId) => void
  onClose: () => void
}

/**
 * Клавиши, которыми ползунок и правда двигают. Отпускание любой другой громкость
 * не меняет — и звучать ему не с чего: дойдя до списка табуляцией, человек
 * получал бы звук от одного того, что встал на ползунок.
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
 * Какие поводы зовут звуком и насколько громко. Список короткий и весь на виду:
 * это не настройки на все случаи жизни, а шесть моментов, в которые панель ждёт
 * человека.
 */
export const Sounds = ({ prefs, onToggle, onVolume, onPreview, onClose }: SoundsProps) => {
  /**
   * Конец возни с ползунком ловим на самом окне, а не на нём.
   *
   * Дотянув ползунок до края, руку уводят за его край — и отпускание мыши
   * достаётся уже не ему. Обычный браузер довёл бы событие до того, на ком жест
   * начался, но встроенный в IDE рисуется офскрин и такой захват до страницы не
   * доносит: громкость на сотне оставалась единственной, которую нельзя было
   * услышать. Слушатель на окне срабатывает, где бы руку ни отпустили (тем же
   * способом переставляются вкладки — см. Header).
   */
  const release = useRef<(() => void) | null>(null)

  /**
   * Слушатель ставится в начале жеста и переживает все его кадры, а громкость к
   * концу уже другая — поэтому проигрывает он не ту обёртку, что была на старте,
   * а сегодняшнюю. Иначе, дотянув ползунок до двадцати процентов, слышишь
   * прежнюю сотню.
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

  // Панель закрывают и посреди жеста: висящий слушатель пережил бы её.
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
                  {/* Ползунок распоряжается и галочкой: выключенный звук и
                      нулевая громкость это одно и то же, поэтому доведённый до
                      нуля снимает её, а поднятый обратно — возвращает. У
                      выключенного он приглушён, но живой: включить звук можно и
                      им, сразу задав нужную громкость. */}
                  <input
                    type="range"
                    className={`${s.soundSlider} ${on ? '' : s.soundSliderOff}`}
                    min={0}
                    max={100}
                    step={1}
                    value={volume}
                    aria-label={`${sound.label} volume`}
                    onChange={(event) => onVolume(sound.id, Number(event.target.value))}
                    // Послушать результат сразу, а не гадать, насколько тише стало.
                    // Только по концу жеста: на каждый процент это была бы каша.
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
