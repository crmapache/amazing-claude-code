import type { CheckpointItem, CompactItem, CrashItem, MetaItem, ThinkItem } from '../../feed/types'
import s from '../feed.module.css'

/**
 * Всегда в одну строку — обрезаем многоточием через CSS (text-overflow), а не
 * разворачиваем на полэкрана: это ход мысли между делом, не то, ради чего
 * приходят в панель. Пока мысль ещё стримится, plашка дышит тем же пульсом,
 * что и CONTEXT во время сжатия — тот же язык «идёт, не готово».
 */
export const ThinkRow = ({ item }: { item: ThinkItem }) => (
  <div className={s.think}>
    <span className={`${s.toolChip} ${s.chipThink} ${item.pending ? s.thinkPending : ''}`}>THINK</span>
    <span className={s.thinkText}>{item.text}</span>
  </div>
)

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
