import { EFFORT_SAMPLE, MODE_SAMPLE, MODEL_SAMPLE, modeLabel, modeShortLabel, modelLabel } from '../catalog'
import {
  FIVE_HOUR_MS,
  limitWindowName,
  limitWindowRing,
  paceColor,
  RING_LENGTH,
  RING_RADIUS,
  ringDash,
  timeLeft,
  WEEK_MS,
  weekBudgetToday,
} from '../feed/usage'
import type { ExtraUsage, UsageWindow } from '../protocol'
import { FeedbackButton } from './Feedback'
import s from './shell.module.css'
import { ThanksButton } from './Thanks'

export type SelectorKind = 'model' | 'effort' | 'mode'

/**
 * Where a selector's button stands - both vertical edges rather than one: the menu decides for itself
 * whether to grow up or down, by where there is genuinely room (see Menu), and it needs both edges
 * regardless of which way it ends up opening.
 */
export interface Anchor {
  right: number
  top: number
  bottom: number
}

/**
 * A button's place on the screen, in the shape the menu wants it. Measured from the button itself rather
 * than counted from fixed coordinates: the panel comes in any width, and "roughly on the right" misses.
 * Shared by everyone who opens a menu from a button of their own - the selectors here and the heart beside
 * them (see Thanks.tsx).
 */
export const anchorFrom = (button: HTMLElement): Anchor => {
  const rect = button.getBoundingClientRect()
  return { right: window.innerWidth - rect.right, top: rect.top, bottom: rect.bottom }
}

interface UsageMetersProps {
  /** Today's tokens across every project - the same "tok" as in a terminal. */
  todayTokens: string
  /** The subscription's usage windows. They come from the agent itself, so they are sometimes empty. */
  usage: { session?: UsageWindow; week?: UsageWindow; extra?: ExtraUsage }
}

/**
 * The subscription's usage: the five-hour window, the weekly one and the day's volume of work.
 *
 * It lives in the input field's own bottom row rather than in the status line under it: that is where one
 * looks while deciding what to write next - whether the limit will stretch to a long turn - and the
 * figures should be where the hand is.
 *
 * A ring beside the figure rather than a bare figure: the share is read out of the corner of the eye,
 * without adding percentages in one's head, while the ring takes up no more room than the line.
 *
 * The context fill is deliberately not here: it is already drawn as a bar above the field itself (see
 * Composer), and a second figure about the same thing would only take up room.
 */
export const UsageMeters = ({ todayTokens, usage }: UsageMetersProps) => {
  /**
   * Which ring burns, when one does. The window that ran out is the one being paid past, and a five-hour
   * one and a weekly one are two different rings: painting the five-hour ring for an exhausted week would
   * point at a window that is fine.
   */
  const burning = usage.extra?.active ? limitWindowRing(usage.extra.window) : null

  return (
    <div className={s.meters}>
      {/* The burning ring stands instead of the window's share rather than beside it: that window is used
          up, its percentage is stuck at a hundred, and a figure that cannot change any more says nothing.
          What matters now is that the work is being paid for - so the ring is closed, painted its own
          colour, left without a number and set alight, and the tooltip says the rest. */}
      {burning === 'session' ? (
        <Meter percent={100} color="var(--acc-extra)" value="" flame tooltip={extraTooltip(usage.extra!)} />
      ) : usage.session ? (
        <Meter
          percent={usage.session.percent}
          color={paceColor(usage.session.percent, usage.session.resets, FIVE_HOUR_MS)}
          tooltip={windowTooltip('5-hour limit', usage.session)}
        />
      ) : null}

      {burning === 'week' ? (
        <Meter percent={100} color="var(--acc-extra)" value="" flame tooltip={extraTooltip(usage.extra!)} />
      ) : usage.week ? (
        <WeekMeter usage={usage.week} />
      ) : null}

      <span
        className={s.meterTokens}
        data-tooltip="Tokens spent today, across all projects"
        data-tooltip-at="top left"
        data-tooltip-kind="meter"
      >
        {todayTokens}
      </span>
    </div>
  )
}

/**
 * The id of the blur the heat is drawn with. One for the whole page on purpose: the filter is the same for
 * every burning ring, and two rings burn at once at most (the composer's row and the phone's sheet).
 */
const FLAME_HEAT = 'acc-flame-heat'

