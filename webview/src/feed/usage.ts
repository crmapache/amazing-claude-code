/**
 * How the usage gauges are read: the ring's geometry, the colour of a window by its pace, and the
 * colour of the context by its fill.
 *
 * Apart from the components because two screens draw them now - the status line at the desk (see
 * StatusBar) and the composer on the phone (see mobile/screens/Composer). A phone showing 61% in
 * orange while the panel shows the same 61% in green would be worse than a phone showing nothing: the
 * whole point of the colour is that it can be trusted without reading the figure.
 *
 * The thresholds themselves are taken from a personal ~/.claude/statusline.sh one to one.
 */

/**
 * Which window a limit event is about, in the words a person uses - the CLI's own names for them, not a
 * guess.
 *
 * The weekly ones come per model as well as in general: an exhausted Opus week with the shared one still
 * half full is an ordinary state of affairs, and "your weekly limit is used up" would then be a lie about
 * the whole subscription. An unfamiliar name gives an empty string rather than itself: a new bucket in a
 * later CLI must not turn into "your seven_day_whatever limit" in the panel.
 *
 * Here rather than in the feed because two things read it: the row in the feed (see rate_limit_event in
 * build.ts) and the tooltip on the burning ring (see UsageMeters).
 */
const LIMIT_WINDOW_NAME: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'weekly',
  seven_day_opus: 'weekly Opus',
  seven_day_sonnet: 'weekly Sonnet',
  seven_day_oauth_apps: 'weekly apps',
  seven_day_overage_included: 'weekly, extra usage included',
  overage: 'extra usage',
}

export const limitWindowName = (window: string | undefined): string => LIMIT_WINDOW_NAME[window ?? ''] ?? ''

/**
 * Which of the two rings the window belongs to: the five-hour one or the weekly one.
 *
 * It decides which ring burns while extra usage is being spent. Everything weekly - the shared window and
 * the per-model ones alike - belongs to the weekly ring; anything else, an unfamiliar name included, goes
 * to the five-hour one, because that is the window that runs out several times a day and is nearly always
 * the one meant.
 */
export const limitWindowRing = (window: string | undefined): 'session' | 'week' =>
  window?.startsWith('seven_day') ? 'week' : 'session'

/** The ring's radius in its own coordinates, and the arc length at that radius. */
export const RING_RADIUS = 8.5

export const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** How far to leave the arc "unturned": at 0% there is no ring at all, at 100% it is closed. */
export const ringDash = (percent: number): number =>
  RING_LENGTH * (1 - Math.min(100, Math.max(0, percent)) / 100)

export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

const WEEK_DAILY_BUDGET = 14

/**
 * The alarm level by the pace of usage rather than by a bare percentage. 51% over a week with the
 * window almost over is not frightening, while the same percentage on the first day is alarming: we
 * compare the real usage against the line of an even pace up to the reset and colour the deviation
 * from it. Plus an absolute ceiling on top: right at the limit, time no longer saves anyone, whatever
 * the pace. 0 = green, 1 = yellow, 2 = orange, 3 = red.
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

export const paceColor = (usedPercent: number, resets: string, windowMs: number): string =>
  SEVERITY_COLOR[paceSeverity(usedPercent, resets, windowMs)] ?? SEVERITY_COLOR[0]!

/**
 * The context has no window with a reset of its own - only a bare percentage, on a scale of its own.
 * This is the shared source of truth for the thresholds: the context bar in the composer, the vertical
 * scale beside a narrow field and the phone's own bar are coloured and lit by the same levels -
 * duplicating 50/70/85 in a second place would mean parting them sooner or later.
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

export const contextGlow = (percent: number): { strong: string; soft: string } =>
  CONTEXT_LEVEL_GLOW[contextLevel(percent)]

/**
 * How long is left until the window resets: "2h 41m".
 *
 * The remainder specifically rather than the reset time: it answers one question - hold out or start
 * saving right now - and in this shape the answer does not have to be worked out. Null when nobody
 * knows yet: a window that has just reset has no next reset time until the very first turn, and
 * "resets soon" would then mean exactly the opposite of the truth.
 */
export const timeLeft = (resets: string): string | null => {
  const resetMs = resets ? new Date(resets).getTime() : Number.NaN
  if (Number.isNaN(resetMs)) return null

  const minutes = Math.round((resetMs - Date.now()) / 60_000)
  if (minutes <= 0) return null

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`

  // A weekly window is measured in days for most of its life, and "97h 12m" is a number one has to
  // divide in one's head before it means anything.
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/**
 * The second figure beside the weekly usage is not the share of time elapsed but the window's day
 * number: on the day the limit resets 14% is already available, the next day 28%, and so on (100/7
 * rounded to a flat 14 - the same logic as in a personal statusline.sh), so that it does not have to be
 * worked out in one's head on every glance.
 */
export const weekBudgetToday = (resets: string): number | null => {
  if (!resets) return null

  const resetMs = new Date(resets).getTime()
  if (Number.isNaN(resetMs)) return null

  const start = resetMs - WEEK_MS
  const elapsed = Math.max(0, Date.now() - start)
  const day = Math.floor(elapsed / DAY_MS) + 1
  return Math.min(day * WEEK_DAILY_BUDGET, 100)
}
