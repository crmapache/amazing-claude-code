import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import snakeinHero from '../assets/snakein-hero.webp'
import { Microphone } from './Microphone'
import { useHoverTarget } from '../hooks/useHoverTarget'
import { useWheelScroll } from '../hooks/useWheelScroll'
import { useT } from '../i18n'
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
  | 'settings'
  | 'sounds'
  | 'remote'
  | 'remoteAbout'
  | 'defaultMode'
  | 'composerLayout'
  | 'pasteCollapse'
  | 'improvePrompt'
  | 'voice'
  | 'voiceLanguage'
  | 'voiceDevice'
  | 'language'
  | 'feedback'
  | 'feedbackLog'

/**
 * The state of remote access as the root row shows it - the word and the colour come from the caller.
 *
 * A word and a tone, and no sentence beside them: the row is a row like every other one in the list, and
 * what the state means in full is written on the screen behind it, where there is room to say it.
 */
export interface RemoteSummary {
  label: string
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
  /** From how many lines a pasted text folds into a chip, or that it never does. */
  pasteCollapse: string
  /** Whether the improve button asks by a text of one's own - "Default" or "Custom". */
  improvePrompt: string
  /** Dictation: the language it listens in, or that it is switched off. */
  voice: string
  /** The language in force, written in itself - "简体中文" rather than "Chinese". */
  language: string
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
  /**
   * An address to the system browser. The page has no browser of its own to open anything with, so the
   * only outward link in the menu - the author's card at its foot - hands the address to the shell.
   */
  onOpenLink: (url: string) => void
  /** The screen itself, built by the caller - the frame knows nothing about what is inside. */
  children: ReactNode
}

/**
 * Where the author's card leads. The marks say which placement brought the visit: it is the one
 * advertisement in the panel, and whether it is worth the room it takes is a question with an answer.
 */
const AUTHOR_URL =
  'https://snakein.com/?utm_source=amazing-claude-code&utm_medium=plugin&utm_campaign=side-menu'

/** The author's other product, named the same in every language. */
const AUTHOR_PRODUCT = 'Snakein'

/**
 * The five screens that live behind "Settings" rather than in the root list.
 *
 * They used to stand in the root as a group of four, which made the first thing anybody saw a list of
 * ten rows - and the four of them are the same kind of thing: a preference, set once and rarely
 * revisited. One row instead of four, and the language joins them rather than making the root longer.
 */
const SETTINGS_SCREENS: MenuScreen[] = [
  'sounds',
  'defaultMode',
  'composerLayout',
  'pasteCollapse',
  'improvePrompt',
  'voice',
  'language',
]

/**
 * Where a step back leads from each screen. Three of them stand one level deeper than the rest: the
 * preferences belong to "Settings", "what travels" to remote access, and the report's preview to the
 * feedback form it is about - coming back from any of them to the root list would lose the screen one
 * was in the middle of.
 */
export const parentOf = (screen: MenuScreen): MenuScreen => {
  if (screen === 'remoteAbout') return 'remote'
  if (screen === 'feedbackLog') return 'feedback'
  // The language dictation listens in and the microphone it listens through are chosen on lists of their
  // own - sixty-odd languages will not fit beside a key field, and coming back from either belongs to the
  // voice screen rather than to the settings list two steps up.
  if (screen === 'voiceLanguage' || screen === 'voiceDevice') return 'voice'
  if (SETTINGS_SCREENS.includes(screen)) return 'settings'
  return 'menu'
}

/**
 * The colours of a value that is a state rather than a count - the dot and the word share them.
 *
 * Two rows have one: MCP says so when every server is up, remote access always, because the whole point
 * of that row is which of four states the line is in.
 */
interface ValueTone {
  text: string
  dot: string
}

const VALUE_OK: ValueTone = { text: 'var(--acc-ok-light)', dot: 'var(--acc-ok)' }

