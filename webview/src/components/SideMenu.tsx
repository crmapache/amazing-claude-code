import { useEffect, useRef, type ReactNode } from 'react'
import { useHoverTarget } from '../hooks/useHoverTarget'
import { useWheelScroll } from '../hooks/useWheelScroll'
import { STATISTICS_ICON } from '../stats/icons'
import s from './sideMenu.module.css'

/**
 * Which screen the menu is showing. `menu` is the root list; the rest slide over it and keep it
 * underneath, which is what makes the way back a step rather than a fresh start.
 */
export type MenuScreen =
  | 'menu'
  | 'history'
  | 'mcp'
  | 'plugins'
  | 'sounds'
  | 'remote'
  | 'remoteAbout'
  | 'defaultMode'
  | 'composerLayout'
  | 'improvePrompt'
  | 'feedback'
  | 'feedbackLog'

/** The state of remote access as the root row shows it - the colour and the words come from the caller. */
export interface RemoteSummary {
  label: string
  hint: string
  tone: 'off' | 'busy' | 'live' | 'bad'
}

/**
 * What each entry says without being opened. The numbers are the answer to the question one would open
 * the screen for - how many servers are up, which mode new tabs start in.
 */
export interface MenuSummary {
  history: number | null
  /** Achievements earned against all of them - "27/50". Empty until the figures arrive. */
  statistics: string
  mcp: { connected: number; total: number } | null
  plugins: number | null
  sounds: string
  defaultMode: string
  composerLayout: string
  /** Whether the improve button asks by a text of one's own - "Default" or "Custom". */
  improvePrompt: string
  remote: RemoteSummary
  version: string
}

interface SideMenuProps {
  open: boolean
  screen: MenuScreen
  summary: MenuSummary
  onPick: (screen: MenuScreen) => void
  /**
   * The statistics are not a screen of the menu but a tab of the strip (see Header): the row here opens
   * that tab and the menu closes behind it. A screen inside the menu would be 350 pixels wide, and a
   * chart of a month wants the whole panel.
   */
  onOpenStatistics: () => void
  onBack: () => void
  onClose: () => void
  /** The screen itself, built by the caller - the frame knows nothing about what is inside. */
  children: ReactNode
}

/**
 * Where a step back leads from each screen. Two of them stand one level deeper than the rest: "what
 * travels" belongs to remote access, and the report's preview belongs to the feedback form it is about -
 * coming back from either to the root list would lose the screen that was being filled in.
 */
export const parentOf = (screen: MenuScreen): MenuScreen => {
  if (screen === 'remoteAbout') return 'remote'
  if (screen === 'feedbackLog') return 'feedback'
  return 'menu'
}

const TITLES: Record<MenuScreen, { title: string; hint: string }> = {
  menu: { title: 'MENU', hint: 'everything the panel keeps out of the way' },
  history: { title: 'HISTORY', hint: 'past conversations of this project' },
  mcp: { title: 'MCP SERVERS', hint: 'status · sign in · reconnect' },
  plugins: { title: 'PLUGINS', hint: 'installed · browse · marketplaces' },
  sounds: { title: 'SOUND ALERTS', hint: 'when the panel calls you' },
  remote: { title: 'REMOTE ACCESS', hint: 'state · relay · paired devices' },
  remoteAbout: { title: 'WHAT TRAVELS', hint: 'read this before you turn it on' },
  defaultMode: { title: 'DEFAULT MODE', hint: 'what new tabs start in' },
  composerLayout: { title: 'COMPOSER LAYOUT', hint: 'where the input sits' },
  improvePrompt: { title: 'IMPROVE PROMPT', hint: 'what the sparkle button asks for' },
  feedback: { title: 'FEEDBACK', hint: 'a bug, an idea, or just hello' },
  feedbackLog: { title: 'WHAT GETS ATTACHED', hint: 'the whole report, before it goes' },
}

const TONE_CLASS: Record<RemoteSummary['tone'], string> = {
  off: 'var(--acc-fg-ghost)',
  busy: 'var(--acc-warn)',
  live: 'var(--acc-ok)',
  bad: 'var(--acc-bad)',
}

/** The tint of the remote row: the state's own colour, faint enough to stay a background. */
const TONE_TINT: Record<RemoteSummary['tone'], { border: string; background: string }> = {
  off: { border: 'var(--acc-line)', background: 'var(--acc-bg-card)' },
  busy: { border: 'var(--acc-warn-32)', background: 'var(--acc-warn-06)' },
  live: { border: 'var(--acc-ok-32)', background: 'var(--acc-ok-10)' },
  bad: { border: 'var(--acc-bad-32)', background: 'var(--acc-bad-10)' },
}

