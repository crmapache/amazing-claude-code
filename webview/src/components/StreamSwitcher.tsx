import { useState } from 'react'
import { Menu, type MenuOption } from './Menu'
import type { Anchor } from './StatusBar'
import s from './shell.module.css'

export type AgentStatus = 'idle' | 'running' | 'done' | 'needs-input'

export interface AgentTab {
  id: string
  label: string
  meta: string
  status: AgentStatus
}

interface StreamSwitcherProps {
  tabs: AgentTab[]
  mainStatus: AgentStatus
  active: string
  onPick: (id: string) => void
}

const STATUS_DOT: Partial<Record<AgentStatus, string>> = {
  running: 'var(--acc-accent)',
  done: 'var(--acc-ok)',
  'needs-input': 'var(--acc-warn)',
}

const STATUS_TAG: Partial<Record<AgentStatus, string>> = {
  running: 'RUNNING',
  done: 'DONE',
  'needs-input': 'NEEDS INPUT',
}

/**
 * Дропдаун вместо чипов StreamsBar: переключает, что видно в области вывода —
 * main или конкретный агент. Появляется только когда за сессию был хотя бы
 * один агент — до этого переключать нечего, а до первого запуска место в
 * шапке лучше не занимать.
 */
export const StreamSwitcher = ({ tabs, mainStatus, active, onPick }: StreamSwitcherProps) => {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  if (tabs.length === 0) return null

  const options: MenuOption[] = [
    {
      id: 'main',
      label: 'main',
      dot: STATUS_DOT[mainStatus],
      tag: STATUS_TAG[mainStatus],
      danger: mainStatus === 'needs-input',
    },
    ...tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      sub: tab.meta,
      dot: STATUS_DOT[tab.status],
      tag: STATUS_TAG[tab.status],
      danger: tab.status === 'needs-input',
    })),
  ]

  const currentLabel = active === 'main' ? 'main' : (tabs.find((tab) => tab.id === active)?.label ?? 'main')

  return (
    <div className={s.streamBar}>
      <button
        type="button"
        className={s.selector}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAnchor({ right: window.innerWidth - rect.right, top: rect.top, bottom: rect.bottom })
        }}
      >
        <span className={s.selectorLabel}>STREAM</span>
        <span className={s.selectorValue}>{currentLabel}</span>
        <Chevron />
      </button>

      {anchor ? (
        <Menu
          title="STREAMS"
          hint="what the output area shows"
          width={280}
          anchor={anchor}
          placement="down"
          options={options}
          selected={active}
          onPick={(id) => {
            onPick(id)
            setAnchor(null)
          }}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </div>
  )
}

const Chevron = () => (
  <svg className={s.selectorCaret} viewBox="0 0 10 6" aria-hidden="true">
    <path
      d="M1 1.4 5 5 9 1.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
