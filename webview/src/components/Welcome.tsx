import { useEffect, useRef, useState, type PointerEvent } from 'react'
import s from './shell.module.css'
import w from './welcome.module.css'
import { useT } from '../i18n'
import { SPARK_PATH, type Custom } from './Splash'

/**
 * The screen a panel shows once its last tab is closed: an empty speech bubble with a plus in it - the
 * "new chat" everyone already knows from their messengers - drawing itself, above the greeting and the
 * button that opens one.
 *
 * Kin to the splash the panel opens with (Splash.tsx), and meant to read as such: the same gradient
 * strokes written out by hand, the same glow and sparks, and the same three lights - moon, aquamarine,
 * iris - only resting now instead of orbiting. The splash says "here is the plugin"; this one says
 * "nothing is going on, and the next move is yours", so it is smaller and quieter, and the one thing in
 * it that keeps moving on purpose is the plus nudging towards the button now and then.
 */

/** The bubble, in the stage's pixels: a rounded body with its tail at the bottom left. */
const BUBBLE =
  'M64 30H136A18 18 0 0 1 154 48V84A18 18 0 0 1 136 102H88L68 118L72 102H64A18 18 0 0 1 46 84V48A18 18 0 0 1 64 30Z'

/** The plus in the middle of the bubble's body, written after it - upright stroke first, then across. */
const PLUS = [
  { d: 'M100 54V78', at: 0.75 },
  { d: 'M88 66H112', at: 0.95 },
]

/**
 * The sparks around the bubble - the four-pointed one of the splash and of the usage ring - popping out
 * one after another once the plus is written, then twinkling. Centre, size, the twinkle's period and offset.
 */
const SPARKS = [
  { x: 164, y: 22, size: 14, at: 1.0, seconds: 3.6, delay: 0.4, colour: 'var(--acc-accent-light)' },
  { x: 184, y: 50, size: 8, at: 1.15, seconds: 4.2, delay: 1.6, colour: 'var(--acc-agent-light)' },
  { x: 28, y: 112, size: 9, at: 1.3, seconds: 3.9, delay: 0.9, colour: 'var(--acc-branch-light)' },
]

/**
 * The splash's three travellers, off their orbits: each hangs by the bubble and drifts up and down on a
 * period of its own, so the three never settle into step.
 */
const LIGHTS = [
  { x: 26, y: 60, at: 1.2, seconds: 3.2, colour: 'var(--acc-accent)' },
  { x: 178, y: 96, at: 1.3, seconds: 3.9, colour: 'var(--acc-branch)' },
  { x: 148, y: 134, at: 1.4, seconds: 4.6, colour: 'var(--acc-agent)' },
]

/** The stage's size, which everything above is placed in. Mirrored in .stage. */
const STAGE_W = 200
const STAGE_H = 150

/**
 * How long the scene keeps moving with nobody's mouse over it.
 *
 * The panel renders offscreen (see WebviewHost): every frame of an animation is drawn in the browser's
 * process and carried to the IDE as a picture. A screen like this one can be left open for hours - the
 * last tab closed at the end of the day - and hours of drifting lights would be hours of frames nobody
 * watches. So after a while the scene holds still where it is, which reads as a picture rather than as
 * something stuck, and the first movement of the mouse over the panel sets it going from that very spot.
 */
const REST_AFTER_MS = 30_000

interface WelcomeProps {
  onStart: () => void
}

export const Welcome = ({ onStart }: WelcomeProps) => {
  const t = useT()
  const stage = useRef<HTMLDivElement>(null)
  const [resting, setResting] = useState(false)
  // When the mouse last moved here. A ref rather than state: it moves on every pointer event, and the
  // only thing that needs to know is the timer below.
  const stirredAt = useRef(0)

  useEffect(() => {
    if (resting) return

    stirredAt.current = Date.now()
    let timer = 0
    const check = () => {
      const left = stirredAt.current + REST_AFTER_MS - Date.now()
      if (left <= 0) setResting(true)
      else timer = window.setTimeout(check, left)
    }
    timer = window.setTimeout(check, REST_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [resting])

  /*
   * The stage leans a little towards the mouse, as a card on a table does when looked at from the side.
   * Written straight onto the stage's style rather than through state: this runs on every pointer event,
   * and a render per event for two numbers the CSS already knows how to use would be the whole cost.
   */
  const lean = (event: PointerEvent<HTMLDivElement>) => {
    stirredAt.current = Date.now()
    if (resting) setResting(false)

    const box = event.currentTarget.getBoundingClientRect()
    const style = stage.current?.style
    if (!style || box.width === 0 || box.height === 0) return
    style.setProperty('--acc-lean-x', (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3))
    style.setProperty('--acc-lean-y', (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3))
  }

  const straighten = () => {
    const style = stage.current?.style
    style?.setProperty('--acc-lean-x', '0')
    style?.setProperty('--acc-lean-y', '0')
  }

  return (
    <div className={w.welcome} data-resting={resting || undefined} onPointerMove={lean} onPointerLeave={straighten}>
      <div ref={stage} className={w.stage} aria-hidden="true">
        <div className={w.float}>
          <div className={w.glow} />
          <div className={w.ping} />

          <svg className={w.bubble} width={STAGE_W} height={STAGE_H} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
            <defs>
              {/* One sweep across the whole drawing, as on the splash's monogram: the bubble and its plus
                  are lit as one thing rather than each by a gradient inside its own box. */}
              <linearGradient id="acc-welcome-ink" gradientUnits="userSpaceOnUse" x1="46" y1="30" x2="154" y2="118">
                <stop offset="0" className={w.inkMoon} />
                <stop offset="0.55" className={w.inkAqua} />
                <stop offset="1" className={w.inkIris} />
              </linearGradient>
            </defs>
            <g stroke="url(#acc-welcome-ink)">
              <path className={w.outline} d={BUBBLE} pathLength={1} />
              <g className={w.plus}>
                {PLUS.map((stroke) => (
                  <path key={stroke.d} d={stroke.d} pathLength={1} style={{ '--acc-at': `${stroke.at}s` } as Custom} />
                ))}
              </g>
            </g>
          </svg>

          {SPARKS.map((spark) => (
            <span
              key={`${spark.x}:${spark.y}`}
              className={w.spark}
              style={
                {
                  left: `${spark.x - spark.size / 2}px`,
                  top: `${spark.y - spark.size / 2}px`,
                  width: `${spark.size}px`,
                  height: `${spark.size}px`,
                  color: spark.colour,
                  '--acc-at': `${spark.at}s`,
                  '--acc-for': `${spark.seconds}s`,
                  '--acc-from': `-${spark.delay}s`,
                } as Custom
              }
            >
              <svg className={w.twinkle} viewBox="0 0 12 12">
                <path d={SPARK_PATH} fill="currentColor" />
              </svg>
            </span>
          ))}

          {LIGHTS.map((light) => (
            <span
              key={light.colour}
              className={w.light}
              style={
                {
                  left: `${light.x - 3.5}px`,
                  top: `${light.y - 3.5}px`,
                  color: light.colour,
                  '--acc-at': `${light.at}s`,
                  '--acc-for': `${light.seconds}s`,
                } as Custom
              }
            >
              <span className={w.drift} />
            </span>
          ))}
        </div>
      </div>

      <p className={`${s.gateTitle} ${w.title}`}>{t.chrome.noChats.title}</p>
      <button type="button" className={`${s.gateButton} ${w.start}`} onClick={onStart}>
        {t.chrome.noChats.button}
      </button>
    </div>
  )
}
