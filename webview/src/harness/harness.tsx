import { StrictMode, useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../App'
import '../base.css'
import styles from './harness.module.css'
import { ScenarioPlayer } from './player'
import { ScenarioToolbar } from './ScenarioToolbar'
import { scenarios } from './scenarios'
import type { Scenario } from './types'

const player = new ScenarioPlayer()

const Harness = () => {
  const [runId, setRunId] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const runScenario = useCallback((next: Scenario) => {
    player.cancel()
    setActiveId(next.id)
    setRunId((id) => id + 1)
    void player.play(next)
  }, [])

  return (
    <div className={styles.harnessRoot}>
      <div className={styles.stageCard}>
        <App key={runId} />
      </div>
      <ScenarioToolbar
        scenarios={scenarios}
        activeId={activeId}
        onRun={runScenario}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
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
