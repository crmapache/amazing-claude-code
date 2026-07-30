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
    <>
      {/* Стейдж резервирует место под сайдбар и сам ограничен по ширине, чтобы
          похоже было на настоящую боковую панель IDE, а не на окно браузера
          целиком - иначе оба сценария (plan-approval, permission-waiting),
          которые заканчиваются на клике по настоящей кнопке, эту кнопку
          вообще не давали бы нажать: тулбар лежал бы прямо поверх неё. */}
      <div className={`${styles.stage} ${collapsed ? styles.stageToolbarCollapsed : ''}`}>
        <App key={runId} />
      </div>
      <ScenarioToolbar
        scenarios={scenarios}
        activeId={activeId}
        onRun={runScenario}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />
    </>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing in harness.html')

createRoot(container).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
