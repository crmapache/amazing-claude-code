import s from './shell.module.css'

interface SkeletonBarProps {
  width: string | number
  height?: number
  /** For a status dot - a circle rather than a rounded rectangle. */
  round?: boolean
}

/**
 * A stand-in where text or a button will be while the data has not arrived - with the same breathing
 * (acc-pulse) as a tab's working dot. It is there so that a modal takes roughly the same height at once
 * as it will with real data: without it the list appears empty and the height jerks when the answer
 * finally arrives.
 */
export const SkeletonBar = ({ width, height = 11, round }: SkeletonBarProps) => (
  <span className={s.skeletonBar} style={{ width, height, borderRadius: round ? '50%' : undefined }} />
)
