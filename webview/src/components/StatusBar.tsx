import { EFFORT_SAMPLE, MODE_SAMPLE, MODEL_SAMPLE, modeLabel, modeShortLabel, modelLabel } from '../catalog'
import type { UsageWindow } from '../protocol'
import s from './shell.module.css'

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

interface UsageMetersProps {
  /** Today's tokens across every project - the same "tok" as in a terminal. */
  todayTokens: string
  /** The subscription's usage windows. They come from the agent itself, so they are sometimes empty. */
  usage: { session?: UsageWindow; week?: UsageWindow }
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
export const UsageMeters = ({ todayTokens, usage }: UsageMetersProps) => (
  <div className={s.meters}>
    {usage.session ? (
      <Meter
        percent={usage.session.percent}
        color={paceColor(usage.session.percent, usage.session.resets, FIVE_HOUR_MS)}
        tooltip={windowTooltip('5-hour limit', usage.session)}
      />
    ) : null}

    {usage.week ? <WeekMeter usage={usage.week} /> : null}

    <span className={s.meterTokens} data-tooltip="Tokens spent today, across all projects" data-tooltip-at="top left">
      {todayTokens}
    </span>
  </div>
)

/** The ring's radius in its own coordinates, and the arc length at that radius. */
const RING_RADIUS = 8.5
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** How far to leave the arc "unturned": at 0% there is no ring at all, at 100% it is closed. */
const dashFor = (percent: number): number => RING_LENGTH * (1 - Math.min(100, Math.max(0, percent)) / 100)

interface MeterProps {
  percent: number
  color: string
  /** A pale arc under the main one: the pace one checks against. None means it is not drawn. */
  pace?: number | null
  /** The hover tooltip; a newline in it is a genuine second line. */
  tooltip: string
}

const Meter = ({ percent, color, pace = null, tooltip }: MeterProps) => (
  <span className={s.meter} data-tooltip={tooltip} data-tooltip-at="top left" role="img" aria-label={tooltip}>
    {/* overflow is visible: the arc's round caps stick out past the viewBox. */}
    <svg className={s.meterRing} viewBox="0 0 22 22" aria-hidden="true">
      <circle className={s.meterTrack} cx="11" cy="11" r={RING_RADIUS} />
      {pace === null ? null : (
        <circle
          className={s.meterPace}
          cx="11"
          cy="11"
          r={RING_RADIUS}
          style={{ strokeDasharray: RING_LENGTH, strokeDashoffset: dashFor(pace) }}
        />
      )}
      <circle
        className={s.meterArc}
        cx="11"
        cy="11"
        r={RING_RADIUS}
        style={{ stroke: color, strokeDasharray: RING_LENGTH, strokeDashoffset: dashFor(percent) }}
      />
    </svg>
    <span className={s.meterValue} style={{ color }}>
      {percent}%
    </span>
  </span>
)

interface StatusBarProps {
  model?: string
  effort: string
  mode: string
  onOpen: (kind: SelectorKind, anchor: Anchor) => void
}

/**
 * The bottom line: what we work with (the model, the effort, the mode). The branch and its PR have moved
 * from here into the header - one place for every layout rather than a copy per layout (see Header.tsx).
 * The usage lives in the input field itself, see [UsageMeters].
 */
export const StatusBar = ({ model, effort, mode, onOpen }: StatusBarProps) => (
  <div className={s.status}>
    <div className={s.selectors}>
      <Selectors model={model} effort={effort} mode={mode} onOpen={onOpen} />
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
        <button type="button" className={s.statusPrLink} onClick={onOpenPullRequest} title="Open pull request in browser">
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
  title: string
  className?: string
  onOpen: (anchor: Anchor) => void
}

/** One selector's button (MODEL/EFFORT/MODE). What is exported is the whole row - see [Selectors]. */
const Selector = ({ label, value, sample, title, className = '', onOpen }: SelectorProps) => (
  <button
    type="button"
    className={`${s.selector} ${className}`}
    title={title}
    onClick={(event) => {
      // The menu stands by the button's place rather than by fixed coordinates: the panel comes in any
      // width, and "roughly on the right" misses.
      const rect = event.currentTarget.getBoundingClientRect()
      onOpen({ right: window.innerWidth - rect.right, top: rect.top, bottom: rect.bottom })
    }}
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
export const Selectors = ({ model, effort, mode, auto = false, onOpen }: SelectorsProps) => {
  const grow = auto ? s.selectorAuto : ''

  return (
    <>
      <Selector
        label="MODEL"
        value={modelLabel(model)}
        sample={MODEL_SAMPLE}
        title={`Model: ${modelLabel(model)}`}
        className={grow}
        onOpen={(anchor) => onOpen('model', anchor)}
      />
      <Selector
        label="EFFORT"
        value={effort}
        sample={EFFORT_SAMPLE}
        title={`Reasoning effort: ${effort}`}
        className={grow}
        onOpen={(anchor) => onOpen('effort', anchor)}
      />
      <Selector
        label="MODE"
        value={modeShortLabel(mode)}
        sample={MODE_SAMPLE}
        title={`Permission mode: ${modeLabel(mode)}`}
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

const FIVE_HOUR_MS = 5 * 60 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_DAILY_BUDGET = 14

/**
 * The alarm level by the pace of usage rather than by a bare percentage - the logic is taken from a
 * personal ~/.claude/statusline.sh one to one. 51% over a week with the window almost over is not
 * frightening, while the same percentage on the first day is alarming: we compare the real usage against
 * the line of an even pace up to the reset and colour the deviation from it. Plus an absolute ceiling on
 * top: right at the limit, time no longer saves anyone, whatever the pace.
 * 0 = green, 1 = yellow, 2 = orange, 3 = red.
 */
const paceSeverity = (usedPercent: number, resets: string, windowMs: number): number => {
  const resetMs = resets ? new Date(resets).getTime() : Number.NaN
  const now = Date.now()

  // No reset data, or the window is no longer current (the reset is in the past) - the ceiling only.
  if (!resets || Number.isNaN(resetMs) || resetMs <= now) {
    if (usedPercent >= 96) return 3
    if (usedPercent >= 90) return 2
    return 0
  }

  const elapsedFraction = Math.min(1, Math.max(0, (now - (resetMs - windowMs)) / windowMs))
  const over = usedPercent - elapsedFraction * 100

  let severity = over <= 0 ? 0 : over <= 15 ? 1 : over <= 35 ? 2 : 3
  if (usedPercent >= 96) severity = Math.max(severity, 3)
  else if (usedPercent >= 90) severity = Math.max(severity, 2)

  return severity
}

const SEVERITY_COLOR = ['var(--acc-meter-green)', 'var(--acc-warn)', 'var(--acc-orange)', 'var(--acc-bad-light)']

const paceColor = (usedPercent: number, resets: string, windowMs: number): string =>
  SEVERITY_COLOR[paceSeverity(usedPercent, resets, windowMs)] ?? SEVERITY_COLOR[0]!

/**
 * The context has no window with a reset of its own - only a bare percentage, on a scale of its own. This
 * is the shared source of truth for the thresholds: the context bar in the composer (see Composer.tsx) is
 * coloured and lit by the same levels as this figure - duplicating 50/70/85 in a second place would mean
 * parting them sooner or later.
 */
type ContextLevel = 'green' | 'warn' | 'orange' | 'bad'

const contextLevel = (percent: number): ContextLevel => {
  if (percent < 50) return 'green'
  if (percent < 70) return 'warn'
  if (percent < 85) return 'orange'
  return 'bad'
}

const CONTEXT_LEVEL_COLOR: Record<ContextLevel, string> = {
  green: 'var(--acc-meter-green)',
  warn: 'var(--acc-warn)',
  orange: 'var(--acc-orange)',
  bad: 'var(--acc-bad-light)',
}

export const contextColor = (percent: number): string => CONTEXT_LEVEL_COLOR[contextLevel(percent)]

/** The same pair of glow intensities (80% + 35%) as in the context bar itself. */
const CONTEXT_LEVEL_GLOW: Record<ContextLevel, { strong: string; soft: string }> = {
  green: { strong: 'var(--acc-meter-green-80)', soft: 'var(--acc-meter-green-35)' },
  warn: { strong: 'var(--acc-warn-80)', soft: 'var(--acc-warn-35)' },
  orange: { strong: 'var(--acc-orange-80)', soft: 'var(--acc-orange-35)' },
  bad: { strong: 'var(--acc-bad-light-80)', soft: 'var(--acc-bad-light-35)' },
}

export const contextGlow = (percent: number): { strong: string; soft: string } => CONTEXT_LEVEL_GLOW[contextLevel(percent)]

/**
 * How long is left until the window resets: "2h 41m".
 *
 * The remainder specifically rather than the reset time: it answers one question - hold out or start
 * saving right now - and in this shape the answer does not have to be worked out.
 */
const timeLeft = (resets: string): string | null => {
  const resetMs = resets ? new Date(resets).getTime() : Number.NaN
  if (Number.isNaN(resetMs)) return null

  const minutes = Math.round((resetMs - Date.now()) / 60_000)
  if (minutes <= 0) return null

  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

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
 * The second figure beside the weekly usage is not the share of time elapsed but the window's day number:
 * on the day the limit resets 14% is already available, the next day 28%, and so on (100/7 rounded to a
 * flat 14 - the same logic as in a personal statusline.sh), so that it does not have to be worked out in
 * one's head on every glance at the status bar.
 */
const weekBudgetToday = (resets: string): number | null => {
  if (!resets) return null

  const resetMs = new Date(resets).getTime()
  if (Number.isNaN(resetMs)) return null

  const start = resetMs - WEEK_MS
  const elapsed = Math.max(0, Date.now() - start)
  const day = Math.floor(elapsed / DAY_MS) + 1
  return Math.min(day * WEEK_DAILY_BUDGET, 100)
}

/** An accent of its own for every permission mode - see .selectorPlan and its neighbours. */
const modeClass = (mode: string): string => {
  if (mode === 'plan') return s.selectorPlan ?? ''
  if (mode === 'acceptEdits') return s.selectorAccept ?? ''
  if (mode === 'bypassPermissions') return s.selectorDanger ?? ''
  return ''
}
