import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import w from './splash.module.css'

/**
 * The panel's opening: the ACC monogram writing itself out, its rays catching light, and the panel's
 * three voices circling it - the conversation in moon blue, a fork in aquamarine, a subagent in iris -
 * over the plugin's name. It plays once per page, while the panel underneath is still asking the IDE
 * whether Claude Code is there and signed in, and melts away once that answer is in.
 *
 * A layer over the whole page rather than a screen inside App (main.tsx renders it beside the panel).
 * Inside App it would sit in one of two different trees - the sign-in gate before the answer, the panel
 * after - and the switch between them, which is exactly the moment it covers, would mount it anew and
 * start the whole scene over. So the panel reports that it is ready (markPanelReady) instead of the
 * splash being told through props.
 *
 * The same monogram as the tool window's button (src/main/resources/icons/toolWindow.svg), on the same
 * 20x20 grid, and painted with the panel's own accents rather than the logo's coral: this is the inside of
 * the panel, where the plate would be the one thing on the screen in colours nothing else here uses. The
 * accents are roles, so the light theme repaints the whole scene without a line of its own.
 *
 * Everything moves on CSS alone - see splash.module.css for the timeline and for how an orbit is made of
 * two swings.
 */

/**
 * Whether the panel has what it needs to show something real - the IDE's answer about the CLI and the
 * sign-in. Outside React on purpose: the one who knows (App) and the one who waits (Splash) are not in
 * each other's tree.
 */
let panelReady = false
const readyListeners = new Set<() => void>()

/** Called by App once the IDE has said whether Claude Code is installed and signed in. */
export const markPanelReady = (): void => {
  if (panelReady) return
  panelReady = true
  for (const listener of readyListeners) listener()
}

const subscribeReady = (listener: () => void): (() => void) => {
  readyListeners.add(listener)
  return () => readyListeners.delete(listener)
}

const readReady = (): boolean => panelReady

/**
 * How long the scene holds before it may go: the monogram written, the rays out, the orbits up and the
 * name risen. An answer from the IDE that comes sooner - the usual case - waits for this; one that comes
 * later keeps the splash up, with the loading line showing, until it does.
 */
const HOLD_MS = 2200

/**
 * The splash's patience. An IDE that has not answered by now has something wrong with it, and the screen
 * underneath says so in words ("Checking Claude Code…", or what it found) - hiding that behind a pretty
 * picture would turn a problem into a hang.
 */
const GIVE_UP_MS = 6000

/** The fade that hands the page to the panel. Mirrored in .splash[data-leaving]. */
const LEAVE_MS = 500

/** Stroke by stroke, the way the letter is written by hand: the tick, its crossbar, then the two arcs. */
const LETTERS = [
  { d: 'M1.8 9.6 5.2 2.0 8.6 9.6', at: 0.1, seconds: 0.6 },
  { d: 'M3.1 7.0H7.3', at: 0.55, seconds: 0.3 },
  { d: 'M13.0 7.8A3.4 3.4 0 1 0 13.0 12.6', at: 0.7, seconds: 0.5 },
  { d: 'M17.2 12.0A3.4 3.4 0 1 0 17.2 16.8', at: 0.9, seconds: 0.5 },
]

/**
 * The two fans, up-right and down-left. Each ray is written from the letters outwards, so drawing it
 * along its own length is what makes the fan burst rather than fill in.
 */
const RAYS = [
  'M11.71 5.30 12.53 3.05',
  'M13.68 6.32 15.80 4.20',
  'M14.70 8.29 16.95 7.47',
  'M8.29 14.70 7.47 16.95',
  'M6.32 13.68 4.20 15.80',
  'M5.30 11.71 3.05 12.53',
]

/** When the fan bursts - the moment the last arc is written - and how far apart its rays go off. */
const RAYS_AT = 1.25
const RAYS_STEP = 0.05

/**
 * The same six rays glinting one after another once the fan is out, as a wave across each fan in turn -
 * for as long as the splash stays up waiting for the IDE.
 */
const GLINT_AT = 2.1
const GLINT_STEP = 0.45

/**
 * The two orbits, tilted to cross over the monogram. Sizes are in the stage's pixels, and each orbit is
 * drawn twice from these same numbers - once as the faint ring and once as the path its travellers take
 * (see .orbit) - so the two cannot drift apart.
 */
const ORBITS = [
  { tilt: -22, rx: 112, ry: 32, seconds: 10 },
  { tilt: 28, rx: 96, ry: 26, seconds: 14 },
]

/** Who travels which orbit, and how far round it they already are when the page opens, as a share of the lap. */
const TRAVELLERS = [
  { orbit: 0, colour: 'var(--acc-accent)', lap: 0 },
  { orbit: 0, colour: 'var(--acc-branch)', lap: 0.5 },
  { orbit: 1, colour: 'var(--acc-agent)', lap: 0.3 },
]

/**
 * The sky around it, in the stage's pixels: position of the centre, size, and the twinkle's own period
 * and offset. Kept to the corners, clear of the orbits. The bigger ones are the four-pointed spark the
 * usage ring throws (see StatusBar), the smaller ones plain points - at five pixels a spark is a blur.
 */