/** The tighter blur that gives each spark its halo - see .flameSparkGlow. */
const FLAME_GLOW = 'acc-flame-glow'

export interface RingProps {
  percent: number
  color: string
  /** A pale arc under the main one: the pace one checks against. None means it is not drawn. */
  pace?: number | null
  /** In pixels, when the ring is not the status line's own 22 - the phone's is bigger. */
  size?: number
  /** The ring burns: the plan's ceiling is behind and the meter is running (see FlameRing). */
  flame?: boolean
}

interface MeterProps extends RingProps {
  /** The hover tooltip; a newline in it is a genuine second line. */
  tooltip: string
  /**
   * What stands beside the ring, when it is not the percentage: an empty string leaves the ring alone
   * (see the extra usage ring in UsageMeters).
   */
  value?: string
}

/**
 * The ring alone, without the figure beside it or the tooltip over it.
 *
 * Exported because the phone draws exactly this one, only bigger and in a layout of its own (see
 * mobile/screens/Composer): the geometry - the radius, the stroke, which way the arc turns - is the
 * kind of thing that is copied once and then quietly drifts.
 */
export const Ring = ({ percent, color, pace = null, size, flame = false }: RingProps) => (
  // overflow is visible: the arc's round caps stick out past the viewBox.
  <svg
    className={s.meterRing}
    viewBox="0 0 22 22"
    style={size === undefined ? undefined : { width: size, height: size }}
    aria-hidden="true"
  >
    <circle className={s.meterTrack} cx="11" cy="11" r={RING_RADIUS} />
    {flame ? <Flames /> : null}
    {pace === null ? null : (
      <circle
        className={s.meterPace}
        cx="11"
        cy="11"
        r={RING_RADIUS}
        style={{ strokeDasharray: RING_LENGTH, strokeDashoffset: ringDash(pace) }}
      />
    )}
    <circle
      className={s.meterArc}
      cx="11"
      cy="11"
      r={RING_RADIUS}
      style={{ stroke: color, strokeDasharray: RING_LENGTH, strokeDashoffset: ringDash(percent) }}
    />
  </svg>
)

/**
 * The sparks, and where each leaves the ring.
 *
 * `angle` is a place on the ring, in degrees from the top - all the way round, because the ring smokes
 * from wherever it happens to, not out of its crown. Spaced unevenly on purpose: two close together, then
 * a gap. `size`, `rise` and the period are all slightly different from spark to spark - in step they would
 * beat like an indicator rather than smoke - and the negative delay starts each one part-way up instead of
 * all of them at rest.
 */
const SPARKS = [
  { angle: 14, size: 1.1, rise: 1.15, seconds: 1.9, delay: 0 },
  { angle: 63, size: 0.9, rise: 0.95, seconds: 1.45, delay: 0.7 },
  { angle: 112, size: 1.05, rise: 1.1, seconds: 1.75, delay: 1.25 },
  { angle: 158, size: 0.85, rise: 0.85, seconds: 1.5, delay: 0.4 },
  { angle: 204, size: 1, rise: 1, seconds: 2, delay: 1 },
  { angle: 253, size: 1.1, rise: 1.05, seconds: 1.6, delay: 0.25 },
  { angle: 299, size: 0.95, rise: 0.9, seconds: 1.8, delay: 0.85 },
  { angle: 337, size: 1.05, rise: 1.2, seconds: 1.35, delay: 1.45 },
]

/** The four-pointed spark, drawn in a box of its own twelve by twelve - see SPARK_SCALE. */
const SPARK_PATH = 'M6 0L7.1 4.9L12 6L7.1 7.1L6 12L4.9 7.1L0 6L4.9 4.9Z'

/**
 * How much of that box is left. Set by the smallest ring rather than the biggest: on the composer's own
 * twenty-two pixels anything finer than about five of them across simply is not seen, and the sheet's
 * forty-four-pixel ring scales it up along with everything else.
 */
const SPARK_SCALE = 0.52

/** How far up a spark gets before it is gone, in the drawing's units - times its own share (see [rise]). */
const SPARK_RISE = 6.4

/** The outer edge of the ring: half the stroke past its radius, which is where the metal actually ends. */
const RING_EDGE = RING_RADIUS + 1.9

