import { useState } from 'react'
import {
  TIER_CHANNEL,
  TIER_TEXT,
  closest,
  filterGroups,
  summarize,
  type AchievementFilter,
  type DressedAchievement,
  type DressedGroup,
} from '../../stats/achievements'
import { ROMAN, TIER_COUNT } from '../../stats/catalogue'
import { AchievementChip, tierStyle } from './AchievementChip'
import s from './stats.module.css'

/**
 * All fifty-one achievements, five tiers each - a screen of its own behind the statistics tab.
 *
 * Grouped the way a person would look for them: the habit, the hours, the code, the tools, the way
 * around the panel. A locked one is drawn quiet rather than hidden: knowing what there is to earn is
 * half of what the screen is for.
 */

interface AchievementsProps {
  groups: DressedGroup[]
  filter: AchievementFilter
}

const FILTERS: { id: AchievementFilter; label: string }[] = [
  { id: 'all', label: 'All' },
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

/** "27 of 50 earned · 61 tiers of 250 · five tiers each" - the head's hint. */
export const achievementsHint = (groups: DressedGroup[]): string => {
  const summary = summarize(groups)
  return `${summary.earned} of ${summary.total} earned · ${summary.tiers} tiers of ${summary.tiersTotal} · five tiers each`
}

/** The spread bar's paints by tier, I to V: the higher the tier, the stronger its colour. */
const SPREAD_ALPHA = ['22%', '55%', '65%', '70%', '85%']

export const Achievements = ({ groups, filter }: AchievementsProps) => {
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
          <span className={s.figure}>
            {summary.earned}
            <span className={s.figureDim}>/{summary.total}</span>
          </span>
          <span className={s.summaryCaption}>earned</span>
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
              <AchievementCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

/** One achievement, dressed: the tier decides how loudly it is drawn. */
const AchievementCard = ({ item }: { item: DressedAchievement }) => {
  const strength = [12, 42, 55, 62, 70, 82][item.tier] ?? 12

  return (
    <div className={`${s.achievement} ${item.earned ? '' : s.achievementLocked}`} style={tierStyle(item.tier)}>
      <div className={s.achievementTop}>
        <AchievementChip id={item.id} locked={!item.earned} small />
        <span className={s.achievementName}>{item.name}</span>
        <span className={s.achievementTier}>{item.tierMark}</span>
      </div>

      <div className={s.pips}>
        {Array.from({ length: TIER_COUNT }, (_, index) => (
          <span
            key={index}
            className={s.pip}
            style={index < item.tier ? { background: `rgb(${TIER_CHANNEL[index + 1]} / ${52 + index * 8}%)` } : undefined}
          />
        ))}
      </div>

      <span className={s.achievementHint}>{item.hint}</span>

      <div className={s.achievementBottom}>
        <span className={`${s.bar} ${s.barHair}`}>
          <span
            className={s.barFill}
            style={{
              width: `${Math.round(item.progress * 100)}%`,
              background: `rgb(${TIER_CHANNEL[item.tier]} / ${item.earned ? strength : 22}%)`,
            }}
          />
        </span>
        <span className={s.achievementValue}>{item.value}</span>
      </div>
    </div>
  )
}
