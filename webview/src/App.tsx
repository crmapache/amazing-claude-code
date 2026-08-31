import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { send, subscribe } from './bridge'
import { copyToClipboard, installClipboardBridge, resolveClipboard } from './clipboard'
import {
  effortOptions,
  modeMenuOptions,
  modelMenu,
  type ModeAvailability,
  nextMode,
  resolvePanelModel,
  modelInForce,
  normalizeMode,
  withRefusedMode,
} from './catalog'
import { AgentStreamView } from './components/AgentStreamView'
import { AskPanel } from './components/AskPanel'
import { Composer } from './components/Composer'
import {
  composerLayoutOptions,
  isSideComposerLayout,
  layoutForRoom,
  normalizeComposerLayout,
  type ComposerLayout,
} from './composerLayout'
import { pasteCollapseSummary } from './pasteCollapse'
import { Confirm } from './components/Confirm'
import { Feed } from './components/Feed'
import {
  Feedback,
  FeedbackLog,
  emptyFeedback,
  feedbackLogs,
  feedbackProblem,
  type FeedbackDraft,
} from './components/Feedback'
import { Header, type Session, type SessionState } from './components/Header'
import { History } from './components/History'
import { Garland, Snowfall } from './components/Holiday'
import { LoginGate, type AuthState } from './components/LoginGate'
import { Mcp } from './components/Mcp'
import { Menu, type MenuOption } from './components/Menu'
import { ImprovePrompt } from './components/ImprovePrompt'
import { VoiceDevices, VoiceInput, VoiceLanguages, type VoiceSettings } from './components/VoiceInput'
import { SettingsScreen, SideMenu, parentOf, type MenuScreen, type MenuSummary } from './components/SideMenu'
import { Language } from './components/Language'
import { LocaleProvider, activeLocale, nativeName, useDict } from './i18n'
import type { Dict } from './i18n/en'
import { StatisticsTab, type StatisticsView } from './components/stats/StatisticsTab'
import { dressAll, summarize } from './stats/achievements'
import { ChoiceList, LayoutChoice } from './components/Choices'
import { PasteCollapse } from './components/PasteCollapse'
import { PermissionPanel } from './components/PermissionPanel'
import { Plugins } from './components/Plugins'
import { Queue } from './components/Queue'
import { Quotes, type Quote } from './components/Quotes'
import { SelectionMenu } from './components/SelectionMenu'
import { Tooltips } from './components/Tooltips'
import { Remote, RemoteAbout, remoteState, type RemoteStatus } from './components/Remote'
import { Sounds } from './components/Sounds'
import { StatusBar, UsageMeters, type Anchor, type SelectorKind } from './components/StatusBar'
import { SHARE, shareText, thanksMenu, thanksUrl } from './components/Thanks'
import { useHoliday } from './hooks/useHoliday'
import { useHoverTarget } from './hooks/useHoverTarget'
import { useLowPanel } from './hooks/useLowPanel'
import { StreamSwitcher } from './components/StreamSwitcher'
import { TaskListPanel } from './components/TaskListPanel'
import composer from './components/composer.module.css'
import s from './components/shell.module.css'
import { bashCommand, shellText, type ShellRun } from './feed/bash'
import { contextOf, initialPanelState, reducePanel, type PanelState } from './feed/build'
import { deferFollowUpForCompact } from './feed/compact'
import { PASTE_COLLAPSE_DEFAULT, PASTE_COLLAPSE_NEVER, pasteCollapseLines, referenceChip } from './feed/reference'
import { deriveSessionTitle } from './feed/title'
import {
  appendChip,
  appendText,
  buildCommands,
  captureWrittenCommand,
  localCommand,
  plainText,
  type LocalCommand,
} from './feed/slash'
import {
  awaitsYou,
  buildAgentTabs,
  mainStatusOf,
  ownStream,
  pendingAsk,
  pendingPermission,
  pendingPlan,
  streamStatus,
} from './feed/streamStatus'
import {
  improveLanded,
  improveNote,
  improveResult,
  improveShown,
  improveStarted,
  improveTakenBack,
  type ImproveNote,
  type ImproveRequest,
  type ImproveSource,
} from './feed/improve'
import { voiceAppend, voiceGhost, voiceMessage } from './feed/voice'
import { composePrompt, countSessionImages, imageAttachments, tokensText, trimTrailingSpace } from './feed/tokens'
import type { FeedItem, TaskItem, TodoItem, UserItem, UserToken } from './feed/types'
import { mergeUsage, type UsageFacts } from './feed/usage'
import type {
  AvailablePluginInfo,
  HistoryEntry,
  InstalledPluginInfo,
  McpServerInfo,
  ModelInfo,
  PluginMarketplaceInfo,
  SoundId,
  VoiceBalance,
  VoiceHotkeySlot,
  StatisticsData,
  TitleSource,
} from './protocol'
import {
  NO_SOUND_PREFS,
  SOUND_IDS,
  isMuted,
  rememberPanel,
  setVolume,
  soundForPanel,
  toggleSound,
  volumeOf,
  type SoundMemory,
  type SoundPrefs,
} from './sounds'
import { planDecisionOf, useCardState, type CardState } from './hooks/useCardState'
import { useEarlierPages } from './hooks/useEarlierPages'
import { groupOrder, moveTab, placeAtEnd, placeIn, STATISTICS_GROUP, type TabPlace } from './tabs'
import { useSelection } from './hooks/useSelection'

const MAIN_SESSION = 'main'

/**
 * Where a Deepgram key comes from. The console rather than the marketing page: somebody sent here is
 * here to sign up and copy a key, and the front page is two clicks further from that than this is.
 */
const DEEPGRAM_URL = 'https://console.deepgram.com/signup'

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

/** How often the figures are asked for again while the statistics tab is being looked at. */
const STATISTICS_REFRESH_MS = 30_000

/** How often at most a hand on the keyboard is reported - the ledger counts by the minute anyway. */
const ACTIVITY_REPORT_MS = 30_000

/** "27/50" - the achievements earned, for the menu's row. */
const achievementsCount = (data: StatisticsData): string => {
  const summary = summarize(dressAll(data.achievements))
  return `${summary.earned}/${summary.total}`
}

/**
 * What a message went out with, for the statistics: the files and folders attached, and the selections
 * carried in - a quote of the agent's words or a reference from the editor. Only the page knows what a
 * chip is; the IDE counts the rest (see the stat message in protocol.ts).
 *
 * Images are the IDE's to count, not this page's, and that is the whole rule of the split: a picture
 * travels with the message as bytes, so the IDE sees it and counts it there. Counted here as well, one
 * screenshot went into the book as two - the achievement for attachments came at half its price and the
 * figure on the tab was simply wrong. A file or a folder reaches the agent as text in the message and
 * the IDE cannot tell it from any other word, which is why those two stay here.
 */
const reportChips = (tokens: UserToken[], quotesBeside: number): void => {
  let attachments = 0
  let quotes = quotesBeside
  for (const token of tokens) {
    if (token.kind !== 'chip') continue
    if (token.chip.kind === 'file' || token.chip.kind === 'dir') attachments++
    if (token.chip.kind === 'quote' || token.chip.kind === 'ref') quotes++
  }
  if (attachments > 0 || quotes > 0) send({ type: 'stat', kind: 'prompt', attachments, quotes })
}

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

/**
 * Voice input before the IDE has said anything about it - which is also what it looks like on a machine
 * where nobody has switched it on. Switched off means no microphone button at all, so an unanswered panel
 * shows exactly what a panel without the feature shows.
 */
const NO_VOICE: VoiceSettings = {
  enabled: false,
  language: 'en',
  languages: [],
  device: '',
  devices: [],
  keyHint: '',
  hotkeys: {
    push: { caps: [] },
    hold: { caps: [] },
    pushMouse: { caps: [] },
    holdMouse: { caps: [] },
  },
}

