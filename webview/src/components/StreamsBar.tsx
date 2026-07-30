import s from './shell.module.css'

export interface Stream {
  id: string
  label: string
  meta: string
  live: boolean
  color: string
}

interface StreamsBarProps {
  streams: Stream[]
  activeStream: string
  runningAgents: number
  onPick: (id: string) => void
  onOpenDrawer: () => void
}

export const StreamsBar = ({
  streams,
  activeStream,
  runningAgents,
  onPick,
  onOpenDrawer,
}: StreamsBarProps) => (
  <div className={s.streams}>
    <span className={s.streamsLabel}>STREAMS</span>

    <div className={s.streamList}>
      {streams.map((stream) => (
        <button
          key={stream.id}
          type="button"
          className={`${s.stream} ${stream.id === activeStream ? s.streamActive : ''}`}
          onClick={() => onPick(stream.id)}
        >
          <span
            className={`${s.streamDot} ${stream.live ? s.dotRunning : ''}`}
            style={{ background: stream.color }}
          />
          <span className={s.streamLabel}>{stream.label}</span>
          {stream.meta ? <span className={s.streamMeta}>{stream.meta}</span> : null}
        </button>
      ))}
    </div>

    <div className={s.spacer} />

    {runningAgents > 0 ? (
      <button type="button" className={s.running} onClick={onOpenDrawer}>
        <span className={s.runningDot} />
        <span className={s.runningLabel}>
          {runningAgents} {runningAgents === 1 ? 'agent' : 'agents'} running
        </span>
        <span style={{ fontSize: 9, opacity: 0.8 }}>▸</span>
      </button>
    ) : null}
  </div>
)
