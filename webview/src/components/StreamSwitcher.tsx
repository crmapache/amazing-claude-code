import { useEffect, useRef } from 'react'
import s from './shell.module.css'

export type AgentStatus = 'idle' | 'running' | 'done' | 'needs-input' | 'stopped' | 'failed'

export interface AgentTab {
  id: string
  label: string
  meta: string
  status: AgentStatus
  /** Сколько агент уже прошёл — на чип идёт как заполнение кружка, не текстом. */
  percent: number
  duration: string
}

/** Работающая прямо сейчас фоновая команда: не стрим, переключать в ней нечего. */
export interface BackgroundChip {
  id: string
  label: string
  duration: string
}

interface StreamSwitcherProps {
  tabs: AgentTab[]
  background: BackgroundChip[]
  mainStatus: AgentStatus
  active: string
  onPick: (id: string) => void
}

const STATUS_DOT: Partial<Record<AgentStatus, string>> = {
  running: 'var(--acc-accent)',
  done: 'var(--acc-ok)',
  'needs-input': 'var(--acc-warn)',
  stopped: 'var(--acc-fg-faint)',
  failed: 'var(--acc-bad)',
}

/**
 * Кружок прогресса вместо плоской точки — залит по часовой стрелке ровно на
 * percent, пустой контур при 0%, сплошной кружок при 100%. Цвет тот же, что
 * был бы у точки: заполнение отвечает за «сколько», цвет — за «что сейчас».
 */
const ProgressDot = ({ percent, color }: { percent: number; color: string }) => (
  <span
    className={s.streamProgress}
    style={{ borderColor: color, background: `conic-gradient(${color} ${percent}%, transparent ${percent}%)` }}
  />
)

/**
 * Чипы вместо дропдауна: main всегда первым, дальше агенты в порядке запуска.
 * Клик переключает, что видно в области вывода — как вкладки. Появляется
 * только когда за сессию был хотя бы один агент — до этого переключать
 * нечего, а до первого запуска место в шапке лучше не занимать.
 */
export const StreamSwitcher = ({ tabs, background, mainStatus, active, onPick }: StreamSwitcherProps) => {
  const listRef = useRef<HTMLDivElement | null>(null)

  // Колесо мыши крутит только по вертикали — переводим deltaY в горизонтальную
  // прокрутку сами, иначе при переполнении чипы были бы недостижимы без
  // трекпада. preventDefault нужен настоящий, не пассивный слушатель: иначе
  // событие ещё и укатило бы страницу вниз при каждой прокрутке чипов.
  useEffect(() => {
    const element = listRef.current
    if (!element) return

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return
      element.scrollLeft += event.deltaY
      event.preventDefault()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  if (tabs.length === 0 && background.length === 0) return null

  return (
    <div className={s.streams}>
      <div className={s.streamList} ref={listRef}>
        <button
          type="button"
          className={`${s.stream} ${active === 'main' ? s.streamActive : ''}`}
          onClick={() => onPick('main')}
        >
          {STATUS_DOT[mainStatus] ? (
            <span className={s.streamDot} style={{ background: STATUS_DOT[mainStatus] }} />
          ) : null}
          <span className={s.streamLabel}>main</span>
        </button>

        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${s.stream} ${tab.id === active ? s.streamActive : ''}`}
            onClick={() => onPick(tab.id)}
          >
            <ProgressDot percent={tab.percent} color={STATUS_DOT[tab.status] ?? 'var(--acc-fg-fainter)'} />
            <span className={s.streamLabel}>{tab.label}</span>
            {tab.duration ? <span className={s.streamDuration}>{tab.duration}</span> : null}
            {tab.meta ? <span className={s.streamMeta}>{tab.meta}</span> : null}
          </button>
        ))}

        {/* Фоновая команда — не вкладка: своего потока у неё нет, показывать по
            клику нечего. Это метка о том, что процесс всё ещё жив, и держится
            она ровно столько, сколько он работает. */}
        {background.map((task) => (
          <span key={task.id} className={`${s.stream} ${s.streamStatic}`} title={task.label}>
            <span className={s.streamDot} style={{ background: 'var(--acc-accent)' }} />
            <span className={s.streamLabel}>bg</span>
            <span className={s.streamDuration}>{task.duration}</span>
            <span className={s.streamMeta}>{task.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