const STARS = [
  { x: 26, y: 30, size: 10, seconds: 3.4, delay: 0.2, colour: 'var(--acc-accent-light)' },
  { x: 234, y: 24, size: 8, seconds: 4.1, delay: 1.3, colour: 'var(--acc-agent-light)' },
  { x: 244, y: 128, size: 4, seconds: 2.9, delay: 0.7, colour: 'var(--acc-fg-faint)' },
  { x: 16, y: 150, size: 7, seconds: 3.7, delay: 2.1, colour: 'var(--acc-branch-light)' },
  { x: 218, y: 188, size: 11, seconds: 4.4, delay: 0.9, colour: 'var(--acc-accent-light)' },
  { x: 58, y: 196, size: 4, seconds: 3.1, delay: 1.7, colour: 'var(--acc-fg-faint)' },
  { x: 150, y: 10, size: 4, seconds: 3.9, delay: 2.6, colour: 'var(--acc-agent-light)' },
]

export const SPARK_PATH = 'M6 0L7.1 4.9L12 6L7.1 7.1L6 12L4.9 7.1L0 6L4.9 4.9Z'

/** The stage's size, which the orbits' and the stars' pixels are counted in. Mirrored in .stage. */
const STAGE_W = 260
const STAGE_H = 210

export type Custom = CSSProperties & Record<`--${string}`, string>

/** Motion turned down: a splash is nothing but motion, so there is none - the panel opens as it always did. */
const motionDown = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const Splash = () => {
  const ready = useSyncExternalStore(subscribeReady, readReady)
  const [gone, setGone] = useState(motionDown)
  const [played, setPlayed] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    const hold = window.setTimeout(() => setPlayed(true), HOLD_MS)
    const patience = window.setTimeout(() => setGaveUp(true), GIVE_UP_MS)
    return () => {
      window.clearTimeout(hold)
      window.clearTimeout(patience)
    }
  }, [])

  const leaving = played && (ready || gaveUp)

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setGone(true), LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  if (gone) return null

  return (
    <div
      className={w.splash}
      data-leaving={leaving || undefined}
      // The scene has played out and the IDE is still quiet: only now does the loading line show. An
      // answer that came in time never shows it at all - a bar that appears for the last tenth of a
      // second before everything fades is noise, not news.
      data-waiting={(played && !leaving) || undefined}
      aria-hidden="true"
    >
      <div className={w.stage}>
        <div className={w.float}>
          <div className={w.glow} />
          <div className={w.flash} />

          <svg className={w.rings} width={STAGE_W} height={STAGE_H} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
            {ORBITS.map((orbit) => (
              <ellipse
                key={orbit.tilt}
                cx={STAGE_W / 2}
                cy={STAGE_H / 2}
                rx={orbit.rx}
                ry={orbit.ry}
                transform={`rotate(${orbit.tilt} ${STAGE_W / 2} ${STAGE_H / 2})`}
              />
            ))}
          </svg>

          {STARS.map((star) => (
            <span
              key={`${star.x}:${star.y}`}
              className={w.star}
              style={
                {
                  left: `${star.x - star.size / 2}px`,
                  top: `${star.y - star.size / 2}px`,
                  width: `${star.size}px`,
                  height: `${star.size}px`,
                  color: star.colour,
                  '--acc-for': `${star.seconds}s`,
                  '--acc-at': `-${star.delay}s`,
                } as Custom
              }
            >
              {star.size >= 7 ? (
                <svg className={w.twinkle} viewBox="0 0 12 12">
                  <path d={SPARK_PATH} fill="currentColor" />
                </svg>
              ) : (
                <span className={`${w.twinkle} ${w.point}`} />
              )}
            </span>
          ))}

          <svg className={w.mark} viewBox="-0.35 -0.25 20 20">
            <defs>
              {/* Across the monogram's own grid, the way the logo lights its mark: one sweep over all four
                  strokes rather than a gradient of its own inside each little box. */}
              <linearGradient id="acc-splash-ink" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="17.5" y2="17.5">
                <stop offset="0" className={w.inkMoon} />
                <stop offset="0.55" className={w.inkAqua} />
                <stop offset="1" className={w.inkIris} />
              </linearGradient>
            </defs>
            <g className={w.letters} stroke="url(#acc-splash-ink)">
              {LETTERS.map((letter) => (
                <path
                  key={letter.d}
                  d={letter.d}
                  pathLength={1}
                  style={{ '--acc-at': `${letter.at}s`, '--acc-for': `${letter.seconds}s` } as Custom}
                />
              ))}
            </g>
            <g className={w.rays}>
              {RAYS.map((d, index) => (
                <path
                  key={d}
                  d={d}
                  pathLength={1}
                  style={
                    {
                      '--acc-at': `${RAYS_AT + index * RAYS_STEP}s`,
                      '--acc-glint': `${GLINT_AT + index * GLINT_STEP}s`,
                    } as Custom
                  }
                />
              ))}
            </g>
          </svg>

          {TRAVELLERS.map((traveller) => {
            const orbit = ORBITS[traveller.orbit]!
            return (
              <span
                key={traveller.colour}
                className={w.orbit}
                style={
                  {
                    color: traveller.colour,
                    '--acc-tilt': `${orbit.tilt}deg`,
                    '--acc-rx': `${orbit.rx}px`,
                    '--acc-ry': `${orbit.ry}px`,
                    '--acc-period': `${orbit.seconds}s`,
                    '--acc-delay': `${-traveller.lap * orbit.seconds}s`,
                  } as Custom
                }
              >
                <span className={w.orbitX}>
                  <span className={w.orbitY}>
                    <span className={w.traveller} />
                  </span>
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {/* The product's name, the one line on this screen - a name, so the same in every language. */}
      <p className={w.name}>Amazing Claude Code</p>
      <span className={w.loading} />
    </div>
  )
}