const Chevron = ({ className }: { className: string }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
    <path
      d="M6.2 3.8L10.4 8l-4.2 4.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ICONS: Record<string, ReactNode> = {
  statistics: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={STATISTICS_ICON} />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 4.9V8l2.4 1.5" />
    </svg>
  ),
  mcp: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="2.4" y="3" width="11.2" height="4.2" rx="1.2" />
      <rect x="2.4" y="8.8" width="11.2" height="4.2" rx="1.2" />
      <circle cx="5.2" cy="5.1" r=".75" fill="currentColor" stroke="none" />
      <circle cx="5.2" cy="10.9" r=".75" fill="currentColor" stroke="none" />
    </svg>
  ),
  plugins: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="2.6" y="2.6" width="4.6" height="4.6" rx="1.1" />
      <rect x="8.8" y="2.6" width="4.6" height="4.6" rx="1.1" />
      <rect x="2.6" y="8.8" width="4.6" height="4.6" rx="1.1" />
      <rect x="8.8" y="8.8" width="4.6" height="4.6" rx="1.1" />
    </svg>
  ),
  remote: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="8" cy="8" r="1.7" fill="currentColor" stroke="none" />
      <path d="M4.9 11.1a4.4 4.4 0 010-6.2" />
      <path d="M11.1 4.9a4.4 4.4 0 010 6.2" />
      <path d="M2.6 13.4a7.6 7.6 0 010-10.8" />
      <path d="M13.4 2.6a7.6 7.6 0 010 10.8" />
    </svg>
  ),
  sounds: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.2h2.3L8.4 3.6v8.8L5.3 9.8H3z" />
      <path d="M10.9 5.7a3.3 3.3 0 010 4.6" />
      <path d="M12.7 3.9a5.7 5.7 0 010 8.2" />
    </svg>
  ),
  defaultMode: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.2l4.6 1.7v3.9c0 3-2.1 4.9-4.6 6-2.5-1.1-4.6-3-4.6-6V3.9z" />
    </svg>
  ),
  composerLayout: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="2.4" y="3.2" width="11.2" height="9.6" rx="1.4" />
      <path d="M2.4 10h11.2" />
    </svg>
  ),
  feedback: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M3.2 3.2h9.6a1.6 1.6 0 0 1 1.6 1.6v4.8a1.6 1.6 0 0 1-1.6 1.6H6.6l-2.7 2.2v-2.2h-.7A1.6 1.6 0 0 1 1.6 9.6V4.8a1.6 1.6 0 0 1 1.6-1.6z" />
    </svg>
  ),
  /* The same sparkle the button in the composer wears (see Composer.Sparkle): one mark for one feature,
     so the row and the button recognise each other without being read. */
  improvePrompt: (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="currentColor">
      <path d="M9.5 2.2q1.1 6 6.3 7.3-5.2 1.3-6.3 7.3-1.1-6-6.3-7.3 5.2-1.3 6.3-7.3Z" />
      <path d="M17.8 14q.55 3.3 3.4 4-2.85 0.7-3.4 4-0.55-3.3-3.4-4 2.85-0.7 3.4-4Z" />
    </svg>
  ),
}

/**
 * The menu behind the burger in the header.
 *
 * One panel down the right-hand edge with a screen of its own behind every entry, instead of a dropdown
 * that opened five separate overlays. The point is not the animation: it is that remote access, MCP and
 * the plugins get a whole screen each rather than a popover sized for a list of six, and that the way
 * back is always in the same place.
 *
 * The frame stays mounted while the panel is shut - that is what lets it slide rather than appear. What
 * costs something to render (the screens themselves) the caller withholds until there is a reason.
 */
