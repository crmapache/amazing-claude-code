import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { send } from '../../bridge'
import { useHoverTarget } from '../../hooks/useHoverTarget'
import { useWheelScroll } from '../../hooks/useWheelScroll'
import type { StatisticsData } from '../../protocol'
import { closest, dressAll, recentlyEarned, summarize, type DressedGroup } from '../../stats/achievements'
import { ROMAN } from '../../stats/catalogue'
import {
  dayHours,
  daysTile,
  factsTile,
  filesTile,
  hoursSeries,
  outputTile,
  projectCount,
  projectRows,
  rangeOf,
  timeTile,
  toolRows,
  type DayHours,
  type RangeKey,
  type TimeTile,
  type ToolRow,
} from '../../stats/compute'
import {
  clock,
  compactNumber,
  duration,
  durationDelta,
  groupThousands,
  longDate,
  money,
  shortDate,
  turnLength,
} from '../../stats/format'
import { drawPoster, posterName, SKIP } from '../../stats/poster'
import { AchievementChip, tierStyle } from './AchievementChip'
import { AchievementFilterSwitch, Achievements, achievementsHint, useAchievementFilter } from './Achievements'
import { DayChart } from './DayChart'
import { Heatmap } from './Heatmap'
import { HoursChart } from './HoursChart'
import s from './stats.module.css'

/**
 * The statistics tab: every project together, for today, the last week, the last month or all time - and
 * behind it the achievements screen.
 *
 * Everything on it is arithmetic over the days the IDE keeps (see stats/compute.ts): the range switches
 * here, without a round trip. The figures arrive as one message and are asked for again while the tab
 * is open (see App), so a turn finishing shows up on the tiles within the minute.
 */

export type StatisticsView = 'overview' | 'achievements'

interface StatisticsTabProps {
  data: StatisticsData | null
  view: StatisticsView
  onView: (view: StatisticsView) => void
  /** The plugin's own version - it stands under a shared picture, see stats/poster.ts. */
  version: string
}

/**
 * The share button: whatever screen is open, drawn into a PNG and handed to the IDE, which writes it out
 * (see the saveImage message and stats/poster.ts).
 *
 * Drawing takes a moment - a screen a thousand pixels tall goes through a canvas - so the button says what
 * it is doing and then that it is done, rather than looking untouched while the file is being made.
 */