/** A spark's starting point on that edge, at the given angle from the top. */
const sparkAt = (angle: number): { x: number; y: number } => {
  const radians = (angle * Math.PI) / 180

  return { x: 11 + RING_EDGE * Math.sin(radians), y: 11 - RING_EDGE * Math.cos(radians) }
}

/**
 * How far a spark rises: the whole way when it leaves the top of the ring, a fifth of it at the bottom.
 *
 * Not a flourish but the way round a real problem. Everything rises straight up, so a spark from below has
 * the ring's own metal above it - given the full height it would sail through the hole in the middle, and
 * a star crossing the inside of the ring reads as something loose rather than as smoke. Cut short, it
 * fades while still against the metal, exactly as a wisp of smoke does with something in its way.
 */
const sparkRise = (angle: number): number => {
  const upwards = (1 + Math.cos((angle * Math.PI) / 180)) / 2

  return 0.2 + 0.8 * upwards
}

/**
 * The ring smoking with sparks - the extra usage one, and nothing else.
 *
 * Sparks rather than a glow: a glow around a ring is a ring, and the thing worth noticing out of the
 * corner of an eye is that this one is *burning*. So eight little stars lift off it and go straight up, the
 * way smoke does - each from its own place anywhere along the ring's edge, at its own size, to its own
 * height, on its own period, turning as it goes and coming apart into nothing. Nothing shares a rhythm
 * with anything else, so the smoke never comes back into step while somebody is watching.
 *
 * The ones from below rise barely at all, and that is deliberate - see sparkRise.
 *
 * Under them lies the heat: one dim blurred circle that swells and gives way. It is what makes the sparks
 * look lit rather than drawn, and it stays faint, because the ring is what has to be read.
 *
 * Two groups per spark rather than one, because each does a job the other would overwrite: the outer one
 * is what the animation moves, the inner one holds the star's own place, size and centring.
 *
 * The blur is an SVG filter rather than the CSS one: this ring is drawn at twenty pixels and at forty-four
 * (see the phone's Limits sheet), and a blur in screen pixels would be twice as soft on the small one.
 * Everything that moves is a transform or an opacity - the two the browser animates on the compositor,
 * without laying the page out again.
 */
const Flames = () => (
  <>
    <defs>
      <filter id={FLAME_HEAT} x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="1.1" />
      </filter>
      <filter id={FLAME_GLOW} x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="0.7" />
      </filter>
    </defs>

    <circle className={s.flameHeat} cx="11" cy="11" r={RING_RADIUS + 0.6} filter={`url(#${FLAME_HEAT})`} />

    {SPARKS.map((spark) => (
      <g
        key={spark.angle}
        className={s.flameSpark}
        style={{
          animationDuration: `${spark.seconds}s`,
          animationDelay: `-${spark.delay}s`,
          ['--acc-rise' as string]: `${-SPARK_RISE * spark.rise * sparkRise(spark.angle)}px`,
        }}
      >
        <g
          transform={`translate(${sparkAt(spark.angle).x} ${sparkAt(spark.angle).y}) scale(${SPARK_SCALE * spark.size}) translate(-6 -6)`}
        >
          {/* The same star twice: a blurred, wider copy under a sharp one. At this size the halo is what
              makes a spark visible at all - a five-pixel shape with no light around it reads as a speck of
              dust on the screen. */}
          <path className={s.flameSparkGlow} d={SPARK_PATH} filter={`url(#${FLAME_GLOW})`} />
          <path className={s.flameSparkStar} d={SPARK_PATH} />
        </g>
      </g>
    ))}
  </>
)

const Meter = ({ percent, color, pace = null, tooltip, value, flame = false }: MeterProps) => {
  const caption = value ?? `${percent}%`

  return (
    <span
      className={s.meter}
      data-tooltip={tooltip}
      data-tooltip-at="top left"
      // The two-full-lines drawing rather than a button caption's - Tooltips carries the mark over onto
      // the shared element (see tooltip.module.css).
      data-tooltip-kind="meter"
      role="img"
      aria-label={tooltip}
    >
      <Ring percent={percent} color={color} pace={pace} flame={flame} />
      {caption ? (
        <span className={s.meterValue} style={{ color }}>
          {caption}
        </span>
      ) : null}
    </span>
  )
}