export const SideMenu = ({ open, screen, summary, onPick, onOpenStatistics, onBack, onClose, children }: SideMenuProps) => {
  const sheet = useRef<HTMLElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const detail = useRef<HTMLDivElement>(null)

  const inDetail = screen !== 'menu'

  // The highlight under the pointer and the wheel both need a hand in the IDE's embedded browser - see
  // the two hooks for why.
  useHoverTarget(sheet)
  useWheelScroll(root, !inDetail)
  useWheelScroll(detail, inDetail)

  /*
   * Escape closes what is open, one step at a time: "what travels" goes back to remote access, a screen
   * goes back to the root, the root closes the menu. Caught in the capture phase and stopped there -
   * further down the same key means "stop the agent" (see App), and closing a menu must not do that.
   */
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()

      if (screen === 'menu') onClose()
      else onBack()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, screen, onBack, onClose])

  const head = TITLES[screen]
  const remoteTint = TONE_TINT[summary.remote.tone]

  return (
    <>
      <div className={`${s.scrim} ${open ? s.scrimOpen : s.scrimShut}`} onClick={onClose} />

      <aside ref={sheet} className={`${s.sheet} ${open ? s.sheetOpen : s.sheetShut}`} aria-hidden={!open}>
        <div className={s.head}>
          {inDetail ? (
            <button type="button" className={s.headButton} aria-label="Back" onClick={onBack}>
              <svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
                <path
                  d="M9.5 3.5L5 8l4.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}

          <div className={s.headTitles}>
            <span className={s.title}>{head.title}</span>
            <span className={s.hint}>{head.hint}</span>
          </div>

          <div className={s.headSpace} />

          <button
            type="button"
            className={`${s.headButton} ${s.headClose}`}
            aria-label="Close menu"
            onClick={onClose}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
              <path
                d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className={s.stage}>
          <div
            ref={root}
            className={`${s.level} ${s.levelRoot} ${inDetail ? s.levelRootHeld : s.levelRootShown}`}
            // Nothing under the detail screen is reachable by keyboard either: the eye sees one screen,
            // and Tab has to agree with it.
            inert={inDetail}
          >
            <div className={`${s.group} ${s.groupFirst}`}>THIS PROJECT</div>
            <div className={s.rows}>
              <Row
                icon="history"
                iconClass={s.rowIconHistory}
                label="History"
                sub="Past conversations of this project"
                value={summary.history === null ? '' : String(summary.history)}
                onClick={() => onPick('history')}
              />
              <Row
                icon="statistics"
                iconClass={s.rowIconStatistics}
                label="Statistics"
                sub="Hours, habits, achievements"
                value={summary.statistics}
                onClick={onOpenStatistics}
              />
              <Row
                icon="mcp"
                iconClass={s.rowIconMcp}
                label="MCP servers"
                sub="Status, sign-in, reconnect"
                value={summary.mcp ? `${summary.mcp.connected}/${summary.mcp.total}` : ''}
                // The count is worth a dot of its own only when everything is up: "4/5" in the same grey
                // as the rest says nothing about whether that is fine.
                valueOk={Boolean(summary.mcp && summary.mcp.connected === summary.mcp.total && summary.mcp.total > 0)}
                onClick={() => onPick('mcp')}
              />
              <Row
                icon="plugins"
                iconClass={s.rowIconPlugins}
                label="Plugins"
                sub="Installed, browse, marketplaces"
                value={summary.plugins === null ? '' : String(summary.plugins)}
                onClick={() => onPick('plugins')}
              />
            </div>

            <div className={s.group}>DEVICES</div>
            <div className={s.rows}>
              <button
                type="button"
                className={s.rowCard}
                style={{ borderColor: remoteTint.border, background: remoteTint.background }}
                onClick={() => onPick('remote')}
              >
                <span
                  className={`${s.rowIcon}`}
                  style={{ color: TONE_CLASS[summary.remote.tone] }}
                >
                  {ICONS.remote}
                </span>
                <span className={s.rowCardText}>
                  <span className={s.rowCardTop}>
                    <span className={s.rowLabel}>Remote access</span>
                    <span className={s.badge} style={{ color: TONE_CLASS[summary.remote.tone] }}>
                      <span className={s.badgeDot} />
                      {summary.remote.label}
                    </span>
                  </span>
                  <span className={s.rowCardHint}>{summary.remote.hint}</span>
                </span>
                <Chevron className={s.rowCardChevron} />
              </button>
            </div>

            <div className={s.group}>PREFERENCES</div>
            <div className={s.rows}>
              <Row
                icon="sounds"
                iconClass={s.rowIconSounds}
                label="Sound alerts"
                sub="When the panel calls you"
                value={summary.sounds}
                onClick={() => onPick('sounds')}
              />
              <Row
                icon="defaultMode"
                iconClass={s.rowIconMode}
                label="Default mode"
                sub="What new tabs start in"
                value={summary.defaultMode}
                onClick={() => onPick('defaultMode')}
              />
              <Row
                icon="composerLayout"
                iconClass={s.rowIconLayout}
                label="Composer layout"
                sub="Where the input sits"
                value={summary.composerLayout}
                onClick={() => onPick('composerLayout')}
              />
              <Row
                icon="improvePrompt"
                iconClass={s.rowIconImprove}
                label="Improve prompt"
                sub="What the sparkle button asks for"
                value={summary.improvePrompt}
                onClick={() => onPick('improvePrompt')}
              />
            </div>

            {/* The plugin itself, rather than the work done in it - which is why it stands apart from the
                three groups above and right against the version in the footer. */}
            <div className={s.group}>THE PLUGIN</div>
            <div className={s.rows}>
              <Row
                icon="feedback"
                iconClass={s.rowIconFeedback}
                label="Send feedback"
                sub="A bug, an idea, or just hello"
                value=""
                onClick={() => onPick('feedback')}
              />
            </div>

            <div className={s.footer}>
              <span>Amazing Claude Code</span>
              <span className={s.footerVersion}>{summary.version}</span>
            </div>
          </div>

          <div
            ref={detail}
            className={`${s.level} ${s.levelDetail} ${inDetail ? s.levelDetailShown : s.levelDetailHidden}`}
            inert={!inDetail}
          >
            {children}
          </div>
        </div>
      </aside>
    </>
  )
}

const Row = ({
  icon,
  iconClass,
  label,
  sub,
  value,
  valueOk = false,
  onClick,
}: {
  icon: string
  iconClass: string
  label: string
  sub: string
  value: string
  valueOk?: boolean
  onClick: () => void
}) => (
  <button type="button" className={s.row} onClick={onClick}>
    <span className={`${s.rowIcon} ${iconClass}`}>{ICONS[icon]}</span>
    <span className={s.rowText}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.rowSub}>{sub}</span>
    </span>
    {value ? (
      <span className={`${s.rowValue} ${valueOk ? s.rowValueOk : ''}`}>
        {valueOk ? <span className={s.rowValueDot} /> : null}
        {value}
      </span>
    ) : null}
    <Chevron className={s.rowChevron} />
  </button>
)