const TONE_VALUE: Record<RemoteSummary['tone'], ValueTone> = {
  off: { text: 'var(--acc-fg-ghost)', dot: 'var(--acc-fg-ghost)' },
  busy: { text: 'var(--acc-warn)', dot: 'var(--acc-warn)' },
  live: { text: 'var(--acc-ok)', dot: 'var(--acc-ok)' },
  bad: { text: 'var(--acc-bad)', dot: 'var(--acc-bad)' },
}

/**
 * The icon of the remote row, in the colour of the state.
 *
 * Every other row's icon has a colour fixed for good, and this one deliberately does not: it used to be a
 * whole tinted card, and losing that tint entirely would leave the row saying nothing until it is read.
 * A green box against a grey one is the answer to "is it on" from across the panel.
 */
const TONE_ICON: Record<RemoteSummary['tone'], CSSProperties> = {
  off: { background: 'var(--acc-neutral-12)', color: 'var(--acc-fg-dim)' },
  busy: { background: 'var(--acc-warn-12)', color: 'var(--acc-warn)' },
  live: { background: 'var(--acc-ok-12)', color: 'var(--acc-ok)' },
  bad: { background: 'var(--acc-bad-12)', color: 'var(--acc-bad)' },
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
  /* A clipboard with lines of text on it: the row is about what happens to what comes off the clipboard,
     and a chip drawn instead would need the whole story told before it meant anything. */
  pasteCollapse: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.2H4.4a1.2 1.2 0 0 0-1.2 1.2v8a1.2 1.2 0 0 0 1.2 1.2h7.2a1.2 1.2 0 0 0 1.2-1.2v-8a1.2 1.2 0 0 0-1.2-1.2H10" />
      <rect x="6" y="1.9" width="4" height="2.6" rx="0.9" />
      <path d="M5.9 8h4.2M5.9 10.6h2.6" />
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
  settings: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.9v1.5M8 12.6v1.5M13.1 8h-1.5M4.4 8H2.9M11.6 4.4l-1.1 1.1M5.5 10.5l-1.1 1.1M11.6 11.6l-1.1-1.1M5.5 5.5L4.4 4.4" />
    </svg>
  ),
  /* The same microphone the composer's button wears: one drawing for one feature, so the row and the
     button recognise each other without being read. */
  voice: <Microphone size={16} />,
  /* A globe rather than a letter: the row has to be recognisable from inside a language one cannot read,
     which is exactly the case somebody looking for this row is in. */
  language: (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5.7" />
      <path d="M2.3 8h11.4" />
      <path d="M8 2.3c1.5 1.6 2.3 3.6 2.3 5.7S9.5 12.1 8 13.7C6.5 12.1 5.7 10.1 5.7 8S6.5 3.9 8 2.3Z" />
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
export const SideMenu = ({
  open,
  screen,
  summary,
  onPick,
  onOpenStatistics,
  onBack,
  onClose,
  onOpenLink,
  children,
}: SideMenuProps) => {
  const t = useT()
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

  const head = t.menu.titles[screen]

  return (
    <>
      <div className={`${s.scrim} ${open ? s.scrimOpen : s.scrimShut}`} onClick={onClose} />

      <aside ref={sheet} className={`${s.sheet} ${open ? s.sheetOpen : s.sheetShut}`} aria-hidden={!open}>
        <div className={s.head}>
          {inDetail ? (
            <button type="button" className={s.headButton} aria-label={t.common.back} onClick={onBack}>
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
            aria-label={t.common.closeMenu}
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
            <div className={`${s.group} ${s.groupFirst}`}>{t.menu.groups.project}</div>
            <div className={s.rows}>
              <Row
                icon="history"
                iconClass={s.rowIconHistory}
                label={t.menu.rows.history.label}
                sub={t.menu.rows.history.sub}
                value={summary.history === null ? '' : String(summary.history)}
                onClick={() => onPick('history')}
              />
              <Row
                icon="statistics"
                iconClass={s.rowIconStatistics}
                label={t.menu.rows.statistics.label}
                sub={t.menu.rows.statistics.sub}
                value={summary.statistics}
                onClick={onOpenStatistics}
              />
              <Row
                icon="mcp"
                iconClass={s.rowIconMcp}
                label={t.menu.rows.mcp.label}
                sub={t.menu.rows.mcp.sub}
                value={summary.mcp ? `${summary.mcp.connected}/${summary.mcp.total}` : ''}
                // The count is worth a dot of its own only when everything is up: "4/5" in the same grey
                // as the rest says nothing about whether that is fine.
                valueTone={
                  summary.mcp && summary.mcp.connected === summary.mcp.total && summary.mcp.total > 0
                    ? VALUE_OK
                    : undefined
                }
                onClick={() => onPick('mcp')}
              />
              <Row
                icon="plugins"
                iconClass={s.rowIconPlugins}
                label={t.menu.rows.plugins.label}
                sub={t.menu.rows.plugins.sub}
                value={summary.plugins === null ? '' : String(summary.plugins)}
                onClick={() => onPick('plugins')}
              />
            </div>

            <div className={s.group}>{t.menu.groups.devices}</div>
            <div className={s.rows}>
              {/* A row like the four above it, not the tinted card it used to be. The card carried a whole
                  sentence about the state and stood three lines tall for it - at the top of a list whose
                  every other entry says its piece in one. What the sentence explained is on the screen
                  behind the row; what is worth knowing without opening it is the state itself, and that
                  fits where the other rows keep their counts. */}
              <Row
                icon="remote"
                iconStyle={TONE_ICON[summary.remote.tone]}
                label={t.menu.rows.remote.label}
                sub={t.menu.rows.remote.sub}
                value={summary.remote.label}
                valueTone={TONE_VALUE[summary.remote.tone]}
                onClick={() => onPick('remote')}
              />
            </div>

            {/* The plugin itself, rather than the work done in it - which is why it stands apart from the
                groups above and right against the version in the footer. Both rows belong to it: the
                settings configure the plugin, and the feedback is about the plugin. */}
            <div className={s.group}>{t.menu.groups.plugin}</div>
            <div className={s.rows}>
              <Row
                icon="settings"
                iconClass={s.rowIconSettings}
                label={t.menu.rows.settings.label}
                sub={t.menu.rows.settings.sub}
                value=""
                onClick={() => onPick('settings')}
              />
              <Row
                icon="feedback"
                iconClass={s.rowIconFeedback}
                label={t.menu.rows.feedback.label}
                sub={t.menu.rows.feedback.sub}
                value=""
                onClick={() => onPick('feedback')}
              />
            </div>

            {/* The one advertisement in the panel, and it stands where an advertisement can be walked
                past: at the foot of a menu, under everything the menu is actually opened for. The
                picture is here rather than a line of link text because the product is a screen - a
                bare address asks to be trusted, a screenshot lets one decide before the click. */}
            <div className={s.group}>{t.menu.groups.author}</div>
            <div className={s.rows}>
              <div className={s.author}>
                <div className={s.authorWords}>
                  <span className={s.rowLabel}>{t.menu.author.title}</span>
                  <span className={s.authorBody}>
                    {t.menu.author.body}
                    <svg className={s.authorHeart} viewBox="0 0 16 16" aria-hidden="true">
                      <path
                        d="M8 14.3l-.9-.85C3.4 10.1 1 7.95 1 5.4A3.55 3.55 0 0 1 4.6 1.8c1.3 0 2.55.6 3.4 1.57A4.4 4.4 0 0 1 11.4 1.8A3.55 3.55 0 0 1 15 5.4c0 2.55-2.4 4.7-6.1 8.06z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </div>

                <button type="button" className={s.authorSite} onClick={() => onOpenLink(AUTHOR_URL)}>
                  {/* Decorative on purpose: the name and what it does are written right underneath, and
                      a screen reader announcing the picture too would say the same thing twice. The
                      measurements are the file's own - without them the row jumps as it decodes. */}
                  <img
                    className={s.authorShot}
                    src={snakeinHero}
                    alt=""
                    width={608}
                    height={182}
                    decoding="async"
                  />
                  <span className={s.authorFoot}>
                    <span className={s.authorNames}>
                      <span className={s.authorName}>{AUTHOR_PRODUCT}</span>
                      <span className={s.authorTagline}>{t.menu.author.tagline}</span>
                    </span>
                    <svg className={s.authorArrow} viewBox="0 0 16 16" aria-hidden="true">
                      <path
                        d="M5.4 10.6L10.6 5.4M6.2 5.2h4.6v4.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
              </div>
            </div>

            <div className={s.footer}>
              <span>{t.menu.footer}</span>
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

/**
 * What used to be the PREFERENCES group of the root list, one level down.
 *
 * The rows are the same rows, values and all - what changed is only where they stand: the root opened on
 * ten entries, four of which were the same kind of thing. The language joins them here rather than making
 * that list eleven long.
 */
export const SettingsScreen = ({
  summary,
  onPick,
}: {
  summary: MenuSummary
  onPick: (screen: MenuScreen) => void
}) => {
  const t = useT()

  return (
    <div className={s.screen}>
      <div className={s.rows}>
        <Row
          icon="sounds"
          iconClass={s.rowIconSounds}
          label={t.settings.rows.sounds.label}
          sub={t.settings.rows.sounds.sub}
          value={summary.sounds}
          onClick={() => onPick('sounds')}
        />
        <Row
          icon="defaultMode"
          iconClass={s.rowIconMode}
          label={t.settings.rows.defaultMode.label}
          sub={t.settings.rows.defaultMode.sub}
          value={summary.defaultMode}
          onClick={() => onPick('defaultMode')}
        />
        <Row
          icon="composerLayout"
          iconClass={s.rowIconLayout}
          label={t.settings.rows.composerLayout.label}
          sub={t.settings.rows.composerLayout.sub}
          value={summary.composerLayout}
          onClick={() => onPick('composerLayout')}
        />
        <Row
          icon="pasteCollapse"
          iconClass={s.rowIconPaste}
          label={t.settings.rows.pasteCollapse.label}
          sub={t.settings.rows.pasteCollapse.sub}
          value={summary.pasteCollapse}
          onClick={() => onPick('pasteCollapse')}
        />
        <Row
          icon="improvePrompt"
          iconClass={s.rowIconImprove}
          label={t.settings.rows.improvePrompt.label}
          sub={t.settings.rows.improvePrompt.sub}
          value={summary.improvePrompt}
          onClick={() => onPick('improvePrompt')}
        />
        <Row
          icon="voice"
          iconClass={s.rowIconVoice}
          label={t.settings.rows.voice.label}
          sub={t.settings.rows.voice.sub}
          value={summary.voice}
          onClick={() => onPick('voice')}
        />
        <Row
          icon="language"
          iconClass={s.rowIconLanguage}
          label={t.settings.rows.language.label}
          sub={t.settings.rows.language.sub}
          value={summary.language}
          onClick={() => onPick('language')}
        />
      </div>
    </div>
  )
}

const Row = ({
  icon,
  iconClass = '',
  iconStyle,
  label,
  sub,
  value,
  valueTone,
  onClick,
}: {
  icon: string
  iconClass?: string
  /** For the one row whose colour is not fixed: remote access wears the colour of its own state. */
  iconStyle?: CSSProperties
  label: string
  sub: string
  value: string
  valueTone?: ValueTone
  onClick: () => void
}) => (
  <button type="button" className={s.row} onClick={onClick}>
    <span className={`${s.rowIcon} ${iconClass}`} style={iconStyle}>
      {ICONS[icon]}
    </span>
    <span className={s.rowText}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.rowSub}>{sub}</span>
    </span>
    {value ? (
      <span className={s.rowValue} style={valueTone ? { color: valueTone.text } : undefined}>
        {valueTone ? <span className={s.rowValueDot} style={{ background: valueTone.dot }} /> : null}
        {value}
      </span>
    ) : null}
    <Chevron className={s.rowChevron} />
  </button>
)
