import { useEffect, useRef } from 'react'
import s from './shell.module.css'

/**
 * Что происходит во вкладке: ничего, идёт работа, работа закончена или ждут
 * человека. Кружок один и тот же, отличаются цвет и дыхание — так состояние видно
 * боковым зрением, не читая подпись.
 */
export type SessionState = 'idle' | 'running' | 'done' | 'attention' | 'crashed'

export interface Session {
  id: string
  title: string
  state: SessionState
  /** Корневой разговор: форки и форки форков носят один и тот же. */
  groupId: string
  /** Глубина ветвления: 0 — корень, 1 — форк, 2 — форк форка. */
  depth: number
}

/**
 * Цвета групп, но не просто оттенок по кругу: два соседних оттенка при одной
 * яркости/насыщенности на глаз почти не отличаются (первая попытка именно так
 * и вышла) — золотой угол между оттенками расшатывает соседство, а чередование
 * из трёх поясов яркости/насыщенности разводит по контрасту даже те пары
 * оттенков, что всё равно оказались рядом.
 *
 * Радуга на все 360° была единственным цветным шумом в панели: вкладки
 * перекрикивали ленту, ради которой панель и открывают. Теперь оттенки живут в
 * холодной дуге темы (аквамарин → лунно-голубой → ирис) — группы по-прежнему
 * различимы, но не спорят с акцентами.
 */
const GROUP_COLOR_COUNT = 18
const GOLDEN_ANGLE = 137.508
/** Холодная дуга: аквамарин → лунно-голубой → ирис. Ширина дуги 114°. */
const HUE_START = 178
const HUE_SPAN = 114
const COLOR_BANDS = [
  { s: 62, l: 70 },
  { s: 55, l: 58 },
  { s: 45, l: 78 },
]
const GROUP_COLORS = Array.from({ length: GROUP_COLOR_COUNT }, (_, index) => {
  const hue = Math.round(HUE_START + ((index * GOLDEN_ANGLE) % HUE_SPAN))
  const band = COLOR_BANDS[index % COLOR_BANDS.length]!
  return `hsl(${hue}, ${band.s}%, ${band.l}%)`
})

/**
 * Не по счёту вкладок, а от самого id группы — цвет не сползает, когда рядом
 * открываются и закрываются другие. Простое умножение на 31 плохо
 * перемешивает похожие строки (у "session-<timestamp>" отличаются только
 * последние цифры) — соседние по времени вкладки получали соседние по кругу
 * оттенки, то есть визуально одинаковые. Финализатор MurmurHash3 ниже — тот
 * самый шаг лавинного перемешивания, после которого мелкая разница на входе
 * даёт совсем другой номер цвета на выходе.
 */
const colorForGroup = (groupId: string): string => {
  let hash = 0
  for (let i = 0; i < groupId.length; i++) hash = Math.imul(hash ^ groupId.charCodeAt(i), 0x01000193)

  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16

  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length] ?? GROUP_COLORS[0]!
}

interface HeaderProps {
  sessions: Session[]
  activeSession: string
  onPickSession: (id: string) => void
  onCloseSession: (id: string) => void
  onNewSession: () => void
  onOpenHistory: () => void
  onOpenMcp: () => void
  onOpenPlugins: () => void
}

const DOT_CLASS: Record<SessionState, string> = {
  idle: '',
  running: s.dotRunning ?? '',
  done: s.dotDone ?? '',
  attention: s.dotAttention ?? '',
  crashed: s.dotCrashed ?? '',
}

const DOT_TITLE: Record<SessionState, string> = {
  idle: 'Idle',
  running: 'Claude is working',
  done: 'Turn finished',
  attention: 'Waiting for you',
  crashed: 'Session stopped unexpectedly',
}

export const Header = ({
  sessions,
  activeSession,
  onPickSession,
  onCloseSession,
  onNewSession,
  onOpenHistory,
  onOpenMcp,
  onOpenPlugins,
}: HeaderProps) => {
  const header = useRef<HTMLElement>(null)

  /**
   * Вкладки при нехватке места переносятся на вторую строку — хедер растёт.
   * Оверлеи (история, MCP, плагины, меню) позиционируются от его реальной
   * высоты через переменную, а не число: иначе на второй строке они легли бы
   * поверх вкладок.
   */
  useEffect(() => {
    const element = header.current
    if (!element) return

    const updateHeight = () => {
      document.documentElement.style.setProperty('--header-height', `${element.offsetHeight}px`)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <header className={s.header} ref={header}>
      <div className={s.tabs}>
        {sessions.map((session, index) => {
          const color = colorForGroup(session.groupId)
          // Группу отбиваем от соседней зазором: цвета мало, если вкладки слиплись.
          const startsGroup = index === 0 || sessions[index - 1]?.groupId !== session.groupId

          return (
            <div
              key={session.id}
              className={`${s.tab} ${session.id === activeSession ? s.tabActive : ''} ${
                startsGroup ? s.tabGroupStart : ''
              }`}
              style={{ paddingLeft: 11 + session.depth * 9 }}
              onClick={() => onPickSession(session.id)}
            >
              <span className={s.tabGroupBar} style={{ background: color }} />
              <span className={`${s.dot} ${DOT_CLASS[session.state]}`} title={DOT_TITLE[session.state]} />
              {session.depth > 0 ? (
                <span className={s.tabFork} style={{ color }}>
                  ⑂
                </span>
              ) : null}
              <span className={s.tabTitle}>{session.title}</span>
              <button
                type="button"
                className={s.tabClose}
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseSession(session.id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}

        <button type="button" className={s.tabAdd} title="New session" onClick={onNewSession}>
          +
        </button>
      </div>

      <div className={s.spacer} />

      <div className={s.headerTools}>
        {/* Возобновление разговора в потоковом режиме недоступно слэш-командой:
            она открывает интерактивный список. Поэтому список свой. */}
        <button
          type="button"
          className={s.historyButton}
          aria-label="Past conversations in this project"
          data-tooltip="Past conversations in this project"
          onClick={onOpenHistory}
        >
          ◷
        </button>
        <button
          type="button"
          className={s.historyButton}
          aria-label="MCP servers"
          data-tooltip="MCP servers"
          onClick={onOpenMcp}
        >
          ⇄
        </button>
        <button
          type="button"
          className={s.historyButton}
          aria-label="Plugins"
          data-tooltip="Plugins"
          onClick={onOpenPlugins}
        >
          ⬡
        </button>
      </div>
    </header>
  )
}
