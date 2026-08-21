import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { send, subscribe } from './bridge'
import { installClipboardBridge, resolveClipboard } from './clipboard'
import {
  EFFORT_OPTIONS,
  modeMenuOptions,
  modelMenu,
  type ModeAvailability,
  nextMode,
  resolvePanelModel,
  switchedModel,
  normalizeMode,
  withRefusedMode,
} from './catalog'
import { AgentStreamView } from './components/AgentStreamView'
import { AskPanel } from './components/AskPanel'
import { Composer } from './components/Composer'
import {
  COMPOSER_LAYOUT_OPTIONS,
  isSideComposerLayout,
  normalizeComposerLayout,
  type ComposerLayout,
} from './composerLayout'
import { Confirm } from './components/Confirm'
import { Feed } from './components/Feed'
import { Header, type Session, type SessionState } from './components/Header'
import { History } from './components/History'
import { LoginGate, type AuthState } from './components/LoginGate'
import { Mcp } from './components/Mcp'
import { Menu, type MenuOption } from './components/Menu'
import { PermissionPanel } from './components/PermissionPanel'
import { Plugins } from './components/Plugins'
import { Queue, type QueuedPrompt } from './components/Queue'
import { Quotes, type Quote } from './components/Quotes'
import { SelectionMenu } from './components/SelectionMenu'
import { Sounds } from './components/Sounds'
import { StatusBar, UsageMeters, type Anchor, type SelectorKind } from './components/StatusBar'
import { StreamSwitcher, type AgentStatus, type AgentTab } from './components/StreamSwitcher'
import { TaskListPanel } from './components/TaskListPanel'
import composer from './components/composer.module.css'
import s from './components/shell.module.css'
import { bashCommand, shellText, type ShellRun } from './feed/bash'
import { contextOf, initialPanelState, reducePanel, type PanelState } from './feed/build'
import { deferFollowUpForCompact } from './feed/compact'
import { referenceChip } from './feed/reference'
import { deriveSessionTitle } from './feed/title'
import { appendChip, appendText, buildCommands, localCommand, plainText, type LocalCommand } from './feed/slash'
import { composePrompt, imageAttachments, tokensText, trimTrailingSpace } from './feed/tokens'
import { formatDuration } from './feed/tools'
import type { AskItem, FeedItem, PermItem, PlanItem, TaskItem, TodoItem, UserItem, UserToken } from './feed/types'
import type {
  AvailablePluginInfo,
  HistoryEntry,
  InstalledPluginInfo,
  McpServerInfo,
  ModelInfo,
  PluginMarketplaceInfo,
  SoundId,
  UsageWindow,
} from './protocol'
import {
  NO_SOUND_PREFS,
  isMuted,
  rememberPanel,
  setVolume,
  soundForPanel,
  toggleSound,
  volumeOf,
  type SoundMemory,
  type SoundPrefs,
} from './sounds'
import { useCardState, type CardState } from './hooks/useCardState'
import { moveGroup } from './tabs'
import { useSelection } from './hooks/useSelection'

const MAIN_SESSION = 'main'

/** A tab's placeholder title - before the first message and right after /clear. */
const defaultTitle = (sessionId: string): string => (sessionId === MAIN_SESSION ? 'main session' : 'new session')

/**
 * The IDE's fonts go straight into the document's root rather than into React state: dozens of rules
 * across every module's styles read them, and driving that through props would mean dragging a font size
 * through half the tree for something the cascade settles anyway. The defaults stay in tokens.css - the
 * panel lives by them in a browser and in the harness, where no IDE stands nearby.
 */
const applyTypography = (monoFamily: string, uiFamily: string, lineHeight: number): void => {
  const root = document.documentElement.style

  if (monoFamily) root.setProperty('--acc-mono', `'${monoFamily}', ui-monospace, monospace`)
  if (uiFamily) root.setProperty('--acc-font', `'${uiFamily}', system-ui, sans-serif`)
  if (lineHeight > 0) root.setProperty('--acc-leading', String(lineHeight))
}

/** How long a Stop's confirmation is waited for before offering to kill the process by force. */
const STOP_GRACE_MS = 8000

/**
 * After how long a loaded list of MCP servers or plugins is due for a refresh.
 *
 * Opened a tab, closed it, opened it again - asking anew serves nothing: this list changes rarely (and
 * edits from the tab itself update it on their own), while the request costs dearly - `claude mcp list`
 * honestly brings up every server, the plugin catalogue walks the marketplaces, and that takes seconds.
 * Coming back to the tab later, though, one sees the genuine state of affairs even if the config was
 * edited from a terminal.
 */
const LIST_STALE_MS = 60_000

/** How long to wait for the fiddling with the volume slider to end before writing the choice down. */
const SOUND_SAVE_DELAY_MS = 250

/**
 * For how long after pressing "sign out" a lost login counts as one's own doing rather than as news. With
 * room to spare for the sign-out itself: it goes through the IDE's terminal, where the person has yet to
 * see how it ended.
 */
const SIGN_OUT_GRACE_MS = 2 * 60 * 1000

/**
 * The draft, the attachments and the quotes belong to a conversation rather than to the panel as a whole.
 *
 * The text and the attachments are one sequence of tokens rather than text with a separate list of chips
 * on top: that way an attachment stays exactly where it was inserted rather than always in front of the
 * whole text.
 */
interface Draft {
  tokens: UserToken[]
  quotes: Quote[]
}

const EMPTY_DRAFT: Draft = { tokens: [], quotes: [] }

/** One reference for every tab without a queue - otherwise it would flicker through the dependencies. */
const EMPTY_QUEUE: QueuedPrompt[] = []

