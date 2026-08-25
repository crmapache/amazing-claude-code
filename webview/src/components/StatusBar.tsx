import { EFFORT_SAMPLE, MODE_SAMPLE, MODEL_SAMPLE, modeLabel, modeShortLabel, modelLabel } from '../catalog'
import {
  FIVE_HOUR_MS,
  paceColor,
  RING_LENGTH,
  RING_RADIUS,
  ringDash,
  timeLeft,
  WEEK_MS,
  weekBudgetToday,
} from '../feed/usage'
import type { UsageWindow } from '../protocol'
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

export interface RingProps {
  percent: number
  color: string
  /** A pale arc under the main one: the pace one checks against. None means it is not drawn. */
  pace?: number | null
  /** In pixels, when the ring is not the status line's own 22 - the phone's is bigger. */
  size?: number
}

interface MeterProps extends RingProps {
  /** The hover tooltip; a newline in it is a genuine second line. */
  tooltip: string
}

/**
 * The ring alone, without the figure beside it or the tooltip over it.
 *
 * Exported because the phone draws exactly this one, only bigger and in a layout of its own (see
 * mobile/screens/Composer): the geometry - the radius, the stroke, which way the arc turns - is the
 * kind of thing that is copied once and then quietly drifts.
 */
export const Ring = ({ percent, color, pace = null, size }: RingProps) => (
  // overflow is visible: the arc's round caps stick out past the viewBox.
  <svg
    className={s.meterRing}
    viewBox="0 0 22 22"
    style={size === undefined ? undefined : { width: size, height: size }}
    aria-hidden="true"
  >
    <circle className={s.meterTrack} cx="11" cy="11" r={RING_RADIUS} />
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

const Meter = ({ percent, color, pace = null, tooltip }: MeterProps) => (
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
    <Ring percent={percent} color={color} pace={pace} />
    <span className={s.meterValue} style={{ color }}>
      {percent}%
    </span>
  </span>
)

interface StatusBarProps {
  model?: string
  /**
   * The model the person chose, when the conversation is running on another one - see Selectors. Empty
   * whenever the two agree, which is nearly always.
   */
  switchedFrom?: string
  effort: string
  mode: string
  onOpen: (kind: SelectorKind, anchor: Anchor) => void
  onOpenThanks: (anchor: Anchor) => void
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
export const StatusBar = ({ model, switchedFrom, effort, mode, onOpen, onOpenThanks }: StatusBarProps) => (
  <div className={s.status}>
    <div className={s.selectors}>
      <Selectors model={model} switchedFrom={switchedFrom} effort={effort} mode={mode} onOpen={onOpen} />
    </div>

    <div className={s.spacer} />

    <ThanksButton onOpen={onOpenThanks} />
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
   * The model the person chose, given only when the conversation is running on a different one: the CLI
   * moved it there by itself (see ModelSwitchItem). Then the MODEL button wears an accent and says in its
   * tooltip whose doing this was - otherwise the selector looks as though it had wandered off on its own,
   * and the panel as though it changed the choice behind one's back.
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
        title={
          switchedFrom
            ? `Model: ${modelLabel(model)} - Claude Code switched to it on its own; your choice is ${modelLabel(switchedFrom)}`
            : `Model: ${modelLabel(model)}`
        }
        className={`${grow} ${switchedFrom ? s.selectorSwitched ?? '' : ''}`}
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

/** An accent of its own for every permission mode - see .selectorPlan and its neighbours. */
const modeClass = (mode: string): string => {
  if (mode === 'plan') return s.selectorPlan ?? ''
  if (mode === 'acceptEdits') return s.selectorAccept ?? ''
  if (mode === 'bypassPermissions') return s.selectorDanger ?? ''
  return ''
}
