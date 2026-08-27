import { useEffect, useRef, useState, type RefObject } from 'react'
import { send } from '../../bridge'
import { CARD_WIDTH, drawPoster, posterName, SKIP, type PosterOptions } from '../../stats/poster'
import {
  TIER_CHANNEL,
  TIER_TEXT,
  closest,
  filterGroups,
  paintOf,
  summarize,
  type AchievementFilter,
  type DressedAchievement,
  type DressedGroup,
} from '../../stats/achievements'
import { ROMAN } from '../../stats/catalogue'
import { AchievementChip, tierStyle } from './AchievementChip'
import s from './stats.module.css'

/**
 * All fifty-two achievements, five tiers each - a screen of its own behind the statistics tab.
 *
 * Grouped the way a person would look for them: the habit, the hours, the code, the tools, the way
 * around the panel. A locked one is drawn quiet rather than hidden: knowing what there is to earn is
 * half of what the screen is for.
 */

interface AchievementsProps {
  groups: DressedGroup[]
  filter: AchievementFilter
  /**
   * What a shared picture says about where it came from - the IDE, the plugin's version, the day.
   *
   * Absent while the figures have not arrived, and then no card offers to be shared: there would be
   * nothing truthful to write under it (see stats/poster.ts).
   */
  poster?: Omit<PosterOptions, 'width' | 'heading'>
}

const FILTERS: { id: AchievementFilter; label: string }[] = [
  { id: 'all', label: 'See All' },
  { id: 'earned', label: 'Earned' },
  { id: 'progress', label: 'In progress' },
]

/** The segmented switch of the screen's head, owned by the head rather than by the list. */
export const AchievementFilterSwitch = ({
  filter,
  onFilter,
}: {
  filter: AchievementFilter
  onFilter: (filter: AchievementFilter) => void
}) => (
  <div className={s.segments}>
    {FILTERS.map((option) => (
      <button
        key={option.id}
        type="button"
        className={`${s.segment} ${filter === option.id ? s.segmentOn : ''}`}
        onClick={() => onFilter(option.id)}
      >
        {option.label}
      </button>
    ))}
  </div>
)

export const useAchievementFilter = () => useState<AchievementFilter>('all')

/** "9 of 46 done · 61 of 226 steps" - the head's hint. */
export const achievementsHint = (groups: DressedGroup[]): string => {
  const summary = summarize(groups)
  return `${summary.completed} of ${summary.total} done · ${summary.tiers} of ${summary.tiersTotal} steps`
}

/** The spread bar's paints by tier, I to V: the higher the tier, the stronger its colour. */
const SPREAD_ALPHA = ['22%', '55%', '65%', '70%', '85%']

