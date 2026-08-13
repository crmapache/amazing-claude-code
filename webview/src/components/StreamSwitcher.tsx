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
  /**
   * Чем эту работу зовёт CLI, если её ещё можно прибить. Пусто у всего, что уже
   * закончилось, и у агента, о запуске которого CLI пока не сообщил, — тогда и
   * крестика на чипе нет: нажимать было бы не на что.
   */
  stopId?: string
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
  /** Крестик на чипе: спрашиваем подтверждение, прибивает уже App. */
  onStop: (task: { id: string; title: string; subject: string }) => void
  /**
   * Compact экономит высоту и держит переключатель не отдельной строкой под
   * шапкой, а чипами внутри неё самой, рядом с иконками (см. Header). Без
   * своих отступов, фона и рамки снизу — они здесь чужие, чипы и так стоят в
   * ряду с остальными элементами шапки.
   */
  inline?: boolean
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
 * Крестик рисуем, а не пишем символом: у типографского «×» своя посадка в
 * шрифте — он сидит выше базовой линии и не по центру собственной строки, — и
 * в маленькой квадратной кнопке это видно на глаз. У линий центр там, где мы
 * его поставили.
 */
const StopCross = () => (
  <svg className={s.streamStopIcon} viewBox="0 0 8 8" aria-hidden="true">
    <path d="M1.4 1.4 6.6 6.6M6.6 1.4 1.4 6.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

/**
 * Чипы вместо дропдауна: main всегда первым, дальше агенты в порядке запуска.
 * Клик переключает, что видно в области вывода — как вкладки. Появляется
 * только когда за сессию был хотя бы один агент — до этого переключать
 * нечего, а до первого запуска место в шапке лучше не занимать.
 */
export const StreamSwitcher = ({
  tabs,
  background,
  mainStatus,
  active,
  onPick,
  onStop,
  inline = false,
}: StreamSwitcherProps) => {
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

  const list = (
    <div className={`${s.streamList} ${inline ? s.streamListInline : ''}`} ref={listRef}>
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

      {/* Не кнопка, а строка с кнопками внутри: у чипа их две — сам он
          переключает поток, крестик прибивает работу. */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`${s.stream} ${tab.stopId ? s.streamStoppable : ''} ${tab.id === active ? s.streamActive : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onPick(tab.id)}
          // Кнопкой чип быть перестал (внутри своя, крестик), но с клавиатуры
          // он обязан работать по-прежнему — оттого роль и обе клавиши.
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onPick(tab.id)
          }}
        >
          <ProgressDot percent={tab.percent} color={STATUS_DOT[tab.status] ?? 'var(--acc-fg-fainter)'} />
          <span className={s.streamLabel}>{tab.label}</span>
          {tab.duration ? <span className={s.streamDuration}>{tab.duration}</span> : null}
          {tab.meta ? <span className={s.streamMeta}>{tab.meta}</span> : null}
          {tab.stopId ? (
            <button
              type="button"
              className={s.streamStop}
              title="Stop this agent"
              aria-label={`Stop ${tab.label}`}
              onClick={(event) => {
                event.stopPropagation()
                onStop({
                  id: tab.stopId as string,
                  title: 'Stop this agent?',
                  subject: tab.meta || tab.label,
                })
              }}
            >
              <StopCross />
            </button>
          ) : null}
        </div>
      ))}

      {/* Фоновая команда — не вкладка: своего потока у неё нет, показывать по
          клику нечего. Это метка о том, что процесс всё ещё жив, и держится
          она ровно столько, сколько он работает. */}
      {background.map((task) => (
        <span key={task.id} className={`${s.stream} ${s.streamStatic} ${s.streamStoppable}`} title={task.label}>
          <span className={s.streamDot} style={{ background: 'var(--acc-accent)' }} />
          <span className={s.streamLabel}>bg</span>
          <span className={s.streamDuration}>{task.duration}</span>
          <span className={s.streamMeta}>{task.label}</span>
          <button
            type="button"
            className={s.streamStop}
            title="Stop this command"
            aria-label={`Stop ${task.label}`}
            onClick={() => onStop({ id: task.id, title: 'Stop this command?', subject: task.label })}
          >
            <StopCross />
          </button>
        </span>
      ))}
    </div>
  )

  return inline ? list : <div className={s.streams}>{list}</div>
}
