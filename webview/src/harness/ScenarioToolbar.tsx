import type { Scenario } from './types'
import s from './harness.module.css'

interface ScenarioToolbarProps {
  scenarios: Scenario[]
  activeId: string | null
  onRun: (scenario: Scenario) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

const CATEGORY_LABEL: Record<Scenario['category'], string> = {
  grouping: 'Группировка вызовов',
  cards: 'Остальные карточки',
  system: 'Служебные состояния',
  combined: 'Комбинированный',
}

const CATEGORY_ORDER: Scenario['category'][] = ['grouping', 'cards', 'system', 'combined']

export const ScenarioToolbar = ({ scenarios, activeId, onRun, collapsed, onToggleCollapsed }: ScenarioToolbarProps) => {
  return (
    <div className={`${s.toolbar} ${collapsed ? s.toolbarCollapsed : ''}`}>
      <div className={s.toolbarHead}>
        {!collapsed ? <span className={s.toolbarTitle}>Сценарии</span> : null}
        <button type="button" className={s.toolbarToggle} onClick={onToggleCollapsed}>
          {collapsed ? '«' : '»'}
        </button>
      </div>

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
