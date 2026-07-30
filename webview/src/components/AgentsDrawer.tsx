import s from './shell.module.css'

export interface AgentCard {
  id: string
  name: string
  kind: string
  live: boolean
  elapsed: string
  percent: number
  line: string
}

interface AgentsDrawerProps {
  agents: AgentCard[]
  onFocus: (id: string) => void
  onClose: () => void
}

export const AgentsDrawer = ({ agents, onFocus, onClose }: AgentsDrawerProps) => {
  const running = agents.filter((agent) => agent.live).length

  return (
    <>
      <div className={s.drawerScrim} onClick={onClose} />
      <aside className={s.drawer}>
        <div className={s.drawerHead}>
          <span className={s.drawerLabel}>PARALLEL WORK</span>
          <span className={s.drawerMeta}>
            {running} running · {agents.length - running} finished
          </span>
          <div className={s.spacer} />
          <button type="button" className={s.tabClose} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={s.drawerBody}>
          {agents.map((agent) => (
            <div key={agent.id} className={`${s.agent} ${agent.live ? '' : s.agentDone}`}>
              <div className={s.agentHead}>
                <span className={`${s.agentDot} ${agent.live ? s.agentDotLive : ''}`} />
                <span className={s.agentName}>{agent.name}</span>
                <span className={s.agentKind}>{agent.kind}</span>
                <div className={s.spacer} />
                <span className={s.agentElapsed}>{agent.elapsed}</span>
              </div>

              <div className={s.agentBody}>
                <div className={s.agentLine}>{agent.line}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className={s.gaugeTrack} style={{ flex: 1, width: 'auto' }}>
                    <div
                      className={s.gaugeFill}
                      style={{ width: `${agent.percent}%`, background: 'var(--acc-agent)' }}
                    />
                  </div>
                  <span className={s.agentElapsed}>{agent.percent}%</span>
                </div>
                <div>
                  <button type="button" className={s.drawerClose} onClick={() => onFocus(agent.id)}>
                    Open stream
                  </button>
                </div>
              </div>
            </div>
          ))}

          {agents.length === 0 ? (
            <div className={s.drawerEmpty}>
              <span>no subagents dispatched yet</span>
              <div className={s.spacer} />
            </div>
          ) : null}
        </div>

        <div className={s.drawerFoot}>
          <span className={s.drawerMeta}>Dispatched by the lead agent · each has its own context</span>
          <div className={s.spacer} />
          <button type="button" className={s.drawerClose} onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </>
  )
}
