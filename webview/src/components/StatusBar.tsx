import { modeLabel, modeShortLabel, modelLabel } from '../catalog'
import type { UsageWindow } from '../protocol'
import s from './shell.module.css'

export type SelectorKind = 'model' | 'effort' | 'mode'

/** Где стоит кнопка селектора: меню открывается рядом с ней. */
export interface Anchor {
  right: number
  top: number
  /** Нижний край кнопки-триггера — нужен только меню, открывающемуся вниз. */
  bottom?: number
}

interface StatusBarProps {
  gitBranch?: string
  pullRequest?: string
  /** Открыть PR текущей ветки в системном браузере. Не URL: сама ссылка живёт в панели. */
  onOpenPullRequest: () => void
  contextPercent: number
  contextTokens: string
  /** Токены за сегодня по всем проектам — то же "tok", что в терминале. */
  todayTokens: string
  /** Окна расхода подписки. Приходят от самого агента, поэтому бывают пустыми. */
  usage: { session?: UsageWindow; week?: UsageWindow }
  model?: string
  effort: string
  mode: string
  onOpen: (kind: SelectorKind, anchor: Anchor) => void
}

/**
 * Нижняя строка — та же сводка, что в строке состояния терминала: ветка, её PR,
 * заполнение контекста, окна подписки и объём работы. Полосок-градусников тут нет
 * намеренно: цифра с цветом читается быстрее, а места занимает втрое меньше.
 */
export const StatusBar = ({
  gitBranch,
  pullRequest,
  onOpenPullRequest,
  contextPercent,
  contextTokens,
  todayTokens,
  usage,
  model,
  effort,
  mode,
  onOpen,
}: StatusBarProps) => (
  <div className={s.status}>
    <div className={s.statusLine}>
      {gitBranch ? (
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
      ) : null}

      <div className={s.spacer} />

      <span className={s.statusItem} title={`Context window · ${contextTokens}`}>
        <span className={s.statusKey}>ctx</span>
        <span className={s.statusValue} style={{ color: contextColor(contextPercent) }}>
          {contextPercent}%
        </span>
      </span>

      {usage.session ? (
        <span className={s.statusItem} title={`Five-hour window · resets ${resetAt(usage.session.resets)}`}>
          <span className={s.statusKey}>5h</span>
          <span
            className={s.statusValue}
            style={{ color: paceColor(usage.session.percent, usage.session.resets, FIVE_HOUR_MS) }}
          >
            {usage.session.percent}%
          </span>
        </span>
      ) : null}

      {usage.week ? <WeekUsage usage={usage.week} /> : null}

      <span className={s.statusItem} title="Tokens spent today, across all projects">
        <span className={s.statusKey}>tok</span>
        <span className={s.statusTok}>{todayTokens}</span>
      </span>
    </div>

    <div className={s.selectors}>
      <Selector label="MODEL" value={modelLabel(model)} title={`Model: ${modelLabel(model)}`} onOpen={(anchor) => onOpen('model', anchor)} />
      <Selector label="EFFORT" value={effort} title={`Reasoning effort: ${effort}`} onOpen={(anchor) => onOpen('effort', anchor)} />
      <Selector
        label="MODE"
        value={modeShortLabel(mode)}
        title={`Permission mode: ${modeLabel(mode)}`}
        className={modeClass(mode)}
        onOpen={(anchor) => onOpen('mode', anchor)}
      />
    </div>
  </div>
)

/**
 * Второй процент (дневной бюджет) — всегда блёклый целиком, вместе со своим "%":
 * в личном statusline.sh dim оборачивает "/budget%" одной группой, а не только
 * цифры. Если вынести "%" наружу, в общий крашеный span, он подсвечивается
 * тем же цветом, что и первое число, — и блёклость выглядит недоделанной.
 */
const WeekUsage = ({ usage }: { usage: UsageWindow }) => {
  const budget = weekBudgetToday(usage.resets)

  return (
    <span
      className={s.statusItem}
      title={`Weekly window · resets ${resetAt(usage.resets)} · second number: budget available today at an even 14%/day pace`}
    >
      <span className={s.statusKey}>wk</span>
      <span className={s.statusValue} style={{ color: paceColor(usage.percent, usage.resets, WEEK_MS) }}>
        {usage.percent}
        {budget === null ? '%' : null}
      </span>
      {budget !== null ? <span className={s.statusSlash}>/{budget}%</span> : null}
    </span>
  )
}

interface SelectorProps {
  label: string
  value: string
  title: string
  className?: string
  onOpen: (anchor: Anchor) => void
}

const Selector = ({ label, value, title, className = '', onOpen }: SelectorProps) => (
  <button
    type="button"
    className={`${s.selector} ${className}`}
    title={title}
    onClick={(event) => {
      // Меню встаёт по месту кнопки, а не по фиксированным координатам: панель
      // бывает любой ширины, и «примерно справа» промахивается.
      const rect = event.currentTarget.getBoundingClientRect()
      onOpen({ right: window.innerWidth - rect.right, top: rect.top })
    }}
  >
    <span className={s.selectorLabel}>{label}</span>
    <span className={s.selectorValue}>{value}</span>
    <Chevron />
  </button>
)

/** Аккуратная галка вместо ▼: у типографского треугольника чужой вес и вид. */
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
 * Уровень тревоги по темпу расхода, не по голому проценту — логика взята из
 * личного ~/.claude/statusline.sh 1:1. 51% за неделю при почти прошедшем окне
 * не страшно, а тот же процент в первый день — тревожно: сравниваем реальный
 * расход с линией равномерного темпа до сброса и красим отклонение от неё.
 * Плюс абсолютный потолок сверху: у самого лимита время уже не спасает,
 * независимо от темпа.
 * 0 = green, 1 = yellow, 2 = orange, 3 = red.
 */
const paceSeverity = (usedPercent: number, resets: string, windowMs: number): number => {
  const resetMs = resets ? new Date(resets).getTime() : Number.NaN
  const now = Date.now()

  // Нет данных о сбросе или окно уже неактивно (сброс в прошлом) — только потолок.
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

/** У контекста нет своего окна со сбросом — только голый процент, шкала своя. */
const contextColor = (percent: number): string => {
  if (percent < 50) return 'var(--acc-meter-green)'
  if (percent < 70) return 'var(--acc-warn)'
  if (percent < 85) return 'var(--acc-orange)'
  return 'var(--acc-bad-light)'
}

const resetAt = (resets: string): string => {
  if (!resets) return 'soon'

  const date = new Date(resets)
  return Number.isNaN(date.getTime()) ? resets : date.toLocaleString()
}

/**
 * Второе число рядом с недельным расходом — не доля прошедшего времени, а
 * номер дня окна: в день сброса лимита уже доступно 14%, на следующий день —
 * 28% и так далее (100/7 округлённые до ровных 14 — та же логика, что и в
 * личном statusline.sh), чтобы не считать это в уме на каждый взгляд в статус-бар.
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

const modeClass = (mode: string): string => {
  if (mode === 'plan') return s.selectorPlan ?? ''
  if (mode === 'acceptEdits') return s.selectorAccept ?? ''
  if (mode === 'bypassPermissions') return s.selectorDanger ?? ''
  return ''
}
