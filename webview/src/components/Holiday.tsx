import s from './holiday.module.css'

/**
 * The two decorations that are nodes of their own - the garland under the header and the snow behind
 * the feed. The third, the frozen Send button, is not a node at all: it is the button's own fill under
 * [data-holiday] (see composer.module.css), so the whole 26px still take the click.
 *
 * Both are rendered by the panel and only by the panel (App.tsx). Nothing here goes into Feed: the feed
 * is shared with the phone (mobile/screens/Thread.tsx), and a phone snowed on through a shared component
 * would be a decoration nobody asked for on a screen with its own header and its own composer.
 */

/** One tile of the swag, in the SVG's own units. The bulbs hang off the dip in the middle of it. */
const SPAN = 72

/**
 * Enough bulbs for a panel wider than any monitor; the rest are clipped by the strip's overflow.
 *
 * A count rather than a measurement: knowing the width would mean a ResizeObserver and a re-render per
 * drag of the tool window's edge, and the whole thing is twenty-four dots.
 */
const BULBS = 24

/**
 * The panel's own accents, in the order they read best next to one another. No new hues: a garland in
 * colours the panel does not otherwise use is the thing that would clash with the theme.
 */
const COLOURS = [
  'var(--acc-bad)',
  'var(--acc-ok)',
  'var(--acc-warn)',
  'var(--acc-accent)',
  'var(--acc-agent)',
  'var(--acc-branch)',
]

/** Out-of-step blinking. Sorted delays would read as a wave running down the wire rather than as lights. */
const DELAYS = [0, -0.5, -1.1, -0.3, -1.7, -0.9, -2.2, -1.4, -0.7, -2.6, -1.9]

/**
 * The wire with its lights, one line directly under the header.
 *
 * The swag is a pattern rather than a stretched path: at 72px a tile it keeps its shape whether the
 * panel is a narrow tool window or half a monitor, while one path scaled to the width would flatten
 * into a straight line on a wide panel.
 */
export const Garland = () => (
  <div className={s.garland} aria-hidden="true">
    <svg className={s.wire} width="100%" height="15">
      <defs>
        <pattern id="acc-garland-wire" width={SPAN} height="15" patternUnits="userSpaceOnUse">
          <path
            d={`M0 2 Q ${SPAN / 2} 12 ${SPAN} 2`}
            fill="none"
            stroke="var(--acc-line-hover)"
            strokeWidth="1.4"
          />
        </pattern>
      </defs>
      <rect width="100%" height="15" fill="url(#acc-garland-wire)" />
    </svg>

    {Array.from({ length: BULBS }, (_, index) => (
      <span
        key={index}
        className={s.bulb}
        style={{
          left: `${SPAN / 2 + index * SPAN - 2.5}px`,
          color: COLOURS[index % COLOURS.length],
          animationDelay: `${DELAYS[index % DELAYS.length]}s`,
        }}
      />
    ))}
  </div>
)

/**
 * left, size, seconds it takes to fall, and how far into the fall it already is.
 *
 * Twelve where there were ten: a fifth more snow in the air, which is what "heavier" means for a
 * snowfall - the flakes themselves stay the size and the brightness they were.
 */
const FLAKES = [
  { left: 8, size: 2, fall: 15, delay: -1 },
  { left: 19, size: 3, fall: 21, delay: -6 },
  { left: 31, size: 2, fall: 17, delay: -11 },
  { left: 44, size: 2, fall: 24, delay: -3 },
  { left: 56, size: 3, fall: 19, delay: -14 },
  { left: 67, size: 2, fall: 26, delay: -8 },
  { left: 78, size: 2, fall: 16, delay: -19 },
  { left: 89, size: 3, fall: 22, delay: -4 },
  { left: 37, size: 2, fall: 28, delay: -22 },
  { left: 73, size: 2, fall: 18, delay: -16 },
  { left: 14, size: 2, fall: 20, delay: -9 },
  { left: 62, size: 2, fall: 23, delay: -25 },
]

/**
 * The flakes, over the feed and under everything one can click.
 *
 * Only transform and opacity move, so a falling flake composites and never asks the feed to repaint a
 * line of code. A flake that reaches the bottom of the feed is gone - see the note on .snow about the
 * drift that used to heap up there.
 */
export const Snowfall = () => (
  <div className={s.snow} aria-hidden="true">
    {FLAKES.map((flake, index) => (
      <span
        key={index}
        className={s.flake}
        style={{
          left: `${flake.left}%`,
          width: `${flake.size}px`,
          height: `${flake.size}px`,
          animationDuration: `${flake.fall}s`,
          animationDelay: `${flake.delay}s`,
        }}
      />
    ))}
  </div>
)