export const Achievements = ({ groups, filter, poster }: AchievementsProps) => {
  const summary = summarize(groups)
  const nearest = closest(groups)
  const shown = filterGroups(groups, filter)
  // Left to right the way one counts: I first, V last, and the locked ones after them in the legend.
  const spread = [1, 2, 3, 4, 5].map((tier) => ({
    tier,
    count: summary.spread[tier] ?? 0,
    share: summary.total > 0 ? ((summary.spread[tier] ?? 0) / summary.total) * 100 : 0,
  }))

  return (
    <>
      <div className={s.summary}>
        <span className={s.summaryCount}>
          {/* Finished ones, not started ones: on a screen of ladders nearly everything is started. */}
          <span className={s.figure}>
            {summary.completed}
            <span className={s.figureDim}>/{summary.total}</span>
          </span>
          <span className={s.summaryCaption}>done</span>
        </span>

        <span className={s.summarySpread}>
          <span className={s.spreadRow}>
            <span>tier spread</span>
            <span className={s.spreadBar}>
              {spread.map((entry) => (
                <span
                  key={entry.tier}
                  style={{
                    width: `${entry.share}%`,
                    background: `rgb(${TIER_CHANNEL[entry.tier]} / ${SPREAD_ALPHA[entry.tier - 1]})`,
                  }}
                />
              ))}
            </span>
          </span>
          <span className={s.spreadLegend}>
            {spread.map((entry) => (
              <span key={entry.tier} style={{ color: TIER_TEXT[entry.tier] }}>
                {ROMAN[entry.tier]} · {entry.count}
              </span>
            ))}
            <span>locked · {summary.spread[0] ?? 0}</span>
          </span>
        </span>

        {nearest ? (
          <span className={s.summaryClosest}>
            <span className={s.summaryClosestLabel}>CLOSEST ONE</span>
            <span className={s.summaryClosestName}>{nearest.item.name}</span>
            <span className={s.summaryClosestNote}>
              {nearest.standing} · {nearest.remaining}
            </span>
          </span>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className={s.empty}>
          {filter === 'earned' ? 'Nothing earned yet - the first ones come with the first hour.' : 'Everything is earned. All of it.'}
        </div>
      ) : null}

      {shown.map((group) => (
        <div key={group.id} className={s.group}>
          <div className={s.groupHead}>
            <span className={s.label}>{group.name}</span>
            <span className={s.groupNote}>{group.note}</span>
          </div>
          <div className={s.achievements}>
            {group.items.map((item) => (
              <AchievementCard key={item.id} item={item} poster={poster} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

/**
 * The button that saves one achievement as a picture - the same road the whole screen takes, at the width
 * of a card and with a line above it saying what it is (see stats/poster.ts).
 *
 * Only on an achievement that has been earned: a locked card is a thing to reach for, not a thing to show
 * off, and a picture of one would be a boast about nothing.
 */
const CardShare = ({ item, card, poster }: { item: DressedAchievement; card: RefObject<HTMLDivElement | null>; poster: Omit<PosterOptions, 'width' | 'heading'> }) => {
  const [state, setState] = useState<'idle' | 'drawing' | 'done'>('idle')

  useEffect(() => {
    if (state !== 'done') return
    const timer = setTimeout(() => setState('idle'), 2200)
    return () => clearTimeout(timer)
  }, [state])

  const share = async () => {
    const node = card.current
    if (!node || state === 'drawing') return
    setState('drawing')
    try {
      const picture = await drawPoster(node, { ...poster, width: CARD_WIDTH, heading: 'Look what I got.' })
      send({ type: 'saveImage', name: posterName(`achievement-${item.id}`, poster.date), data: picture })
      setState('done')
    } catch (error) {
      send({ type: 'trace', message: `The achievement picture could not be drawn: ${String(error)}` })
      setState('idle')
    }
  }

  return (
    <button
      type="button"
      className={`${s.cardShare} ${state === 'done' ? s.cardShareDone : ''}`}
      onClick={share}
      disabled={state === 'drawing'}
      aria-label={`Save "${item.name}" for share`}
      data-tooltip={state === 'done' ? 'Saved to your downloads' : 'Save for share'}
      {...{ [SKIP]: '' }}
    >
      {state === 'done' ? (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path d="M3.5 8.5L6.5 11.5L12.5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 10.5V2.5" />
            <path d="M5 5.5L8 2.5L11 5.5" />
            <path d="M3.5 9.5v3a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3" />
          </g>
        </svg>
      )}
    </button>
  )
}

/** One achievement, dressed: the tier decides how loudly it is drawn. */
const AchievementCard = ({ item, poster }: { item: DressedAchievement; poster?: Omit<PosterOptions, 'width' | 'heading'> }) => {
  const paint = paintOf(item.tier, item.steps)
  const strength = [12, 42, 55, 62, 70, 82][paint] ?? 12
  const card = useRef<HTMLDivElement>(null)

  return (
    <div className={`${s.achievement} ${item.earned ? '' : s.achievementLocked}`} style={tierStyle(paint)} ref={card}>
      <div className={s.achievementTop}>
        <AchievementChip id={item.id} locked={!item.earned} small />
        <span className={s.achievementName}>{item.name}</span>
        {poster && item.earned ? <CardShare item={item} card={card} poster={poster} /> : null}
        <span className={s.achievementTier}>{item.tierMark}</span>
      </div>

      {/* A pip for every line this one has, rather than five for everything: a milestone has a single line
          to cross and there are exactly two ways to say thanks, and five pips promised steps behind them
          that do not exist. A short ladder still ends in the top tier's paint - being done is being done,
          however few lines it took (see paintOf). */}
      <div className={s.pips}>
        {Array.from({ length: item.steps }, (_, index) => {
          const step = paintOf(index + 1, item.steps)
          return (
            <span
              key={index}
              className={s.pip}
              style={index < item.tier ? { background: `rgb(${TIER_CHANNEL[step]} / ${44 + step * 8}%)` } : undefined}
            />
          )
        })}
      </div>

      <span className={s.achievementHint}>{item.hint}</span>

      <div className={s.achievementBottom}>
        <span className={s.bar}>
          <span
            className={s.barFill}
            style={{
              width: `${Math.round(item.progress * 100)}%`,
              background: `rgb(${TIER_CHANNEL[paint]} / ${item.earned ? strength : 22}%)`,
            }}
          />
        </span>
        <span className={s.achievementValue}>{item.value}</span>
      </div>
    </div>
  )
}
