import { Ring } from '../../components/StatusBar'
import {
  contextColor,
  contextGlow,
  FIVE_HOUR_MS,
  paceColor,
  timeLeft,
  WEEK_MS,
  weekBudgetToday,
} from '../../feed/usage'
import type { UsageWindow } from '../../protocol'
import type { ProjectFacts } from '../facts'
import m from '../mobile.module.css'

interface LimitsProps {
  facts: ProjectFacts
  context: { percent: number; used: number; limit: number }
  onClose: () => void
}

/**
 * What is behind the two rings on the strip.
 *
 * At the desk this is a tooltip: the share, and how long until the window resets. A touchscreen has no
 * hover to put a tooltip under, and the alternative - writing the reset times into the strip itself -
 * would take the width of the branch to say something one checks twice a day.
 *
 * The dim arc gets a sentence of its own here rather than a legend on the strip, for the same reason:
 * it is the one thing on either ring that cannot be guessed from looking at it.
 */
export const Limits = ({ facts, context, onClose }: LimitsProps) => {
  const budget = facts.week ? weekBudgetToday(facts.week.resets) : null

  return (
    <div className={m.sheetScrim} onClick={onClose}>
      {/* The sheet is not the scrim: a tap inside it must not count as a tap outside. */}
      <div className={m.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={m.sheetGrab} />
        <div className={m.sheetHead}>
          <span className={m.sheetTitle}>Limits and context</span>
          <button type="button" className={m.sheetClose} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={m.limBody}>
          {facts.session ? (
            <Window
              name="Five-hour window"
              usage={facts.session}
              color={paceColor(facts.session.percent, facts.session.resets, FIVE_HOUR_MS)}
            />
          ) : null}

          {facts.week ? (
            <>
              <div className={m.limDivider} />
              <Window
                name="Weekly window"
                usage={facts.week}
                color={paceColor(facts.week.percent, facts.week.resets, WEEK_MS)}
                pace={budget}
              />
              {budget === null ? null : (
                <p className={m.limNote}>
                  <span className={m.limSwatch} />
                  <span>
                    The dim arc is an even pace: {budget}% of the week is already “due” by today. While the
                    bright arc is shorter than it, the week is on plan.
                  </span>
                </p>
              )}
            </>
          ) : null}

          <div className={m.limDivider} />

          <div className={m.limBlock}>
            <div className={m.limHead}>
              <span className={m.limName}>This conversation’s context</span>
              <span className={m.limMeta}>
                {compact(context.used)} of {compact(context.limit)}
              </span>
              <span className={m.limValue} style={{ color: contextColor(context.percent) }}>
                {context.percent}%
              </span>
            </div>
            <div className={m.limBar}>
              <div
                className={m.limBarFill}
                style={{
                  width: `${context.percent}%`,
                  background: contextColor(context.percent),
                  boxShadow: `0 0 8px ${contextGlow(context.percent).strong}, 0 0 16px ${contextGlow(context.percent).soft}`,
                }}
              />
            </div>
          </div>

          {facts.todayTokens ? (
            <>
              <div className={m.limDivider} />
              <div className={m.limRow}>
                <span className={m.limText}>
                  <span className={m.limName}>Spent today</span>
                  <span className={m.limMeta}>across every project</span>
                </span>
                <span className={m.limValue} style={{ color: 'var(--acc-branch-light)' }}>
                  {facts.todayTokens}
                </span>
              </div>
            </>
          ) : null}

          {!facts.session && !facts.week ? (
            // The windows come from the agent itself and are sometimes simply not there yet - a freshly
            // started IDE has asked nobody anything. Saying so beats an empty sheet.
            <p className={m.limEmpty}>The IDE has not reported the subscription windows yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface WindowProps {
  name: string
  usage: UsageWindow
  color: string
  pace?: number | null
}

const Window = ({ name, usage, color, pace = null }: WindowProps) => {
  const left = timeLeft(usage.resets)

  return (
    <div className={m.limRow}>
      <Ring percent={usage.percent} color={color} pace={pace} size={44} />
      <span className={m.limText}>
        <span className={m.limName}>{name}</span>
        {/*
          "When it is known" specifically: a window that has just reset has no next reset time until
          the very first turn of the day, and "resets soon" would then mean the opposite of the truth.
        */}
        <span className={m.limMeta}>{left === null ? 'reset time unknown yet' : `resets in ${left}`}</span>
      </span>
      <span className={m.limValue} style={{ color }}>
        {usage.percent}%
      </span>
    </div>
  )
}

/** "128K", "1.2M" - a token count is read as a size, not counted digit by digit. */
const compact = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
  return `${tokens}`
}
