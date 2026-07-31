import type { Scenario } from './types'
import s from './harness.module.css'

interface CheckpointsCardProps {
  scenario: Scenario | null
  currentIndex: number
  onJump: (index: number) => void
  onCopyLog: () => void
  copied: boolean
}

export const CheckpointsCard = ({ scenario, currentIndex, onJump, onCopyLog, copied }: CheckpointsCardProps) => {
  const total = scenario?.checkpoints.length ?? 0

  return (
    <div className={s.checkpoints}>
      <div className={s.checkpointsHead}>
        <span className={s.toolbarTitle}>Чекпоинты</span>
        <button type="button" className={s.copyButton} onClick={onCopyLog} disabled={!scenario}>
          {copied ? '✓ скопировано' : 'Скопировать лог'}
        </button>
      </div>

      {!scenario ? (
        <div className={s.checkpointsEmpty}>Запусти сценарий, чтобы увидеть его чекпоинты</div>
      ) : (
        <>
          <div className={s.checkpointsList}>
            {scenario.checkpoints.map((cp, index) => (
              <button
                key={cp.id}
                type="button"
                className={`${s.checkpointRow} ${index === currentIndex ? s.checkpointCurrent : ''} ${
                  index <= currentIndex ? s.checkpointVisited : ''
                }`}
                onClick={() => onJump(index)}
              >
                <span className={s.checkpointDot} />
                <span className={s.checkpointLabel}>
                  {index + 1}. {cp.label}
                </span>
              </button>
            ))}
          </div>

          <div className={s.checkpointsNav}>
            <button type="button" disabled={currentIndex <= 0} onClick={() => onJump(currentIndex - 1)}>
              ←
            </button>
            <span className={s.checkpointsCounter}>
              {currentIndex + 1} / {total}
            </span>
            <button type="button" disabled={currentIndex >= total - 1} onClick={() => onJump(currentIndex + 1)}>
              →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
