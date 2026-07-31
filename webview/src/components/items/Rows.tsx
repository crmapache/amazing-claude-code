import type { CheckpointItem, CompactItem, CrashItem, MetaItem } from '../../feed/types'
import s from '../feed.module.css'

export const CheckpointRow = ({ item }: { item: CheckpointItem }) => (
  <div className={s.checkpoint}>
    <span className={s.checkpointChip}>{item.chip}</span>
    <span className={s.checkpointTarget}>{item.target}</span>
    <div className={s.dashed} />
  </div>
)

export const CompactRow = ({ item }: { item: CompactItem }) => (
  <div className={s.compact}>
    <span className={`${s.compactLabel} ${item.pending ? s.pending : ''}`}>CONTEXT</span>
    <span className={s.compactText}>{item.target}</span>
    <div className={s.spacer} />
  </div>
)

export const MetaRow = ({ item }: { item: MetaItem }) => (
  <div className={s.meta}>
    {item.stats.map((stat, index) => (
      <span key={index}>{stat}</span>
    ))}
  </div>
)

/** Процесс умер сам — недвусмысленная пометка, а не молчаливое «idle». */
export const CrashRow = ({ item }: { item: CrashItem }) => (
  <div className={s.crash}>
    <span className={s.crashLabel}>SESSION</span>
    <span className={s.crashText}>{item.message}</span>
  </div>
)
