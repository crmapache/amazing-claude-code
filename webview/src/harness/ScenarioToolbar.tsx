import type { PlaybackMode, Scenario } from './types'
import s from './harness.module.css'

interface ScenarioToolbarProps {
  scenarios: Scenario[]
  activeId: string | null
  onRun: (scenario: Scenario) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  mode: PlaybackMode
  onModeChange: (mode: PlaybackMode) => void
}

const CATEGORY_LABEL: Record<Scenario['category'], string> = {
  grouping: 'Группировка вызовов',
  cards: 'Остальные карточки',
  system: 'Служебные состояния',
  combined: 'Комбинированный',
}

const CATEGORY_ORDER: Scenario['category'][] = ['grouping', 'cards', 'system', 'combined']

export const ScenarioToolbar = ({
  scenarios,
  activeId,
  onRun,
  collapsed,
  onToggleCollapsed,
  mode,
  onModeChange,
}: ScenarioToolbarProps) => {
  return (
    <div className={`${s.toolbar} ${collapsed ? s.toolbarCollapsed : ''}`}>
      <div className={s.toolbarHead}>
        {!collapsed ? <span className={s.toolbarTitle}>Сценарии</span> : null}
        <button type="button" className={s.toolbarToggle} onClick={onToggleCollapsed}>
          {collapsed ? '«' : '»'}
        </button>
      </div>

      {!collapsed ? (
        <div className={s.modeSwitch}>
          <button
            type="button"
            className={`${s.modeButton} ${mode === 'auto' ? s.modeActive : ''}`}
            onClick={() => onModeChange('auto')}
          >
            Авто
          </button>
          <button
            type="button"
            className={`${s.modeButton} ${mode === 'step' ? s.modeActive : ''}`}
            onClick={() => onModeChange('step')}
          >
            Шаги
          </button>
        </div>
      ) : null}

      {!collapsed
        ? CATEGORY_ORDER.filter((category) => scenarios.some((item) => item.category === category)).map(
            (category) => (
              <div key={category} className={s.group}>
                <div className={s.groupLabel}>{CATEGORY_LABEL[category]}</div>
                {scenarios
                  .filter((item) => item.category === category)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${s.scenarioButton} ${activeId === item.id ? s.scenarioActive : ''}`}
                      onClick={() => onRun(item)}
                    >
                      {item.title}
                    </button>
                  ))}
              </div>
            ),
          )
        : null}
    </div>
  )
}
