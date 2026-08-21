import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../App'
import '../base.css'
import { CheckpointsCard } from './CheckpointsCard'
import styles from './harness.module.css'
import { ScenarioPlayer } from './player'
import { ScenarioToolbar } from './ScenarioToolbar'
import { scenarios } from './scenarios'
import type { PlaybackMode, Scenario } from './types'

const player = new ScenarioPlayer()

const Harness = () => {
  const [runId, setRunId] = useState(0)
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null)
  const [checkpointIndex, setCheckpointIndex] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [mode, setMode] = useState<PlaybackMode>('auto')
  const [copied, setCopied] = useState(false)

  // The keys read the freshest values without recreating the handler on every little thing.
  const stateRef = useRef({ activeScenario, checkpointIndex })
  stateRef.current = { activeScenario, checkpointIndex }

  const jumpToCheckpoint = useCallback((scenario: Scenario, targetIndex: number) => {
    const clamped = Math.max(0, Math.min(targetIndex, scenario.checkpoints.length - 1))
    player.cancel()
    setActiveScenario(scenario)
    setCheckpointIndex(clamped)
    setRunId((id) => id + 1)
    void player.jumpTo(scenario, clamped)
  }, [])

  const runScenario = useCallback(
    (next: Scenario) => {
      if (mode === 'step') {
        jumpToCheckpoint(next, 0)
        return
      }

      player.cancel()
      setActiveScenario(next)
      setCheckpointIndex(0)
      setRunId((id) => id + 1)
      void player.playAuto(next, (progress) => setCheckpointIndex(progress.checkpointIndex))
    },
    [mode, jumpToCheckpoint],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { activeScenario: scenario, checkpointIndex: index } = stateRef.current
      if (!scenario) return
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return

      // We do not intercept the arrows while the focus is in any input field - there they walk the text.
      // The panel's message field is a contenteditable rather than a <textarea>: without this check an
      // arrow in it wound the checkpoint on, recreated the panel along with it and wiped the typed draft.
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.isContentEditable) return

      event.preventDefault()
      jumpToCheckpoint(scenario, event.key === 'ArrowRight' ? index + 1 : index - 1)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [jumpToCheckpoint])

  const copyLog = useCallback(() => {
    if (!activeScenario) return

    const current = activeScenario.checkpoints[checkpointIndex]
    const text = [
      `Scenario: ${activeScenario.id} - ${activeScenario.title}`,
      `Mode: ${mode === 'auto' ? 'auto' : 'steps'}`,
      `Checkpoint: ${checkpointIndex + 1} / ${activeScenario.checkpoints.length} - ${current?.label ?? ''}`,
    ].join('\n')

    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [activeScenario, checkpointIndex, mode])

  return (
    <div className={styles.harnessRoot}>
      <div className={styles.stageCard}>
        <App key={runId} />
      </div>
      <CheckpointsCard
        scenario={activeScenario}
        currentIndex={checkpointIndex}
        onJump={(index) => activeScenario && jumpToCheckpoint(activeScenario, index)}
        onCopyLog={copyLog}
        copied={copied}
      />
      <ScenarioToolbar
        scenarios={scenarios}
        activeId={activeScenario?.id ?? null}
        onRun={runScenario}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mode={mode}
        onModeChange={setMode}
      />
    </div>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing in harness.html')

createRoot(container).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