interface StatusBarProps {
  model?: string
  /** The model the agent moved this conversation off by itself, when it did - see Selectors. */
  switchedFrom?: string
  effort: string
  mode: string
  onOpen: (kind: SelectorKind, anchor: Anchor) => void
  onOpenThanks: (anchor: Anchor) => void
  onOpenFeedback: () => void
}

/**
 * The bottom line: what we work with (the model, the effort, the mode), and at the row's far end the heart
 * (see Thanks.tsx). The branch and its PR have moved from here into the header - one place for every
 * layout rather than a copy per layout (see Header.tsx). The usage lives in the input field itself, see
 * [UsageMeters].
 *
 * The heart is pinned to the opposite edge by a spacer rather than by the row's alignment: the selectors
 * keep the width they need, the heart keeps the far end, and the gap between them is whatever is left -
 * so nothing moves when the model or the mode changes.
 */
export const StatusBar = ({ model, switchedFrom, effort, mode, onOpen, onOpenThanks, onOpenFeedback }: StatusBarProps) => (
  <div className={s.status}>
    <div className={s.selectors}>
      <Selectors model={model} switchedFrom={switchedFrom} effort={effort} mode={mode} onOpen={onOpen} />
    </div>

    <div className={s.spacer} />

    {/* The two of them as one group: this row spaces its parts widely (the selectors on one side, the
        buttons on the other), while these two belong together and sit at the selectors' own spacing. */}
    <div className={s.endPair}>
      <FeedbackButton onOpen={onOpenFeedback} />
      <ThanksButton onOpen={onOpenThanks} />
    </div>
  </div>
)

interface BranchChipProps {
  gitBranch?: string
  pullRequest?: string
  onOpenPullRequest?: () => void
}

/**
 * The branch and its PR - exported on the same principle as [Selector]: compact shows the same chip in
 * its own row beside the tasks rather than in a separate status line (see TaskListPanel.tsx), while its
 * look and behaviour have to stay the same.
 */
export const BranchChip = ({ gitBranch, pullRequest, onOpenPullRequest }: BranchChipProps) => {
  if (!gitBranch) return null

  return (
    <span className={s.statusItem}>
      <span className={s.statusBranch}>{gitBranch}</span>
      {pullRequest ? (
        <button
        type="button"
        className={s.statusPrLink}
        onClick={onOpenPullRequest}
        data-tooltip="Open pull request in browser"
        data-tooltip-at="top left"
      >
          PR #{pullRequest}
        </button>
      ) : (
        <span className={s.statusPr}>no PR</span>
      )}
    </span>
  )
}

/**
 * The weekly window: under the bright usage arc lies a pale arc of the even pace, that is, how much of
 * the limit is already "due" by today. While the bright one is shorter than the pale one, we are on plan
 * - and that is visible without reading a single figure. That same budget used to stand as a second
 * number after a slash, but two percentages in a row had to be compared in one's head every time.
 */
const WeekMeter = ({ usage }: { usage: UsageWindow }) => {
  const budget = weekBudgetToday(usage.resets)

  return (
    <Meter
      percent={usage.percent}
      color={paceColor(usage.percent, usage.resets, WEEK_MS)}
      pace={budget}
      tooltip={
        budget === null
          ? windowTooltip('Weekly limit', usage)
          : `${windowTooltip('Weekly limit', usage)}\nDim ring: ${budget}% even-pace budget for today`
      }
    />
  )
}

interface SelectorProps {
  label: string
  value: string
  /** The longest possible value: the width is measured by it - see the markup below. */
  sample: string
  hint: string
  className?: string
  onOpen: (anchor: Anchor) => void
}

/** One selector's button (MODEL/EFFORT/MODE). What is exported is the whole row - see [Selectors]. */
const Selector = ({ label, value, sample, hint, className = '', onOpen }: SelectorProps) => (
  <button
    type="button"
    className={`${s.selector} ${className}`}
    /* The panel's own hint rather than the native title: the native one does not unfold in the IDE's
       browser at all, and on this button in particular there is something to read - a MODEL wearing the
       accent explains by nothing else why it does (see Selectors below and Tooltips). */
    data-tooltip={hint}
    data-tooltip-at="top left"
    onClick={(event) => onOpen(anchorFrom(event.currentTarget))}
  >
    <span className={s.selectorLabel}>{label}</span>
    {/*
      The width is held by an invisible longest option, while the value itself lies over it and does not
      count towards the width at all. Otherwise the button is measured by whatever is chosen right now:
      "Ask" is narrower than "Bypass", "low" than "ultracode" - and every switch would shift its
      neighbours along the row.
    */}
    <span className={s.selectorValue}>
      <span className={s.selectorSample} aria-hidden="true">
        {sample}
      </span>
      <span className={s.selectorText}>{value}</span>
    </span>
    <Chevron />
  </button>
)