const ShareButton = ({
  screen,
  data,
  view,
  version,
}: {
  screen: RefObject<HTMLDivElement | null>
  data: StatisticsData
  view: StatisticsView
  version: string
}) => {
  const [state, setState] = useState<'idle' | 'drawing' | 'done'>('idle')

  useEffect(() => {
    if (state !== 'done') return
    const timer = setTimeout(() => setState('idle'), 2200)
    return () => clearTimeout(timer)
  }, [state])

  const share = async () => {
    const node = screen.current
    if (!node || state === 'drawing') return
    setState('drawing')
    try {
      const picture = await drawPoster(node, { ide: data.ide, version, date: data.today })
      send({ type: 'saveImage', name: posterName(view === 'achievements' ? 'achievements' : 'statistics', data.today), data: picture })
      setState('done')
    } catch (error) {
      send({ type: 'trace', message: `The statistics picture could not be drawn: ${String(error)}` })
      setState('idle')
    }
  }

  return (
    <button
      type="button"
      className={s.share}
      onClick={share}
      disabled={state === 'drawing'}
      aria-label="Save this screen as a picture"
      data-tooltip={state === 'done' ? 'Saved to your downloads' : 'Save this screen as a picture'}
      {...{ [SKIP]: '' }}
    >
      {state === 'done' ? (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path d="M3.5 8.5L6.5 11.5L12.5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 10.5V2.5" />
            <path d="M5 5.5L8 2.5L11 5.5" />
            <path d="M3.5 9.5v3a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3" />
          </g>
        </svg>
      )}
    </button>
  )
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '1d', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

export const StatisticsTab = ({ data, view, onView, version }: StatisticsTabProps) => {
  const root = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  // Today first: the figure most often looked for is the one for the day being worked.
  const [range, setRange] = useState<RangeKey>('1d')
  const [filter, setFilter] = useAchievementFilter()

  // The highlight under the pointer and the wheel both need a hand in the IDE's embedded browser - see
  // the two hooks for why.
  useHoverTarget(root)
  useWheelScroll(body)

  const groups = useMemo(() => (data ? dressAll(data.achievements) : null), [data])

  return (
    <div className={s.root} ref={root}>
      {view === 'achievements' && groups ? (
        <div className={s.head}>
          <button
            type="button"
            className={s.headBack}
            aria-label="Back to statistics"
            onClick={() => onView('overview')}
            {...{ [SKIP]: '' }}
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path
                d="M9.5 3.5L5 8l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className={s.headTitles}>
            <span className={s.title}>ACHIEVEMENTS</span>
            <span className={s.hint}>{achievementsHint(groups)}</span>
          </div>
          <div className={s.headSpace} />
          {data ? <ShareButton screen={root} data={data} view={view} version={version} /> : null}
          <AchievementFilterSwitch filter={filter} onFilter={setFilter} />
        </div>
      ) : (
        <div className={s.head}>
          <div className={s.headTitles}>
            <span className={s.title}>STATISTICS</span>
            <span className={s.hint}>{data ? overviewHint(data, range) : 'counting up…'}</span>
          </div>
          <div className={s.headSpace} />
          {data ? <ShareButton screen={root} data={data} view={view} version={version} /> : null}
          <div className={s.segments}>
            {RANGES.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`${s.segment} ${range === option.key ? s.segmentOn : ''}`}
                onClick={() => setRange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={s.body} ref={body}>
        {!data || !groups ? (
          <div className={s.empty}>Counting up… the figures arrive from the IDE in a moment.</div>
        ) : view === 'achievements' ? (
          <Achievements
            groups={groups}
            filter={filter}
            poster={{ ide: data.ide, version, date: data.today }}
          />
        ) : (
          <Overview data={data} range={range} groups={groups} onAchievements={() => onView('achievements')} />
        )}
      </div>
    </div>
  )
}

const overviewHint = (data: StatisticsData, key: RangeKey): string => {
  const range = rangeOf(data, key)
  const projects = projectCount(data)
  const scope = projects <= 1 ? 'one project' : `all ${projects} projects together`
  return `${scope} · ${range.label}`
}

// --- The overview -----------------------------------------------------------------------------

interface OverviewProps {
  data: StatisticsData
  range: RangeKey
  groups: DressedGroup[]
  onAchievements: () => void
}

const Overview = ({ data, range: key, groups, onAchievements }: OverviewProps) => {
  const range = useMemo(() => rangeOf(data, key), [data, key])
  const time = useMemo(() => timeTile(data, range), [data, range])
  const days = useMemo(() => daysTile(data, range), [data, range])
  const output = useMemo(() => outputTile(data, range), [data, range])
  const series = useMemo(() => hoursSeries(data, range), [data, range])
  const hours = useMemo(() => dayHours(data, range), [data, range])
  const tools = useMemo(() => toolRows(data, range), [data, range])
  const projects = useMemo(() => projectRows(data, range), [data, range])
  const files = useMemo(() => filesTile(data, range), [data, range])
  const facts = useMemo(() => factsTile(data, range), [data, range])
  const summary = useMemo(() => summarize(groups), [groups])
  const nearest = useMemo(() => closest(groups), [groups])
  const recent = useMemo(() => recentlyEarned(groups), [groups])

  const activeDots = days.dots.filter((dot) => dot.active).length
  // A single day is read differently: "a day" says nothing about one day, "1/1" says nothing about the
  // days at work, and a line chart one point wide draws nothing at all. The delta keeps the same short
  // "vs prev" as every other range - the previous stretch of one day is yesterday, and a longer word is
  // cut off by the tile anyway (see .figureNote).
  const oneDay = key === '1d'
  const scope = oneDay ? 'today' : 'in this range'

  return (
    <>
      <div className={s.tiles}>
        <div className={s.tile}>
          <span className={`${s.label} ${s.labelAccent}`}>TIME IN THE PANEL · {range.tag}</span>
          <span className={s.figureRow}>
            <span className={s.figure}>{duration(time.minutes)}</span>
            {time.delta === null ? null : (
              <span className={`${s.figureNote} ${time.delta >= 0 ? s.figureNoteOk : s.figureNoteBad}`}>
                {durationDelta(time.delta)} vs prev
              </span>
            )}
          </span>
          <span className={s.foot}>{timeFoot(time, hours, oneDay)}</span>
        </div>

        <div className={s.tile}>
          <span className={`${s.label} ${s.labelOk}`}>{oneDay ? 'DAYS IN A ROW' : 'DAYS AT WORK'}</span>
          <span className={s.figureRow}>
            <span className={s.figure}>
              {oneDay ? days.streak : days.active}
              <span className={s.figureDim}>{oneDay ? 'd' : `/${days.total}`}</span>
            </span>
            <span className={s.figureNote}>
              {oneDay ? `best ${days.best}` : `streak ${days.streak}d · best ${days.best}`}
            </span>
          </span>
          <div className={s.dots} data-tooltip={`${activeDots} of the last ${days.dots.length} days`}>
            {days.dots.map((dot, index) => (
              <span
                key={dot.date}
                className={`${s.dot} ${dot.active ? s.dotOn : ''}`}
                style={dot.active ? ({ '--dot-alpha': `${46 + index * 4}%` } as React.CSSProperties) : undefined}
                data-tooltip={`${shortDate(dot.date)} · ${dot.active ? 'worked' : 'quiet'}`}
              />
            ))}
          </div>
        </div>

        <div className={s.tile}>
          <span className={`${s.label} ${s.labelBranch}`}>WHAT CAME OUT OF IT</span>
          <span className={s.figureRow}>
            <span className={s.figure}>{groupThousands(output.turns)}</span>
            <span className={s.figureNote}>
              {output.turns === 1 ? 'reply' : 'replies'} · {output.sessions} {output.sessions === 1 ? 'session' : 'sessions'}
            </span>
          </span>
          <span className={s.foot}>
            {groupThousands(output.filesTouched)} files touched · {output.forks} {output.forks === 1 ? 'fork' : 'forks'} along the way
          </span>
        </div>

        <div className={s.tile}>
          <span className={`${s.label} ${s.labelAgent}`}>ACHIEVEMENTS</span>
          <span className={s.figureRow}>
            {/* The same figure the achievements screen leads with: how many are finished. */}
            <span className={s.figure}>
              {summary.completed}
              <span className={s.figureDim}>/{summary.total}</span>
            </span>
            <span className={s.figureNote}>
              <button type="button" className={s.link} onClick={onAchievements}>
                See All
              </button>
            </span>
          </span>
          <span className={s.foot}>
            {nearest ? (
              <>
                Next: <span className={s.footStrong}>{nearest.item.name}</span> - {nearest.remaining}
              </>
            ) : (
              'Every line crossed - nothing left to reach for.'
            )}
          </span>
        </div>
      </div>

      {oneDay ? (
        <div className={s.chartCard}>
          <div className={s.labelRow}>
            <span className={s.label}>THE HOURS OF TODAY</span>
            <span className={s.labelNote}>{dayNote(hours)}</span>
          </div>
          <DayChart hours={hours} />
        </div>
      ) : (
        <div className={s.chartCard}>
          <div className={s.labelRow}>
            <span className={s.label}>HOURS A DAY IN THE PANEL</span>
            <span className={s.labelNote}>
              {series.longest
                ? `longest day ${duration(series.longest.minutes)} on ${shortDate(series.longest.date)}`
                : 'no day at work in this range yet'}
            </span>
          </div>
          <HoursChart series={series} />
        </div>
      )}

      <div className={s.card}>
        <div className={s.labelRow}>
          <span className={s.label}>WHEN YOU WORK</span>
          <span className={s.labelNote}>minutes a day · as far back as the panel is wide</span>
          <span className={s.labelSpace} />
          <span className={s.heatLegend}>
            <span>quiet</span>
            <span className={s.heatSwatch} style={{ background: 'rgb(var(--acc-ch-mist) / 10%)' }} />
            <span className={s.heatSwatch} style={{ background: 'rgb(var(--acc-ch-moon) / 22%)' }} />
            <span className={s.heatSwatch} style={{ background: 'rgb(var(--acc-ch-moon) / 42%)' }} />
            <span className={s.heatSwatch} style={{ background: 'rgb(var(--acc-ch-moon) / 68%)' }} />
            <span className={s.heatSwatch} style={{ background: 'var(--acc-c-moon-3)' }} />
            <span>busy</span>
          </span>
        </div>
        <Heatmap data={data} />
      </div>

      <div className={s.tiles}>
        <div className={s.tile} style={{ gap: 9 }}>
          <span className={s.label}>WHAT THE AGENT DID</span>
          {tools.length === 0 ? <span className={s.foot}>No tool calls {scope}.</span> : null}
          {tools.map((tool) => (
            <span key={tool.name} className={s.row}>
              <span className={s.rowName} data-tooltip={tool.name}>
                {tool.name}
              </span>
              <span className={s.bar}>
                <span className={s.barFill} style={{ width: `${Math.round(tool.share * 100)}%`, background: toolPaint(tool) }} />
              </span>
              <span className={s.rowValue}>{groupThousands(tool.count)}</span>
            </span>
          ))}
        </div>

        <div className={s.tile} style={{ gap: 9 }}>
          <span className={s.label}>WHERE THE HOURS WENT</span>
          {projects.length === 0 ? <span className={s.foot}>No hours {scope} yet.</span> : null}
          {projects.map((project, index) => (
            <span key={project.key} className={s.stack}>
              <span className={s.stackTop}>
                <span
                  className={`${s.stackName} ${project.current ? s.stackNameCurrent : index >= 3 ? s.stackNameDim : ''}`}
                  data-tooltip={project.name}
                >
                  {project.name}
                </span>
                <span className={s.stackValue}>{duration(project.minutes)}</span>
              </span>
              <span
                className={s.stackBar}
                style={{
                  width: `${Math.round(project.share * 100)}%`,
                  background: `rgb(var(--acc-ch-moon) / ${[85, 58, 42, 30, 20][index] ?? 20}%)`,
                }}
              />
            </span>
          ))}
        </div>

        <div className={s.tile} style={{ gap: 10 }}>
          <span className={s.label}>FILES</span>
          <span className={s.pair}>
            <span className={s.pairAdded}>+{groupThousands(files.added)}</span>
            <span className={s.pairRemoved}>−{groupThousands(files.removed)}</span>
          </span>
          <span className={s.barSplit}>
            <span style={{ width: `${addedShare(files.added, files.removed)}%`, background: 'rgb(var(--acc-ch-mint) / 55%)' }} />
            <span style={{ width: `${100 - addedShare(files.added, files.removed)}%`, background: 'rgb(var(--acc-ch-rose-4) / 45%)' }} />
          </span>
          <span className={s.foot}>
            {groupThousands(files.touched)} files touched · {files.refused} {files.refused === 1 ? 'edit' : 'edits'} you turned down · biggest edit{' '}
            {groupThousands(files.biggest)} lines
          </span>
        </div>

        <div className={s.tile} style={{ gap: 10 }}>
          <span className={s.label}>SESSIONS · MODELS · FORKS</span>
          <div className={s.facts}>
            <Fact label="Sessions" value={groupThousands(facts.sessions)} />
            <Fact label="Replies" value={groupThousands(facts.turns)} />
            <Fact label="Average reply" value={facts.averageTurnMs === null ? '–' : turnLength(facts.averageTurnMs)} />
            <Fact label="Longest session" value={duration(facts.longestSessionMinutes)} />
            <Fact label="Forks" value={groupThousands(facts.forks)} />
            <Fact label="Deepest chain" value={String(facts.deepestChain)} />
          </div>
          <span className={s.barSplit}>
            {facts.models.map((model, index) => (
              <span
                key={model.name}
                style={{
                  width: `${Math.round(model.share * 100)}%`,
                  background: `rgb(${MODEL_PAINT[index % MODEL_PAINT.length]} / 60%)`,
                }}
              />
            ))}
          </span>
          <span className={s.sentence}>
            {facts.models.length === 0
              ? `no replies ${scope}`
              : `${facts.models
                  .slice(0, 3)
                  .map((model) => `${model.name} ${Math.round(model.share * 100)}%`)
                  .join(' · ')} · ${compactNumber(facts.tokens)} tokens, ${money(facts.cost)} on API prices`}
          </span>
        </div>
      </div>

      <div className={s.card} style={{ padding: '11px 14px 12px' }}>
        <div className={s.labelRow}>
          <span className={s.label}>EARNED LATELY</span>
          <span className={s.labelSpace} />
          <button type="button" className={`${s.link} ${s.labelNote}`} onClick={onAchievements}>
            See All
          </button>
        </div>
        {recent.length === 0 ? (
          <span className={s.foot}>Nothing yet - the first tiers come with the first hour and the first edit. Counting since {longDate(data.today >= dayOfSince(data) ? dayOfSince(data) : data.today)}.</span>
        ) : (
          <div className={s.recent}>
            {recent.map((earned) => (
              <span key={`${earned.item.id}-${earned.tier}`} className={s.recentCard} style={tierStyle(earned.tier)}>
                <AchievementChip id={earned.item.id} />
                <span className={s.recentText}>
                  <span className={s.recentName}>
                    {earned.item.name}
                    {earned.item.spec.milestone ? '' : ` · ${ROMAN[earned.tier]}`}
                  </span>
                  <span className={s.recentNote} data-tooltip={earned.note}>
                    {earned.note}
                  </span>
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * "busiest hour 08:00 · across 4 projects", "2h 41m a day · in one project" - what stands under the
 * figure of time in the panel.
 *
 * The projects are named as a count rather than added up as minutes. Their minutes overlap whenever two
 * agents run at once, and the sum of them was the figure that made a day of two hours read as four; what
 * the day really holds is above, and how it was spread is in the list of where the hours went.
 */
const timeFoot = (time: TimeTile, hours: DayHours, oneDay: boolean): string => {
  if (time.minutes === 0) return oneDay ? 'nothing in the panel yet' : 'nothing in the panel in this range'

  const when = oneDay
    ? hours.peak
      ? // As on the chart, the top is often shared: naming the first of several says the day had one.
        hours.peaks.length > 1
        ? `${hours.peaks.length} hours at ${duration(hours.peak.minutes)}`
        : `busiest hour ${clock(hours.peak.hour)}`
      : 'the hours of it are not marked'
    : `${duration(time.perDay)} a day`
  const where = time.projects <= 1 ? 'in one project' : `across ${time.projects} projects`

  return `${when} · ${where}`
}

/**
 * "09:00 to 21:00 · busiest 17:00 with 42m" - what the hours of the day add up to.
 *
 * The busiest hour is rarely alone. An hour spent in the panel end to end holds sixty minutes and there
 * is no sixty-first, so a working day ties for the top over and over - and the chart lights every hour
 * that reaches it. Naming one of them here while three glowed there was the whole of the puzzle: the note
 * says which they are, and up to three of them it says so by name.
 */
const dayNote = (hours: DayHours): string => {
  if (hours.peak === null || hours.first === null || hours.last === null) return 'nothing in the panel today yet'

  const span = `${clock(hours.first)} to ${clock(hours.last + 1)}`
  const spent = duration(hours.peak.minutes)
  const top =
    hours.peaks.length > NAMED_PEAKS
      ? `busiest ${hours.peaks.length} hours with ${spent} each`
      : `busiest ${listOf(hours.peaks.map(clock))} with ${spent}${hours.peaks.length > 1 ? ' each' : ''}`

  return `${span} · ${top}`
}

/** How many hours the note is willing to name before it counts them instead. */
const NAMED_PEAKS = 3

/** "09:00, 10:00 and 13:00" - an English list, for a note read as a sentence. */
const listOf = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const dayOfSince = (data: StatisticsData): string => {
  const date = new Date(data.since)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const addedShare = (added: number, removed: number): number => {
  const total = added + removed
  if (total === 0) return 50
  return Math.round((added / total) * 100)
}

const MODEL_PAINT = ['var(--acc-ch-aqua)', 'var(--acc-ch-iris)', 'var(--acc-ch-moon)', 'var(--acc-ch-sand)']

const toolPaint = (tool: ToolRow): string => {
  switch (tool.tone) {
    case 'edit':
      return tool.name === 'Write' ? 'rgb(var(--acc-ch-moon) / 45%)' : 'rgb(var(--acc-ch-moon) / 70%)'
    case 'command':
      return 'rgb(var(--acc-ch-sand) / 65%)'
    case 'agent':
      return 'rgb(var(--acc-ch-iris) / 60%)'
    case 'mcp':
      return 'rgb(var(--acc-ch-aqua) / 60%)'
    default:
      return tool.name === 'Read' ? 'rgb(var(--acc-ch-mist) / 45%)' : 'rgb(var(--acc-ch-mist) / 38%)'
  }
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <span className={s.fact}>
    <span className={s.factLabel}>{label}</span>
    <span className={s.factValue}>{value}</span>
  </span>
)
