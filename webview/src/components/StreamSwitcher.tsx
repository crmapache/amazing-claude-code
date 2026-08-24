import { useCallback } from 'react'
import s from './shell.module.css'

export type AgentStatus = 'idle' | 'running' | 'done' | 'needs-input' | 'stopped' | 'failed'

export interface AgentTab {
  id: string
  label: string
  meta: string
  status: AgentStatus
  /** How far the agent has got - it goes onto the chip as the circle's fill rather than as text. */
  percent: number
  duration: string
  /**
   * What the CLI calls this work, when it can still be killed. Empty for everything already finished and
   * for an agent whose launch the CLI has not reported yet - then the chip carries no cross either: there
   * would be nothing to press.
   */
  stopId?: string
}

/** A background command running right now: not a stream, there is nothing to switch to in it. */
export interface BackgroundChip {
  id: string
  /** What it was launched with, in two words: `sandbox.sh`, `pnpm dev`. */
  label: string
  /** The model's description of the command - it does not fit the chip and lives in the tooltip. */
  description: string
  /** And the command itself, which is what the tooltip is actually for. */
  command?: string
  duration: string
}

interface StreamSwitcherProps {
  tabs: AgentTab[]
  background: BackgroundChip[]
  mainStatus: AgentStatus
  active: string
  onPick: (id: string) => void
  /** The cross on the chip: we ask for confirmation, and App does the killing. */
  onStop: (task: { id: string; title: string; subject: string }) => void
}

const STATUS_DOT: Partial<Record<AgentStatus, string>> = {
  running: 'var(--acc-accent)',
  done: 'var(--acc-ok)',
  'needs-input': 'var(--acc-warn)',
  stopped: 'var(--acc-fg-faint)',
  failed: 'var(--acc-bad)',
}

/**
 * How many pixels to travel horizontally per notch of the wheel. A wheel does not always measure its
 * movement in pixels: with some mice and shells the event arrives in lines or pages, and then the "raw"
 * value is 3 rather than 100, and the chip strip would barely move.
 */
const wheelStep = (event: WheelEvent, element: HTMLElement) => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * element.clientWidth
  return event.deltaY
}

/**
 * A progress circle instead of a flat dot - filled clockwise by exactly percent, an empty outline at 0%,
 * a solid circle at 100%. The colour is the one the dot would have had: the fill answers "how much", the
 * colour "what right now".
 */
const ProgressDot = ({ percent, color }: { percent: number; color: string }) => (
  <span
    className={s.streamProgress}
    style={{ borderColor: color, background: `conic-gradient(${color} ${percent}%, transparent ${percent}%)` }}
  />
)

/**
 * The cross is drawn rather than written as a character: the typographic "×" has a seat of its own in the
 * font - it sits above the baseline and off-centre in its own line - and in a small square button that is
 * visible to the eye. With lines the centre is where we put it.
 */
const StopCross = () => (
  <svg className={s.streamStopIcon} viewBox="0 0 8 8" aria-hidden="true">
    <path d="M1.4 1.4 6.6 6.6M6.6 1.4 1.4 6.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

/**
 * Chips instead of a dropdown: main always first, then the agents in launch order. A click switches what
 * is visible in the output area - like tabs. It appears only once there has been at least one agent in
 * the session: before that there is nothing to switch between, and until the first launch the room in the
 * header is better left alone.
 */
export const StreamSwitcher = ({
  tabs,
  background,
  mainStatus,
  active,
  onPick,
  onStop,
}: StreamSwitcherProps) => {
  // A mouse wheel scrolls vertically only - we translate deltaY into horizontal scrolling ourselves, or
  // on overflow the chips would be unreachable without a trackpad and without Shift. preventDefault needs
  // a real, non-passive listener: otherwise the event would also roll the feed down on every scroll of
  // the chips. The listener is attached in a callback ref rather than in an effect: the chip strip
  // appears after the first render (before the first agent there is none at all), and an effect with
  // empty dependencies would have found nothing but emptiness.
  const attachWheel = useCallback((element: HTMLDivElement | null) => {
    if (!element) return

    const onWheel = (event: WheelEvent) => {
      // A horizontal trackpad gesture (and a wheel with Shift) the browser handles itself - there is no
      // need to interfere. But a horizontal one specifically, not any gesture with a hint of sideways
      // movement: perfectly vertical swipes do not happen on a trackpad, and bowing out on the mere
      // presence of deltaX would leave the strip standing still. What decides is whichever there is more
      // of in the gesture.
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      element.scrollLeft += wheelStep(event, element)
      event.preventDefault()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  if (tabs.length === 0 && background.length === 0) return null

  const list = (
    <div className={s.streamList} ref={attachWheel}>
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

      {/* Not a button but a row with buttons inside: a chip has two - the chip itself switches the
          stream, the cross kills the work. */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`${s.stream} ${tab.stopId ? s.streamStoppable : ''} ${tab.id === active ? s.streamActive : ''}`}
          role="button"
          tabIndex={0}
          // The agent's occupation on the chip is cut off by width - the full text stays in the hover
          // tooltip.
          title={tab.meta || undefined}
          onClick={() => onPick(tab.id)}
          // The chip has stopped being a button (there is one inside it, the cross), but from the
          // keyboard it still has to work - hence the role and both keys.
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onPick(tab.id)
          }}
        >
          <ProgressDot percent={tab.percent} color={STATUS_DOT[tab.status] ?? 'var(--acc-fg-fainter)'} />
          <span className={s.streamLabel}>{tab.label}</span>
          {tab.duration ? <span className={s.streamDuration}>{tab.duration}</span> : null}
          {/* What the agent is busy with right now goes as a line on the chip itself rather than only in
              a tooltip: a tooltip does not update while it hangs there - and the occupation changes as it
              goes - and it cannot be opened from the keyboard at all. The line would eat the whole width,
              so it is narrow and ends in an ellipsis. */}
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

      {/* A background command is not a tab: it has no stream of its own and there is nothing to show on
          a click. This is a mark that the process is still alive, and it stays exactly as long as it
          runs. */}
      {background.map((task) => (
        <span
          key={task.id}
          className={`${s.stream} ${s.streamStatic} ${s.streamStoppable}`}
          // The panel's own tooltip rather than the browser's: this page renders offscreen, and a
          // native title never reaches the IDE's window - hovering a chip showed nothing at all.
          //
          // The command first, because that is the question a chip raises ("what is this that keeps
          // running"), and the model's description under it when there is one.
          data-tooltip={[task.command, task.description].filter(Boolean).join('\n') || task.label}
          data-tooltip-at="top"
        >
          <span className={s.streamDot} style={{ background: 'var(--acc-accent)' }} />
          <span className={s.streamLabel}>bg</span>
          <span className={s.streamDuration}>{task.duration}</span>
          <span className={s.streamMeta}>{task.label}</span>
          <button
            type="button"
            className={s.streamStop}
            title="Stop this command"
            aria-label={`Stop ${task.label}`}
            onClick={() =>
              onStop({ id: task.id, title: 'Stop this command?', subject: task.description || task.label })
            }
          >
            <StopCross />
          </button>
        </span>
      ))}
    </div>
  )

  return <div className={s.streams}>{list}</div>
}