export const App = () => {
  const [panels, dispatchPanel] = useReducer(panelsReducer, { [MAIN_SESSION]: initialPanelState })
  const [sessions, setSessions] = useState<Session[]>([
    { id: MAIN_SESSION, title: defaultTitle(MAIN_SESSION), state: 'idle', groupId: MAIN_SESSION, depth: 0, titleSource: 'default' },
  ])
  const [active, setActive] = useState(MAIN_SESSION)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  /**
   * The deferred "finish the current thing first" - kept per tab, like the draft and the command output
   * beside it: a queue belongs to a conversation rather than to the panel as a whole.
   *
   * As one shared list it travelled somewhere other than where it was put: the queue is worked through by
   * whichever conversation comes free, and the list was one for all - switch to the neighbouring tab and
   * its free conversation took someone else's message for itself.
   */
  const [queue, setQueue] = useState<Record<string, QueuedPrompt[]>>({})
  /**
   * What the person has run in bash mode since their last message - per tab, each with a conversation of
   * its own.
   *
   * It travels to the agent as an attachment to the next message, exactly as Claude Code itself does it:
   * such a command is not worth a turn of its own (otherwise a "!git status" would drive the model for the
   * sake of two lines), but its output must not vanish either - without it the next request of the "fix
   * this here" kind hangs in the air.
   */
  const [shellRuns, setShellRuns] = useState<Record<string, ShellRun[]>>({})
  /**
   * A file dragged from the IDE or from a file manager is being held over the panel (see fileDrag). The
   * drag itself never reaches the page, so the input field's highlight is lit by the shell's message
   * rather than by the browser's events.
   */
  const [fileDragOver, setFileDragOver] = useState(false)
  const [menu, setMenu] = useState<{ kind: SelectorKind; anchor: Anchor } | null>(null)
  /**
   * The choice of model, effort and mode. It arrives from the shell at startup and is saved there too: a
   * new tab, a fork and the IDE's next start begin from it.
   */
  const [prefs, setPrefs] = useState({ model: '', effort: 'high', mode: 'manual' })
  const [auth, setAuth] = useState<AuthState | null>(null)
  /**
   * Whether the "no questions" mode is allowed on this machine. The shell finds that out from the CLI
   * itself and answers with a message of its own, so until the answer comes we assume it is not: leading
   * someone by one key into a mode that refuses at once is worse than not letting them in there for a
   * second at all.
   */
  const [bypassAvailable, setBypassAvailable] = useState(false)
  /**
   * The modes the agent has already refused (at present only bypass). Nobody knows about it in advance -
   * neither the panel nor the shell: whether it is available is decided by the organisation's policy,
   * answered by the agent itself, and answered the only way it can - by refusing the request to switch. A
   * refusal once heard is remembered for the whole panel: this is about the account rather than the tab.
   */
  const [refusedModes, setRefusedModes] = useState<string[]>([])
  /**
   * The models on which the agent has already refused to switch to auto. This refusal used to live in
   * refusedModes too, as a "for the whole panel" flag - but the mode's own caption in MODE_OPTIONS says
   * plainly "Not on every model": the unavailability depends on the model rather than on the machine or
   * the account alone, and one refusal on Haiku must not silently dim auto on Sonnet as well. The list is
   * shared across every tab (the same logic as refusedModes) - only keyed by model.
   */
  const [autoRefusedModels, setAutoRefusedModels] = useState<string[]>([])
  /** The screen's side the panel is pressed to - it decides where the border towards the editor is drawn. */
  const [dockAnchor, setDockAnchor] = useState<'left' | 'right' | 'top' | 'bottom'>('right')
  /** Where the input field sits. It arrives from the shell at startup and is saved there too. */
  const [composerLayout, setComposerLayoutState] = useState<ComposerLayout>('bottom')
  const [loginWaiting, setLoginWaiting] = useState(false)
  /** Grows whenever the input field has to be given the focus back: after a link from the editor, say. */
  const [focusToken, setFocusToken] = useState(0)
  const [usage, setUsage] = useState<{
    session?: UsageWindow
    week?: UsageWindow
    contextWindow?: number
    todayTokens?: string
  }>({})
  /**
   * Which of the modal panels is open - one value rather than three independent booleans. That way they
   * are mutually exclusive by construction: opening the plugins closes the history by itself rather than
   * leaving it hanging quietly under the new one on top of it.
   */
  const [openPanel, setOpenPanel] = useState<'history' | 'mcp' | 'plugins' | 'sounds' | null>(null)
  /** The tick boxes and the volume of the sound alerts - see sounds.ts. */
  const [soundPrefs, setSoundPrefs] = useState<SoundPrefs>(NO_SOUND_PREFS)
  /** The project's past conversations: null means the list has not arrived yet (see the startup requests). */
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  /**
   * The work someone asked to kill with the cross on a chip - still without an answer to "are you sure?".
   * We ask because a miss on that cross costs dearly: for an agent it is tens of minutes of work, for a
   * background command a live process such as a server.
   */
  const [stopping, setStopping] = useState<{ id: string; title: string; subject: string } | null>(null)

  /**
   * A conversation chosen in the history, while the question about it goes unanswered: taking a tab for it
   * means killing the process of the conversation currently in it, and with it the turn running at that
   * moment. We ask only about a busy tab: a free one has nothing to lose, its conversation goes nowhere -
   * it stays in the very history this one was opened from.
   */
  const [resuming, setResuming] = useState<HistoryEntry | null>(null)
  /**
   * A finished agent disappears from the tabs by itself as soon as nobody is looking at it (see the effect
   * below) - rather than instantly before the eyes of whoever is reading it right then: in that case it
   * holds on until the switch to something else. clearFinishedAgents below additionally hides them all at
   * once before a new message in main. It lives here rather than in PanelState: the durable event log
   * loses nothing, and the hiding is purely a matter of display.
   */
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set())
  const [activeStream, setActiveStream] = useState('main')
  /**
   * The lists of MCP servers and plugins: null means they have never arrived, an empty array that they
   * arrived and are genuinely empty. The difference is visible to the eye: in the first case the tab shows
   * a skeleton, in the second an honest "nothing is configured".
   *
   * Both lists are asked for right at startup rather than waiting for their tab to be opened (see the
   * effect with the startup requests): every such request is a separate run of claude taking several
   * seconds, and there is no reason to wait for them on a click.
   */
  const [mcpServers, setMcpServers] = useState<McpServerInfo[] | null>(null)
  const [mcpLoading, setMcpLoading] = useState(true)
  const [mcpFetchedAt, setMcpFetchedAt] = useState(0)
  const [mcpMessage, setMcpMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pluginsInstalled, setPluginsInstalled] = useState<InstalledPluginInfo[] | null>(null)
  const [pluginsAvailable, setPluginsAvailable] = useState<AvailablePluginInfo[] | null>(null)
  const [marketplaces, setMarketplaces] = useState<PluginMarketplaceInfo[] | null>(null)
  const [pluginsLoading, setPluginsLoading] = useState(true)
  const [pluginsFetchedAt, setPluginsFetchedAt] = useState(0)
  const [pluginMessage, setPluginMessage] = useState<{ ok: boolean; text: string } | null>(null)
  /**
   * The catalogue of models from the CLI itself: null means it has not arrived yet, and then the menu shows
   * the built-in list (see modelOptions). Keeping a list of our own is not an option - the available models
   * depend on the account and on the organisation's policy.
   */
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  /** The project's files for the "@" hint - they arrive by themselves, the panel asks for nothing. */
  const [files, setFiles] = useState<string[]>([])
  /** The slash commands' descriptions and argument syntax - of the same nature as files. */
  const [commandHints, setCommandHints] = useState<Record<string, { description: string; argumentHint: string }>>({})

  const feedRef = useRef<HTMLElement | null>(null)
  const [selection, clearSelection] = useSelection(feedRef)
  const cards = useCardState()

  /**
   * The left/right side rail's node - an empty <div> in the markup below, into which Composer draws
   * MODEL/EFFORT/MODE and the buttons through a portal (see Composer.railContainer). State rather than an
   * ordinary ref: the portal itself is drawn in an effect after this node's first render, and React has to
   * learn about that in order to repaint Composer with a container that is no longer null.
   */
  const [railNode, setRailNode] = useState<HTMLDivElement | null>(null)

  const panel = panels[active] ?? initialPanelState
  const draft = drafts[active] ?? EMPTY_DRAFT
  const sessionQueue = queue[active] ?? EMPTY_QUEUE
  const running = panel.status === 'running'
  /**
   * The context gauge: the number comes from the CLI itself, and the calculation from usage stays as a
   * fallback for when it is not there yet (see contextOf).
   */
  const context = contextOf(panel, usage.contextWindow)
  const imageBaseCount = useMemo(() => countSessionImages(panel, sessionQueue), [panel, sessionQueue])

  // A Stop honestly waits for a confirmation; if it has not come for longer than is reasonable, we offer
  // to kill the process by force rather than stand with a spinning button forever.
  const stopStalled = Boolean(
    running && panel.stopRequestedAt && Date.now() - panel.stopRequestedAt > STOP_GRACE_MS,
  )

  // One source of truth for the button and for the menu: until the agent confirms the change we show what
  // was chosen, and after that what it genuinely applied.
  const mode = panel.pendingMode ?? panel.permissionMode ?? prefs.mode

  // Which model is genuinely running - see resolvePanelModel, and there too why it was split out into a
  // function of its own.
  const model = resolvePanelModel(panel, models, prefs.model)

  // Which of the optional things the Shift+Tab cycle may reach: the permission for bypass arrives from
  // the shell, auto through a refusal of its own on the current model (see autoRefusedModels).
  const availableModes = useMemo(
    () => ({
      bypass: bypassAvailable && !refusedModes.includes('bypassPermissions'),
      auto: !autoRefusedModels.includes(model),
    }),
    [bypassAvailable, refusedModes, autoRefusedModels, model],
  )

  /**
   * The conversation moved to another model against our will - see switchedModel. It lives in the tab
   * rather than in the shared setting: the neighbouring one has a conversation and a model of its own.
   */
  const switched = switchedModel(models, prefs.model, panel.model)

  const editDraft = useCallback(
    (session: string, change: Partial<Draft>) => {
      setDrafts((current) => ({
        ...current,
        [session]: { ...(current[session] ?? EMPTY_DRAFT), ...change },
      }))
    },
    [],
  )

  /**
   * Ask for the lists anew. Quietly when there is already something on the screen to show: then the tab
   * opens instantly on what is ready, and the fresh data rolls in by itself, without a skeleton and
   * without a "Refreshing..." on the button.
   */
  const loadMcp = useCallback(
    (quiet = false) => {
      if (!quiet) setMcpLoading(true)
      // We ask the conversation: the servers are held by its process, and only it knows their live state
      // (see mcpList in the protocol).
      send({ type: 'mcpList', sessionId: activeRef.current })
    },
    [],
  )

  const loadPlugins = useCallback((quiet = false) => {
    if (!quiet) setPluginsLoading(true)
    send({ type: 'pluginList' })
    send({ type: 'marketplaceList' })
  }, [])

  /**
   * Which pinned panel is open right now - for those who toggle it from a closure that outlived its render
   * (see [openHistory]).
   */
  const openPanelRef = useRef(openPanel)
  openPanelRef.current = openPanel

  /**
   * The history is a toggle for a pinned panel, like the neighbouring open* ones below. But it lives here
   * rather than beside them: it is also called by the `/resume` command from the input field (see
   * [runLocal]), and that one is declared higher up the file.
   *
   * It genuinely used to be declared beside its neighbours - that is, AFTER the early return to the login
   * screen - and `/resume` did not work at all: the panel's first render always leaves through that return
   * (the login is not confirmed by then), and `runLocal` from that same render stayed closed over a
   * variable that render never got as far as declaring. After that React handed out exactly that one:
   * `runLocal`'s dependencies did not change by the next render.
   */
  const openHistory = useCallback(() => {
    setMenu(null)

    if (openPanelRef.current === 'history') {
      setOpenPanel(null)
      return
    }

    setOpenPanel('history')
    send({ type: 'history' })
  }, [])

  // Past conversations, MCP servers and plugins are asked for right at the start, together with the
  // panel's readiness: by the time their tab is opened they are already loaded.
  useEffect(() => {
    send({ type: 'ready' })
    send({ type: 'history' })
    loadMcp()
    loadPlugins()
  }, [loadMcp, loadPlugins])

  /**
   * The cursor under the mouse goes to the shell, so that it sets it on the IDE's window.
   *
   * By its own means the page cannot do that: the embedded browser is drawn offscreen, in a separate
   * process (see protocol, the cursor message), and the pointer the CSS asks for never reaches the window -
   * over the buttons an ordinary arrow would remain.
   *
   * On mouseover rather than on every movement: the cursor changes at the elements' borders rather than
   * inside one. The value is inherited, so we ask the node under the mouse itself - for a caption inside a
   * button it is the same as for the button.
   */
  useEffect(() => {
    let last = ''

    const report = (cursor: string) => {
      if (cursor === last) return
      last = cursor
      send({ type: 'cursor', cursor })
    }

    const onOver = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      report(target ? getComputedStyle(target).cursor : 'default')
    }
    // The mouse has left the panel entirely - the cursor beyond it is not ours.
    const onLeave = () => report('default')

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseleave', onLeave)

    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  /**
   * The bash-mode commands that have been started, by their number: the shell's answer brings only the
   * output, while the agent needs the command itself too. The tab is remembered beside the command - by it
   * we cross out everything that must not outlive a `/clear` or a closed conversation. A ref rather than
   * state: nothing repaints because of it, and the subscription to the shell's messages, which lives once
   * for the panel's whole life, would not see fresh state anyway.
   */
  const shellCommands = useRef<Record<string, { session: string; command: string }>>({})

  /** Forget a tab's still-running commands: this conversation no longer needs their output. */
  const forgetShellCommands = (session: string) => {
    for (const [id, run] of Object.entries(shellCommands.current)) {
      if (run.session === session) delete shellCommands.current[id]
    }
  }
  /** A run's sequence number - the id's uniqueness comes from it, see runShell. */
  const shellSeq = useRef(0)

  /**
   * A paste into the input field with whatever came from the IDE: a link from the editor, a file from a
   * dialog, a folder dropped with the mouse.
   *
   * It goes to the caret's place rather than to the draft's end: the person may have hit a new line and
   * gone off into the editor for the link - it has to stand where they expect it. The place itself lives in
   * the input field, so the field is what inserts it (see Composer) and the panel only hands the attachment
   * over. While there is no field at all - no chat is open - we append to the draft's end: it will wait for
   * the first tab.
   */
  const insertIntoComposer = useRef<((token: UserToken) => void) | null>(null)
  const registerInsert = useCallback((insert: ((token: UserToken) => void) | null) => {
    insertIntoComposer.current = insert
  }, [])

  const addToDraft = (token: UserToken) => {
    const insert = insertIntoComposer.current
    if (insert) {
      insert(token)
      return
    }

    setDrafts((current) => {
      const session = current[activeRef.current] ?? EMPTY_DRAFT
      return {
        ...current,
        [activeRef.current]: {
          ...session,
          tokens:
            token.kind === 'chip'
              ? appendChip(session.tokens, token.chip)
              : appendText(session.tokens, token.value),
        },
      }
    })
  }

  /**
   * Otherwise a running tool's duration stands still right up to the result - beside finished cards that
   * appear instantly, that reads as a hang. A ref rather than an effect dependency on panels: otherwise
   * every tick would recreate the interval.
   */
  const panelsRef = useRef(panels)
  panelsRef.current = panels

  /**
   * The same reason as panelsRef: the subscription to the shell's messages is held once at mount and has no
   * render of its own, while which model genuinely runs in a tab that got refused (see autoRefusedModels)
   * has to be known fresh rather than as it was at the moment of subscribing.
   */
  const modelsRef = useRef(models)
  modelsRef.current = models
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  /**
   * The sound alerts: what each tab has managed to tell the onlooker. Memory between frames rather than
   * state - nothing repaints because of it.
   */
  const soundMemory = useRef<Record<string, SoundMemory>>({})
  /** The effect below reads the sound settings, but has no reason to restart because of them. */
  const soundPrefsRef = useRef(soundPrefs)
  soundPrefsRef.current = soundPrefs

  /**
   * Call with a sound, if this occasion is not switched off by a tick box.
   *
   * The tab the call comes from decides whether a sound is needed at all: nobody is watching a background
   * one, while the open one the person is most likely looking at right now - and calling them to what is
   * already before their eyes serves nothing. The "most likely" is refined by the shell: the panel may be
   * hidden from sight and the IDE's window minimised (see onlyIfAway).
   */
  const alert = useCallback((sound: SoundId, sessionId: string) => {
    const prefs = soundPrefsRef.current
    if (isMuted(prefs, sound)) return

    send({
      type: 'sound',
      sound,
      volume: volumeOf(prefs, sound),
      onlyIfAway: sessionId === activeRef.current,
    })
  }, [])

  /** The deferred write of the sound settings - see changeSoundPrefs. */
  const soundSaveTimer = useRef<number | undefined>(undefined)

  /**
   * Show the new setting at once and write it down a little later.
   *
   * The volume slider fires an event on every percent: without the delay one drag would turn into a hundred
   * trips to the IDE's settings.
   */
  const changeSoundPrefs = (next: SoundPrefs) => {
    setSoundPrefs(next)

    window.clearTimeout(soundSaveTimer.current)
    soundSaveTimer.current = window.setTimeout(() => {
      soundSaveTimer.current = undefined
      send({ type: 'soundSettings', muted: next.muted, volumes: next.volumes as Record<string, number> })
    }, SOUND_SAVE_DELAY_MS)
  }

  /**
   * The deferred write is flushed before the page disappears.
   *
   * Otherwise the last quarter second of fiddling with the slider would be lost every time the panel is
   * reloaded: the setting would look as though it had been set, and would come back as it was.
   */
  useEffect(() => {
    const flush = () => {
      if (soundSaveTimer.current === undefined) return

      window.clearTimeout(soundSaveTimer.current)
      soundSaveTimer.current = undefined

      const prefs = soundPrefsRef.current
      send({ type: 'soundSettings', muted: prefs.muted, volumes: prefs.volumes as Record<string, number> })
    }

    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  /** Whether the shell's previous answer had a login: a sign-out is visible only through the change. */
  const wasLoggedIn = useRef<boolean | null>(null)
  /**
   * When "sign out" was pressed: a login lost right after that is one's own doing rather than news. A time
   * rather than a mere flag: the sign-out may not happen at all (the terminal window was closed, the
   * polling gave up), and an everlasting flag would later swallow a genuine sign-out - precisely the one
   * thing the sound is here for.
   */
  const signedOutAt = useRef(0)

  /**
   * The sound calls the person from any tab rather than only from the open one: a background tab has only a
   * dot on its label, and that is looked at exactly when one already knows something is happening there.
   */
  useEffect(() => {
    for (const sessionId of Object.keys(panels)) {
      const panel = panels[sessionId]
      if (!panel) continue

      const memory = soundMemory.current[sessionId]
      // The first look at a tab is only an introduction: nothing that already lies in it should sound
      // (see rememberPanel).
      if (!memory) {
        soundMemory.current[sessionId] = rememberPanel(panel)
        continue
      }

      const sound = soundForPanel(panel, memory)
      if (sound) alert(sound, sessionId)
    }
  }, [panels, alert])

  /**
   * Before a new message genuinely leaves for main, we hide from the dropdown every agent that has finished
   * its work by then - otherwise over a long session a long tail of the unneeded would pile up there. An
   * agent that has not finished we leave alone: it must not disappear by itself, only when it is done.
   */
  const clearFinishedAgents = (session: string) => {
    const items = panelsRef.current[session]?.items ?? []
    const finishedIds = items
      .filter((item): item is TaskItem => item.kind === 'task' && !item.pending)
      .map((item) => item.id)
    if (finishedIds.length === 0) return

    setHiddenTaskIds((current) => {
      const next = new Set(current)
      for (const id of finishedIds) next.add(id)
      return next
    })
  }

  /**
   * A background agent nobody is watching right now is hidden as soon as it finishes - there is no reason to
   * wait for the next message in main just so it stops taking up a tab. The one being read right now
   * (activeStream) we leave alone: work must not be yanked out from under the cursor - it hides by itself
   * as soon as the reading switches to something else (the effect restarts on activeStream and picks it up).
   */
  useEffect(() => {
    const finishedIds = panel.items
      .filter((item): item is TaskItem => item.kind === 'task' && !item.pending && item.id !== activeStream)
      .map((item) => item.id)
    if (finishedIds.length === 0) return

    setHiddenTaskIds((current) => {
      let changed = false
      const next = new Set(current)
      for (const id of finishedIds) {
        if (next.has(id)) continue
        next.add(id)
        changed = true
      }
      return changed ? next : current
    })
  }, [panel.items, activeStream])

  useEffect(() => {
    const id = setInterval(() => {
      for (const sessionId of Object.keys(panelsRef.current)) {
        const panel = panelsRef.current[sessionId]
        // We tick both while a Stop's confirmation is awaited and while a turn runs without a single
        // tool call (turnStartedAt exists by then, while startedAt is still empty) - otherwise the
        // "Claude is thinking" would stand there with a zero counter until the first call began.
        // panel.retry is the countdown to the next attempt in the status line: it ticks even when there
        // is no work in the panel at all (the turn may have ended while a background subagent's request
        // waits for a retry).
        if (
          Object.keys(panel.startedAt).length > 0 ||
          panel.stopRequestedAt ||
          panel.turnStartedAt ||
          panel.retry
        ) {
          dispatchPanel({ session: sessionId, action: { kind: 'tick' } })
        }
      }
    }, 1000)

    return () => clearInterval(id)
  }, [])

  /**
   * The main stream's permission/ask/plan can be decided only by whoever is looking at this very tab - the
   * decision cards are rendered out of the active session's panel.items (see permission/ask just below and
   * Feed's onPlanDecision), so watching one active session is enough rather than driving this across every
   * open tab. We react to a change in awaitsYou and carry it into the panel (attentionStarted /
   * attentionEnded - see build.ts) so that streamStatus can subtract the waiting time from "Claude is
   * thinking - Xm Ys" rather than charge it to the agent.
   */
  useEffect(() => {
    const awaiting = panel.items.some((item) => ownStream(item) && awaitsYou(item, cards))
    dispatchPanel({ session: active, action: { kind: awaiting ? 'attentionStarted' : 'attentionEnded' } })
  }, [active, panel.items, cards])

  useEffect(
    () =>
      subscribe((message) => {
        switch (message.type) {
          case 'init':
            if (message.sounds) {
              setSoundPrefs({
                muted: message.sounds.muted as SoundId[],
                volumes: message.sounds.volumes as Partial<Record<SoundId, number>>,
              })
            }
            if (message.preferences) {
              setPrefs((current) => ({
                model: message.preferences?.model || current.model,
                effort: message.preferences?.effort || current.effort,
                mode: normalizeMode(message.preferences?.mode || current.mode),
              }))
              if (message.preferences.composerLayout) {
                setComposerLayoutState(normalizeComposerLayout(message.preferences.composerLayout))
              }
            }
            dispatchPanel({
              session: MAIN_SESSION,
              action: {
                kind: 'init',
                project: {
                  name: message.projectName,
                  workingDirectory: message.workingDirectory,
                  gitBranch: message.gitBranch,
                },
              },
            })
            break

          case 'project':
            dispatchPanel({
              session: MAIN_SESSION,
              action: {
                kind: 'project',
                gitBranch: message.gitBranch,
                pullRequest: message.pullRequest,
                pullRequestUrl: message.pullRequestUrl,
              },
            })
            break

          case 'sessions':
            setSessions(
              message.sessions.map((info) => ({
                id: info.id,
                title: info.title,
                state: 'idle' as const,
                groupId: info.id,
                depth: 0,
                titleSource: 'default' as const,
              })),
            )
            break

          case 'status':
            dispatchPanel({ session: message.sessionId, action: { kind: 'status', status: message.state } })
            break

          // The answer to the title generation (see submit): we overwrite only if the tab is still alive
          // and a /clear has not just renamed it back to the placeholder - otherwise a stale answer would
          // bring back a title the user has explicitly just given up.
          case 'sessionTitle':
            setSessions((current) =>
              current.map((session) =>
                session.id === message.sessionId && session.titleSource !== 'default'
                  ? { ...session, title: message.title, titleSource: 'llm' }
                  : session,
              ),
            )
            break

          case 'error':
            dispatchPanel({ session: message.sessionId, action: { kind: 'error', message: message.message } })
            break

          case 'agent':
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'agent', event: message.event, replay: message.replay },
            })
            // The conversation has been wiped: the command output that never made it to the agent has
            // nothing to do with the new conversation - it leaves along with the feed. Together with what
            // has been collected we forget what is still running too: otherwise the output of a command
            // started in the previous conversation would arrive in the new one and travel to the agent
            // with its very first message.
            if (message.event.type === 'conversation_reset') {
              forgetShellCommands(message.sessionId)
              setShellRuns((current) => ({ ...current, [message.sessionId]: [] }))
              // The tab's title is part of the conversation that has just been wiped too: without a
              // reset it would hang on from the previous subject, and the next message would no longer
              // rename the tab (see submit).
              setSessions((current) =>
                current.map((session) =>
                  session.id === message.sessionId
                    ? { ...session, title: defaultTitle(session.id), titleSource: 'default' }
                    : session,
                ),
              )
            }
            break

          case 'replayFinished':
            dispatchPanel({ session: message.sessionId, action: { kind: 'replayFinished' } })
            break

          case 'processExited':
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'processExited', exitCode: message.exitCode },
            })
            break

          case 'picked':
            addToDraft({ kind: 'chip', chip: { kind: message.kind, value: message.value } })
            break

          case 'fileDrag':
            setFileDragOver(message.over)
            break

          case 'history':
            setHistory(message.conversations)
            break

          case 'mcpServers':
            setMcpServers(message.servers)
            setMcpLoading(false)
            setMcpFetchedAt(Date.now())
            break

          case 'mcpActionResult':
            setMcpMessage({ ok: message.ok, text: message.message })
            // A failure is an outcome too: without this a list that failed to load would stay with a
            // skeleton and a dimmed button forever.
            if (!message.ok) setMcpLoading(false)
            break

          case 'plugins':
            setPluginsInstalled(message.installed)
            setPluginsAvailable(message.available)
            setPluginsLoading(false)
            setPluginsFetchedAt(Date.now())
            break

          case 'pluginActionResult':
            setPluginMessage({ ok: message.ok, text: message.message })
            if (!message.ok) setPluginsLoading(false)
            break

          case 'marketplaces':
            setMarketplaces(message.marketplaces)
            break

          case 'models':
            setModels(message.models)
            break

          case 'context':
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'context', used: message.used, max: message.max },
            })
            break

          case 'bashResult': {
            // Into the card as in a terminal, as one stream: the errors are mixed in with the ordinary
            // output exactly where the command itself printed them.
            const output = [message.stdout, message.stderr].filter((part) => part.trim().length > 0).join('\n')

            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'bashFinished', id: message.id, output, exitCode: message.exitCode },
            })

            // To the agent separately, under tags of their own (see shellText): by them one can see the
            // command complained even when the return code is zero.
            //
            // The command itself is taken BEFORE setState rather than inside it: React calls an updater
            // function not exactly once (in strict mode twice), and crossing the record out from there
            // would eat its own result - the output would not reach the agent at all.
            const ran = shellCommands.current[message.id]
            if (ran) {
              delete shellCommands.current[message.id]

              setShellRuns((current) => ({
                ...current,
                [ran.session]: [
                  ...(current[ran.session] ?? []),
                  { command: ran.command, stdout: message.stdout, stderr: message.stderr, exitCode: message.exitCode },
                ],
              }))
            }
            break
          }

          case 'files':
            setFiles(message.files)
            break

          case 'commandHints':
            setCommandHints(message.hints)
            break

          case 'dockAnchor':
            setDockAnchor(message.anchor)
            break

          case 'typography':
            applyTypography(message.monoFamily, message.uiFamily, message.lineHeight)
            break

          case 'usage':
            // It arrives by two independent routes (the conversation's usage and separately the
            // transcript scan for todayTokens) - we merge rather than replace whole, otherwise one would
            // zero out what the other has already learned.
            setUsage((current) => ({
              session: message.session ?? current.session,
              week: message.week ?? current.week,
              // ?? will not do here - a 0 is not nullish, it would get stuck in the state forever and the
              // context gauge below would divide by zero for good.
              contextWindow:
                message.contextWindow && message.contextWindow > 0 ? message.contextWindow : current.contextWindow,
              todayTokens: message.todayTokens ?? current.todayTokens,
            }))
            break

          case 'permission':
            dispatchPanel({
              session: message.sessionId,
              action: {
                kind: 'permission',
                id: message.id,
                target: message.target,
                command: message.command,
                mode: message.mode,
                reason: message.reason,
                rememberable: message.rememberable,
                taskId: message.agentId,
              },
            })
            break

          case 'auth':
            setAuth({
              installed: message.installed,
              loggedIn: message.loggedIn,
              email: message.email,
              plan: message.plan,
              executablePath: message.executablePath,
              searched: message.searched,
            })
            if (message.loggedIn) setLoginWaiting(false)
            // The login fell away by itself: until one signs in again the agent answers any request with
            // a brush-off about /login, and that is worth noticing at once rather than after three useless
            // answers. About one's own sign-out and about the very first answer (when there is no previous
            // state yet) we stay silent. About a lost login the panel speaks by itself, with a whole login
            // screen: for whoever is looking at it a sound adds nothing here.
            if (
              !message.loggedIn &&
              wasLoggedIn.current === true &&
              Date.now() - signedOutAt.current > SIGN_OUT_GRACE_MS
            ) {
              alert('trouble', activeRef.current)
            }
            if (message.loggedIn) signedOutAt.current = 0
            wasLoggedIn.current = message.loggedIn
            break

          case 'modeAvailability':
            setBypassAvailable(message.bypassPermissions)
            break

          case 'model':
            // The setting follows the model in force rather than the one chosen: a rejected one must
            // neither stand as a tick in the menu nor travel as a flag into the next tab - with it the
            // process would not come up at all.
            setPrefs((current) => ({ ...current, model: message.model }))
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'modelApplied', model: message.model, error: message.error },
            })
            break

          case 'mode': {
            // auto is unavailable through nobody's fault and not just this once - it is a property of the
            // model, and there is nowhere to learn it in advance (see ModeAvailability): the only way is to
            // try and look at the refusal. Until the first attempt Shift+Tab and the menu consider it
            // available, so the very first refusal is unavoidable for every new model. After that
            // autoRefusedModels remembers it and neither the menu nor the cycle will land on auto again -
            // and this first, expected refusal we do not show as a red card in the conversation: it is an
            // internal check of what is possible rather than something to read and dismiss by hand.
            const routineAutoRefusal = !message.applied && normalizeMode(message.mode) === 'auto'

            if (!message.applied) {
              if (routineAutoRefusal) {
                // The model of this very tab at the moment of the refusal rather than the active one
                // (one may switch to another tab before the answer comes) - see autoRefusedModels.
                // Resolved by the same formula as in the render (see resolvePanelModel), otherwise
                // "did the agent name a model" would be decided differently in two places.
                const sessionPanel = panelsRef.current[message.sessionId]
                const refusedModel = resolvePanelModel(sessionPanel ?? {}, modelsRef.current, prefsRef.current.model)
                setAutoRefusedModels((current) => (current.includes(refusedModel) ? current : [...current, refusedModel]))
              } else {
                setRefusedModes((current) => withRefusedMode(current, message.mode))
              }
            }
            dispatchPanel({
              session: message.sessionId,
              action: {
                kind: 'modeApplied',
                mode: normalizeMode(message.mode),
                applied: message.applied,
                error: routineAutoRefusal ? undefined : message.error,
              },
            })
            break
          }

          case 'clipboard':
            resolveClipboard(message)
            break

          case 'selection':
            // A reference to a piece of a file from the editor: we do not drag the text along, the agent
            // reads the file itself and sees it whole. As a chip both for a path from the project's root
            // and for an absolute one: the input field is no place for a raw path fifty characters long,
            // and the full path travels to the agent either way (see referenceText).
            addToDraft({ kind: 'chip', chip: referenceChip(message) })
            setFocusToken((current) => current + 1)
            break
        }
      }),
    [],
  )

  /**
   * The embedded browser's clipboard on Linux is connected to nothing: what was copied in a code tab never
   * reaches the panel, and the other way round too. The bridge fixes that through the shell - see
   * clipboard.ts.
   */
  useEffect(() => installClipboardBridge(), [])

  /**
   * The subscription lives once while the active tab changes - so we hold it in a ref.
   *
   * Updated right during the render rather than in an effect: the alerts effect is declared above and in
   * the same frame would fire earlier - that is, it would decide whether to sound by the tab that was open
   * before the switch.
   */
  const activeRef = useRef(active)
  activeRef.current = active

  // An open stream belongs to the tab it was opened in: another session almost certainly has no agent
  // with such an id. Without the reset a tab switch could carry an orphaned activeStream into someone
  // else's panel and run into an empty screen with no dropdown and no way back to main.
  useEffect(() => {
    setActiveStream('main')
  }, [active])

  /**
   * The queue works itself through as soon as the conversation comes free: that is exactly what the caption
   * under the button promises.
   *
   * Across every tab rather than the one open: a queue waits for the end of the turn it was put into, and
   * has no reason to wait for a switch to its tab - a background conversation is precisely what one leaves
   * in order to go and do something else.
   *
   * One message per pass: the next travels when the turn it began has ended, while a neighbouring tab's
   * queue is picked up by a restart of this same effect - its own turn does not stand in the way.
   */
  useEffect(() => {
    const ready = Object.keys(queue).find(
      (sessionId) => (queue[sessionId]?.length ?? 0) > 0 && panels[sessionId]?.status !== 'running',
    )
    if (!ready) return

    const next = queue[ready]?.[0]
    if (!next) return

    clearFinishedAgents(ready)
    // Reading a subagent belongs to the open tab: a background one has none, and there is nothing to
    // reset there.
    if (ready === activeRef.current) setActiveStream('main')
    setQueue((current) => ({ ...current, [ready]: (current[ready] ?? []).slice(1) }))
    dispatchPanel({
      session: ready,
      // Into the feed goes what was typed rather than the finished string: otherwise the attachments of a
      // message sent from the queue disappear from the session's history and countSessionImages stops
      // seeing them - the next image becomes the first one again.
      action: { kind: 'prompt', tokens: next.tokens, quotes: [] },
    })
    send({ type: 'prompt', sessionId: ready, text: next.text, images: next.images })
  }, [panels, queue])

  /**
   * The mode is changed by the shell through a control message: the agent applies it to the very next tool
   * calls, and the conversation needs no restart.
   */
  /**
   * The mode of THIS tab, and of no other. The MODE selector and Shift+Tab both come here.
   *
   * prefs.mode is deliberately left alone: it is what new tabs start in, and choosing to spend one tab
   * in plan mode says nothing about the next one. The two used to be the same action, and a single pick
   * quietly became the starting mode in every project and after every restart. Changing that is its own
   * decision now - see [setDefaultMode].
   */
  const setMode = useCallback(
    (next: string) => {
      send({ type: 'setMode', sessionId: active, mode: next })
      dispatchPanel({ session: active, action: { kind: 'modeRequested', mode: next } })
    },
    [active],
  )

  /**
   * What new tabs start in - chosen from the header's menu and nowhere else, so that it never changes by
   * itself. The open tabs are left as they are on purpose: this is a decision about the next tab rather
   * than about the one being worked in, and reaching into a running conversation to apply it would be
   * exactly the surprise this separation removes.
   */
  const setDefaultMode = useCallback((next: string) => {
    send({ type: 'setDefaultMode', mode: next })
    setPrefs((current) => ({ ...current, mode: next }))
  }, [])

  /**
   * The mode in force is an optional one (auto/bypass) and has become unavailable in this very tab, while
   * nobody asked the tab anything: auto was chosen under one model, say, and then the model was changed to
   * one where the agent had already rejected it (see autoRefusedModels). It will not right itself - mode's
   * sources (see above) do not recompute it backwards, it simply stands as the last thing requested or
   * inherited from prefs - so we roll back to Ask permissions by the same route it is chosen by hand. The
   * rollback is this tab's alone (see setMode): should the saved default itself be a mode this machine
   * cannot do, every new tab corrects itself the same way on opening, and what to start in stays the
   * person's own answer rather than something the panel quietly rewrote. We leave it alone while an
   * answer to a change is still awaited (pendingMode) - our refusal has not happened yet, we wait for a
   * real one.
   */
  useEffect(() => {
    if (panel.pendingMode) return
    const stale = (mode === 'auto' && !availableModes.auto) || (mode === 'bypassPermissions' && !availableModes.bypass)
    if (stale) setMode('manual')
  }, [mode, availableModes, panel.pendingMode, setMode])

  /** The input field's placement is the shell's choice too: a new start of the IDE begins from it. */
  const setComposerLayout = useCallback((next: ComposerLayout) => {
    send({ type: 'setComposerLayout', layout: next })
    setComposerLayoutState(next)
  }, [])

  /**
   * The decision on a plan card - one point for both buttons: it marks the plan decided (after that the
   * card is not drawn, see Feed) and answers the agent, which stands at this very place.
   *
   * The panel does not choose the mode here itself - that is the shell's business (see
   * ClaudePanel.decidePlan): an approval switches the conversation into bypass so that the plan's further
   * steps do not ask for permission one by one; the new mode arrives as an ordinary system event, as it
   * does with a manual choice.
   */
  const decidePlan = useCallback(
    (itemId: string, decision: 'approve' | 'keepPlanning', message?: string) => {
      cards.decidePlan(itemId, decision)
      send({ type: 'planDecision', sessionId: active, id: itemId, decision, message })
    },
    [cards, active],
  )

  /**
   * Everything that travels into the feed lives as one and the same reference from render to render.
   * Otherwise the cards would be repainted anew on every frame of a typing answer: to React a new function
   * in the props is as good a reason as new text (see Feed).
   */
  const attachFeed = useCallback((element: HTMLElement | null) => {
    feedRef.current = element
  }, [])

  const openLink = useCallback((url: string) => send({ type: 'openExternal', url }), [])

  const dismissError = useCallback(
    (id: string) => dispatchPanel({ session: active, action: { kind: 'dismissError', id } }),
    [active],
  )

  /**
   * The question was dismissed without choosing a single option: the person will say it in their own words.
   * To the agent that travels as a refusal to its call - by the same route as a "deny" on a permission
   * request: the turn goes on while the question stops holding the panel. Staying silent is not an option -
   * the agent would go on waiting for a choice.
   */
  const dismissAsk = useCallback(
    (itemId: string) => {
      cards.answerAsk(itemId)
      send({ type: 'askDismiss', sessionId: active, id: itemId })
    },
    [cards, active],
  )

  /**
   * The answer to the agent's question returns through the very tool call that asked it: the turn stands
   * precisely on it and carries on from the same place rather than starting anew with the next message.
   *
   * Into the feed the answer still goes as the person's own line: otherwise the conversation would keep a
   * question with not a trace of an answer to it.
   */
  const sendAnswers = useCallback(
    (itemId: string, answers: { question: string; answer: string }[]) => {
      // Marked answered either way - otherwise a card without a single question (from an empty or broken
      // tool call, say) cannot be closed at all: there is nothing to send, and the button would then do
      // nothing forever.
      cards.answerAsk(itemId)

      const answered = answers.filter((entry) => entry.answer.trim().length > 0)
      if (answered.length === 0) return

      // A question together with its answer, the pairs separated by an empty line. As answers alone in a
      // row this line did not read in the feed at all: a "Only the multi-line one" without the question
      // above it means nothing, and one call may hold up to six questions. The same text goes to the agent
      // when there is nobody left to wait for the answer (see askAnswer in protocol) - it is clearer there
      // too.
      const text = answered.map((entry) => `${entry.question}\n${entry.answer}`).join('\n\n')

      send({
        type: 'askAnswer',
        sessionId: active,
        id: itemId,
        answers: Object.fromEntries(answered.map((entry) => [entry.question, entry.answer])),
        text,
      })
      dispatchPanel({
        session: active,
        action: {
          kind: 'prompt',
          // The same text into the feed but in pieces: the question as a token separate from its answer.
          // Only that way does the card know which lines the person wrote and which the panel filled in,
          // and dims precisely the repeated question (see UserToken.echo) - from the text alone that is
          // indistinguishable.
          tokens: answered.flatMap<UserToken>((entry, index) => [
            { kind: 'text', value: index === 0 ? entry.question : `\n\n${entry.question}`, echo: true },
            { kind: 'text', value: `\n${entry.answer}` },
          ]),
          quotes: [],
          steering: true,
        },
      })
    },
    [cards, active],
  )

  const decidePermission = useCallback(
    (id: string, decision: 'once' | 'always' | 'deny') => {
      send({ type: 'permissionDecision', id, decision })
      dispatchPanel({ session: active, action: { kind: 'permissionResolved', id, decision } })
    },
    [active],
  )

  // Shift+Tab drives around the circle of modes - the same habit and the same circle as in a terminal.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The developer tools live on a key rather than on a button: they are not worth room in the header,
      // and without them the panel cannot be debugged.
      if (event.code === 'KeyD' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        send({ type: 'openDevTools' })
        return
      }

      // Escape = Stop while the agent genuinely works - the same gesture as in a terminal (Ctrl+C) and
      // the same honesty about the status as the button itself: we do not put up a "free" of our own but
      // wait for a real event. Composer dims this event itself (stopPropagation) while Escape is busy with
      // its own business - closing the command or file hint - so it reaches here only when there is
      // nothing left to close above.
      if (event.key === 'Escape') {
        if (!running) return
        event.preventDefault()
        send({ type: 'stop', sessionId: active })
        dispatchPanel({ session: active, action: { kind: 'stopRequested' } })
        return
      }

      if (event.key !== 'Tab' || !event.shiftKey) return

      event.preventDefault()
      setMode(nextMode(mode, availableModes))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, availableModes, setMode, running, active])

  /**
   * A fork from a selected piece: the agent gets the whole conversation up to this point but carries on in
   * a new conversation - the original stays as it was. The selection travels with it as a quote above the
   * input field: it is not editable and does not clutter the field itself.
   */
  const fork = useCallback(
    (quote = '') => {
      // An instant guess from the quote itself is already more meaningful than a generic "fork N"; the
      // first message in the fork replaces it with the LLM's answer (see sessionTitle).
      const short = deriveSessionTitle(quote, 48)
      const id = `branch-${Date.now()}`
      const parent = sessions.find((session) => session.id === active)
      const parentTitle = parent?.title ?? 'main session'

      // A fork stays in its conversation's group - and a fork of a fork too. That way one subject's tabs
      // hold together and differ from other people's at a glance.
      const groupId = parent?.groupId ?? MAIN_SESSION
      const depth = (parent?.depth ?? 0) + 1
      const inGroup = sessions.filter((session) => session.groupId === groupId).length

      setSessions((current) => {
        const next = [...current]
        // Placed right after its group's last tab rather than at the list's end.
        const lastOfGroup = next.map((session) => session.groupId).lastIndexOf(groupId)
        next.splice(lastOfGroup + 1, 0, {
          id,
          title: short || `fork ${inGroup}`,
          state: 'idle',
          groupId,
          depth,
          titleSource: short ? 'heuristic' : 'default',
        })
        return next
      })

      send({ type: 'newSession', kind: 'branch', sessionId: id, parentId: active, title: short, quote })

      if (quote) {
        setDrafts((current) => ({
          ...current,
          [id]: { ...EMPTY_DRAFT, quotes: [{ id: `q-${Date.now()}`, text: quote }] },
        }))
      }

      dispatchPanel({
        session: id,
        action: { kind: 'checkpoint', chip: 'FORK', target: `continues ${parentTitle} · nothing here goes back` },
      })

      setActive(id)
      setFocusToken((current) => current + 1)
    },
    [active, sessions],
  )

  /**
   * A new tab from scratch - both the ordinary one from the "+" button and the single one that greets the
   * user after they have closed every one of them.
   */
  const startSession = useCallback((id: string) => {
    setSessions((current) => [
      ...current,
      { id, title: defaultTitle(id), state: 'idle', groupId: id, depth: 0, titleSource: 'default' },
    ])
    setActive(id)
    send({ type: 'newSession', kind: 'main', sessionId: id, title: defaultTitle(id) })
  }, [])

  /** The tabs' new order after a drag - see moveGroup. */
  const reorderGroups = useCallback((groupId: string, beforeGroupId: string | null) => {
    setSessions((current) => moveGroup(current, groupId, beforeGroupId))
  }, [])

  /**
   * A past conversation carries on in the tab it was chosen from: the panel replays its history right
   * there.
   *
   * We no longer start a tab of its own for it. The tabs are the person's to run - they open them, close
   * them and lay them out in order - while the history, slipping one more tab in for every conversation
   * opened, stuffed the panel's top with tabs nobody asked for: glancing into a past conversation and
   * coming back then cost a tidy-up afterwards too.
   */
  const openResumed = useCallback(
    (entry: HistoryEntry) => {
      const title = deriveSessionTitle(entry.title, 40)

      setOpenPanel(null)
      // The title has already been set by the history panel (an LLM title from the cache or a heuristic) -
      // it is not a placeholder worth replacing with the very next message in this tab.
      //
      // There may be no tab at all: the person closed them all and opens a past conversation from the
      // history on an empty panel. Then it is started right here - otherwise the replay would travel into
      // a conversation not visible through a single tab (see the empty state in the markup below).
      setSessions((current) =>
        current.some((session) => session.id === active)
          ? current.map((session) => (session.id === active ? { ...session, title, titleSource: 'llm' } : session))
          : [...current, { id: active, title, state: 'idle', groupId: active, depth: 0, titleSource: 'llm' }],
      )

      /**
       * Everything the panel remembered about this tab is about a conversation no longer in it: the feed,
       * the subagent chips, the bash-mode command output, the deferred messages, the snapshot for the
       * sound alerts. Leaving any of it means mixing it into the replay of someone else's conversation
       * about to arrive on top.
       */
      dispatchPanel({ session: active, closed: true })
      setActiveStream('main')
      forgetShellCommands(active)
      setShellRuns((current) => ({ ...current, [active]: [] }))
      setQueue((current) => ({ ...current, [active]: [] }))
      delete soundMemory.current[active]

      send({ type: 'resumeSession', sessionId: active, conversationId: entry.id })
    },
    [active],
  )

  const resume = useCallback(
    (entry: HistoryEntry) => {
      // This conversation is already open in this tab - replaying it anew serves nothing.
      if (panelsRef.current[active]?.sessionId === entry.id) {
        setOpenPanel(null)
        return
      }

      if (panelsRef.current[active]?.status === 'running') {
        setResuming(entry)
        return
      }

      openResumed(entry)
    },
    [active, openResumed],
  )

  /**
   * Choosing a model from the menu in the bottom row and by a command in the field is one and the same
   * action, so its route is one as well. Through the shell rather than as a turn to the agent: the choice
   * passes on to new tabs and outlives a restart of the IDE.
   */
  const pickModel = useCallback(
    (model: string) => {
      setPrefs((current) => ({ ...current, model }))
      send({ type: 'setModel', sessionId: active, model })
      // Until the agent answers we show what was chosen - otherwise the choice looks lost; the answer
      // either confirms it or brings the previous model back.
      dispatchPanel({ session: active, action: { kind: 'modelRequested', model } })
    },
    [active],
  )

  const pickEffort = useCallback(
    (effort: string) => {
      setPrefs((current) => ({ ...current, effort }))
      send({ type: 'setEffort', sessionId: active, effort })
    },
    [active],
  )

  const runLocal = useCallback(
    ({ name, argument }: LocalCommand) => {
      if (name === 'model') {
        pickModel(argument)
        return
      }

      if (name === 'effort') {
        pickEffort(argument)
        return
      }

      if (name === 'login') {
        send({ type: 'login' })
        setLoginWaiting(true)
        return
      }

      if (name === 'logout') {
        // We signed out ourselves - there is nobody to disturb with that sound (see the auth handling).
        signedOutAt.current = Date.now()
        send({ type: 'logout' })
        return
      }

      if (name === 'resume') {
        openHistory()
        return
      }

      if (name === 'fork') fork()
    },
    [fork, pickModel, pickEffort],
  )

  /** The Alt+B from the selection menu. The key is drawn in the menu, so it has to work. */
  useEffect(() => {
    if (!selection) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyB' || !event.altKey) return

      event.preventDefault()
      fork(selection.text)
      clearSelection()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection, fork, clearSelection])

  /**
   * A bash-mode command: it is run by the shell in the project's working directory rather than by the agent
   * (see feed/bash). The card goes into the feed at once, before any output - a long command takes seconds,
   * and all that time it has to be visible that it is running.
   */
  const runShell = useCallback(
    (command: string) => {
      // A counter rather than the time alone: two commands started within the same millisecond (that is
      // how the harness plays them) would get one number - and by it the feed looks the card up and
      // recalls the command's text for the agent.
      shellSeq.current += 1
      const id = `bash-${Date.now()}-${shellSeq.current}`
      shellCommands.current[id] = { session: active, command }

      dispatchPanel({ session: active, action: { kind: 'bashStarted', id, command } })
      send({ type: 'bash', sessionId: active, id, command })
    },
    [active],
  )

  /**
   * Sending a message: straight into the work or into the queue.
   *
   * "Straight" works during a turn too: the agent is started with streaming input, and a message written
   * into it is picked up at the nearest step without starting the turn anew - the very same thing Enter
   * does in a terminal. The queue is the opposite: an explicit request to finish the current thing first
   * and take this one next.
   *
   * The exception is compacting the context: /compact swallows stdin, and anything written there is lost.
   * While it runs, Enter behaves like Queue (see deferFollowUpForCompact).
   */
  const submit = useCallback((queued: boolean, overrideText?: string) => {
    // The panel's commands never travel to the agent: signing in and out are out of its reach in streaming
    // mode, and forking is about the panel's own workings altogether.
    // Quotes and attachments do not stand in a command's way: they stay in the field and travel with the
    // next message - losing them over one command would be a shame.
    // A strict type check rather than a plain "overrideText !== undefined": this function is called from
    // click handlers too, into which React passes an event object - a comparison with undefined would take
    // it for substituted text.
    const isOverride = typeof overrideText === 'string'
    // The empty tail is taken off at once: it is invisible in the field (the last line there takes no
    // space, at most the caret stands on it) while in the feed it would show as a spare empty line. To the
    // agent composePrompt does not send it anyway.
    const tokens = isOverride
      ? [{ kind: 'text' as const, value: overrideText }]
      : trimTrailingSpace(draft.tokens)
    const quotes = isOverride ? [] : draft.quotes

    // A "!" at the start is a terminal command rather than a message to the agent: the panel runs it and
    // shows the output in a card of its own (see runShell).
    const command = bashCommand(tokens)
    if (command) {
      runShell(command)
      if (!isOverride) editDraft(active, { tokens: [] })
      return
    }

    // Through tokensText rather than plainText: a command in the field is a chip, and plain text does not
    // see it at all (see captureCommand). To the agent it means exactly "/name" anyway, and that is what we
    // recognise it by.
    const local = localCommand(tokensText(tokens), models)
    if (local) {
      runLocal(local)
      if (!isOverride) editDraft(active, { tokens: [] })
      return
    }

    const written = isOverride ? overrideText : composePrompt(draft, imageBaseCount)
    if (!written) return

    // The first message of this tab's run - we put a human-readable guess in place of "new session" or
    // "fork N" at once, without waiting for the LLM's answer (see sessionTitle): that comes next and
    // replaces it if it can.
    setSessions((current) =>
      current.map((session) =>
        session.id === active && session.titleSource === 'default'
          ? { ...session, title: deriveSessionTitle(written), titleSource: 'heuristic' }
          : session,
      ),
    )

    // The output of the commands run since the last message travels ahead of this one - and leaves the
    // accumulator: the agent has no use for it twice. Into the feed it does not go: there it already
    // stands as a card of its own, in its own place in time.
    const runs = shellRuns[active] ?? []
    const text = runs.length > 0 ? `${shellText(runs)}\n\n${written}` : written
    if (runs.length > 0) setShellRuns((current) => ({ ...current, [active]: [] }))

    const images = isOverride ? [] : imageAttachments(draft.tokens)
    const attachCount = isOverride ? 0 : draft.tokens.filter((token) => token.kind === 'chip').length

    // Into the queue while the agent is busy and someone explicitly asked to wait, or while compacting
    // runs: /compact swallows stdin and does not run these messages once it ends (see
    // deferFollowUpForCompact). A free agent has nothing to wait for.
    if ((queued && running) || deferFollowUpForCompact(panel.compacting, running, lastUserText(panel.items))) {
      setQueue((current) => ({
        ...current,
        [active]: [
          ...(current[active] ?? []),
          {
            id: `q-${Date.now()}`,
            text,
            attach: attachCount ? `${attachCount} refs` : '',
            tokens,
            images,
          },
        ],
      }))
      if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
      return
    }

    /**
     * While a plan card waits for a decision, the turn stands precisely on it: the agent called
     * ExitPlanMode and will not budge, whatever is written to it. As an ordinary message such text simply
     * vanished - it went into a standing process, and the panel looked hung: the message is in the feed,
     * the "Claude is thinking" shimmers, and nothing happens.
     *
     * So whatever is written while a plan is alive is the answer on the plan: the very same "Keep
     * planning", only with the remark the plan was not accepted over. That is exactly how it works in a
     * terminal too.
     */
    const plan = pendingPlan(panel, cards.planDecisions)
    if (plan) {
      dispatchPanel({
        session: active,
        action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text), steering: true },
      })
      // An image cannot be carried by a permission answer: exactly one string travels there (see
      // ClaudePanel.decidePlan). So a remark with attachments goes as an ordinary message afterwards - by
      // then the turn has been released and will accept it - while the plan gets a generic "still
      // planning". That way both the text and the image reach the agent, each exactly once.
      if (images.length > 0) {
        decidePlan(plan.id, 'keepPlanning')
        send({ type: 'prompt', sessionId: active, text, images })
      } else {
        decidePlan(plan.id, 'keepPlanning', text)
      }

      if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
      return
    }

    // A follow-up continues what was begun, so the feed stays as it is: there is nothing to hide this
    // same turn's subagent cards for, they are still at work.
    if (!running) {
      clearFinishedAgents(active)
      setActiveStream('main')
    }

    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text), steering: running },
    })

    send({ type: 'prompt', sessionId: active, text, images })
    if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
  }, [
    draft,
    running,
    active,
    runLocal,
    runShell,
    editDraft,
    imageBaseCount,
    models,
    panel,
    cards.planDecisions,
    decidePlan,
    shellRuns,
  ])

  const sendNow = useCallback(() => submit(false), [submit])
  const queueNext = useCallback(() => submit(true), [submit])

  /**
   * Whether there is anything to send: text, an attachment or a quote. An empty field means both buttons
   * are dimmed, and Enter does nothing either.
   */
  const draftReady = useMemo(() => {
    if (draft.quotes.length > 0) return true
    if (draft.tokens.some((token) => token.kind === 'chip')) return true
    return plainText(draft.tokens).trim().length > 0
  }, [draft])

  // For the local harness page only (webview/src/harness) - it imitates a genuine send of a message from
  // the input field. Vite statically substitutes import.meta.env.DEV with false on a vite build, so this
  // code physically will not be in the assembled plugin.
  useEffect(() => {
    if (!import.meta.env.DEV) return

    window.__accHarnessSend = (text: string) => submit(false, text)
    return () => {
      window.__accHarnessSend = undefined
    }
  }, [submit])

  // The same trick as above: the harness imitates a genuine click on a plan card's button (rather than
  // only the backend's reaction to it) so that stepping through the checkpoints shows the card
  // disappearing by itself.
  useEffect(() => {
    if (!import.meta.env.DEV) return

    window.__accHarnessResolvePlan = decidePlan
    return () => {
      window.__accHarnessResolvePlan = undefined
    }
  }, [decidePlan])

  const agentTabs = useMemo(
    () => buildAgentTabs(panel, cards.answeredAsks, hiddenTaskIds),
    [panel, cards.answeredAsks, hiddenTaskIds],
  )
  const mainStatus = useMemo(() => mainStatusOf(panel, cards.answeredAsks), [panel, cards.answeredAsks])

  // activeStream outlives a session switch or a `/clear` by one frame more than the effect needs to reset
  // it to 'main' (and after a /clear the effect does not fire at all - active has not changed). Since the
  // task it points at is not found in this panel, we count it as main rather than draw an empty screen.
  const activeTask = panel.items.find((item): item is TaskItem => item.kind === 'task' && item.id === activeStream)
  const resolvedStream = activeStream === 'main' || activeTask ? activeStream : 'main'
  /**
   * What is holding the turn right now and waiting for the person. Both panels are computed here rather
   * than in place: their digit hotkeys are shared, and whose they are can be decided only by knowing both
   * at once.
   */
  const permission = pendingPermission(panel.items, resolvedStream)
  const ask = pendingAsk(panel.items, cards.answeredAsks, resolvedStream)
  const commands = useMemo(
    () => buildCommands(panel.slashCommands, commandHints),
    [panel.slashCommands, commandHints],
  )
  const tabs = useMemo(
    () =>
      sessions.map((session) => ({
        ...session,
        state: sessionState(panels[session.id], session.id === active, cards),
      })),
    [sessions, panels, active, cards.planDecisions, cards.answeredAsks],
  )

  // Without a login the input field is meaningless: the agent answers any question with a line about
  // /login, and that command itself is out of reach in streaming mode.
  if (!auth || !auth.loggedIn) {
    return (
      <div className={s.panel} data-anchor={dockAnchor}>
        <LoginGate
          auth={auth}
          waiting={loginWaiting}
          onLogin={() => {
            send({ type: 'login' })
            setLoginWaiting(true)
          }}
          onRecheck={() => send({ type: 'checkAuth' })}
          onSetExecutablePath={(path) => send({ type: 'setExecutablePath', path })}
        />
      </div>
    )
  }

  /**
   * The session tabs and the history / MCP / plugins / sounds / layout buttons are shared by the whole
   * panel rather than tied to one column, and stand at the top under any layout: the feed (and beside it,
   * in left/right, the side rail) takes everything left below.
   *
   * History, MCP, plugins and sounds are toggles for one and the same pinned panel (see openPanel), items
   * of the shared menu behind the burger in the header (see Header.onOpenMenu). Each closes the menu
   * itself - that panel and the popup menu (model / effort / mode / layout) must not stand at once: one of
   * them would cover the other's buttons, and Escape and a click outside would then not know which to
   * close first.
   *
   * A tab opens on what has been loaded in advance. We ask anew only if the previous request has already
   * come back while what is shown has had time to go stale.
   */
  const openMcp = () => {
    setMenu(null)
    if (openPanel === 'mcp') {
      setOpenPanel(null)
      return
    }
    setOpenPanel('mcp')
    setMcpMessage(null)
    if (!mcpLoading && Date.now() - mcpFetchedAt > LIST_STALE_MS) loadMcp(mcpServers !== null)
  }

  const openPlugins = () => {
    setMenu(null)
    if (openPanel === 'plugins') {
      setOpenPanel(null)
      return
    }
    setOpenPanel('plugins')
    setPluginMessage(null)
    if (!pluginsLoading && Date.now() - pluginsFetchedAt > LIST_STALE_MS) {
      loadPlugins(pluginsInstalled !== null)
    }
  }

  const openSounds = () => {
    setMenu(null)
    setOpenPanel(openPanel === 'sounds' ? null : 'sounds')
  }

  /**
   * Open the MODEL/EFFORT/MODE selector - or close it with a second click on the same button. The menu's
   * scrim deliberately does not cover the header and, in left/right, the top of the side rail, where these
   * buttons stand (see .menuScrim and Header.onOpenMenu - the same trick already stands there): otherwise
   * the button would not be clickable while its own popup is open. A second click on the button itself the
   * scrim does not catch, so we toggle ourselves rather than rely on a click outside the menu.
   */
  const openSelector = (kind: SelectorKind, anchor: Anchor) => {
    if (menu?.kind === kind) {
      setMenu(null)
      return
    }
    setOpenPanel(null)
    setMenu({ kind, anchor })
  }

  /**
   * Open the current branch's PR in the system browser - the link itself lives in the panel and travels
   * outwards only on a click. The branch and its PR live in the header (see Header), one and the same place
   * under any layout.
   */
  const openPullRequest = () => {
    const url = panels[MAIN_SESSION]?.project?.pullRequestUrl
    if (url) send({ type: 'openExternal', url })
  }

  const header = (
    <Header
        sessions={tabs}
        layout={composerLayout}
        activeSession={active}
        onPickSession={setActive}
        onCloseSession={(id) => {
          // Any tab closes like an ordinary one, the last one included - then there is nothing to show,
          // but the header and its buttons (history, MCP, plugins) stay: they are not tied to whether a
          // conversation is open.
          send({ type: 'closeSession', sessionId: id })
          delete soundMemory.current[id]
          // Both the collected output and what is still running: without the second, a later answer from
          // the shell would start the record up again - for a conversation that no longer exists.
          forgetShellCommands(id)
          setShellRuns((current) => {
            if (!(id in current)) return current
            const next = { ...current }
            delete next[id]
            return next
          })
          // What this tab deferred leaves along with it: the conversation that was to run it no longer
          // exists.
          setQueue((current) => {
            if (!(id in current)) return current
            const next = { ...current }
            delete next[id]
            return next
          })
          dispatchPanel({ session: id, closed: true })
          const next = sessions.filter((session) => session.id !== id)
          setSessions(next)
          if (active === id) setActive(next[0]?.id ?? MAIN_SESSION)
        }}
        onNewSession={() => startSession(`session-${Date.now()}`)}
        onReorderGroups={reorderGroups}
        onOpenMenu={(anchor) => openSelector('header', anchor)}
        gitBranch={panels[MAIN_SESSION]?.project?.gitBranch}
        pullRequest={panels[MAIN_SESSION]?.project?.pullRequest}
        onOpenPullRequest={openPullRequest}
      />
  )

  /**
   * A permission, a question, the task list with the branch and the PR, the queue, the quotes - the whole
   * stack of cards above the input field. In bottom and compact it stands right in the dock (see below),
   * while in left/right it travels through a portal into the side rail spanning the panel's full height
   * (see railNode) - for the same reasons as Composer's MODEL/EFFORT/MODE: the field and the feed are left
   * as a clean pair of two blocks one above the other, with no cards wedged in between.
   */
  const dockCards = (
    <>
      <PermissionPanel item={permission} composerEmpty={!draftReady} onDecide={decidePermission} />

      <AskPanel
        key={ask?.id ?? 'none'}
        item={ask}
        composerEmpty={!draftReady}
        // While an unanswered permission hangs beside it, the digits belong to that one: two panels
        // listening to the same key would both answer at once.
        hotkeys={!permission}
        onSubmit={sendAnswers}
        onDismiss={dismissAsk}
      />

      <TaskListPanel item={latestTodo(panel.items)} layout={composerLayout} />

      <Queue
        items={sessionQueue}
        onReorder={(from, to) =>
          setQueue((current) => {
            const next = [...(current[active] ?? [])]
            const [moved] = next.splice(from, 1)
            if (moved) next.splice(to, 0, moved)
            return { ...current, [active]: next }
          })
        }
        onRemove={(id) =>
          setQueue((current) => ({
            ...current,
            [active]: (current[active] ?? []).filter((item) => item.id !== id),
          }))
        }
      />

      <Quotes
        items={draft.quotes}
        onRemove={(id) => editDraft(active, { quotes: draft.quotes.filter((quote) => quote.id !== id) })}
      />
    </>
  )

  return (
    <div className={s.panel} data-anchor={dockAnchor} data-layout={composerLayout}>
      {header}

      {openPanel === 'history' ? (
        <History conversations={history} onOpen={resume} onClose={() => setOpenPanel(null)} />
      ) : null}

      {/* Killed only when asked - the work itself is stopped by the CLI, and it reports the end through
          an ordinary notification: the chip leaves by itself, and faking its end on our side serves
          nothing. */}
      {stopping ? (
        <Confirm
          title={stopping.title}
          subject={stopping.subject}
          confirmLabel="Stop"
          onCancel={() => setStopping(null)}
          onConfirm={() => {
            send({ type: 'stopTask', sessionId: active, taskId: stopping.id })
            setStopping(null)
          }}
        />
      ) : null}

      {/* The tab is busy with work - before handing it over to a past conversation we ask: a process with
          a running turn will survive this no better than a closed tab (see resume). */}
      {resuming ? (
        <Confirm
          title="This tab is still working. Open the past chat here?"
          subject={resuming.title}
          confirmLabel="Open"
          onCancel={() => setResuming(null)}
          onConfirm={() => {
            openResumed(resuming)
            setResuming(null)
          }}
        />
      ) : null}

      {openPanel === 'sounds' ? (
        <Sounds
          prefs={soundPrefs}
          onToggle={(sound) => changeSoundPrefs(toggleSound(soundPrefs, sound))}
          onVolume={(sound, volume) => changeSoundPrefs(setVolume(soundPrefs, sound, volume))}
          // A muted sound plays too: hearing exactly what one is switching off is precisely what the
          // button is pressed for. The volume is taken as it stands right now: otherwise there is nothing
          // to check the slider against.
          onPreview={(sound) => send({ type: 'sound', sound, volume: volumeOf(soundPrefs, sound) })}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}

      {openPanel === 'mcp' ? (
        <Mcp
          servers={mcpServers}
          loading={mcpLoading}
          message={mcpMessage}
          onRefresh={() => {
            setMcpMessage(null)
            loadMcp()
          }}
          onReconnect={(name) => {
            setMcpMessage(null)
            send({ type: 'mcpReconnect', sessionId: active, name })
          }}
          // The login address is opened by the shell in the system browser, and the code from it is caught
          // by the CLI itself: the panel is left waiting for a new status.
          onAuthenticate={(name) => {
            setMcpMessage(null)
            send({ type: 'mcpAuthenticate', sessionId: active, name })
          }}
          onRemove={(name) => {
            setMcpMessage(null)
            send({ type: 'mcpRemove', sessionId: active, name })
          }}
          onAdd={(name, command, transport) => {
            setMcpMessage(null)
            send({ type: 'mcpAdd', sessionId: active, name, command, transport })
          }}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}

      {openPanel === 'plugins' ? (
        <Plugins
          installed={pluginsInstalled}
          available={pluginsAvailable}
          marketplaces={marketplaces}
          loading={pluginsLoading}
          message={pluginMessage}
          onRefresh={() => {
            setPluginMessage(null)
            loadPlugins()
          }}
          onInstall={(plugin) => {
            setPluginMessage(null)
            send({ type: 'pluginInstall', plugin })
          }}
          onUninstall={(plugin) => {
            setPluginMessage(null)
            send({ type: 'pluginUninstall', plugin })
          }}
          onEnable={(plugin) => {
            setPluginMessage(null)
            send({ type: 'pluginEnable', plugin })
          }}
          onDisable={(plugin) => {
            setPluginMessage(null)
            send({ type: 'pluginDisable', plugin })
          }}
          onAddMarketplace={(source) => {
            setPluginMessage(null)
            send({ type: 'marketplaceAdd', source })
          }}
          onRemoveMarketplace={(name) => {
            setPluginMessage(null)
            send({ type: 'marketplaceRemove', name })
          }}
          onDismissMessage={() => setPluginMessage(null)}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}

      {sessions.length === 0 ? (
        <div className={s.emptyState}>
          <p className={s.gateTitle}>No open chats</p>
          <button type="button" className={s.gateButton} onClick={() => startSession(MAIN_SESSION)}>
            New chat
          </button>
        </div>
      ) : (
        <div className={s.workArea} data-layout={composerLayout}>
        <div className={s.content}>
        <StreamSwitcher
          tabs={agentTabs}
          background={panel.background}
          mainStatus={mainStatus}
          active={resolvedStream}
          onPick={setActiveStream}
          onStop={setStopping}
        />

        <div className={s.body}>
          {resolvedStream === 'main' ? (
            <Feed
              items={panel.items}
              streamingText={panel.streamingText}
              streamingId={panel.streamingId}
              streamingThinking={panel.streamingThinking}
              streaming={running}
              streamStatus={streamStatus(panel, cards)}
              statusStalled={panel.retry !== undefined}
              cards={cards}
              scrollRef={attachFeed}
              onPlanDecision={decidePlan}
              onDismissError={dismissError}
              onOpenLink={openLink}
            />
          ) : (
            <AgentStreamView item={activeTask} />
          )}

          {selection && resolvedStream === 'main' ? (
            <SelectionMenu
              selection={selection}
              onFork={() => {
                fork(selection.text)
                clearSelection()
              }}
              onQuote={() => {
                // As a chip right in the input field, like a file or an image, rather than as a separate
                // block above it: a quote from the agent's output is no worse than an attachment.
                const ordinal = draft.tokens.filter((token) => token.kind === 'chip' && token.chip.kind === 'quote').length + 1
                editDraft(active, {
                  tokens: appendChip(draft.tokens, { kind: 'quote', value: `ref${ordinal}`, text: selection.text }),
                })
                clearSelection()
                setFocusToken((current) => current + 1)
              }}
            />
          ) : null}
        </div>
        </div>

        {/* An empty node - all the markup inside it is drawn through portals: dockCards itself (see
            above) and Composer (see railContainer) - the state and the handlers each stay in their own
            place, while the node stands here so that the .workArea grid can stretch it over the panel's
            full height. */}
        {isSideComposerLayout(composerLayout) ? <div className={s.railColumn} ref={setRailNode} /> : null}
        {isSideComposerLayout(composerLayout) && railNode ? createPortal(dockCards, railNode) : null}

        <div className={composer.dock} data-layout={composerLayout}>
          {isSideComposerLayout(composerLayout) ? null : dockCards}

          <Composer
            sessionId={active}
            tokens={draft.tokens}
            streaming={running}
            planMode={mode === 'plan'}
            contextPercent={context.percent}
            commands={commands}
            models={models}
            meters={
              <UsageMeters todayTokens={usage.todayTokens ?? '…'} usage={usage} />
            }
            files={files}
            imageBaseCount={imageBaseCount}
            focusToken={focusToken}
            layout={composerLayout}
            model={model}
            effort={prefs.effort}
            mode={mode}
            onOpenSelector={openSelector}
            railContainer={railNode}
            fileDragOver={fileDragOver}
            onTokensChange={(tokens) => editDraft(active, { tokens })}
            onAttach={() => send({ type: 'pick' })}
            // The chips are assembled by the shell and come back as an ordinary picked - by the same route
            // as a choice through a dialog: only it knows whether this is a file or a folder.
            onDropFiles={(paths) => send({ type: 'dropped', paths })}
            registerInsert={registerInsert}
            onSubmit={sendNow}
            onQueue={queueNext}
            canSubmit={draftReady}
            stopStalled={stopStalled}
            onStop={() => {
              // We are in no hurry to go idle: the status is honestly awaited from a real event rather
              // than put up by ourselves - otherwise a Stop could lie "free" at exactly the moment the
              // agent has genuinely hung.
              send({ type: 'stop', sessionId: active })
              dispatchPanel({ session: active, action: { kind: 'stopRequested' } })
            }}
            onForceStop={() => {
              send({ type: 'kill', sessionId: active })
              dispatchPanel({ session: active, action: { kind: 'status', status: 'idle' } })
            }}
          />

          {/* The tight layouts (compact and left/right) keep MODEL/EFFORT/MODE in the input field itself
              or in the side rail (see Composer) - they have no status row of their own under the field,
              the height is given to the feed. The branch and its PR live in the header (see Header),
              the same under any layout. */}
          {composerLayout === 'compact' || isSideComposerLayout(composerLayout) ? null : (
            <StatusBar
              model={model}
              effort={prefs.effort}
              mode={mode}
              onOpen={openSelector}
            />
          )}
        </div>
        </div>
      )}

      {menu ? (
        <Menu
          {...menuProps(
            menu.kind,
            models,
            prefs.model,
            switched,
            prefs.effort,
            mode,
            prefs.mode,
            composerLayout,
            openPanel,
            availableModes,
          )}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onPick={(id) => {
            const anchor = menu.anchor
            const kind = menu.kind
            setMenu(null)

            if (kind === 'model') pickModel(id)
            if (kind === 'effort') pickEffort(id)
            if (kind === 'mode') setMode(id)
            if (kind === 'defaultMode') setDefaultMode(id)
            if (kind === 'composerLayout') setComposerLayout(normalizeComposerLayout(id))
            if (kind === 'header') {
              if (id === 'history') openHistory()
              else if (id === 'mcp') openMcp()
              else if (id === 'plugins') openPlugins()
              else if (id === 'sounds') openSounds()
              // Not actions but ways into a submenu - reopened from the same point the burger itself
              // grew from (see Header.onOpenMenu).
              else if (id === 'defaultMode') setMenu({ kind: 'defaultMode', anchor })
              else if (id === 'composerLayout') setMenu({ kind: 'composerLayout', anchor })
            }
          }}
        />
      ) : null}
    </div>
  )
}

// --- Session state ----------------------------------------------------------

type PanelsState = Record<string, PanelState>

/**
 * An ordinary change to a conversation - or its closing: a closed tab leaves the state entirely rather
 * than lying about with a feed of its own.
 */
type PanelsAction =
  | { session: string; action: Parameters<typeof reducePanel>[1] }
  | { session: string; closed: true }

const panelsReducer = (state: PanelsState, event: PanelsAction): PanelsState => {
  /**
   * While a closed tab stayed in the state, one went on paying for it: everything that walks the
   * conversations (the sound alerts, say) saw it on every update - that is, on every piece of an answer
   * being typed in any other tab - and worked through the feed of a conversation that no longer exists all
   * over again.
   */
  if ('closed' in event) {
    if (!(event.session in state)) return state

    const next = { ...state }
    delete next[event.session]
    return next
  }

  return {
    ...state,
    [event.session]: reducePanel(state[event.session] ?? initialPanelState, event.action),
  }
}

/**
 * What a tab's dot shows. A crashed process matters most: the turn was cut short against its will, and even
 * a tab nobody is looking at has to say so. Next comes waiting for the person, and only then ordinary work.
 */
const sessionState = (panel: PanelState | undefined, active: boolean, cards: CardState): SessionState => {
  if (!panel) return 'idle'

  if (panel.crashed) return 'crashed'

  // An unanswered permission request always calls: without the person the turn will not budge.
  if (panel.items.some((item) => item.kind === 'perm' && item.decision === null)) return 'attention'

  // The agent's question and a shown plan hold the turn just as fast, and until now only the open tab's
  // status line could say so: a background one span "working" endlessly. We look only at a running turn -
  // the same cards arrive with a conversation raised from the history, but there is nothing left to decide
  // there.
  if (panel.status === 'running' && panel.items.some((item) => awaitsYou(item, cards))) return 'attention'

  /**
   * An error calls only a background tab and only while it is the last thing that happened: in the open tab
   * the person sees it in the feed anyway, and a dot that pulses on to the conversation's end after that is
   * simply noise. The turn's outcome (meta) does not count: it comes right after the failure and tells about
   * the very same broken turn.
   */
  const last = [...panel.items].reverse().find((item) => item.kind !== 'meta')
  if (!active && last?.kind === 'error') return 'attention'

  if (panel.status === 'running') return 'running'

  // We count as finished a conversation in which the agent brought a turn to its end at least once: a fork
  // marker by itself is not work yet.
  return panel.items.some((item) => item.kind === 'meta') ? 'done' : 'idle'
}

// --- Derived data -----------------------------------------------------------

/**
 * How many images have already travelled to the agent earlier in this same session - through sent messages
 * and through what already stands in the queue. We carry the numbering on from that number rather than from
 * zero on every message: otherwise an "Image #1" repeats in line after line, and the number no longer tells
 * which image is meant when there are several over a conversation.
 */
const countSessionImages = (panel: PanelState, queue: QueuedPrompt[]): number => {
  const sent = panel.items.reduce(
    (sum, item) =>
      item.kind === 'user'
        ? sum + item.tokens.filter((token) => token.kind === 'chip' && token.chip.kind === 'img' && Boolean(token.chip.data)).length
        : sum,
    0,
  )
  const queued = queue.reduce((sum, item) => sum + item.images.length, 0)
  return sent + queued
}

/**
 * Whether the turn stands on this feed item waiting for the person. A permission request, a question with
 * options and a shown plan hold it equally fast, so their rule is one: parting ways, it would lie now
 * through the status line, now through the tab's dot - depending on where which case was forgotten.
 */
const awaitsYou = (item: FeedItem, cards: CardState): boolean =>
  (item.kind === 'perm' && item.decision === null) ||
  (item.kind === 'ask' && !item.historic && !cards.answeredAsks.includes(item.id)) ||
  (item.kind === 'plan' && !item.historic && cards.planDecisions[item.id] === undefined)

/** The main stream rather than a separate subagent: that one has a tab and a status of its own. */
const ownStream = (item: FeedItem): boolean => !('taskId' in item) || item.taskId === undefined

/**
 * While an unanswered permission request or a question from the MAIN stream hangs there, the turn is not
 * genuinely thinking - it stands and waits for the person's decision. A "Claude is thinking" at that moment
 * would be untrue. A particular agent's decision does not count here: the status in the dropdown and the
 * agent's own tab answer for that - if the main status line reacted to them too, it would itself become the
 * very dishonest caption the whole redesign was undertaken to get away from.
 *
 * The elapsed time is written right here rather than waiting for the turn's outcome: the "Worked Ns" under a
 * finished answer arrives only with its end, and until then how much had already passed was not visible at
 * all. It is counted from turnStartedAt less pausedMs - the total time of every such wait over this turn
 * (see attentionStarted/attentionEnded in feed/build.ts and the effect in App that sends them): otherwise
 * after a decision the idle seconds would be charged to the agent retroactively, as though it had been
 * "thinking" all that time. It is updated once a second by the same tick that moves the tool calls'
 * durations (see tickDurations in feed/build.ts).
 */
const streamStatus = (panel: PanelState, cards: CardState): string => {
  /**
   * The request to the model failed and waits for a retry: at that moment the turn is not running at all -
   * no text, no calls, no question - and a "Claude is thinking" with a running counter would be an outright
   * lie. It is precisely because of it that the panel looked hung: the only thing happening was shown
   * nowhere.
   *
   * Before compacting: the request that compacts the context can fail too, and then what has to be told
   * about is the failure rather than the compacting standing still because of it.
   */
  if (panel.retry) {
    // The attempts and the countdown are told about by the card in the feed right above this line (see
    // RetryRow) - here goes only what is not in it: how long all of this has already dragged on. The line's
    // familiar shape is kept - "what is happening - how long it has run" - and exactly what was untrue
    // changes.
    return `${panel.retry.label} · waiting ${formatDuration(Date.now() - panel.retry.startedAt)}`
  }

  // The compacting is spoken about by its own card in the feed (a CONTEXT with a growing percentage) -
  // there must be no second caption about the same thing right under it.
  if (panel.compacting) return ''

  const awaitingDecision = panel.items.some((item) => ownStream(item) && awaitsYou(item, cards))
  if (awaitingDecision) return 'Waiting for you'

  /**
   * The main stream's own turn may have ended already (the agent started a background subagent and fell
   * silent at that - which is what the Task tool does outside a skill) while the subagent has not. Without
   * this branch the only trace of anything still happening would be a dot on the subagent's chip, which one
   * first has to notice and then work out what it means.
   */
  if (panel.status !== 'running') {
    const pending = panel.items.filter((item) => item.kind === 'task' && item.pending).length
    if (pending === 0) return ''
    return pending === 1 ? 'Waiting for subagent' : `Waiting for ${pending} subagents`
  }

  /**
   * What exactly is being done right now has already been named by a card in the feed itself (the tool call,
   * its command, its description). Repeating the same thing here a second time in different words is not an
   * account of what is happening but a duplicate of what is visible a line above anyway. While the turn runs
   * and no decision is awaited from the person, there is exactly one honest caption here - the turn is
   * thinking.
   */
  const label = 'Claude is thinking'
  if (!panel.turnStartedAt) return label

  // A decision has just been taken: awaitingDecision is already false, but the effect that carries
  // waitStartedAt into pausedMs has not run yet (it fires after this render) - we count the current pause in
  // right here so that the number does not jump on the next tick.
  const now = Date.now()
  const ongoingWait = panel.waitStartedAt ? now - panel.waitStartedAt : 0
  const elapsed = formatDuration(now - panel.turnStartedAt - panel.pausedMs - ongoingWait)
  return `${label} · ${elapsed}`
}

/**
 * A shown plan with no decision on it yet: while it is there, the turn stands on it.
 *
 * Only for a running turn: a plan card stays in the feed forever, including in a conversation raised from
 * the history - and there is nothing left to decide there, the turn ended somewhere in the past. Without
 * this check the very first message in a restored tab would travel not as a prompt but as a remark on an
 * ancient plan.
 */
const pendingPlan = (
  panel: PanelState,
  decisions: Record<string, 'approve' | 'keepPlanning'>,
): PlanItem | undefined =>
  panel.status === 'running'
    ? [...panel.items].reverse().find((item): item is PlanItem => item.kind === 'plan' && decisions[item.id] === undefined)
    : undefined

/** The last task list the agent sent - the panel above the input field mirrors only that one. */
const latestTodo = (items: FeedItem[]): TodoItem | undefined =>
  [...items].reverse().find((item): item is TodoItem => item.kind === 'todo')

/** The text of the person's last line - to work out whether this is a compaction right now. */
const lastUserText = (items: FeedItem[]): string => {
  const last = [...items].reverse().find((item): item is UserItem => item.kind === 'user')
  return last ? tokensText(last.tokens).trim() : ''
}

/**
 * Whose stream this actually is. A taskId without the task it refers to (if the agent_id / task_id match
 * one day stops holding on a new version of the CLI, say) is no reason to hide a decision for good: without
 * this it would show up nowhere and quietly expire on a timeout. We count such a case as the main stream
 * rather than as a separate stream that does not exist.
 */
const ownerStream = (taskId: string | undefined, items: FeedItem[]): string => {
  if (taskId === undefined) return 'main'
  const known = items.some((item) => item.kind === 'task' && item.id === taskId)
  return known ? taskId : 'main'
}

/** The last question the agent asked in the current stream that has not been answered yet. */
const pendingAsk = (items: FeedItem[], answered: string[], stream: string): AskItem | undefined =>
  [...items]
    .reverse()
    .find(
      (item): item is AskItem =>
        item.kind === 'ask' &&
        // A question from a past conversation's replay is not shown as a card - see AskItem.historic.
        !item.historic &&
        !answered.includes(item.id) &&
        ownerStream(item.taskId, items) === stream,
    )

/** The current stream's last call that is still waiting for a permission decision. */
const pendingPermission = (items: FeedItem[], stream: string): PermItem | undefined =>
  [...items]
    .reverse()
    .find(
      (item): item is PermItem =>
        item.kind === 'perm' && item.decision === null && ownerStream(item.taskId, items) === stream,
    )

const statusOf = (task: TaskItem, items: FeedItem[], answeredAsks: string[]): AgentStatus => {
  // An agent cut short is not the same as one that ran its course: a killed and a crashed one used to get
  // the same green dot as one that made it to the end.
  if (!task.pending) return task.outcome === 'failed' ? 'failed' : task.outcome === 'stopped' ? 'stopped' : 'done'

  const blocked = items.some(
    (item) =>
      (item.kind === 'perm' && item.taskId === task.id && item.decision === null) ||
      (item.kind === 'ask' && item.taskId === task.id && !item.historic && !answeredAsks.includes(item.id)),
  )
  return blocked ? 'needs-input' : 'running'
}

const mainStatusOf = (panel: PanelState, answeredAsks: string[]): AgentStatus => {
  const blocked = panel.items.some(
    (item) =>
      (item.kind === 'perm' && item.taskId === undefined && item.decision === null) ||
      (item.kind === 'ask' && item.taskId === undefined && !item.historic && !answeredAsks.includes(item.id)),
  )
  if (blocked) return 'needs-input'
  return panel.status === 'running' ? 'running' : 'idle'
}

/** A batch hidden by clearFinishedAgents disappears from the dropdown - the history itself went nowhere. */
const buildAgentTabs = (panel: PanelState, answeredAsks: string[], hiddenTaskIds: Set<string>): AgentTab[] =>
  panel.items
    .filter((item): item is TaskItem => item.kind === 'task' && !hiddenTaskIds.has(item.id))
    .map((task) => ({
      id: task.id,
      label: `agent:${task.target}`,
      meta: task.meta,
      status: statusOf(task, panel.items, answeredAsks),
      percent: task.percent,
      duration: task.duration,
      // There is nothing to kill in one that has already finished, and nothing to kill it with until the
      // CLI has named the task (see TaskItem.taskId).
      stopId: task.pending ? task.taskId : undefined,
    }))

/** The items of the burger menu in the header - see Header.onOpenMenu. */
const HEADER_MENU_OPTIONS: MenuOption[] = [
  { id: 'history', label: 'History' },
  { id: 'mcp', label: 'MCP servers' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'sounds', label: 'Sound alerts' },
  // Not the mode of the tab being worked in - that one lives on the MODE selector by the input field.
  // This is the answer to "what should the next tab start in", and it belongs here precisely because it
  // is asked once in a while rather than in the middle of work.
  { id: 'defaultMode', label: 'Default mode' },
  { id: 'composerLayout', label: 'Composer layout' },
]

const menuProps = (
  kind: SelectorKind,
  models: ModelInfo[] | null,
  /** The chosen value rather than what the agent resolved it into: the tick has to stand on the choice. */
  selectedModel: string,
  /** The model the agent moved the conversation to itself - then the tick stands on it (see modelMenu). */
  switched: string | undefined,
  effort: string,
  mode: string,
  /** What new tabs start in - the saved choice, which the open tab's mode is free to differ from. */
  defaultMode: string,
  composerLayout: string,
  /** Which pinned panel is open right now - the tick in the burger menu stands on it. */
  openPanel: 'history' | 'mcp' | 'plugins' | 'sounds' | null,
  availableModes: ModeAvailability,
): { title: string; hint: string; width: number; options: MenuOption[]; selected: string; tick?: boolean } => {
  if (kind === 'model') {
    return {
      title: 'MODEL',
      hint: '/model',
      width: 344,
      ...modelMenu(models, selectedModel, switched),
    }
  }

  if (kind === 'effort') {
    return {
      title: 'EFFORT',
      hint: 'reasoning budget',
      width: 320,
      options: EFFORT_OPTIONS,
      selected: effort,
    }
  }

  if (kind === 'defaultMode') {
    return {
      title: 'DEFAULT MODE',
      hint: 'what new tabs start in',
      // The same width as the mode selector itself: the same rows with the same captions and sub-lines,
      // and at anything narrower they would wrap differently in the two menus for no reason.
      width: 372,
      // The same list, availability marks and all: a mode this machine or this model cannot do is no
      // better a default than it is a current mode, and saying so in one menu but not the other would
      // only puzzle.
      options: modeMenuOptions(availableModes),
      // The saved default rather than what the tab is in right now. They part ways the moment the tab's
      // mode is changed, and that is the whole point of having two controls.
      selected: normalizeMode(defaultMode),
    }
  }

  if (kind === 'composerLayout') {
    return {
      title: 'COMPOSER LAYOUT',
      hint: 'where the input sits',
      // The title and the hint stand in one row (see Menu.menuHead) - at 220px they collided and the hint
      // wrapped mid-word. 300px is the same room EFFORT has at a comparable length of text.
      width: 300,
      options: COMPOSER_LAYOUT_OPTIONS,
      selected: composerLayout,
    }
  }

  if (kind === 'header') {
    return {
      title: 'MENU',
      hint: '',
      width: 260,
      options: HEADER_MENU_OPTIONS,
      // Composer layout is not a toggle but a way into a submenu of its own (see onPick in App) - it never
      // has a current value here.
      selected: openPanel ?? '',
      // A list of actions rather than a choice among options - a tick of its own is not needed here (see
      // Menu.tick), it would simply stand as an indent beside every row: almost never is any pinned panel
      // open.
      tick: false,
    }
  }

  return {
    title: 'PERMISSION MODE',
    // The circle is the same as in a terminal, and everything but "Don't ask" is in it - the unavailable it
    // simply steps over (see nextMode).
    hint: "shift+tab cycles every mode but Don't ask",
    width: 372,
    options: modeMenuOptions(availableModes),
    selected: mode,
  }
}
