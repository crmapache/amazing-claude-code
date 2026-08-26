import type { CSSProperties } from 'react'
import { TIER_CHANNEL, TIER_TEXT } from '../../stats/achievements'
import { ACHIEVEMENT_ICONS } from '../../stats/icons'
import s from './stats.module.css'

/**
 * The tier's paint as CSS variables on the card: one pair of variables, and every stroke, wash and
 * border of the card reads them - a card is painted by setting two values rather than six classes.
 */
export const tierStyle = (tier: number): CSSProperties =>
  ({
    '--tier': TIER_CHANNEL[tier] ?? TIER_CHANNEL[0],
    '--tier-text': TIER_TEXT[tier] ?? TIER_TEXT[0],
  }) as CSSProperties

/** The achievement's glyph in its round chip: the tier's colour paints it through currentColor. */
export const AchievementChip = ({ id, locked = false, small = false }: { id: string; locked?: boolean; small?: boolean }) => (
  <span className={`${small ? s.achievementChip : s.chip} ${locked ? s.chipLocked : ''}`}>
    <svg
      className={s.chipIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ACHIEVEMENT_ICONS[id] ?? ACHIEVEMENT_ICONS['steady-hand']} />
    </svg>
  </span>
)