interface SelectorsProps {
  model?: string
  /**
   * The model the agent moved this conversation OFF by itself, given only when it did (see
   * PanelState.switchedFrom). Then the MODEL button wears an accent and says in its hint whose doing this
   * was - otherwise the selector looks as though it had wandered off on its own, and the panel as though
   * it changed the choice behind one's back.
   */
  switchedFrom?: string
  effort: string
  mode: string
  /** The row shares the width evenly rather than standing as fixed buttons - see .selectorAuto. */
  auto?: boolean
  onOpen: (kind: SelectorKind, anchor: Anchor) => void
}

/**
 * The whole row of three selectors. Assembled here rather than as a copy in every layout: their captions,
 * tooltips and width samples are one and the same, and they must not drift apart between the status line,
 * compact and the side rail.
 */
export const Selectors = ({ model, switchedFrom, effort, mode, auto = false, onOpen }: SelectorsProps) => {
  const grow = auto ? s.selectorAuto : ''

  return (
    <>
      <Selector
        label="MODEL"
        value={modelLabel(model)}
        sample={MODEL_SAMPLE}
        hint={
          switchedFrom
            ? `Model: ${modelLabel(model)} - Claude Code switched to it on its own, off ${modelLabel(switchedFrom)}`
            : `Model: ${modelLabel(model)}`
        }
        className={`${grow} ${switchedFrom ? s.selectorSwitched ?? '' : ''}`}
        onOpen={(anchor) => onOpen('model', anchor)}
      />
      <Selector
        label="EFFORT"
        value={effort}
        sample={EFFORT_SAMPLE}
        hint={`Reasoning effort: ${effort}`}
        className={grow}
        onOpen={(anchor) => onOpen('effort', anchor)}
      />
      <Selector
        label="MODE"
        value={modeShortLabel(mode)}
        sample={MODE_SAMPLE}
        hint={`Permission mode: ${modeLabel(mode)}`}
        className={`${grow} ${modeClass(mode)}`}
        onOpen={(anchor) => onOpen('mode', anchor)}
      />
    </>
  )
}

/** A tidy chevron instead of ▼: the typographic triangle has a weight and a look of its own. */
const Chevron = () => (
  <svg className={s.selectorCaret} viewBox="0 0 10 6" aria-hidden="true">
    <path d="M1 1.4 5 5 9 1.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * A window's tooltip: the share and, when it is known, how long until the reset. "When" specifically: for
 * a window that has just reset, nobody knows the next reset time yet - it will begin with the very first
 * turn - and then the line about the reset is not written at all. It used to say "Resets in soon" there,
 * which in that case meant exactly the opposite: not "any moment" but "unknown".
 */
const windowTooltip = (title: string, usage: UsageWindow): string => {
  const left = timeLeft(usage.resets)

  return left === null ? `${title}: ${usage.percent}% used` : `${title}: ${usage.percent}% used\nResets in ${left}`
}

/**
 * The extra usage tooltip: what the unnumbered ring means, and how much of the month's budget for it has
 * gone when the account says. Without that share it still says the main thing - the plan's limit is
 * behind us and the work is being billed.
 */
const extraTooltip = (extra: ExtraUsage): string => {
  const window = limitWindowName(extra.window)
  const named = window ? `the ${window} limit` : 'the limit'
  const spent = extra.percent === undefined ? '' : `\n${extra.percent}% of the monthly extra usage spent`

  return `Extra usage: ${named} is used up, the work is billed on top of the plan${spent}`
}

/** An accent of its own for every permission mode - see .selectorPlan and its neighbours. */
const modeClass = (mode: string): string => {
  if (mode === 'plan') return s.selectorPlan ?? ''
  if (mode === 'acceptEdits') return s.selectorAccept ?? ''
  if (mode === 'bypassPermissions') return s.selectorDanger ?? ''
  return ''
}