export const App = () => {
  const [panels, dispatchPanel] = useReducer(panelsReducer, { [MAIN_SESSION]: initialPanelState })
  const [sessions, setSessions] = useState<Session[]>([
    { id: MAIN_SESSION, title: defaultTitle(MAIN_SESSION), state: 'idle', groupId: MAIN_SESSION, depth: 0, titleSource: 'default' },
  ])
  const [active, setActive] = useState(MAIN_SESSION)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

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
  /* One popup for every button of the bottom row: the three selectors and the heart beside them (see
     Thanks.tsx). One state rather than one per button - two open menus at once is not a state the row can
     be in, and separate flags would have to be taught that about each other. */
  /*
   * The panel's own node, and the hover mark over the whole of it (see useHoverTarget): inside the IDE
   * the browser draws offscreen, and there :hover alone loses the moment the cursor crosses from one
   * button straight into its neighbour - the selectors' row and the buttons beside it are exactly such a
   * run of neighbours. Kept in state rather than in a ref: the panel is not rendered until the login has
   * been checked, and a ref filled later never reaches the effect.
   */
  const [panelNode, setPanelNode] = useState<HTMLElement | null>(null)
  useHoverTarget(panelNode)

  const [menu, setMenu] = useState<{ kind: SelectorKind | 'thanks'; anchor: Anchor } | null>(null)
  /** Whether the line about the plugin is in the clipboard - the thanks menu's only way of saying so. */
  const [shared, setShared] = useState(false)
  /**
   * The choice of model, effort and mode. It arrives from the shell at startup and is saved there too: a
   * new tab, a fork and the IDE's next start begin from it.
   */
  const [prefs, setPrefs] = useState({ model: '', effort: 'high', mode: 'manual' })
  /**
   * What language the panel speaks, in two halves: the choice somebody made and what the IDE itself is
   * set to. An empty choice means the second one - a Chinese IDE gets a Chinese panel without anyone
   * having to find the switch first, which is the whole reason the setting exists (see i18n).
   */
  const [language, setLanguage] = useState({ chosen: '', ide: '' })

  /**
   * The language everything below is drawn in, and its words.
   *
   * Read here rather than through the hook because this component is the one that owns the setting: a
   * context reaches children, and App is above its own provider. Everything under it uses `useT()`.
   *
   * Right beside the state rather than by its first use: the words are wanted by the memos further down
   * as well as by the render, and those run before any of it.
   */
  const locale = activeLocale(language.chosen, language.ide)
  const t = useDict(locale)
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
  /** Where the input field sits, as the person chose it. It arrives from the shell at startup and is saved there too. */
  const [chosenLayout, setComposerLayoutState] = useState<ComposerLayout>('bottom')
  /**
   * From how many lines a pasted text folds into a chip. The panel's own default until the IDE says
   * otherwise: the harness has no IDE behind it at all, and a field that folded nothing there would be
   * a different field from the one in the plugin.
   */
  const [pasteCollapse, setPasteCollapseState] = useState(PASTE_COLLAPSE_DEFAULT)
  /**
   * The number the folding goes back to when it is switched on again.
   *
   * "Never fold" is saved as a zero, and a zero cannot remember the threshold it replaced - so the screen
   * would offer the default rather than the number that was set, and the one thing a person is sure to do
   * after switching folding off is switch it back on. Kept beside the setting rather than inside the
   * screen: the screen is thrown away every time the menu goes back a step.
   */
  const [pasteCollapseLast, setPasteCollapseLast] = useState(PASTE_COLLAPSE_DEFAULT)
  /**
   * And what the panel is drawn with: a panel dragged down to a strip has no height for the default
   * layout, and compact is what exists for that room (see layoutForRoom). The choice above is what the
   * menu shows and what the shell keeps - this is only how it is rendered right now.
   */
  const lowPanel = useLowPanel()
  const composerLayout = layoutForRoom(chosenLayout, lowPanel)
  /** The turn of the year: the garland, the snow and the frozen Send button - see holiday.ts. */
  const holiday = useHoliday()
  const [loginWaiting, setLoginWaiting] = useState(false)
  /** Grows whenever the input field has to be given the focus back: after a link from the editor, say. */
  const [focusToken, setFocusToken] = useState(0)
  const [usage, setUsage] = useState<UsageFacts>({})
  /**
   * Which of the modal panels is open - one value rather than three independent booleans. That way they
   * are mutually exclusive by construction: opening the plugins closes the history by itself rather than
   * leaving it hanging quietly under the new one on top of it.
   */
  const [watchers, setWatchers] = useState(0)
  /**
   * The menu behind the burger: whether it is out, and which of its screens is showing.
   *
   * The screen is kept while it is shut so that closing does not make the contents jump on the way out -
   * a fresh opening resets it to the root itself (see openMenu).
   */
  const [sideMenu, setSideMenu] = useState<{ open: boolean; screen: MenuScreen }>({ open: false, screen: 'menu' })
  /** The panel's own version, for the foot of the menu. Absent until the shell's `init` arrives. */
  const [pluginVersion, setPluginVersion] = useState('')

  /**
   * Whether this IDE can be reached from outside, and how that is going. Off until someone turns it on,
   * which is the shape the plugin ships in.
   */
  const [remote, setRemote] = useState<RemoteStatus>({
    state: 'idle',
    enabled: false,
    relay: '',
    agentId: '',
  })
  /** The tick boxes and the volume of the sound alerts - see sounds.ts. */
  const [soundPrefs, setSoundPrefs] = useState<SoundPrefs>(NO_SOUND_PREFS)
  /** The project's past conversations: null means the list has not arrived yet (see the startup requests). */
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  /**
   * The statistics tab's figures: null until the IDE answers the first request. Asked for at startup
   * (the menu's row shows the achievements' count without the tab being opened), again whenever the tab
   * is opened, and every half-minute while it is being looked at (see the effect below).
   */
  const [statistics, setStatistics] = useState<StatisticsData | null>(null)
  /**
   * The statistics tab itself: whether it stands in the strip, where in it, and which of its two screens
   * is showing. Kept apart from `sessions` on purpose - that list is the shell's and is overwritten whole
   * (see the `sessions` message), while this tab is this screen's alone and holds no conversation.
   *
   * Its place is dragged like any other tab's, and is kept as neighbours rather than as a number so that
   * a conversation closing beside it does not shove it along - see TabPlace.
   */
  const [statsTab, setStatsTab] = useState<{ open: boolean; view: StatisticsView; place: TabPlace }>({
    open: false,
    view: 'overview',
    place: { at: 0, among: [] },
  })
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
   * The feedback screen's draft. It lives here rather than inside the screen because the screen is
   * unmounted the moment one steps into the report's preview beside it (see the SideMenu block below) -
   * and a half-written message that vanishes for looking at what it would attach is worse than no
   * preview at all.
   */
  const [feedback, setFeedback] = useState<FeedbackDraft>(emptyFeedback)
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
  /**
   * The names of the commands the agent knows, as it named them last time round (see the `commands`
   * message). Stands in for the conversation's own list until the first message of the tab brings it:
   * an MCP server's commands exist in no file, so without this they could not be hinted at all before
   * the process came up.
   */
  const [knownCommands, setKnownCommands] = useState<string[]>([])

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

  /**
   * A rewrite of the draft under way (see feed/improve.ts): which press it is, whose tab it belongs to,
   * the request the answer will be read back against, and the field exactly as it stood at the press.
   *
   * The field is kept because the answer arrives seconds later and nothing is frozen in the meantime: a
   * rewrite applied over a message that has since been sent would put that sent message back into an empty
   * field, and over one edited by hand would throw the editing away. One slot only - the button refuses a
   * second press while this one is full.
   */
  const [improving, setImproving] = useState<
    { id: string; sessionId: string; request: ImproveRequest; tokens: UserToken[] } | null
  >(null)
  const improvingRef = useRef(improving)
  improvingRef.current = improving

  /**
   * Why the last rewrite came to nothing - one line above the input field, cleared by the next edit.
   *
   * A code rather than a finished sentence (see ImproveNote): this is set from a subscription made once
   * for the panel's whole life, and a sentence built there would keep the language of the first render.
   */
  const [improveError, setImproveError] = useState<ImproveNote | null>(null)

  /**
   * What a tab's rewrites are about - the words they were made from, the takes already seen, and the way
   * back to those words. The rules of it live in feed/improve.ts (see ImproveSource), because they are the
   * kind that break without showing; what the panel adds is where they start and when they end.
   *
   * They end the moment a hand touches the field (see onTokensChange below): an edited rewrite is a draft
   * of one's own again, and reaching back behind it would throw that editing away.
   *
   * The way back is held here rather than left to Cmd+Z, which cannot do this job: the field's undo
   * history is cleared when the tab changes, so a rewrite looked at in the next tab along would have
   * nothing behind it, and after three presses Cmd+Z walks back through the takes one at a time rather
   * than to what was written.
   */
  const [improveSources, setImproveSources] = useState<Record<string, ImproveSource>>({})

  /**
   * A rewrite is being put into the field by us right now. The field reports that edit outwards exactly as
   * it reports a keystroke, and the two have to be told apart: one means the person has moved on from what
   * they wrote, the other is the answer to their asking not to.
   */
  const applyingImprove = useRef(false)

  /**
   * What the improve button asks by: the person's own text, and the built-in one it falls back to. Both
   * arrive with init and are shown on the screen behind the menu (see ImprovePrompt).
   */
  const [improveInstructions, setImproveInstructions] = useState({ instructions: '', builtIn: '' })

  /**
   * Voice input, as the panel holds it: the settings behind the screen, and what a running dictation is
   * doing right now.
   *
   * The settings arrive whole from the IDE (see VoiceDesk) rather than being assembled here, because most
   * of them are things only that side can answer - which microphones exist, what the hotkeys were bound
   * to, whether a key is in the keychain. The key itself never arrives, only its last four characters.
   */
  const [voice, setVoice] = useState<VoiceSettings>(NO_VOICE)

  /**
   * What a dictation is doing.
   *
   * The phase only. How loud the room is arrives ten times a second and is written straight onto the page
   * instead (see the `voiceState` handler): in state it was a render of the whole panel per reading, and
   * neither the feed nor the composer is memoised.
   */
  const [voiceRun, setVoiceRun] = useState<'idle' | 'listening' | 'finishing'>('idle')

  /** The same phase, for the window's key handler - which is built once and would hold a stale one. */
  const voiceRunRef = useRef(voiceRun)
  voiceRunRef.current = voiceRun

  /**
   * The phrase being said right now, drawn in grey after the draft.
   *
   * Held apart from the draft on purpose: it is replaced wholesale by the next interim result and is not
   * a part of the message until Deepgram settles on it. A tail written into the draft and rewritten
   * twice a second would fill the undo history with words nobody typed.
   */
  const [voiceInterim, setVoiceInterim] = useState('')

  /** Why a dictation came to nothing - one line above the field, beside the improve button's own. */
  const [voiceError, setVoiceError] = useState('')

  const [voiceBalance, setVoiceBalance] = useState<VoiceBalance>({ state: 'none' })

  /** Which hotkey the IDE is waiting for a press on, and why the last wait ended with nothing. */
  const [voiceCapturing, setVoiceCapturing] = useState<VoiceHotkeySlot | null>(null)
  const [voiceCaptureProblem, setVoiceCaptureProblem] = useState('')

  /**
   * Where a dictated phrase is landing. A ref rather than state because it is read inside the message
   * handler, which is built once: the words arrive while somebody is talking, and a handler holding a
   * stale tab would put the last sentence into the conversation they left.
   */
  const voiceTargetRef = useRef('')

  const panel = panels[active] ?? initialPanelState
  const draft = drafts[active] ?? EMPTY_DRAFT
  const sessionQueue = panel.queue
  const running = panel.status === 'running'
  /**
   * The context gauge: the number comes from the CLI itself, and the calculation from usage stays as a
   * fallback for when it is not there yet (see contextOf).
   */
  const context = contextOf(panel, usage.contextWindow)
  const imageBaseCount = useMemo(
    () => countSessionImages(panel.items, sessionQueue.reduce((sum, item) => sum + item.images, 0)),
    [panel, sessionQueue],
  )

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

  // And the effort of this tab rather than of the window: the setting is only what a tab that has not
  // started yet will start on (see PanelState.effort).
  const effort = panel.pendingEffort ?? panel.effort ?? prefs.effort

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
   * The model this tab genuinely works on, when it is not the one the setting names - the menu ticks it
   * (see modelInForce). It lives in the tab rather than in the shared setting: the neighbouring one has a
   * conversation and a model of its own.
   */
  const tickedModel = modelInForce(models, prefs.model, panel.model)

  /**
   * The drafts as they stand right now, for the shell's messages: that subscription is set up once for the
   * panel's whole life and never sees a fresh render's state (see the message handler below).
   */
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  const editDraft = useCallback(
    (session: string, change: Partial<Draft>) => {
      // Written down here as well as into state, and the "right now" above is why. The shell hands a
      // whole batch of messages over in one synchronous pass (see bridge), so a second message in that
      // batch reads this ref before any render has happened. Two settled phrases in one frame is not
      // exotic - Deepgram may answer `Finalize` with several - and the second used to be built on the
      // draft from before the first, dropping a whole phrase with nothing in the undo history to get it
      // back with.
      draftsRef.current = {
        ...draftsRef.current,
        [session]: { ...(draftsRef.current[session] ?? EMPTY_DRAFT), ...change },
      }

      setDrafts((current) => ({
        ...current,
        [session]: { ...(current[session] ?? EMPTY_DRAFT), ...change },
      }))
    },
    [],
  )

  /**
   * "Replace the whole field", handed over by the composer (see Composer.registerApply). A rewritten draft
   * goes in through it rather than through the drafts above, so that it becomes one step of the field's own
   * undo history: pressing the sparkle and disliking the answer must be one Cmd+Z away.
   */
  const applyToComposer = useRef<((tokens: UserToken[]) => void) | null>(null)
  const registerApply = useCallback((apply: ((tokens: UserToken[]) => void) | null) => {
    applyToComposer.current = apply
  }, [])

  /** A press of the sparkle is told from the previous one by this - two in one millisecond otherwise share a number. */
  const improveSeq = useRef(0)

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
   * What the menu is showing right now - for those who reach it from a closure that outlived its render
   * (see [openHistory]).
   */
  const sideMenuRef = useRef(sideMenu)
  sideMenuRef.current = sideMenu

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

    // A second `/resume` on an open history closes it, the way pressing the same button twice does.
    if (sideMenuRef.current.open && sideMenuRef.current.screen === 'history') {
      setSideMenu({ open: false, screen: 'history' })
      return
    }

    setSideMenu({ open: true, screen: 'history' })
    send({ type: 'history' })
  }, [])

  // Past conversations, MCP servers and plugins are asked for right at the start, together with the
  // panel's readiness: by the time their tab is opened they are already loaded.
  useEffect(() => {
    send({ type: 'ready', since: seen.current })
    send({ type: 'history' })
    // The menu's row names the achievements' count before the tab is ever opened - so the figures are
    // asked for here, once, along with everything else the menu shows.
    send({ type: 'statistics' })
    // Whether there is a microphone button at all is decided by a setting in the IDE, so the button
    // cannot draw itself until this comes back. Asked for here rather than relied upon: the IDE does send
    // it when the panel opens, but that happens while this page is still loading.
    send({ type: 'voiceConfig' })
    loadMcp()
    loadPlugins()
  }, [loadMcp, loadPlugins])

  /**
   * The statistics tab is looked at and the figures grow under it: a turn ends, a minute passes. Asked
   * for again every half-minute while it is the active tab - the ticker on the IDE's side marks minutes
   * at the same pace, so asking more often would show nothing new.
   */
  useEffect(() => {
    if (active !== STATISTICS_GROUP) return

    send({ type: 'statistics' })
    const timer = setInterval(() => send({ type: 'statistics' }), STATISTICS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [active])

  /**
   * A hand on the keyboard or the wheel counts as time in the panel - the IDE cannot see that by itself,
   * so the page says so, once in a while rather than on every keystroke: the ledger counts by the minute
   * and hears nothing new in between (see StatsCollector on the IDE's side).
   */
  useEffect(() => {
    let lastReported = 0

    const onActivity = () => {
      const now = Date.now()
      if (now - lastReported < ACTIVITY_REPORT_MS) return
      lastReported = now
      const sessionId = activeRef.current
      send({ type: 'stat', kind: 'activity', ...(sessionId === STATISTICS_GROUP ? {} : { sessionId }) })
    }

    window.addEventListener('keydown', onActivity, true)
    window.addEventListener('mousedown', onActivity, true)
    window.addEventListener('wheel', onActivity, { capture: true, passive: true })
    return () => {
      window.removeEventListener('keydown', onActivity, true)
      window.removeEventListener('mousedown', onActivity, true)
      window.removeEventListener('wheel', onActivity, { capture: true })
    }
  }, [])

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

  /**
   * The last journal number seen in each conversation. It goes back to the shell on the next 'ready'
   * (see the handshake below): the conversations outlive this page now, so a reload over a running turn
   * is worth catching up on rather than starting from nothing.
   */
  const seen = useRef<Record<string, number>>({})

  /**
   * The feeds being restored right now, by conversation. A conversation is in here between
   * restoreStarted and restoreFinished, and everything that arrives for it in between is collected
   * instead of being applied - a couple of thousand entries applied one at a time is a couple of
   * thousand renders.
   */
  const restoring = useRef<Record<string, Array<{ action: Parameters<typeof reducePanel>[1]; at?: number }>>>({})

  /**
   * Messages this screen sent and has already drawn. Their echo comes back from the shell (it is what
   * a second client and a restored feed are built from) and would double the card here.
   */
  const ownPrompts = useRef<Set<string>>(new Set())

  /** Two messages inside one millisecond are rare but possible - the counter keeps their ids apart. */
  const promptCounter = useRef(0)
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
        const at = message.at

        /**
         * Everything that lands in a conversation's feed goes through here rather than straight into the
         * reducer: while a feed is being restored from the shell's journal (see restoreStarted) the
         * entries are collected instead, to be applied in one go at the end.
         */
        const feed = (event: { session: string; action: Parameters<typeof reducePanel>[1] }): void => {
          const buffered = restoring.current[event.session]
          if (buffered) {
            buffered.push({ action: event.action, at })
            return
          }
          dispatchPanel({ ...event, at })
        }

        if (message.seq !== undefined && 'sessionId' in message && typeof message.sessionId === 'string') {
          seen.current[message.sessionId] = message.seq
        }

        switch (message.type) {
          case 'init':
            if (message.pluginVersion) setPluginVersion(message.pluginVersion)
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
              // Read unconditionally, unlike the layout above: an absent value is a meaningful answer
              // here - it is what puts the default back after the setting has been cleared.
              const folds = pasteCollapseLines(message.preferences.pasteCollapse)
              setPasteCollapseState(folds)
              if (folds !== PASTE_COLLAPSE_NEVER) setPasteCollapseLast(folds)
              setLanguage({
                chosen: message.preferences.language ?? '',
                ide: message.preferences.ideLanguage ?? '',
              })
            }
            if (message.improve) setImproveInstructions(message.improve)
            feed({
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

          /**
           * The language, told again outside `init`.
           *
           * The setting is machine-wide, so a second window of the same project has to hear about a
           * change it did not make; and a phone is never sent `init` at all (it carries the working
           * directory - see RemoteFeed), so this is the only way it learns the language.
           */
          case 'locale':
            setLanguage({ chosen: message.language ?? '', ide: message.ideLanguage ?? '' })
            break

          case 'project':
            feed({
              session: MAIN_SESSION,
              action: {
                kind: 'project',
                gitBranch: message.gitBranch,
                pullRequest: message.pullRequest,
                pullRequestUrl: message.pullRequestUrl,
              },
            })
            break

          /**
           * The list of tabs as the shell keeps it - and it is the shell that owns it now. What is kept
           * here is only what the shell has no opinion about: which tab this particular screen has open,
           * and the dot's state, which is worked out from the feed below (see sessionState).
           *
           * The optimistic list this page builds on a "+" is overwritten by this one. That is the point:
           * with two clients, one of them guessing an identifier the other already took has to see the
           * truth rather than a tab that exists on its screen alone.
           */
          case 'sessions': {
            const known = message.sessions.map((info) => info.id)
            setSessions(
              message.sessions.map((info) => ({
                id: info.id,
                title: info.title,
                state: 'idle' as const,
                groupId: info.groupId,
                depth: info.depth,
                titleSource: info.titleSource,
              })),
            )
            // The tab this screen had open may have been closed from another one. The statistics tab is
            // not on the shell's list and never will be - it stays put.
            setActive((current) =>
              current === STATISTICS_GROUP || known.includes(current) ? current : (known[0] ?? MAIN_SESSION),
            )
            break
          }

          /**
           * A feed is about to be handed over from the shell's journal. Everything up to restoreFinished
           * is collected rather than applied (see feed above).
           *
           * `from` of zero means the client had nothing, so whatever stands in the tab now is not a
           * shorter version of what is coming - it is a different conversation's remains, and it goes.
           */
          case 'restoreStarted':
            restoring.current[message.sessionId] = []
            if (message.from === 0) dispatchPanel({ session: message.sessionId, reset: true })
            if (message.truncated) {
              restoring.current[message.sessionId]?.push({
                action: {
                  kind: 'checkpoint',
                  chip: 'EARLIER',
                  target: '',
                  targetKey: 'notKept',
                },
              })
            }
            break

          case 'restoreFinished': {
            const collected = restoring.current[message.sessionId]
            delete restoring.current[message.sessionId]
            seen.current[message.sessionId] = message.upTo
            if (collected && collected.length > 0) {
              dispatchPanel({ session: message.sessionId, batch: collected })
            }
            break
          }

          // The answer being printed at the moment this client joined - the deltas that built it are not
          // kept anywhere, so without this the conversation looks frozen until the answer ends.
          case 'streamingText':
            feed({
              session: message.sessionId,
              action: { kind: 'streamPrimed', text: message.text, thinking: message.thinking },
            })
            break

          // A past conversation has been opened in this tab: what the feed held describes something else
          // now.
          case 'remoteState':
            setRemote({
              state: message.state,
              enabled: message.enabled ?? false,
              relay: message.relay,
              agentId: message.agentId,
              fingerprint: message.fingerprint,
              keysKept: message.keysKept,
              devices: message.devices,
              pairing: message.pairing,
              pending: message.pending,
            })
            break

          case 'clients':
            setWatchers(message.count)
            break

          case 'sessionReset':
            dispatchPanel({ session: message.sessionId, reset: true })
            break

          /**
           * The card has been answered - possibly on another device, possibly on this one a moment ago.
           * Applying it twice changes nothing (the decision is already there), and that is what makes the
           * optimistic local update safe to keep.
           */
          case 'permissionResolved':
            feed({
              session: message.sessionId,
              action: { kind: 'permissionResolved', id: message.id, decision: message.decision },
            })
            break

          /**
           * A person's message, as the shell kept it. Our own we skip: it was drawn on the press, and
           * this is the same card arriving a second time. Everyone else's - and our own after a reload -
           * is what makes the feed a conversation rather than a monologue.
           */
          case 'promptEcho': {
            if (message.id && ownPrompts.current.has(message.id)) {
              ownPrompts.current.delete(message.id)
              break
            }
            // A message this window did not send: one fired out of the queue, or written from a phone or a
            // second panel. It begins a turn all the same, so the chips of the agents that finished in the
            // last one are cleared exactly as they are for a message typed here (see submit).
            //
            // Not while a feed is being restored: the journal hands over the very same messages as
            // history, and every one of them would hide the agents of the turn it began - a panel merely
            // reloaded would come back with an empty strip of chips.
            if (!restoring.current[message.sessionId]) {
              clearFinishedAgents(message.sessionId)
              if (message.sessionId === activeRef.current) setActiveStream('main')
            }
            feed({
              session: message.sessionId,
              action: {
                kind: 'prompt',
                tokens: (message.tokens ?? []) as UserToken[],
                quotes: message.quotes ?? [],
                steering: message.steering,
              },
            })
            break
          }

          // What this conversation is waiting to say, as the IDE holds it - see SessionQueue.kt.
          case 'queue':
            feed({ session: message.sessionId, action: { kind: 'queue', items: message.items } })
            break

          case 'planResolved':
            cards.decidePlan(message.id, planDecisionOf(message.decision))
            break

          case 'askResolved':
            cards.answerAsk(message.id)
            break

          case 'status':
            feed({ session: message.sessionId, action: { kind: 'status', status: message.state } })
            break

          // The name the model picked for the conversation - it replaces the guess made from the first
          // message (see submit) whatever that guess was, the placeholder included: the shell asks for
          // the name and throws away an answer about a conversation that a /clear has wiped in the
          // meantime, so anything arriving here is about the conversation the tab is holding now.
          case 'sessionTitle':
            setSessions((current) =>
              current.map((session) =>
                session.id === message.sessionId ? { ...session, title: message.title, titleSource: 'llm' } : session,
              ),
            )
            break

          /**
           * The draft, rewritten (see feed/improve.ts). Everything here is a reason not to apply it: the
           * whole point of the button is that it replaces what somebody wrote, and replacing the wrong
           * thing is worse than not replacing anything.
           */
          case 'promptImproved': {
            const pending = improvingRef.current
            // An answer to a press this panel is no longer waiting on - one from before a reload, or a
            // neighbouring window's.
            if (!pending || pending.id !== message.id) break

            setImproving(null)

            const rewritten = message.error ? null : improveResult(pending.request, message.text ?? '')
            if (!rewritten) {
              complain(message.error ? { kind: 'said', text: message.error } : { kind: 'empty' }, '')
              break
            }

            const current = draftsRef.current[pending.sessionId] ?? EMPTY_DRAFT
            if (current.tokens !== pending.tokens) {
              complain({ kind: 'changed' }, '')
              break
            }

            applyTokens(pending.sessionId, rewritten, true)

            // What was just shown joins what this source has produced: it is not turned down yet, but the
            // next press is exactly the person saying it was (see improveSources).
            setImproveSources((current) => {
              const entry = current[pending.sessionId]
              if (!entry) return current

              return { ...current, [pending.sessionId]: improveLanded(entry, message.text ?? '') }
            })
            break
          }

          case 'voiceConfig':
            setVoice({
              enabled: message.enabled,
              language: message.language,
              languages: message.languages,
              device: message.device,
              devices: message.devices,
              keyHint: message.keyHint,
              hotkeys: message.hotkeys,
            })
            // A binding that landed arrives as a fresh config rather than as an answer of its own, so
            // this is also where the "press a key" state ends.
            setVoiceCapturing(null)
            setVoiceCaptureProblem('')
            break

          case 'voiceState': {
            // Where the words go is decided when the dictation starts, not when they arrive: a tab
            // switched to mid-sentence must not catch the tail of what was said about another one.
            if (message.phase === 'listening' && !voiceTargetRef.current) {
              voiceTargetRef.current = activeRef.current
            }
            if (message.phase === 'idle') voiceTargetRef.current = ''

            setVoiceRun(message.phase)
            // The ring's size follows the room's loudness, and is written onto the page rather than kept
            // in state: it arrives ten times a second, and state here is a render of the whole panel for
            // each of them. Inherited from the root by the button's own rule (see .voiceLive).
            document.documentElement.style.setProperty(
              '--acc-voice-level',
              String(message.phase === 'listening' ? message.level : 0),
            )

            // Nothing is being said any more, so nothing is left half-said: a ghost outliving its
            // dictation hangs in the field with no way to select it or delete it.
            if (message.phase === 'idle') setVoiceInterim('')

            if (message.error) {
              complain(null, message.error)
            } else if (message.phase !== 'idle') {
              // A dictation that started is an answer to whatever went wrong last time.
              setVoiceError('')
            }
            break
          }

          case 'voiceText': {
            if (!message.final) {
              setVoiceInterim(voiceGhost(message.text))
              break
            }

            // The settled phrase replaces the grey tail it was drawn as.
            setVoiceInterim('')

            const target = voiceTargetRef.current || activeRef.current
            const current = draftsRef.current[target] ?? EMPTY_DRAFT
            const next = voiceAppend(current.tokens, message.text)
            // Deepgram sends an empty final result for a pause it decided was the end of a phrase.
            if (next === current.tokens) break

            applyTokens(target, next)
            break
          }

          case 'voiceBalanceIs':
            setVoiceBalance(message)
            break

          case 'voiceCapture':
            setVoiceCapturing(null)
            // Escape means the person changed their mind, and saying so back to them is noise.
            setVoiceCaptureProblem(message.problem === 'button' ? 'button' : '')
            break

          case 'error':
            feed({ session: message.sessionId, action: { kind: 'error', message: message.message } })
            break

          case 'agent':
            feed({
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

          /**
           * A tab is opened with the end of a past conversation, and the cursor is the seam: the rest of it
           * is asked for by pressing the mark above the feed (see loadEarlier). Null rather than nothing
           * when the cursor is absent - that is the answer "the beginning is on screen", which is not the
           * same as saying nothing about the boundary at all (see withEarlier in build.ts).
           */
          case 'replayFinished':
            feed({
              session: message.sessionId,
              action: { kind: 'replayFinished', cursor: message.cursor ?? null },
            })
            break

          /** A page of messages older than what this tab holds - read off the transcript on disk. */
          case 'historyPage':
            feed({
              session: message.sessionId,
              action: {
                kind: 'historyPage',
                entries: message.entries,
                cursor: message.cursor,
                before: message.before,
              },
            })
            break

          case 'processExited':
            feed({
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
            feed({
              session: message.sessionId,
              action: { kind: 'context', used: message.used, max: message.max },
            })
            break

          case 'bashResult': {
            // Into the card as in a terminal, as one stream: the errors are mixed in with the ordinary
            // output exactly where the command itself printed them.
            const output = [message.stdout, message.stderr].filter((part) => part.trim().length > 0).join('\n')

            feed({
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

          case 'commands':
            setKnownCommands(message.commands)
            break

          case 'dockAnchor':
            setDockAnchor(message.anchor)
            break

          case 'typography':
            applyTypography(message.monoFamily, message.uiFamily, message.lineHeight)
            break

          case 'statistics': {
            const { type: _type, seq: _seq, at: _at, ...figures } = message
            setStatistics(figures)
            break
          }

          case 'usage':
            // Folded rather than replaced whole, and by the same rules as on the phone - see mergeUsage.
            setUsage((current) => mergeUsage(current, message))
            break

          /*
           * The feedback screen's three answers. The address and the files come from the IDE, which is
           * where they are kept; the note beside them is what it has to say about the last pick - a file
           * too big, one too many - and it is cleared by the next one rather than by a timer.
           */
          case 'feedbackState':
            setFeedback((current) => ({
              ...current,
              // Whatever the person has done to the field wins - including emptying it. An empty field
              // is not "nothing typed yet": see emailTouched in Feedback.
              email: current.emailTouched ? current.email : message.email,
              attachments: message.attachments,
              note: message.note ?? null,
            }))
            break

          case 'feedbackLog':
            setFeedback((current) => ({ ...current, report: message.text }))
            break

          case 'feedbackSent':
            setFeedback((current) =>
              message.ok
                ? // Sent: the draft goes, the address stays. Somebody who writes once often writes twice,
                  // and asking for it again would read as if the first one had not counted.
                  {
                    ...emptyFeedback(),
                    email: current.email,
                    // Not "sent" when something was left behind: it went, but not all of it, and the
                    // one thing worse than a failure here is a thank-you that hides one.
                    message: message.note ? { kind: 'partly', note: message.note } : { kind: 'sent' },
                  }
                : {
                    ...current,
                    sending: false,
                    message: { kind: 'failed', said: message.error },
                  },
            )
            break

          case 'permission':
            feed({
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
            feed({
              session: message.sessionId,
              action: { kind: 'modelApplied', model: message.model, error: message.error },
            })
            break

          // What the shell says about this conversation, and never about the others: the setting the
          // choice also wrote (see pickEffort) is what the NEXT tab starts on, not what this one runs at.
          case 'effort':
            feed({
              session: message.sessionId,
              action: { kind: 'effortApplied', effort: message.effort },
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
            feed({
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

  /** How a pasted text behaves in the field - kept by the IDE beside the layout, for the same reason. */
  const setPasteCollapse = useCallback((lines: number) => {
    send({ type: 'setPasteCollapse', lines: String(lines) })
    setPasteCollapseState(lines)
    if (lines !== PASTE_COLLAPSE_NEVER) setPasteCollapseLast(lines)
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
      // A key an input method is assembling a character out of belongs to it rather than to the panel:
      // Escape throws the half-typed character away and Tab walks the candidate list, and neither is a
      // "stop the agent" or a "change the mode". The field dims its own Escape (see Composer), but Tab it
      // never sees - this handler is the only guard for it. Reads the flag off the event, so nothing here
      // can stay raised after a composition that ended with the focus elsewhere.
      if (event.isComposing) return

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
        // A dictation started from the button is thrown away first: it is the newer thing on screen, and
        // the words nobody wants must not land in the field while the agent is being stopped. One started
        // from a hotkey never reaches here - the IDE takes that Escape for itself (see HotkeyEngine).
        if (voiceRunRef.current !== 'idle') {
          event.preventDefault()
          send({ type: 'voiceCancel' })
          return
        }

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
    // Without a name rather than with the stand-in this screen draws: a non-empty title is what the shell
    // reads as "somebody has already named this tab" (see SessionRegistry.open), and a tab marked as named
    // is never renamed by its first message afterwards - neither by the guess made here nor by the model's
    // own answer. The phone has always sent an empty one for exactly this reason (see mobile/App.tsx).
    send({ type: 'newSession', kind: 'main', sessionId: id, title: '' })
  }, [])

  /**
   * The strip's new order after a drag - see moveTab, which decides it for conversations and for the
   * statistics alike.
   *
   * The shell hears only about the conversations, and only when their order really changed: it keeps that
   * list and nothing else, while the statistics standing before or after a neighbour is this screen's own
   * business (there is one panel per IDE window, and the tab is a tab of that panel).
   */
  const reorderGroups = useCallback(
    (groupId: string, beforeGroupId: string | null) => {
      const moved = moveTab(sessions, statsTab.open ? statsTab.place : null, groupId, beforeGroupId)

      setSessions(moved.sessions)

      const place = moved.statistics
      if (place) setStatsTab((current) => ({ ...current, place }))

      if (moved.shell) {
        // The order lives on the shell's side too: it is what a second client lists the tabs in.
        send({
          type: 'reorderGroups',
          groupId: moved.shell.groupId,
          ...(moved.shell.beforeGroupId ? { beforeGroupId: moved.shell.beforeGroupId } : {}),
        })
      }
    },
    [sessions, statsTab.open, statsTab.place],
  )

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

      setSideMenu({ open: false, screen: 'menu' })
      // The title has already been set by the history panel - either the model's own, and then it stays,
      // or a guess off the conversation's first line, and then the shell is free to ask for a real one
      // as soon as the conversation carries on here (see sessionTitle). Either way it is not the
      // placeholder the very next message would overwrite.
      //
      // There may be no tab at all: the person closed them all and opens a past conversation from the
      // history on an empty panel. Then it is started right here - otherwise the replay would travel into
      // a conversation not visible through a single tab (see the empty state in the markup below).
      const titleSource: TitleSource = entry.titleSource === 'heuristic' ? 'heuristic' : 'llm'
      setSessions((current) =>
        current.some((session) => session.id === active)
          ? current.map((session) => (session.id === active ? { ...session, title, titleSource } : session))
          : [...current, { id: active, title, state: 'idle', groupId: active, depth: 0, titleSource }],
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
      delete soundMemory.current[active]

      send({ type: 'resumeSession', sessionId: active, conversationId: entry.id })
    },
    [active],
  )

  const resume = useCallback(
    (entry: HistoryEntry) => {
      // This conversation is already open in this tab - replaying it anew serves nothing.
      if (panelsRef.current[active]?.sessionId === entry.id) {
        setSideMenu({ open: false, screen: 'menu' })
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
   * The conversation above what this tab holds - asked for by pressing the mark over the feed.
   *
   * A tab opens a past conversation with its end rather than the whole of it (see ClaudeHistory.opening),
   * and this is how the rest of it arrives, a page at a time. The same hook serves the phone: what a
   * press is worth and when it is over is one behaviour, not two (see useEarlierPages).
   */
  const { loadEarlier } = useEarlierPages(panel, active, (before) =>
    send({ type: 'historyPage', sessionId: active, before }),
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

  /**
   * The effort of THIS conversation - and, as with the model, the one the next tab will start on. Both
   * at once, and deliberately: the choice applies where it was made, while the tabs already open keep
   * working at whatever they were started at (see ClaudeSessionHub.changeEffort).
   */
  const pickEffort = useCallback(
    (effort: string) => {
      setPrefs((current) => ({ ...current, effort }))
      send({ type: 'setEffort', sessionId: active, effort })
      // Shown as chosen until the shell answers - for the same reason as the model: without it the
      // choice looks lost for as long as the message travels.
      dispatchPanel({ session: active, action: { kind: 'effortRequested', effort } })
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
   * The sparkle beside the paperclip: the draft goes off to be rewritten and comes back through
   * [applyToComposer] (see the promptImproved case above).
   *
   * The chips never leave the panel - what travels is the text with a marker where each one stands, plus a
   * line saying what each marker is (see feed/improve.ts). An image's bytes in particular stay here: they
   * have nothing to do with how a sentence should be worded.
   */
  const improvePrompt = (request: ImproveRequest) => {
    // One at a time. The state has a single slot, and a second press would orphan the first answer - which
    // would then arrive and be dropped as unrecognised, looking to the person like nothing happened.
    if (improving) return

    improveSeq.current += 1
    const id = `improve-${Date.now()}-${improveSeq.current}`

    // A press over a rewrite nobody has touched carries on the chain this tab is already in rather than
    // starting a new one (see improveStarted): the same words to rewrite, and every take they have already
    // produced as something the person has now pressed past.
    const chain = improveStarted(improveSources[active], request, draft.tokens)

    setImproveError(null)
    setImproveSources((current) => ({ ...current, [active]: chain }))
    setImproving({ id, sessionId: active, request: chain.source, tokens: draft.tokens })
    send({
      type: 'improvePrompt',
      sessionId: active,
      id,
      draft: chain.source.draft,
      attachments: chain.source.attachments,
      rejected: chain.attempts,
    })
  }

  /**
   * This tab's chain of rewrites is over - the draft it was about is not on the screen any more.
   *
   * One home for the transition rather than the same three lines wherever it happens: a draft leaves the
   * chain by several different doors (typed over, sent, a quote dropped into it), and a door that forgot
   * to close it leaves the panel offering a way back to words nobody is looking at.
   */
  const forgetImproveSource = (sessionId: string) => {
    setImproveSources((current) => {
      if (!(sessionId in current)) return current

      const { [sessionId]: _dropped, ...rest } = current
      return rest
    })
  }

  /**
   * Put a whole draft into a tab, ours rather than the person's: a rewrite that has come back, or the way
   * back out of one.
   *
   * Through the field itself while it is the one on screen - that is what makes it a step in that field's
   * undo history. A tab switched away from in the meantime has no field to speak of, and its draft is
   * simply replaced.
   *
   * The flag is up for exactly the length of that call: the field reports the change straight back out,
   * and without it our own writing would read as the person editing and would end the chain it belongs to
   * (see improveSources).
   */
  /** The codes above, said in the panel's own language (see feed/voice.ts and feed/improve.ts). */
  const voiceErrorText = voiceError ? voiceMessage(t, voiceError) : ''
  const improveErrorText = improveError ? improveNote(t, improveError) : ''

  /**
   * Tokens into the field, by the one road that leaves the undo history intact.
   *
   * Through the composer while the tab is the one on screen (see Composer.registerApply), so that what
   * lands becomes a step of the field's own undo history and a Cmd+Z takes it back; straight into the
   * draft otherwise, because a tab nobody is looking at has no field to put anything into.
   *
   * [ours] says whose writing this is, and only a rewrite is ours: it is the panel's answer to somebody
   * asking not to have written what they wrote, so the field must not take it for a hand on the keyboard.
   * A dictation is the opposite case - it IS them writing - so it reads as an ordinary edit and ends an
   * improve chain (see improveSources), which is right: the draft is no longer the one that was
   * rewritten.
   */
  const applyTokens = (sessionId: string, tokens: UserToken[], ours = false) => {
    const apply = applyToComposer.current

    if (!apply || sessionId !== activeRef.current) {
      editDraft(sessionId, { tokens })
      return
    }

    applyingImprove.current = ours
    try {
      apply(tokens)
    } finally {
      applyingImprove.current = false
    }
  }

  /**
   * The way back: what stands in the field is a rewrite nobody has touched, and this puts the person's own
   * words back in its place (see the line the composer draws above the field).
   *
   * It goes in through the field itself, exactly as the rewrite did, so that it is one step of the undo
   * history - the take just turned down is a Cmd+Z away rather than gone, which is what makes pressing
   * this safe enough to try.
   *
   * What this tab's rewrites started from is deliberately kept: taking one's own words back is the
   * plainest way of saying the take was not wanted, and the next press has to carry that (see
   * improveSources) rather than throw the same dice against the same words again.
   */
  const restoreDraft = () => {
    const entry = improveSources[active]
    if (!entry?.applied) return

    applyTokens(active, entry.before, true)

    setImproveError(null)
    setImproveSources((current) => {
      const held = current[active]
      return held ? { ...current, [active]: improveTakenBack(held) } : current
    })
  }

  /** A complaint about one tab's draft has nothing to say about the next tab's. */
  useEffect(() => {
    setImproveError(null)
    setVoiceError('')
  }, [active])

  /**
   * One line above the field, one complaint in it - the newest.
   *
   * The two share that line and the microphone's used to win it outright, which was fine until it turned
   * out nothing ever took it down: pressing the microphone with no key left a note that outlived the
   * session and quietly swallowed every "the draft changed while it was being rewritten" after it.
   */
  const complain = (rewrite: ImproveNote | null, voice: string) => {
    setImproveError(rewrite)
    setVoiceError(voice)
  }

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
  const commands = useMemo(
    // The tab's own catalogue while it has one, and the project's remembered one until then: this tab's
    // process may not have come up yet, and the two disagree only about a server switched on or off
    // since - where the live one is the truth.
    () => buildCommands(t, panel.slashCommands.length > 0 ? panel.slashCommands : knownCommands, commandHints),
    [t, panel.slashCommands, knownCommands, commandHints],
  )

  const submit = useCallback((queued: boolean, overrideText?: string) => {
    // The panel's commands never travel to the agent: signing in and out are out of its reach in streaming
    // mode, and forking is about the panel's own workings altogether.
    // Quotes and attachments do not stand in a command's way: they stay in the field and travel with the
    // next message - losing them over one command would be a shame.
    // A strict type check rather than a plain "overrideText !== undefined": this function is called from
    // click handlers too, into which React passes an event object - a comparison with undefined would take
    // it for substituted text.
    const isOverride = typeof overrideText === 'string'
    // A message on its way out is a draft nobody is going to rewrite again: what it started from has
    // nothing left to be compared against (see improveSources). The field is emptied further down by
    // several different paths, and this stands ahead of all of them.
    if (!isOverride) forgetImproveSource(active)
    // The empty tail is taken off at once: it is invisible in the field (the last line there takes no
    // space, at most the caret stands on it) while in the feed it would show as a spare empty line. To the
    // agent composePrompt does not send it anyway.
    const typed = isOverride
      ? [{ kind: 'text' as const, value: overrideText }]
      : trimTrailingSpace(draft.tokens)
    const quotes = isOverride ? [] : draft.quotes

    // A "!" at the start is a terminal command rather than a message to the agent: the panel runs it and
    // shows the output in a card of its own (see runShell).
    const command = bashCommand(typed)
    if (command) {
      runShell(command)
      if (!isOverride) editDraft(active, { tokens: [] })
      return
    }

    // Through tokensText rather than plainText: a command in the field is a chip, and plain text does not
    // see it at all (see captureCommand). To the agent it means exactly "/name" anyway, and that is what we
    // recognise it by.
    const local = localCommand(t, tokensText(typed), models)
    if (local) {
      runLocal(local)
      if (!isOverride) editDraft(active, { tokens: [] })
      return
    }

    // A command that stayed plain text - pasted from the clipboard, or sent with Enter right after its own
    // name - becomes a chip before it travels anywhere: the card in the feed, the echo for a second client
    // and the phone are all drawn out of these very tokens (see captureWrittenCommand).
    const tokens = captureWrittenCommand(typed, commands) ?? typed

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
    // And the shell is told the same guess: a second client did not see this message and would otherwise
    // list the tab as "new session" for as long as the conversation lasts.
    if (sessions.find((session) => session.id === active)?.titleSource === 'default') {
      send({ type: 'renameSession', sessionId: active, title: deriveSessionTitle(written) })
    }

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
      send({
        type: 'queuePrompt',
        sessionId: active,
        id: `q-${Date.now()}-${promptCounter.current++}`,
        text,
        attach: attachCount ? `${attachCount} refs` : '',
        // The pieces the card will be drawn from travel with it, exactly as they do with a message sent
        // outright: what fires out of the queue arrives back here as an ordinary echo (see promptEcho).
        tokens,
        quotes: quotes.map((quote) => quote.text),
        images,
      })
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
      const echoId = `p-${Date.now()}-${promptCounter.current++}`
      ownPrompts.current.add(echoId)
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
        send({
          type: 'prompt',
          sessionId: active,
          id: echoId,
          tokens,
          quotes: quotes.map((quote) => quote.text),
          steering: true,
          text,
          images,
        })
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

    const promptId = `p-${Date.now()}-${promptCounter.current++}`
    ownPrompts.current.add(promptId)
    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text), steering: running },
    })

    send({
      type: 'prompt',
      sessionId: active,
      id: promptId,
      // The pieces the card is drawn from travel with it: the shell keeps them for whoever was not here
      // (a second client, or this same page after a reload) - see promptEcho.
      tokens,
      quotes: quotes.map((quote) => quote.text),
      steering: running,
      text,
      images,
    })
    reportChips(tokens, quotes.length)
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
    commands,
    improveSources,
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

  // The harness opens the statistics tab the way the menu's row does - dev builds only, like the hooks
  // above. Here, before the sign-in gate below, so the count of hooks does not change when it opens.
  useEffect(() => {
    if (!import.meta.env.DEV) return

    window.__accHarnessOpenStatistics = (view) => {
      setSideMenu((current) => ({ ...current, open: false }))
      setMenu(null)
      setStatsTab((current) =>
        current.open
          ? { ...current, view }
          : { open: true, view, place: placeAtEnd(groupOrder(sessions)) },
      )
      setActive(STATISTICS_GROUP)
    }
    return () => {
      window.__accHarnessOpenStatistics = undefined
    }
  }, [sessions])

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
  const tabs = useMemo(
    () =>
      sessions.map((session) => ({
        ...session,
        state: sessionState(panels[session.id], session.id === active, cards),
      })),
    [sessions, panels, active, cards.planDecisions, cards.answeredAsks],
  )

  /**
   * "27/51" for the menu's row.
   *
   * Remembered until the figures themselves change, because arriving at those five characters means
   * building the whole catalogue of achievements - every group, every one of them dressed in its words -
   * and then folding it. Nothing in it moves between one statistics message and the next, while the panel
   * repaints dozens of times a second with an answer printing, over a menu that is usually shut.
   *
   * Above the login gate rather than beside its own use further down: everything before that gate runs on
   * every render, and a hook after it would not (see the rules of hooks).
   */
  const achievementsEarned = useMemo(() => (statistics ? achievementsCount(statistics) : ''), [statistics])

  // Without a login the input field is meaningless: the agent answers any question with a line about
  // /login, and that command itself is out of reach in streaming mode.
  if (!auth || !auth.loggedIn) {
    return (
      <LocaleProvider locale={locale}>
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
      </LocaleProvider>
    )
  }

  /**
   * The session tabs and the burger are shared by the whole panel rather than tied to one column, and
   * stand at the top under any layout: the feed (and beside it, in left/right, the side rail) takes
   * everything left below.
   *
   * Everything the burger used to open as five separate overlays is one panel now, with a screen apiece
   * (see SideMenu). Opening it always lands on the root: a menu that reopened wherever it was left would
   * hide the other six entries from someone who came looking for them.
   *
   * A screen opens on what has been loaded in advance. We ask anew only if the previous request has
   * already come back while what is shown has had time to go stale.
   */
  const openMenu = () => {
    setMenu(null)
    setSideMenu((current) => ({ open: !current.open, screen: 'menu' }))
  }

  const closeMenu = () => {
    stopCapturingHotkey()
    setSideMenu((current) => ({ ...current, open: false }))
  }

  /** A step back: out of "what travels" to remote access, out of any other screen to the root. */
  const backMenu = () => {
    stopCapturingHotkey()
    setSideMenu((current) => ({ ...current, screen: parentOf(current.screen) }))
  }

  /**
   * A hotkey recording ends when the screen it belongs to is left, whichever way.
   *
   * It has to: while it runs, the IDE swallows the next key or button press for it (see VoiceHotkeys), so
   * a recording left behind would eat a keystroke somewhere else entirely and bind the panel to it.
   */
  const stopCapturingHotkey = () => {
    if (!voiceCapturing) return

    setVoiceCapturing(null)
    send({ type: 'voiceStopCapture' })
  }

  /**
   * The statistics as a tab of the strip rather than a screen of the menu: a chart of a month wants the
   * whole panel, not 350 pixels of a sheet. Opened from the menu's row - the menu closes behind it.
   *
   * A tab already in the strip keeps the place it was dragged to; a fresh one opens at the end.
   */
  const openStatistics = () => {
    setSideMenu((current) => ({ ...current, open: false }))
    setMenu(null)
    setStatsTab((current) =>
      current.open ? current : { ...current, open: true, place: placeAtEnd(groupOrder(sessions)) },
    )
    setActive(STATISTICS_GROUP)
  }

  const closeStatistics = () => {
    setStatsTab({ open: false, view: 'overview', place: { at: 0, among: [] } })
    if (active === STATISTICS_GROUP) setActive(sessions[0]?.id ?? MAIN_SESSION)
  }

  /**
   * Which conversation a debug report would be about: the tab open right now.
   *
   * The statistics are a tab of the strip too but not a conversation, so from there the report falls back
   * to the first one in the list. Either way the screen names the tab it means out loud rather than
   * leaving it to be guessed (see Feedback).
   */
  const reportedSession = () => sessions.find((session) => session.id === active) ?? sessions[0]

  const openScreen = (screen: MenuScreen) => {
    setSideMenu({ open: true, screen })

    if (screen === 'history') send({ type: 'history' })

    if (screen === 'mcp') {
      setMcpMessage(null)
      if (!mcpLoading && Date.now() - mcpFetchedAt > LIST_STALE_MS) loadMcp(mcpServers !== null)
    }

    if (screen === 'plugins') {
      setPluginMessage(null)
      if (!pluginsLoading && Date.now() - pluginsFetchedAt > LIST_STALE_MS) {
        loadPlugins(pluginsInstalled !== null)
      }
    }

    // The address to answer to, and the files still picked from an earlier visit, are kept by the IDE
    // rather than by the page: the panel is reloaded far more often than a person changes their mind.
    if (screen === 'feedback') {
      setFeedback((current) => ({ ...current, message: null, note: null }))
      send({ type: 'feedbackOpen' })
    }

    // Built afresh every time it is opened, never remembered: a report from ten minutes ago would be
    // shown as if it described what just went wrong.
    if (screen === 'feedbackLog') {
      setFeedback((current) => ({ ...current, report: null }))
      send({ type: 'feedbackReport', sessionId: reportedSession()?.id ?? active })
    }

    // The devices are read afresh every time: a headset plugged in since the panel opened has to be in
    // the list, and nothing else on this screen would have noticed it.
    if (screen === 'voice') {
      setVoiceCaptureProblem('')
      send({ type: 'voiceConfig' })
    }

    // A hotkey recording left running would swallow the very keys this screen is being left by.
    if (screen !== 'voice' && voiceCapturing) {
      setVoiceCapturing(null)
      send({ type: 'voiceStopCapture' })
    }
  }

  /** The bubble beside the heart opens the very same screen the menu's own row does. */
  const openFeedback = () => {
    setMenu(null)
    openScreen('feedback')
  }

  /**
   * What every entry of the menu says without being opened.
   *
   * These are the answers people open the screens for - how many servers are up, which mode the next tab
   * starts in, whether a phone can reach this IDE at all. Cheap to compute and worth the trip saved.
   */
  const menuSummary: MenuSummary = {
    history: history?.length ?? null,
    statistics: achievementsEarned,
    mcp: mcpServers
      ? {
          connected: mcpServers.filter((server) => server.status === 'connected').length,
          total: mcpServers.length,
        }
      : null,
    plugins: pluginsInstalled?.length ?? null,
    sounds: t.common.countOn(SOUND_IDS.filter((sound) => !isMuted(soundPrefs, sound)).length),
    defaultMode:
      modeMenuOptions(t, availableModes).find((option) => option.id === normalizeMode(prefs.mode))?.label ?? '',
    composerLayout: composerLayoutOptions(t).find((option) => option.id === chosenLayout)?.label ?? '',
    pasteCollapse: pasteCollapseSummary(t, pasteCollapse),
    improvePrompt: improveInstructions.instructions.trim()
      ? t.settings.improveSummary.custom
      : t.settings.improveSummary.builtIn,
    // The language it listens in, written in itself as in the picker - or that there is nothing to
    // listen with yet, which is the answer somebody opening this row for the first time needs.
    voice: voice.enabled
      ? voice.languages.find((entry) => entry.code === voice.language)?.native ?? voice.language
      : t.voice.off,
    // Written in itself, as in the picker: the row is read by somebody who may be looking for a way out
    // of a language they cannot read.
    language: nativeName(locale),
    // The word alone, and its colour. The sentence that used to stand under it belongs to the screen
    // behind the row - see RemoteSummary.
    remote: {
      label: remoteState(t, remote.state).label,
      tone: remoteState(t, remote.state).tone,
    },
    version: pluginVersion,
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
    setSideMenu((current) => ({ ...current, open: false }))
    setMenu({ kind, anchor })
  }

  /** The same toggle for the heart at the row's far end, and for the same reason (see [openSelector]). */
  const openThanks = (anchor: Anchor) => {
    if (menu?.kind === 'thanks') {
      setMenu(null)
      return
    }
    setSideMenu((current) => ({ ...current, open: false }))
    // The tick on "share" belongs to the menu that is open, not to the panel: opened again, it asks again.
    setShared(false)
    setMenu({ kind: 'thanks', anchor })
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
          // The draft of a conversation that no longer exists, and what its rewrites were about: both are
          // about a field nobody can open again, and both hold on to whatever was attached to that draft.
          setDrafts((current) => {
            if (!(id in current)) return current

            const next = { ...current }
            delete next[id]
            return next
          })
          forgetImproveSource(id)
          dispatchPanel({ session: id, closed: true })
          const next = sessions.filter((session) => session.id !== id)
          setSessions(next)
          if (active === id) setActive(next[0]?.id ?? MAIN_SESSION)
        }}
        onNewSession={() => startSession(`session-${Date.now()}`)}
        onReorderGroups={reorderGroups}
        onOpenMenu={openMenu}
        statistics={
          statsTab.open
            ? {
                at: placeIn(statsTab.place, groupOrder(sessions)),
                active: active === STATISTICS_GROUP,
              }
            : undefined
        }
        onPickStatistics={() => setActive(STATISTICS_GROUP)}
        onCloseStatistics={closeStatistics}
        watchers={watchers}
        gitBranch={panels[MAIN_SESSION]?.project?.gitBranch}
        pullRequest={panels[MAIN_SESSION]?.project?.pullRequest}
        onOpenPullRequest={openPullRequest}
      />
  )

  /**
   * The usage rings and the day's tokens, built once for whoever draws them.
   *
   * Where they stand depends on the layout and nowhere on what they say: the status line under the field
   * in the ordinary layout (see StatusBar), the row of buttons in compact, a row of their own in the side
   * rail (both see Composer). Only one of those is on the screen at a time, so this node is drawn once
   * however many places are handed it.
   */
  const metersNode = <UsageMeters todayTokens={usage.todayTokens ?? '…'} usage={usage} />

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
        onReorder={(from, to) => {
          const next = [...sessionQueue]
          const [moved] = next.splice(from, 1)
          if (moved) next.splice(to, 0, moved)
          send({ type: 'reorderQueue', sessionId: active, ids: next.map((item) => item.id) })
        }}
        onRemove={(id) => send({ type: 'unqueuePrompt', sessionId: active, id })}
      />

      <Quotes
        items={draft.quotes}
        onRemove={(id) => editDraft(active, { quotes: draft.quotes.filter((quote) => quote.id !== id) })}
      />
    </>
  )

  return (
    <LocaleProvider locale={locale}>
    <div
      className={s.panel}
      ref={setPanelNode}
      data-anchor={dockAnchor}
      data-layout={composerLayout}
      /* One attribute for the whole holiday layer, in the manner of data-layout beside it: what it
         switches on is the Send button's ice, which is that button's own fill rather than a node
         anyone could render here (see composer.module.css). */
      data-holiday={holiday ? '' : undefined}
    >
      {/* The hover hints of every marked control at once - drawn into the body, so its place in this
          tree carries no meaning beyond being mounted with the panel. */}
      <Tooltips />

      {header}

      {/* Killed only when asked - the work itself is stopped by the CLI, and it reports the end through
          an ordinary notification: the chip leaves by itself, and faking its end on our side serves
          nothing. */}
      {stopping ? (
        <Confirm
          title={stopping.title}
          subject={stopping.subject}
          confirmLabel={t.chrome.confirm.stop}
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
          title={t.chrome.resume.title}
          subject={resuming.title}
          confirmLabel={t.chrome.confirm.open}
          onCancel={() => setResuming(null)}
          onConfirm={() => {
            openResumed(resuming)
            setResuming(null)
          }}
        />
      ) : null}

      {active === STATISTICS_GROUP && statsTab.open ? (
        <StatisticsTab
          data={statistics}
          view={statsTab.view}
          onView={(view) => setStatsTab((current) => ({ ...current, view }))}
          version={pluginVersion}
        />
      ) : sessions.length === 0 ? (
        <div className={s.emptyState}>
          <p className={s.gateTitle}>{t.chrome.noChats.title}</p>
          <button type="button" className={s.gateButton} onClick={() => startSession(MAIN_SESSION)}>
            {t.chrome.noChats.button}
          </button>
        </div>
      ) : (
        <div className={s.workArea} data-layout={composerLayout}>
        <div className={s.content}>
        {/* One line directly under the header, where it reads as a shelf ornament rather than as UI.
            Inside .content rather than over .panel: under the left/right layouts the panel is a grid
            whose rail spans its whole height, and a strip drawn across it would cross the chips. */}
        {holiday ? <Garland /> : null}

        <StreamSwitcher
          tabs={agentTabs}
          background={panel.background}
          mainStatus={mainStatus}
          active={resolvedStream}
          onPick={setActiveStream}
          onStop={setStopping}
        />

        <div className={s.body}>
          {/* The flakes take the room behind the feed - .body is already the positioned box that paints
              the feed's background, so the layer covers the feed and nothing above or below it. */}
          {holiday ? <Snowfall /> : null}

          {resolvedStream === 'main' ? (
            /*
             * A feed of its own per tab, rather than one feed shown a different conversation.
             *
             * What it remembers between renders is about a particular chat and its geometry - where the
             * reading was, how tall the feed stood, how many pages of earlier messages have gone in. Kept
             * across a switch of tabs, those measurements described one conversation and were applied to
             * another: a tab where earlier messages had been loaded made the next tab restore a position
             * worked out from a chat it knew nothing about, and it opened neither at the end nor where it
             * was left. Told apart by the tab's own identity, each starts clean and ends at the bottom.
             */
            <Feed
              key={active}
              items={panel.items}
              streamingText={panel.streamingText}
              streamingId={panel.streamingId}
              streamingThinking={panel.streamingThinking}
              streaming={running}
              streamStatus={streamStatus(t, panel, cards)}
              statusStalled={panel.retry !== undefined}
              cards={cards}
              scrollRef={attachFeed}
              onPlanDecision={decidePlan}
              onDismissError={dismissError}
              onOpenLink={openLink}
              onLoadEarlier={loadEarlier}
              earlierPages={panel.earlierPages}
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
                // It goes into the draft without passing through the field, so the chain has to be closed
                // here by hand: a rewrite with a quote added under it is a draft of one's own again, and a
                // way back still on offer would take the quote away with it.
                forgetImproveSource(active)
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
            pasteCollapseLines={pasteCollapse}
            commands={commands}
            models={models}
            meters={metersNode}
            files={files}
            imageBaseCount={imageBaseCount}
            focusToken={focusToken}
            layout={composerLayout}
            model={model}
            switchedFrom={panel.switchedFrom}
            effort={effort}
            mode={mode}
            onOpenSelector={openSelector}
            onOpenThanks={openThanks}
            onOpenFeedback={openFeedback}
            railContainer={railNode}
            fileDragOver={fileDragOver}
            onTokensChange={(tokens, from) => {
              // Renumbered image captions are not an edit at all - nothing was said, and a complaint about
              // the last rewrite is still worth reading.
              if (from !== 'renumber') {
                setImproveError(null)
                setVoiceError('')
              }

              if (!applyingImprove.current && improveSources[active]) {
                // A hand on the keyboard makes this a draft of one's own again: the next press of the
                // sparkle starts from what is in the field rather than from what stood before the last
                // rewrite.
                if (from === 'hand') forgetImproveSource(active)
                // Cmd+Z over a rewrite is the person going back to their own words rather than moving on
                // from them: the chain stands, and only whether a take is on the screen changes with it.
                else if (from === 'history') {
                  setImproveSources((current) => {
                    const held = current[active]
                    return held ? { ...current, [active]: improveShown(held, tokens) } : current
                  })
                }
              }

              // A renumbering while a rewrite is in flight: the draft did not change, only the number in a
              // caption did, so the answer must not be turned away as landing on a different draft (see
              // the promptImproved case above).
              if (from === 'renumber') {
                setImproving((current) =>
                  current && current.sessionId === active ? { ...current, tokens } : current,
                )
              }

              editDraft(active, { tokens })
            }}
            onAttach={() => send({ type: 'pick' })}
            // The chips are assembled by the shell and come back as an ordinary picked - by the same route
            // as a choice through a dialog: only it knows whether this is a file or a folder.
            onDropFiles={(paths) => send({ type: 'dropped', paths })}
            registerInsert={registerInsert}
            registerApply={registerApply}
            onImprove={improvePrompt}
            improving={improving !== null}
            improveRetry={improveSources[active] !== undefined}
            improveError={improveErrorText}
            /* While THIS tab's next take is on its way there is nothing to offer: what the way back leads
               to is about to be decided again, and the answer landing under a line that says otherwise is
               worse than a moment without one. A rewrite running in another tab has nothing to do with
               this one - the slot it occupies is shared, the draft is not. */
            improveRestore={improving?.sessionId !== active && Boolean(improveSources[active]?.applied)}
            onImproveRestore={restoreDraft}
            voice={{ enabled: voice.enabled, phase: voiceRun }}
            /* The button toggles: it starts the hands-free mode, which is the only one a button can mean -
               holding a button down with the mouse while talking is nobody's idea of dictation. */
            onVoiceStart={() => send({ type: 'voiceStart', mode: 'hold' })}
            onVoiceStop={() => send({ type: 'voiceStop' })}
            /* Only in the tab the words are going to: the tail of a sentence being said about another
               conversation has no business hanging under this one's draft. */
            voiceGhost={voiceTargetRef.current === active || !voiceTargetRef.current ? voiceInterim : ''}
            voiceError={voiceErrorText}
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
              switchedFrom={panel.switchedFrom}
              effort={effort}
              mode={mode}
              models={models}
              meters={metersNode}
              onOpen={openSelector}
              onOpenThanks={openThanks}
              onOpenFeedback={openFeedback}
            />
          )}
        </div>
        </div>
      )}

      <SideMenu
        open={sideMenu.open}
        screen={sideMenu.screen}
        summary={menuSummary}
        onPick={openScreen}
        onOpenStatistics={openStatistics}
        onBack={backMenu}
        onClose={closeMenu}
        onOpenLink={openLink}
      >
        {/* Only what is being looked at is built: the MCP and plugin screens are whole lists, and the
            menu is shut far more of the time than it is open. */}
        {sideMenu.open && sideMenu.screen === 'history' ? (
          <History conversations={history} onOpen={resume} />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'mcp' ? (
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
            // The login address is opened by the shell in the system browser, and the code from it is
            // caught by the CLI itself: the panel is left waiting for a new status.
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
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'plugins' ? (
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
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'settings' ? (
          <SettingsScreen summary={menuSummary} onPick={openScreen} />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'voice' ? (
          <VoiceInput
            settings={voice}
            balance={voiceBalance}
            capturing={voiceCapturing}
            captureProblem={voiceCaptureProblem ? t.voice.badButton : ''}
            onToggle={(enabled) => send({ type: 'voiceEnabled', enabled })}
            onKey={(key) => send({ type: 'voiceKey', key })}
            onRefreshBalance={() => send({ type: 'voiceBalance' })}
            onCapture={(slot) => {
              setVoiceCapturing(slot)
              setVoiceCaptureProblem('')
              send({ type: 'voiceCaptureHotkey', slot })
            }}
            onStopCapture={() => {
              setVoiceCapturing(null)
              send({ type: 'voiceStopCapture' })
            }}
            onClear={(slot) => send({ type: 'voiceClearHotkey', slot })}
            onOpenLanguages={() => openScreen('voiceLanguage')}
            onOpenDevices={() => openScreen('voiceDevice')}
            onOpenSite={() => send({ type: 'openExternal', url: DEEPGRAM_URL })}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'voiceLanguage' ? (
          <VoiceLanguages
            settings={voice}
            onPick={(language) => {
              send({ type: 'voiceLanguage', language })
              // Back to the screen that sent us here: the list is a step of the voice screen rather than a
              // place to stay, and a choice made is the end of that step.
              setSideMenu({ open: true, screen: 'voice' })
            }}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'voiceDevice' ? (
          <VoiceDevices
            settings={voice}
            onPick={(device) => {
              send({ type: 'voiceDevice', device })
              setSideMenu({ open: true, screen: 'voice' })
            }}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'language' ? (
          <Language
            chosen={language.chosen}
            ide={language.ide}
            onPick={(next) => {
              // Kept here as well as sent: the IDE answers with a `locale` message of its own, but the
              // screen must not sit in the old language for the length of that round trip.
              setLanguage((current) => ({ ...current, chosen: next }))
              send({ type: 'setLanguage', language: next })
            }}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'sounds' ? (
          <Sounds
            prefs={soundPrefs}
            onToggle={(sound) => changeSoundPrefs(toggleSound(soundPrefs, sound))}
            onVolume={(sound, volume) => changeSoundPrefs(setVolume(soundPrefs, sound, volume))}
            // A muted sound plays too: hearing exactly what one is switching off is precisely what the
            // button is pressed for. The volume is taken as it stands right now: otherwise there is
            // nothing to check the slider against.
            onPreview={(sound) => send({ type: 'sound', sound, volume: volumeOf(soundPrefs, sound) })}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'remote' ? (
          <Remote
            status={remote}
            onToggle={(enabled) => send({ type: 'setRemoteEnabled', enabled })}
            onRelay={(url) => send({ type: 'setRelayUrl', url })}
            onPair={() => send({ type: 'startPairing' })}
            onCancelPairing={() => send({ type: 'cancelPairing' })}
            onApprove={() => send({ type: 'approvePairing' })}
            onRefuse={() => send({ type: 'refusePairing' })}
            onRevoke={(deviceId) => send({ type: 'revokeDevice', deviceId })}
            onAbout={() => setSideMenu({ open: true, screen: 'remoteAbout' })}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'remoteAbout' ? <RemoteAbout /> : null}

        {sideMenu.open && sideMenu.screen === 'defaultMode' ? (
          <ChoiceList
            // The same list, availability marks and all: a mode this machine or this model cannot do is
            // no better a default than it is a current mode, and saying so in one place but not the
            // other would only puzzle.
            options={modeMenuOptions(t, availableModes)}
            // The saved default rather than what the tab is in right now. They part ways the moment the
            // tab's mode is changed, and that is the whole point of having two controls.
            selected={normalizeMode(prefs.mode)}
            onPick={setDefaultMode}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'composerLayout' ? (
          <LayoutChoice
            options={composerLayoutOptions(t)}
            selected={chosenLayout}
            // The menu steps aside on the choice, unlike the lists beside it. What is chosen here is the
            // shape of the panel itself, and the menu covers exactly the place that changes: staying open
            // would mean picking a layout and then having to dismiss the menu to find out whether it was
            // the one wanted. A sound or a default mode has nothing to look at underneath, so those lists
            // stay where they are.
            onPick={(id) => {
              setComposerLayout(normalizeComposerLayout(id))
              closeMenu()
            }}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'pasteCollapse' ? (
          <PasteCollapse t={t} lines={pasteCollapse} last={pasteCollapseLast} onPick={setPasteCollapse} />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'improvePrompt' ? (
          <ImprovePrompt
            instructions={improveInstructions.instructions}
            builtIn={improveInstructions.builtIn}
            onChange={(text) => {
              // Kept here as well as sent: the IDE does not answer this with a fresh init, and the screen
              // would otherwise snap back to the old text the moment it is reopened.
              setImproveInstructions((current) => ({ ...current, instructions: text }))
              send({ type: 'setImproveInstructions', text })
            }}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'feedback' ? (
          <Feedback
            draft={feedback}
            conversation={reportedSession()?.title ?? ''}
            onChange={(change) => setFeedback((current) => ({ ...current, ...change }))}
            onAttach={() => {
              setFeedback((current) => ({ ...current, note: null }))
              send({ type: 'feedbackAttach' })
            }}
            onDetach={(id) => send({ type: 'feedbackDetach', id })}
            onPreview={() => openScreen('feedbackLog')}
            onSend={() => {
              // The same check the button obeys, once more before anything travels: the button can be
              // reached by keyboard while it is disabled in some browsers, and this one is cheap.
              if (feedbackProblem(t, feedback)) return

              setFeedback((current) => ({ ...current, sending: true, message: null }))
              send({
                type: 'feedbackSend',
                kind: feedback.kind,
                sessionId: reportedSession()?.id ?? active,
                text: feedback.text.trim(),
                email: feedback.email.trim(),
                logs: feedbackLogs(feedback),
              })
            }}
          />
        ) : null}

        {sideMenu.open && sideMenu.screen === 'feedbackLog' ? (
          <FeedbackLog
            text={feedback.report}
            conversation={reportedSession()?.title ?? ''}
            onCopy={() => {
              if (feedback.report) send({ type: 'clipboardWrite', text: feedback.report, html: '' })
            }}
          />
        ) : null}
      </SideMenu>

      {menu ? (
        <Menu
          {...(menu.kind === 'thanks'
            ? thanksMenu(t, shared)
            : menuProps(t, menu.kind, models, prefs.model, tickedModel, effort, mode, availableModes))}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onPick={(id) => {
            const kind = menu.kind
            // Every entry but "share" is done with once it is pressed; that one answers inside the menu,
            // so the menu has to still be there to answer in.
            if (kind !== 'thanks' || id !== SHARE) setMenu(null)

            if (kind === 'model') pickModel(id)
            if (kind === 'effort') pickEffort(id)
            if (kind === 'mode') setMode(id)
            // The page has no browser of its own to open anything with: the address goes out to the shell,
            // and the IDE opens it in the system browser - the same route the PR link takes.
            if (kind === 'thanks') {
              const url = thanksUrl(id)
              if (url) send({ type: 'openExternal', url })
              if (id === SHARE) void copyToClipboard(shareText(t)).then((ok) => setShared(ok))
              // Which way was taken, not that the menu was opened: there are three ways to say thanks and
              // the achievement counts the different ones (see Achievements.kt, "thanks").
              if (url || id === SHARE) send({ type: 'stat', kind: 'thanks', way: id })
            }
          }}
        />
      ) : null}
    </div>
    </LocaleProvider>
  )
}

// --- Session state ----------------------------------------------------------

type PanelsState = Record<string, PanelState>

/**
 * An ordinary change to a conversation - or its closing: a closed tab leaves the state entirely rather
 * than lying about with a feed of its own.
 */
type PanelsAction =
  | { session: string; action: Parameters<typeof reducePanel>[1]; at?: number }
  | { session: string; closed: true }
  /**
   * The conversation behind the tab is gone (a past one opened in its place) - the feed starts over
   * rather than having a second conversation appended to the first.
   */
  | { session: string; reset: true }
  /**
   * A whole restored feed at once - everything between restoreStarted and restoreFinished.
   *
   * Applied as one change on purpose: a couple of thousand entries dispatched one at a time is a couple
   * of thousand renders, and this path is already the heaviest one the panel has (a long conversation
   * replayed from disk goes through it too).
   *
   * `at` travels with every entry because the times are the times things genuinely happened. Without
   * them a turn that has been running for a minute would come back as having just started.
   */
  | { session: string; batch: Array<{ action: Parameters<typeof reducePanel>[1]; at?: number }> }

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

  // The project itself survives a reset: it describes the folder rather than the conversation, it
  // arrives once at the start, and losing it would leave the status bar blank until the next restart.
  if ('reset' in event) {
    return { ...state, [event.session]: { ...initialPanelState, project: state[event.session]?.project } }
  }

  if ('batch' in event) {
    const applied = event.batch.reduce(
      (panel, entry) => reducePanel(panel, entry.action, entry.at),
      state[event.session] ?? initialPanelState,
    )
    return { ...state, [event.session]: applied }
  }

  return {
    ...state,
    [event.session]: reducePanel(state[event.session] ?? initialPanelState, event.action, event.at),
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

  // The main turn can end while a skill's background subagent (launched outside the ordinary turn cycle,
  // e.g. by /code-review) keeps going - streamStatus already knows to say "Waiting for N subagents" for the
  // same reason. The dot has to agree, or it calls a conversation done while work is still visibly running.
  if (panel.items.some((item) => item.kind === 'task' && item.pending)) return 'running'

  // We count as finished a conversation in which the agent brought a turn to its end at least once: a fork
  // marker by itself is not work yet.
  return panel.items.some((item) => item.kind === 'meta') ? 'done' : 'idle'
}

// --- Derived data -----------------------------------------------------------

/** The last task list the agent sent - the panel above the input field mirrors only that one. */
const latestTodo = (items: FeedItem[]): TodoItem | undefined =>
  [...items].reverse().find((item): item is TodoItem => item.kind === 'todo')

/** The text of the person's last line - to work out whether this is a compaction right now. */
const lastUserText = (items: FeedItem[]): string => {
  const last = [...items].reverse().find((item): item is UserItem => item.kind === 'user')
  return last ? tokensText(last.tokens).trim() : ''
}

const menuProps = (
  t: Dict,
  kind: SelectorKind,
  models: ModelInfo[] | null,
  /** The chosen value rather than what the agent resolved it into: the tick has to stand on the choice. */
  selectedModel: string,
  /** The model the agent moved the conversation to itself - then the tick stands on it (see modelMenu). */
  switched: string | undefined,
  effort: string,
  mode: string,
  availableModes: ModeAvailability,
): { title: string; hint?: string; width: number; options: MenuOption[]; selected: string; tick?: boolean } => {
  if (kind === 'model') {
    return {
      title: t.selectors.model,
      width: 344,
      ...modelMenu(t, models, selectedModel, switched),
    }
  }

  if (kind === 'effort') {
    return {
      title: t.selectors.effort,
      width: 320,
      options: effortOptions(t),
      selected: effort,
    }
  }

  return {
    title: t.selectors.mode,
    // The one hint left of the three: the others named what the menu already says by its own title, while
    // this one is a key nothing on screen mentions. The circle it walks is the terminal's, and the
    // unavailable it simply steps over (see nextMode).
    hint: t.selectors.modeHint,
    width: 372,
    options: modeMenuOptions(t, availableModes),
    selected: mode,
  }
}
