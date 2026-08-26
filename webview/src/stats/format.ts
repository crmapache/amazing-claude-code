/**
 * How the statistics say their figures: durations in hours and minutes, thousands with a space, big
 * numbers shortened, dates the way the calendar names them.
 *
 * One place rather than a helper per tile, for the same reason as everywhere in this panel: two tiles
 * saying "38h 10m" and "38 h 10 min" about one figure read as two different figures.
 */

/**
 * An ordinary space between the groups of three, as the design writes them - not a narrow no-break one:
 * a figure that cannot be pasted into a search box as digits is a figure that lies a little.
 */
const NARROW_SPACE = ' '

/** "1 284" - thousands set off by a space. */
export const groupThousands = (value: number): string => {
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  const digits = String(Math.abs(rounded))
  const groups: string[] = []
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end))
  return sign + groups.join(NARROW_SPACE)
}

/** "18.4k", "41.2M" - a figure that no longer needs its last digits. Below ten thousand it stays whole. */
export const compactNumber = (value: number): string => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${trimZero((value / 1_000_000).toFixed(1))}M`
  if (abs >= 10_000) return `${trimZero((value / 1_000).toFixed(1))}k`
  return groupThousands(value)
}

const trimZero = (text: string): string => text.replace(/\.0$/, '')

/** "38h 10m", "45m", "0m" - minutes in the design's shape. */
export const duration = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes))
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (hours === 0) return `${rest}m`
  return `${hours}h ${String(rest).padStart(2, '0')}m`
}

/** The same, tighter, for a value against its target: "2h51/4h". */
export const durationTight = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes))
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h${String(rest).padStart(2, '0')}`
}

/** "+6h", "-45m", "±0m" - a change against the previous stretch of the same length. */
export const durationDelta = (minutes: number): string => {
  const rounded = Math.round(minutes)
  if (rounded === 0) return '±0m'
  const sign = rounded > 0 ? '+' : '-'
  const abs = Math.abs(rounded)
  const hours = Math.floor(abs / 60)
  const rest = abs % 60
  if (hours === 0) return `${sign}${rest}m`
  return rest === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${rest}m`
}

/** "41s", "14m 02s", "1h 03m" - a turn's length out of milliseconds. */
export const turnLength = (millis: number): string => {
  const seconds = Math.max(0, Math.round(millis / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** "$974", "$0.42" - the API price of what the plan already paid for. */
export const money = (usd: number): string => {
  if (usd >= 100) return `$${groupThousands(usd)}`
  if (usd >= 10) return `$${usd.toFixed(1)}`
  return `$${usd.toFixed(2)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Aug 14" out of "2026-08-14". */
export const shortDate = (date: string): string => {
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return `${MONTHS[month - 1] ?? ''} ${day}`
}

/** "Aug 14, 2026" - when the year matters, as in "counting since". */
export const longDate = (date: string): string => `${shortDate(date)}, ${date.slice(0, 4)}`

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "10:00" out of an hour of the day. */
export const clock = (hour: number): string => `${String(((hour % 24) + 24) % 24).padStart(2, '0')}:00`
