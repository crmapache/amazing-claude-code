import { Ring } from '../../components/StatusBar'
import {
  contextColor,
  contextGlow,
  FIVE_HOUR_MS,
  limitWindowName,
  limitWindowRing,
  paceColor,
  timeLeft,
  WEEK_MS,
  weekBudgetToday,
} from '../../feed/usage'
import type { ExtraUsage, UsageWindow } from '../../protocol'
import type { ProjectFacts } from '../facts'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

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
  const t = useT()
  const budget = facts.week ? weekBudgetToday(facts.week.resets) : null
  /** Which window is being paid past, when one is - it takes that window's own row below. */
  const burning = facts.extra?.active ? limitWindowRing(facts.extra.window) : null

  return (
    <div className={m.sheetScrim} onClick={onClose}>
      {/* The sheet is not the scrim: a tap inside it must not count as a tap outside. */}
      <div className={m.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={m.sheetGrab} />
        <div className={m.sheetHead}>
          <span className={m.sheetTitle}>{t.mobile.limits.title}</span>
          <button type="button" className={m.sheetClose} aria-label={t.common.close} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={m.limBody}>
          {/* Extra usage stands instead of the window that ran out - that window's percentage cannot move
              any more, and what is worth knowing is that the work is being billed (the same substitution
              as on the rings - see UsageMeters). Which window it replaces is said by the event, so an
              exhausted week does not report itself in the five-hour row. */}
          {burning === 'session' ? (
            <ExtraWindow extra={facts.extra!} />
          ) : facts.session ? (
            <Window
              name={t.mobile.limits.fiveHourWindow}
              usage={facts.session}
              color={paceColor(facts.session.percent, facts.session.resets, FIVE_HOUR_MS)}
            />
          ) : null}

          {burning === 'week' ? (
            <>
              <div className={m.limDivider} />
              <ExtraWindow extra={facts.extra!} />
            </>
          ) : facts.week ? (
            <>
              <div className={m.limDivider} />
              <Window
                name={t.mobile.limits.weeklyWindow}
                usage={facts.week}
                color={paceColor(facts.week.percent, facts.week.resets, WEEK_MS)}
                pace={budget}
              />
              {budget === null ? null : (
                <p className={m.limNote}>{t.mobile.limits.paceNote(budget)}</p>
              )}
            </>
          ) : null}

          <div className={m.limDivider} />

          <div className={m.limBlock}>
            <div className={m.limHead}>
              <span className={m.limName}>{t.mobile.limits.context}</span>
              <span className={m.limMeta}>
                {t.mobile.limits.ofTotal(compact(context.used), compact(context.limit))}
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
                  <span className={m.limName}>{t.mobile.limits.spentToday}</span>
                  <span className={m.limMeta}>{t.mobile.limits.acrossProjects}</span>
                </span>
                <span className={m.limValue} style={{ color: 'var(--acc-branch-light)' }}>
                  {facts.todayTokens}
                </span>
              </div>
            </>
          ) : null}

          {!facts.session && !facts.week && !facts.extra?.active ? (
            // The windows come from the agent itself and are sometimes simply not there yet - a freshly
            // started IDE has asked nobody anything. Saying so beats an empty sheet.
            <p className={m.limEmpty}>{t.mobile.limits.noWindows}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** The window that ran out and is now being paid for: the burning ring, and how much of the doubling has gone. */
const ExtraWindow = ({ extra }: { extra: ExtraUsage }) => {
  const t = useT()
  const window = limitWindowName(t, extra.window)

  return (
    <div className={m.limRow}>
      <Ring percent={100} color="var(--acc-extra)" flame size={44} />
      <span className={m.limText}>
        <span className={m.limName}>{t.mobile.limits.extraUsage}</span>
        <span className={m.limMeta}>
          {t.mobile.limits.extraUsed(window)}
        </span>
      </span>
      {extra.percent === undefined ? null : (
        <span className={m.limValue} style={{ color: 'var(--acc-extra)' }}>
          {extra.percent}%
        </span>
      )}
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
  const t = useT()
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
        <span className={m.limMeta}>
          {left === null ? t.mobile.limits.resetUnknown : t.mobile.limits.resetsIn(left)}
        </span>
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
