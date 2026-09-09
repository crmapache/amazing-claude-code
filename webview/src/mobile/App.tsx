import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { unbase64url } from '../core/crypto'
import { deriveSessionTitle } from '../feed/title'
import type {
  AgentEvent,
  AvailablePluginInfo,
  HistoryEntry,
  InstalledPluginInfo,
  McpServerInfo,
  PluginMarketplaceInfo,
  Scenario,
  ShellMessage,
} from '../protocol'
import { ClockContext } from '../hooks/useNow'
import { planDecisionOf, useCardState } from '../hooks/useCardState'
import { applyFact, emptyFacts, factsFor, isFact, liveRunsOf, type ProjectFacts } from './facts'
import { shelfHome, type RepositoryChoice, type ShelfChoice } from './scenarios'
import { useCalmColors } from '../hooks/useCalmColors'
import { LocaleProvider, activeLocale } from '../i18n'
import { RemoteClock } from './clock'
import { applyMessage, emptyFeed, feedTicks, tickFeed, type MobileFeed } from './feed'
import { Link, type LinkState, type SessionLaunch } from './link'
import {
  buildProjects,
  CAP_OPEN_BARE,
  chatKey,
  waitingFor,
  type AgentEntry,
  type Inventory,
  type ProjectEntry,
  type SessionEntry,
} from './projects'
import { tabHolding } from '../feed/resume'
import { PIN_LIMIT, togglePin } from '../feed/pins'
import type { FeedItem, TaskItem } from '../feed/types'
import { usageOf, type UsageFacts } from '../feed/usage'
import { chatHits, rowOf } from '../feed/search'
import type { PaintedTerm, ScenarioScope, SearchHit, SearchProgressStep, SearchScope } from '../protocol'
import { Search, type SearchTab } from '../components/Search'
import { useEarlierPages } from '../hooks/useEarlierPages'
import { Accounts, type AccountsState } from './screens/Accounts'
import { AgentScreen } from './screens/AgentScreen'
import { Decision } from './screens/Decision'
import { Drawer } from './screens/Drawer'
import { History } from './screens/History'
import { Mcp } from './screens/Mcp'
import { MessageSheet } from './screens/MessageSheet'
import { NewSession } from './screens/NewSession'
import { Pairing, type PairingOffer } from './screens/Pairing'
import { Plugins } from './screens/Plugins'
import { Projects } from './screens/Projects'
import { ScenarioCardScreen } from './screens/ScenarioCardScreen'
import { ScenarioEditor } from './screens/ScenarioEditor'
import { ScenarioRun } from './screens/ScenarioRun'
import { ScenarioStep } from './screens/ScenarioStep'
import { Scenarios } from './screens/Scenarios'
import { RunSheet } from './screens/RunSheet'
import { TabsSheet } from './screens/TabsSheet'
import { Tasks } from './screens/Tasks'
import { Thread } from './screens/Thread'
import type { OutgoingPrompt } from './screens/Composer'
import { useDictation } from './useDictation'
import { forgetAgent, listAgents, readSetting, writeSetting, type PairedAgent } from './storage'
import m from './mobile.module.css'

/**
 * The phone's whole application.
 *
 * It used to be four screens and a promise that it would never be a second panel: what is waiting, one
 * conversation, one decision, and starting something new. The promise stands - this is still where work
 * is unblocked rather than where it is done - but four screens turned out to be fewer than the promise
 * needs. A conversation with a fork in it had no way to reach the fork. A turn running twelve subagents
 * said "working" and nothing else. A server that fell over stopped the work with no way to see it, and
 * an account whose window ran dry could not be swapped for the one signed in beside it.
 *
 * So there are more screens, and each of them earns its place by a question somebody away from the desk
 * genuinely has. What is still absent is absent on purpose and mostly on the other side of the wire as
 * well (see RemoteCommands): installing plugins, signing in to anything, and every machine-wide setting.
 */

type Screen =
  | { at: 'sessions' }
  | { at: 'new'; agentId: string; projectKey: string }
  | { at: 'history'; agentId: string; projectKey: string }
  | { at: 'thread'; agentId: string; projectKey: string; sessionId: string }
  | { at: 'decide'; agentId: string; projectKey: string; sessionId: string }
  /** The task list, the subagents and the background commands of one conversation. */
  | { at: 'tasks'; agentId: string; projectKey: string; sessionId: string }
  /** One subagent's own stream - reached from the screen above it. */
  | { at: 'agent'; agentId: string; projectKey: string; sessionId: string; taskId: string }
  /**
   * The three screens that are about the machine rather than about a conversation.
   *
   * They still carry a project, because that is who answers: every one of these is asked of an IDE, and
   * a phone talks to several of them.
   */
  | { at: 'mcp'; agentId: string; projectKey: string }
  | { at: 'plugins'; agentId: string; projectKey: string }
  | { at: 'accounts'; agentId: string; projectKey: string }
  /**
   * The project's rounds of work, and one run of one of them.
   *
   * About the project rather than about the machine or a conversation, and they earn their place by the
   * question a scenario creates: it runs unattended for hours, which means the person it belongs to is
   * by definition not in front of it. A run that stopped to ask stood still until somebody walked back
   * to the keyboard.
   */
  | { at: 'scenarios'; agentId: string; projectKey: string }
  | { at: 'scenarioRun'; agentId: string; projectKey: string; runId: string }
  /**
   * One step's own conversation, and the editor with one of its cards.
   *
   * Screens rather than sheets because both are long: a step that walked a repository is pages, and a
   * card is a prompt with two answers under it. Everything short about a scenario folds up from the
   * bottom instead (see ScenarioSheets).
   */
  | { at: 'scenarioStep'; agentId: string; projectKey: string; runId: string; key: string }
  | { at: 'scenarioEditor'; agentId: string; projectKey: string }
  | { at: 'scenarioCard'; agentId: string; projectKey: string; stageId: string; cardId: string }
  | { at: 'pairing' }

/** What is folded up over the screen, if anything - the six sheets and the drawer. */
type Sheet = '' | 'tabs' | 'run' | 'message'

/** A conversation being started in a project that has to be opened first - see [startSession]. */
interface Opening {
  agentId: string
  /** Empty for a project opened bare - for its scenarios, with no conversation started in it. */
  sessionId: string
  error: string
  /**
   * What to do once the window is up, with the key the project is open under - the scenarios screen
   * asks for this, since a closed project's shelf is read through the hub the window brings. Absent,
   * the conversation named above is entered, as "Open & start" does.
   */
  then?: (projectKey: string) => void
}

const EMPTY_LAUNCH: SessionLaunch = { model: '', effort: '', mode: '' }

export const App = () => {
  const [agents, setAgents] = useState<PairedAgent[]>([])
  const [screen, setScreen] = useState<Screen>({ at: 'sessions' })
  const [inventories, setInventories] = useState<Record<string, Inventory>>({})
  const [states, setStates] = useState<Record<string, LinkState>>({})
  const [feed, setFeed] = useState<MobileFeed>(emptyFeed())
  const [opening, setOpening] = useState<Opening | null>(null)

  /** Whether the side menu is out, and which sheet is folded up over the screen. */
  const [drawer, setDrawer] = useState(false)
  const [sheet, setSheet] = useState<Sheet>('')

  /** Which message the actions sheet is about - it outlives no conversation but its own. */
  const [acting, setActing] = useState<FeedItem | null>(null)

  /**
   * What has been quoted out of a conversation and is waiting above the field, by chat.
   *
   * Beside the conversations rather than inside the composer, for the reason the queue is in the IDE:
   * a quote is picked in the feed and used in the field, and those are two different places on this
   * screen. By chat, because a quote taken in one conversation has no business standing over another.
   */
  const [quotes, setQuotes] = useState<Record<string, string[]>>({})

  /**
   * Which messages are held over the top of a conversation, by chat (see feed/pins.ts).
   *
   * On this device rather than in the IDE, and lost when the browser throws the page out - which is the
   * price and it is the right one: a pin is a bookmark in something being read, not work. The panel
   * keeps its own the same way, in the tab's state.
   */
  const [pins, setPins] = useState<Record<string, readonly string[]>>({})

  /**
   * The questions of one call answered so far, by the call that asked them (see screens/Decision).
   *
   * Here rather than in that screen for the reason the panel keeps its own outside the card: a phone
   * answers one question at a time, and the screen is taken down by everything ordinary - a step back to
   * the conversation, a look at the task list. Six questions answered down to the last one, gone because
   * somebody checked what the agent was doing.
   */
  const [askAnswers, setAskAnswers] = useState<Record<string, Record<string, string>>>({})

  /**
   * The three screens about the machine, by the IDE they were asked of.
   *
   * By agent rather than one of each: this phone talks to several machines, and an MCP list belongs to
   * the one that answered it. Kept between visits for the reason the histories are - each answer costs
   * that machine a process, and a screen that says "Loading…" over something already known is worse
   * than one a minute old.
   */
  const [mcp, setMcp] = useState<Record<string, McpServerInfo[]>>({})
  const [mcpNote, setMcpNote] = useState<{ ok: boolean; text: string } | null>(null)
  /** The addresses connectors are signed in at, by server, once the IDE has answered (see `mcpSignIn`). */
  const [mcpSignIns, setMcpSignIns] = useState<Record<string, string>>({})
  const [plugins, setPlugins] = useState<
    Record<string, { installed: InstalledPluginInfo[]; available: AvailablePluginInfo[] }>
  >({})
  const [markets, setMarkets] = useState<Record<string, PluginMarketplaceInfo[]>>({})
  const [accounts, setAccounts] = useState<Record<string, AccountsState>>({})
  const [accountNote, setAccountNote] = useState('')

  /**
   * What a scenario request came back refused as, by name (see the outcomes block of the dictionary).
   *
   * Here rather than in either scenario screen because both can raise it and neither owns it: asking
   * for a run that has been swept is answered on the list, while a stop that arrived too late is
   * answered on the run.
   */
  const [scenarioNote, setScenarioNote] = useState('')

  /**
   * The scenario the editor on this phone is holding, and how it got there.
   *
   * Held by the app rather than by the screen for the reason everything else on this page is: a screen
   * is unmounted the moment somebody looks at another one, and a scenario half rewritten on a sofa is
   * not a thing to lose to a glance at a chat. `fresh` is one that has never been saved - what a model
   * wrote, or an empty form - and `tooBig` is one the wire would not carry, which is said out loud
   * rather than sent short (see RemoteFeed.wholeScenario).
   */
  const [edit, setEdit] = useState<{
    draft: Scenario | null
    fresh: boolean
    tooBig: boolean
    /** The answer came back without one: it is on neither shelf any more. */
    gone: boolean
    /**
     * Where it was fetched from - which project's shelf - or null for one never saved.
     *
     * Saved somewhere else, the copy there has to go, as the store takes a scenario off its other shelf
     * when it is moved between the two (see ScenarioStore.save): two files under one identifier is a
     * scenario edited in one place and run from another.
     */
    origin: { agentId: string; projectKey: string; scope: ScenarioScope } | null
    /** The project a shared copy is written through - see ShelfChoice and shelfHome. */
    home: { agentId: string; projectKey: string }
  } | null>(null)

  /**
   * A model writing one out of a sentence: which request, when it started, and why the last one failed.
   *
   * The moment rather than a yes-or-no, because the sheet counts the wait out loud - this reads the
   * project before it writes, so it takes half a minute.
   */
  const [drafting, setDrafting] = useState<{
    id: string
    since: number
    error: string
    /** Where what the model writes is to be kept - chosen before it starts, because it reads that project. */
    shelf: ShelfChoice
    /** The project the request went to, and the one a cancel has to go to as well. */
    home: { agentId: string; projectKey: string }
  }>({ id: '', since: 0, error: '', shelf: { scope: 'user' }, home: { agentId: '', projectKey: '' } })

  /** The same, for the handler below, which is built once and would otherwise hold the first value it saw. */
  const draftingRef = useRef(drafting)
  draftingRef.current = drafting

  /** The log of the one step whose screen is open - see scenarioLog in protocol.ts. */
  const [stepLog, setStepLog] = useState<{
    runId: string
    key: string
    found: boolean
    truncated: boolean
    events: AgentEvent[]
  } | null>(null)

  /** Moves the counters on the list of conversations once a second - see the effect below. */
  const [tick, setTick] = useState(0)

  /**
   * Which plans have been decided and which questions answered - here rather than inside the screen that
   * draws them, because two screens need the same answer and neither of them owns it.
   *
   * The conversation and the decision about it are on separate screens on a phone (see Decision): the
   * thread has to know that something is waiting, the decision screen has to know what. Kept in one
   * place, they cannot disagree - and a decision taken at the desk, which arrives here as a message of
   * its own, takes both of them off the hook at once.
   */
  const cards = useCardState()

  /**
   * The past conversations of each project, by the project they belong to.
   *
   * Kept rather than fetched on every visit: the list is read off that machine's disk, and coming back
   * to a screen that says "Loading…" over something already known is worse than a list a minute old -
   * it is asked for again on opening anyway.
   */
  const [histories, setHistories] = useState<Record<string, HistoryEntry[]>>({})

  /**
   * What each project itself is like, by `agentId:projectKey`: the branch and its pull request, the
   * subscription's windows, the slash commands, the files. The composer is drawn from all four (see
   * mobile/facts).
   *
   * Beside the conversations rather than inside the feed, because that is what they are: they outlive
   * the screen. Walking out of a chat and back into it must not empty the limit rings and blank the
   * branch until the IDE gets round to saying them again - it says them when they change, not when
   * somebody looks.
   */
  const [facts, setFacts] = useState<Record<string, ProjectFacts>>({})

  /**
   * Which Claude account each conversation runs on, by `chatKey`.
   *
   * Needed for one thing and it is not cosmetic: the subscription's figures belong to an account (see
   * ProjectFacts.usage), two of them can be at work on that machine at the same moment, and the rings
   * above this field answer "how much of MY subscription is left" - which has two answers unless the
   * one paying for the conversation on screen is known. The empty string is the CLI's ordinary sign-in.
   */
  const [chatAccounts, setChatAccounts] = useState<Record<string, string>>({})

  /**
   * The conversations this phone has put away, by `agentId:sessionId`.
   *
   * Kept on the device rather than told to the IDE: hiding one changes nothing about it - the process
   * runs, the tab at the desk stays open, the other phone still lists it. What it changes is how much
   * of this screen a project with eight open conversations takes up.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())

  /**
   * The search (see Search.tsx and, for the rules, feed/search.ts) - the same window as the panel's,
   * opened over a conversation or over a project's history. Which IDE and which project it asks is part
   * of what it holds: a phone talks to several.
   */
  const [search, setSearch] = useState<{
    open: boolean
    tab: SearchTab
    query: string
    aiQuery: string
    /** The field's two switches - the pair Find in Files has (see TextIndex.search on the IDE's side). */
    matchCase: boolean
    wholeWords: boolean
    agentId: string
    projectKey: string
    /** The tab a "this chat" search is kept to; empty over a project's history. */
    sessionId: string
  }>({ open: false, tab: 'project', query: '', aiQuery: '', matchCase: false, wholeWords: false, agentId: '', projectKey: '', sessionId: '' })
  const [searchAnswer, setSearchAnswer] = useState<{
    hits: SearchHit[]
    terms: PaintedTerm[]
    counts: { chat: number; project: number; conversations: number }
    total: number
    error: string
    /** Whether this is an answer at all, or the empty state a cleared field puts back (see emptyLine in Search). */
    answered: boolean
    /** The scope the hits were found for - the list is drawn under that tab and no other (see Search.answerScope). */
    scope: SearchScope | ''
  }>({ hits: [], terms: [], counts: EMPTY_COUNTS, total: 0, error: '', answered: false, scope: '' })
  const [searchLoading, setSearchLoading] = useState(false)
  const searchAsked = useRef('')
  /** The scope the query out and unanswered was asked for - what its answer is stamped with. */
  const askedScope = useRef<SearchScope>('project')
  const searchSeq = useRef(0)
  const [aiSearch, setAiSearch] = useState<{
    id: string
    hits: SearchHit[]
    error: string
    answered: boolean
    /** What the model has done so far (see searchProgress in protocol.ts), and when the run began. */
    steps: SearchProgressStep[]
    startedAt: number
  }>({ id: '', hits: [], error: '', answered: false, steps: [], startedAt: 0 })
  const aiSearchRef = useRef(aiSearch)
  aiSearchRef.current = aiSearch

  /** The search folded into a thread's corner - by the conversation it stands over (see chatKey). */
  /** The search folded into the thread's corner - the panel's own state (see SearchCapsuleState in App.tsx). */
  const [capsule, setCapsule] = useState<{
    key: string
    terms: PaintedTerm[]
    note: 'none' | 'loading' | 'missing'
    /** This conversation's hits in the order they stand in it, and which one the thread is on - see chatHits. */
    hits: SearchHit[]
    at: number
  } | null>(null)

  /** The seconds the model's run has taken - by this device's own clock, which is what it waits by. */
  const [aiSeconds, setAiSeconds] = useState(0)

  useEffect(() => {
    if (!aiSearch.id) return

    const tick = () => setAiSeconds(Math.max(0, Math.round((Date.now() - aiSearch.startedAt) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [aiSearch.id, aiSearch.startedAt])
  const [feedFocus, setFeedFocus] = useState<{ key: string; row: string; nonce: number } | undefined>(undefined)
  /** The jump has been made - the request is dropped, so the next visit to the thread does not repeat it (see Feed.onFocused). */
  const forgetFeedFocus = useCallback(() => setFeedFocus(undefined), [])

  /** A jump still on its way - into a conversation being opened, or above what the feed holds. */
  const jumping = useRef<{ key: string; hit: SearchHit; pages: number } | null>(null)
  const [jumpTick, setJumpTick] = useState(0)
  const links = useRef<Record<string, Link>>({})

  /**
   * One reading of each paired IDE's clock, by agent - see clock.ts for why a phone needs one at all.
   *
   * Per IDE because that is what a clock belongs to: two paired machines disagree with this phone by
   * two different amounts, and with each other. Beside the connections rather than inside the feed
   * because it outlives a screen: walking out of a conversation and into another one on the same
   * machine must not throw away what is already known about its clock and start the next turn back at a
   * guess of zero - which is precisely the window the wrong number used to show up in.
   */
  const clocks = useRef<Record<string, RemoteClock>>({})

  const clockOf = useCallback((agentId: string): RemoteClock => {
    const known = clocks.current[agentId]
    if (known) return known

    const made = new RemoteClock()
    clocks.current[agentId] = made
    return made
  }, [])

  /** Whether the IDE being watched was reachable a moment ago - what makes "it came back" a moment. */
  const wasLive = useRef(false)

  /** Numbers the messages this device queues, so two put in the same millisecond are still two. */
  const queueCounter = useRef(0)

  /** Which conversation the feed on screen belongs to - a late message from another one is dropped. */
  const watching = useRef<{ agentId: string; projectKey: string; sessionId: string } | null>(null)

  /**
   * Which run's timeline is on screen, where the message handler can read it.
   *
   * The handler is subscribed once and would go on seeing the screen this page started at. It decides
   * what happens to the heaviest fact there is: the whole record of a run, pushed for every round of
   * work the machine has going, several times a second (see applyFact).
   */
  const watchedRun = useRef('')
  watchedRun.current = screen.at === 'scenarioRun' ? screen.runId : ''

  /**
   * The journal number the feed on screen has reached, where a callback can read it.
   *
   * The state holds the same number, but the connection's callbacks are made once and would go on
   * seeing the number this screen started at - and "ask again from where you are" would then ask from
   * the beginning every time.
   */
  const seen = useRef(0)

  /**
   * What the camera brought, read once before anything renders.
   *
   * In a ref rather than in state because reading it has a side effect - the secret is wiped from the
   * address bar - and that must happen exactly once, not on every render and not twice under a strict
   * mode that mounts everything twice.
   */
  const scanned = useRef<PairingOffer | null>(readPairingFragment())

  useEffect(() => {
    void (async () => {
      const put = await readSetting<string[]>(HIDDEN_KEY)
      // Keys from before a conversation was named together with its project are dropped rather than
      // guessed at: which project's "main" one of them meant cannot be recovered, and the worst answer
      // would be to go on hiding the wrong one (see chatKey).
      const usable = put?.filter((key) => key.split(':').length >= 3) ?? []
      if (usable.length) setHidden(new Set(usable))

      const paired = await listAgents()
      setAgents(paired)

      // Straight to pairing when there is nobody to talk to: an empty list with no way out of it is the
      // worst first screen an application can have. A scanned code goes there too even when other IDEs
      // are already paired - a scan is somebody asking for this, whatever else is on the list.
      if (paired.length === 0 || scanned.current) setScreen({ at: 'pairing' })
    })()
  }, [])

  useEffect(() => {
    seen.current = feed.seq
  }, [feed.seq])

  /**
   * Move the running counters once a second - the panel has had this from the start (see the interval in
   * App.tsx at the desk), and the phone had nothing of the kind.
   *
   * Without it every duration on this screen only ever moved when the next message happened to arrive:
   * a call that takes a minute sat at "0.0s" for the whole of it, and a turn thinking quietly looked
   * stopped. Which is worse on a phone than at a desk - it is the screen someone picks up precisely to
   * find out whether the machine at home is still working.
   *
   * Counted in the IDE's time rather than this device's, for the reason the whole of clock.ts exists.
   *
   * Only while a conversation is actually on screen: the feed outlives the screen showing it, and a
   * phone left on the list of conversations would otherwise re-render the whole application once a
   * second over counters nobody is looking at.
   */
  const showingFeed = screen.at === 'thread' || screen.at === 'decide' || screen.at === 'tasks' || screen.at === 'agent'
  const ticking = feedTicks(feed) && showingFeed
  useEffect(() => {
    if (!ticking) return

    const id = window.setInterval(() => {
      const current = watching.current
      if (!current) return
      setFeed((previous) => tickFeed(previous, clockOf(current.agentId).now()))
    }, 1000)

    return () => window.clearInterval(id)
  }, [ticking, clockOf])

  /**
   * And the same second on the list of conversations, which counts too.
   *
   * A row says "working · 2m 40s" against the clock of the machine it lives on, and without this it
   * only moved when the IDE next sent an inventory - which it does when something changes and every
   * half minute besides. A counter that jumps thirty seconds at a time reads as a screen that has
   * stopped, on exactly the screen somebody picks up to see whether anything is still going.
   *
   * Only while that screen is up, and only while something is actually running on it: a phone left on a
   * quiet list would otherwise re-render the whole application once a second for nothing.
   */
  const counting =
    screen.at === 'sessions' &&
    Object.values(inventories).some((inventory) =>
      inventory.projects.some((project) => project.sessions.some((session) => session.status === 'running')),
    )

  useEffect(() => {
    if (!counting) return

    const id = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [counting])

  /**
   * What time it is on one paired IDE, for the list of conversations.
   *
   * Rebuilt on every tick above, and that is the point rather than a side effect: the durations on that
   * screen are worked out while it renders, so nothing moves unless the function that answers "what
   * time is it there" is a new one. `clockOf` returns the same object for the life of the connection.
   */
  const nowOf = useCallback(
    (agentId: string) => clockOf(agentId).now(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clockOf, tick],
  )

  /**
   * The IDE threw away what it had queued for this phone and asked it to come back for it.
   *
   * Everything that was in flight is gone, so both halves of what this screen shows have to be asked
   * for again: the list, and the conversation being watched - the latter from the number already
   * applied, so a conversation that was merely interrupted is not redrawn from its beginning.
   */
  const resync = useCallback((agentId: string) => {
    const link = links.current[agentId]
    if (!link) return

    link.refreshInventory()

    const current = watching.current
    if (current?.agentId === agentId) link.watch(current.projectKey, current.sessionId, seen.current)
  }, [])

  /**
   * Dictation (see useDictation and mobile/dictation.ts).
   *
   * The request for a token goes through a ref rather than through `command` directly, because the
   * address it needs - which agent, which project - is only known once a conversation is on screen,
   * while the hook itself has to exist before the handler below that answers it.
   */
  const askForToken = useRef<(id: string) => void>(() => undefined)
  const dictation = useDictation({ requestToken: useCallback((id: string) => askForToken.current(id), []) })

  /** The same, in reverse: the handler is built once and would otherwise hold the first hook it saw. */
  const grantArrived = useRef(dictation.grant)
  grantArrived.current = dictation.grant

  const receive = useCallback((agentId: string, message: ShellMessage, projectKey: string) => {
    // The one answer that belongs to a project rather than to a conversation, and the one that arrives
    // while nothing is being watched at all - the screen that asked for it is a list of past
    // conversations, not a feed.
    if (message.type === 'history') {
      setHistories((current) => ({ ...current, [`${agentId}:${projectKey}`]: message.conversations }))
      return
    }

    // The search's answer: to a request this phone made, about no conversation in particular (see
    // searchResults in protocol.ts) - taken before the guard below, like the history.
    if (message.type === 'searchResults') {
      if (message.id === searchAsked.current) {
        searchAsked.current = ''
        setSearchLoading(false)
        setSearchAnswer({
          hits: message.hits,
          terms: message.terms,
          counts: message.counts ?? EMPTY_COUNTS,
          total: message.total ?? message.hits.length,
          error: message.error ?? '',
          answered: true,
          scope: askedScope.current,
        })
      } else if (message.id === aiSearchRef.current.id) {
        setAiSearch((current) => ({ ...current, id: '', hits: message.hits, error: message.error ?? '', answered: true }))
      }
      return
    }

    // One step of the model's search, while it is still searching.
    if (message.type === 'searchProgress') {
      if (message.id === aiSearchRef.current.id) {
        setAiSearch((current) => ({ ...current, steps: [...current.steps, { kind: message.kind, subject: message.subject }] }))
      }
      return
    }

    // A token for dictating (see VoiceGrant): an answer to something this phone asked for, belonging to
    // no conversation, so it too is taken before the guard below.
    if (message.type === 'voiceGrant') {
      grantArrived.current(message)
      return
    }

    /*
     * The three screens about the machine rather than about a conversation.
     *
     * Taken before the guard below for the same reason the history is: none of these carries a session,
     * so the rule that turns away everything not addressed to the conversation on screen would throw
     * every one of them out. They arrive because the plugin lets them (see RemoteFeed.PROJECT_FACTS) -
     * cut down on the way: a server's command line and a marketplace's local folder never leave that
     * machine, and the plugin catalogue is trimmed to what a frame carries.
     */
    if (message.type === 'mcpServers') {
      setMcp((current) => ({ ...current, [agentId]: message.servers }))
      return
    }

    if (message.type === 'mcpActionResult') {
      setMcpNote({ ok: message.ok, text: message.message })
      return
    }

    // Where a connector's sign-in is finished - to this phone alone, for the row that asked (see Mcp).
    if (message.type === 'mcpSignIn') {
      setMcpSignIns((current) => ({ ...current, [message.name]: message.url }))
      return
    }

    if (message.type === 'plugins') {
      setPlugins((current) => ({
        ...current,
        [agentId]: { installed: message.installed, available: message.available },
      }))
      return
    }

    if (message.type === 'marketplaces') {
      setMarkets((current) => ({ ...current, [agentId]: message.marketplaces }))
      return
    }

    if (message.type === 'accounts') {
      setAccounts((current) => ({
        ...current,
        [agentId]: {
          accounts: message.accounts,
          capability: message.capability,
          current: message.current,
          pending: message.pending === true,
        },
      }))
      // Any answer at all ends the wait a press put up: the list is sent after every one of these
      // requests and already says what became of the row (see Accounts at the desk, same rule).
      setAccountNote('')
      return
    }

    if (message.type === 'accountOutcome') {
      setAccountNote(message.code)
      return
    }

    /*
     * A scenario request that could not be done, as a name this side has words for.
     *
     * Taken here with the screens above and for their reason: it belongs to no conversation, so the
     * guard below would throw it away. The shelves and the runs themselves are project facts and are
     * folded in further down (see isFact).
     */
    if (message.type === 'scenarioOutcome') {
      setScenarioNote(message.ok ? '' : message.code)
      return
    }

    /*
     * One scenario, whole, because this phone asked for it by name.
     *
     * The shelves travel with their prose cut out - it is the entire weight of that message - so the
     * editor asks (see `scenarioFetch`). Absent means it is on neither shelf any more; `tooBig` means it
     * would not fit a frame and was therefore not sent at all rather than sent short, which is the one
     * place on this road where shortening is forbidden: what the editor is shown is what it saves back.
     */
    if (message.type === 'scenarioFetched') {
      // Onto what the editor already knows - where it came from and where it goes (see openEditor).
      setEdit((current) =>
        current
          ? {
              ...current,
              draft: message.scenario ?? null,
              fresh: false,
              tooBig: message.tooBig === true,
              // The answer arrived, so a screen still holding nothing is holding nothing for a reason.
              gone: !message.scenario && message.tooBig !== true,
            }
          : current,
      )
      return
    }

    /*
     * What a model wrote out of a sentence. It opens in the editor unsaved: the person asked for a round
     * of work in one sentence and got back stages of instructions to agents, and Save is where they say
     * it is what they meant.
     */
    if (message.type === 'scenarioDrafted') {
      const asked = draftingRef.current
      if (asked.id !== message.id) return

      setDrafting((current) => ({ ...current, id: '', since: 0, error: message.error ?? '' }))
      if (message.scenario) {
        // On the shelf the sheet chose, whatever the machine's own choice was: the desk keeps a shelf of
        // its own for what a model writes (see ScenarioDesk.shelfFor), and it is not this phone's.
        setEdit({
          draft: { ...message.scenario, scope: asked.shelf.scope },
          fresh: true,
          tooBig: false,
          gone: false,
          origin: null,
          home: asked.home,
        })
        setScreen((current) =>
          current.at === 'scenarios'
            ? { at: 'scenarioEditor', agentId: current.agentId, projectKey: current.projectKey }
            : current,
        )
      }
      return
    }

    /* Saved: the shelves follow by themselves, so all this has to do is close the editor's memory. */
    if (message.type === 'scenarioSaved') {
      setEdit(null)
      return
    }

    /* One step's own conversation, cut to the end of it on the way over (see RemoteFeed.trimmedLog). */
    if (message.type === 'scenarioLog') {
      setStepLog({
        runId: message.runId,
        key: message.key,
        found: message.found,
        truncated: message.truncated,
        events: message.events,
      })
      return
    }

    // The project's own facts, which belong to no conversation at all and so must be taken before the
    // guard below turns everything without a matching sessionId away.
    if (isFact(message)) {
      const key = `${agentId}:${projectKey}`
      setFacts((current) => ({
        ...current,
        [key]: applyFact(current[key] ?? emptyFacts(), message, watchedRun.current),
      }))
      return
    }

    const current = watching.current
    if (!current || current.agentId !== agentId) return

    // The project as well as the conversation: an identifier is unique inside a project and nowhere
    // else - every project's first tab is "main" - so a message from another project's main tab would
    // otherwise be applied to the feed on screen.
    if (projectKey && projectKey !== current.projectKey) return

    // Messages about other conversations still arrive - the agent sends what a device subscribed to,
    // and a subscription changes a moment after the screen does.
    if ('sessionId' in message && typeof message.sessionId === 'string' && message.sessionId !== current.sessionId) {
      return
    }

    // A plan decided or a question answered - here rather than in the feed, exactly as at the desk: the
    // agent knows nothing about which cards a screen still counts as open, so it has no place in the
    // conversation's own state. Either device may have been the one that answered, and the other has to
    // stop saying that something is waiting for a person who has already dealt with it.
    // Whose subscription pays for this conversation. It carries a session, so it arrives here rather
    // than among the project's facts - and it is an opaque id, which is all a phone is ever told about
    // an account (see ClaudeSessionHub.sendAccount).
    if (message.type === 'account') {
      const key = chatKey(agentId, projectKey ?? current.projectKey, message.sessionId)
      setChatAccounts((held) => ({ ...held, [key]: message.accountId }))
    }

    if (message.type === 'planResolved') {
      cards.decidePlan(message.id, planDecisionOf(message.decision))
    }
    if (message.type === 'askResolved') {
      cards.answerAsk(message.id)
      // Answered - here, at the desk, or taken back by the agent: what was gathered has nowhere to go.
      setAskAnswers((held) => {
        if (held[message.id] === undefined) return held

        const next = { ...held }
        delete next[message.id]
        return next
      })
    }

    setFeed((previous) => applyMessage(previous, message, clockOf(agentId).now()))
  }, [clockOf, cards])

  /** Watch a conversation from the beginning and show it. */
  const enter = useCallback((agentId: string, projectKey: string, sessionId: string, decide: boolean) => {
    watching.current = { agentId, projectKey, sessionId }
    setFeed(emptyFeed())
    // A different conversation numbers its cards from the beginning again, so what was answered in the
    // one just left would otherwise be counted as answered here too (see CardState.reset).
    cards.reset()

    // From nothing: this screen has no feed for that conversation yet, so the whole of it is wanted.
    links.current[agentId]?.watch(projectKey, sessionId, 0)

    setScreen({ at: decide ? 'decide' : 'thread', agentId, projectKey, sessionId })
  }, [cards])

  /** How a request to open a closed project ended - see [startSession]. */
  const projectOpened = useCallback(
    (agentId: string, result: { sessionId: string; ok: boolean; projectKey?: string; error?: string }) => {
      setOpening((current) => {
        if (!current || current.agentId !== agentId || current.sessionId !== result.sessionId) return current

        if (result.ok && result.projectKey) {
          if (current.then) current.then(result.projectKey)
          else enter(agentId, result.projectKey, result.sessionId, false)
          return null
        }

        return { ...current, error: result.error || 'The IDE could not open that project.' }
      })
    },
    [enter],
  )

  // One connection per paired IDE, opened once and kept.
  useEffect(() => {
    for (const agent of agents) {
      if (links.current[agent.agentId]) continue

      const link = new Link(agent, {
        onMessage: (message, projectKey) => receive(agent.agentId, message as ShellMessage, projectKey),
        onInventory: (inventory) => {
          const list = inventory as Inventory
          // The inventory is also how this phone reads that machine's clock - it is the one thing the
          // IDE sends that says what time it is there now rather than when something happened, and it
          // arrives whenever a conversation changes state and every half minute besides (see clock.ts).
          if (list.at !== undefined) clockOf(agent.agentId).observe(list.at)
          setInventories((current) => ({ ...current, [agent.agentId]: list }))
        },
        onState: (state) => setStates((current) => ({ ...current, [agent.agentId]: state })),
        onProjectOpened: (result) => projectOpened(agent.agentId, result),
        onResync: () => resync(agent.agentId),
      })

      links.current[agent.agentId] = link
      void link.connect()
    }
  }, [agents, receive, projectOpened, resync, clockOf])

  /**
   * A pairing code scanned while this app was already open.
   *
   * The camera opens an address that differs from the one on screen by its fragment alone, and a
   * browser answers that by moving the fragment - not by loading the page again. So nothing read it:
   * the app went on showing the IDE it was already paired with, and the scan appeared to do nothing
   * until the page was reloaded by hand. An installed app makes it likelier still, since it is
   * generally already running.
   */
  useEffect(() => {
    const rescan = () => {
      const offer = readPairingFragment()
      if (!offer) return

      scanned.current = offer
      setScreen({ at: 'pairing' })
    }

    window.addEventListener('hashchange', rescan)
    // Coming back from the browser's own cache: the page was never unloaded, so nothing else fires.
    window.addEventListener('pageshow', rescan)

    return () => {
      window.removeEventListener('hashchange', rescan)
      window.removeEventListener('pageshow', rescan)
    }
  }, [])

  /**
   * Coming back to the app, and coming back to a network.
   *
   * A phone spends most of its life asleep in a pocket, and it wakes with a socket that is dead
   * without having said so. Checking the moment the screen is looked at is what makes the difference
   * between an app that works and one that shows a list from an hour ago - waiting out a backoff of up
   * to half a minute is not an option for something a person is holding.
   */
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== 'visible') return
      for (const link of Object.values(links.current)) link.wake()
    }

    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)

    return () => {
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
    }
  }, [])

  /**
   * Ask to watch this conversation again once the line to its IDE is back.
   *
   * A subscription belongs to a connection: the IDE keeps one per device, but a phone that dropped and
   * came back on new keys has to say what it is looking at, and it asks from the number it already has
   * rather than for the whole feed. Without this, coming out of a lift leaves the screen frozen on the
   * last thing that arrived before the signal went - with everything since sitting in the IDE unasked
   * for.
   */
  useEffect(() => {
    const current = watching.current
    const live = current ? states[current.agentId] === 'connected' : false
    const returned = live && !wasLive.current
    wasLive.current = live

    // Only on the way back. Every message changes the number this asks from, and the screen that opened
    // the conversation has already asked once - re-sending that on each of them would be a frame per
    // message for nothing.
    if (!current || !returned) return

    links.current[current.agentId]?.watch(current.projectKey, current.sessionId, feed.seq)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states])

  /**
   * Whether this phone can reach anything at all.
   *
   * The best of the paired IDEs rather than each one separately: the list already says how each one is
   * doing, and what this answers is the different question of why the screen might be empty. Without it
   * an unreachable relay and a quiet morning look exactly alike - and the empty state says "nothing to
   * show yet", which is a lie in the first case and sends someone looking for the fault in the IDE.
   */
  const reach = useMemo<LinkState | 'none'>(() => {
    if (agents.length === 0) return 'none'

    const order: LinkState[] = ['connected', 'connecting', 'reconnecting', 'asleep', 'elsewhere', 'offline']
    for (const state of order) {
      if (agents.some((agent) => (states[agent.agentId] ?? 'connecting') === state)) return state
    }

    return 'connecting'
  }, [agents, states])

  const paired = useMemo<AgentEntry[]>(
    () =>
      agents.map((agent) => ({
        agentId: agent.agentId,
        label: agent.label,
        state: states[agent.agentId] ?? 'connecting',
      })),
    [agents, states],
  )

  /**
   * Every project on every paired IDE, in the order it deserves attention - see buildProjects, where
   * the ordering itself lives and is tested.
   */
  const projects = useMemo<ProjectEntry[]>(
    () =>
      buildProjects(
        agents.map((agent) => ({ agentId: agent.agentId, label: agent.label })),
        inventories,
        states,
        hidden,
      ),
    [agents, inventories, states, hidden],
  )

  /** Put a conversation away, or bring back everything put away in one project. */
  const remember = useCallback((next: ReadonlySet<string>) => {
    setHidden(next)
    void writeSetting(HIDDEN_KEY, [...next])
  }, [])

  const hide = useCallback(
    (entry: SessionEntry) => remember(new Set([...hidden, chatKey(entry.agentId, entry.projectKey, entry.sessionId)])),
    [hidden, remember],
  )

  const showHidden = useCallback(
    (project: ProjectEntry) => {
      const inventory = inventories[project.agentId]
      const inThisProject = new Set(
        (inventory?.projects.find((one) => one.key === project.key)?.sessions ?? []).map((session) =>
          chatKey(project.agentId, project.key, session.id),
        ),
      )

      remember(new Set([...hidden].filter((one) => !inThisProject.has(one))))
    },
    [hidden, inventories, remember],
  )

  const open = useCallback((entry: SessionEntry) => enter(entry.agentId, entry.projectKey, entry.sessionId, entry.awaitsYou), [enter])

  const command = useCallback((agentId: string, projectKey: string, message: unknown) => {
    links.current[agentId]?.command(projectKey, message)
  }, [])

  /**
   * Ask an IDE about its MCP servers.
   *
   * The status is a question put to a running conversation - the servers are held by its process, and
   * only it knows their live state, exactly as `/mcp` in a terminal is asked of a session (see
   * ProjectCatalog.refreshMcp). So the request has to name one, and any of the project's will do:
   * whichever it names, the answer is about the project's servers.
   *
   * A project with no conversation at all in it has nothing to ask, and the screen says so by staying
   * empty rather than by sending a request that names a tab which does not exist.
   */
  const askMcp = useCallback(
    (agentId: string, projectKey: string) => {
      const sessionId = anySessionOf(projects, agentId, projectKey)
      if (!sessionId) return

      setMcpNote(null)
      command(agentId, projectKey, { type: 'mcpList', sessionId })
    },
    [projects, command],
  )

  /**
   * Open one of the three screens about the machine, asking for what it draws on the way in.
   *
   * Asked on every visit rather than once: each answer is read off that machine as it stands now - a
   * server that fell over a minute ago, an account whose window has moved - and a screen showing what
   * was true when the app started is the screen somebody came here to get away from. What is already
   * known stays on it meanwhile, so the visit does not begin with a blank.
   */
  /**
   * A fork of a whole conversation - the panel's `/fork`, from the sheet behind the open tab.
   *
   * Named after its parent: what the fork is about is what the parent was about, and the group's colour
   * bar and the indent already say which one grew out of which (see TabsSheet). The panel names a
   * bare fork by its number in the group; here the parent's title says more than "fork 2".
   */
  const forkWhole = useCallback(
    (agentId: string, projectKey: string, parentId: string) => {
      const sessionId = newSessionId()
      const parent = projects
        .find((item) => item.agentId === agentId && item.key === projectKey)
        ?.sessions.find((session) => session.sessionId === parentId)

      command(agentId, projectKey, {
        type: 'newSession',
        kind: 'fork',
        sessionId,
        parentId,
        // Empty when there is no parent to read: the IDE names such a tab itself, as it does a "+".
        title: deriveSessionTitle(parent?.title ?? '', 40),
      })

      enter(agentId, projectKey, sessionId, false)
    },
    [command, enter, projects],
  )

  /**
   * A conversation of one's own, carrying everything up to the message it was forked from.
   *
   * The same request the panel's "/fork" makes, and allowed over the wire for the same reason starting
   * a conversation is: it is no more than sending a message, which starts a process too (see
   * RemoteCommands). The name is guessed from the message it grew out of, by the panel's own rule -
   * a fork called "new session" is one nobody can tell from the next one.
   */
  const forkFrom = useCallback(
    (agentId: string, projectKey: string, parentId: string, item: FeedItem) => {
      const sessionId = newSessionId()

      command(agentId, projectKey, {
        type: 'newSession',
        kind: 'fork',
        sessionId,
        parentId,
        title: deriveSessionTitle(forkTitle(item)),
      })

      enter(agentId, projectKey, sessionId, false)
    },
    [command, enter],
  )

  /**
   * The project's scenarios, asking for the shelves on the way in.
   *
   * Asked on every visit even though they arrive by themselves: a phone that paired after the last one
   * was broadcast has never been told, and a screen that waits for the next change to a shelf would be
   * blank until somebody wrote a scenario at the desk. The live run needs no asking at all - it is
   * pushed as it moves (see RemoteFeed.PROJECT_FACTS).
   */
  const openScenarios = useCallback(
    (agentId: string, projectKey: string) => {
      setDrawer(false)
      setScenarioNote('')
      setScreen({ at: 'scenarios', agentId, projectKey })

      /*
       * Watching the PROJECT, with no conversation named.
       *
       * Everything this screen draws - the shelves, what is going, the hours - travels as the project's
       * own facts, and those are addressed by whatever a device has subscribed to (see
       * RemoteAgent.deliver). Opened straight from the menu, without a chat ever having been entered,
       * the screen was addressed by nothing and waited on "Loading…" until somebody at the desk changed
       * a shelf. An empty conversation is how a device says "the project itself".
       */
      links.current[agentId]?.watch(projectKey, '', 0)
      command(agentId, projectKey, { type: 'scenarios' })
    },
    [command],
  )

  /**
   * One run, asked for by name.
   *
   * The live one is already here - it arrives by itself - and asking for it again costs nothing and
   * saves the case that matters: a run opened straight from the list of past ones, which is a file on
   * that machine nobody has read yet.
   */
  const openRun = useCallback(
    (agentId: string, projectKey: string, runId: string) => {
      setScenarioNote('')
      // Named before the asking, not at the next render: the answer is what the screen is opened for,
      // and a record that arrives before the screen is known would be let go of as somebody else's.
      watchedRun.current = runId
      setScreen({ at: 'scenarioRun', agentId, projectKey, runId })
      command(agentId, projectKey, { type: 'scenarioOpen', runId })
    },
    [command],
  )

  /**
   * The editor, on a scenario asked for by name.
   *
   * Asked rather than taken off the shelves, because the shelves travel with their prose cut out: a
   * card's prompt is the whole weight of that message and no list draws a word of it. The screen opens
   * on nothing and fills in when the answer lands, which is the honest shape of a fetch.
   */
  const openEditor = useCallback(
    (agentId: string, projectKey: string, scenario: Scenario) => {
      setScenarioNote('')
      setEdit({
        draft: null,
        fresh: false,
        tooBig: false,
        gone: false,
        origin: { agentId, projectKey, scope: scenario.scope },
        home: { agentId, projectKey },
      })
      setScreen({ at: 'scenarioEditor', agentId, projectKey })
      command(agentId, projectKey, { type: 'scenarioFetch', id: scenario.id, scope: scenario.scope })
    },
    [command],
  )

  /**
   * And an empty one, which needs nothing from the machine: it is a form until Save is pressed.
   *
   * Made by the screen rather than here, because a blank scenario carries words - what it and its first
   * stage are called - and the words are chosen where they are drawn (this file has no dictionary; the
   * panel speaks ten languages and every one of its screens picks its own).
   */
  const openBlankEditor = useCallback(
    (agentId: string, projectKey: string, draft: Scenario, shelf: ShelfChoice) => {
      setScenarioNote('')
      setEdit({
        draft,
        fresh: true,
        tooBig: false,
        gone: false,
        origin: null,
        home: shelfHome(shelf, { agentId, projectKey }),
      })
      setScreen({ at: 'scenarioEditor', agentId, projectKey })
    },
    [],
  )

  /**
   * A closed project, opened for its scenarios: the window and nothing in it.
   *
   * A closed project's shelf is read through its hub, and the hub comes with the window - so picking a
   * closed repository on the scenarios screen opens it in the IDE, the way "Open & start" does, but with
   * no conversation started. The IDE answers with the key the project is open under (see
   * RemoteAgent.openProject), and [then] is told it; the closed key is of no use once it is open.
   */
  const openRepository = useCallback((agentId: string, projectKey: string, then: (opened: string) => void) => {
    setOpening({ agentId, sessionId: '', error: '', then })
    links.current[agentId]?.openProject(projectKey, '', '', EMPTY_LAUNCH)
  }, [])

  /**
   * Every project of every paired IDE, as a place a scenario may be kept - see RepositoryChoice.
   *
   * Whether one can take a shared scenario is known only once its shelves have arrived; until then it is
   * taken to be able to, and the machine answers with a refusal if it cannot - which is what it would
   * have answered anyway.
   */
  const repositories = useMemo<RepositoryChoice[]>(
    () =>
      projects.map((project) => ({
        agentId: project.agentId,
        projectKey: project.key,
        name: project.name,
        canShare: facts[`${project.agentId}:${project.key}`]?.scenarios?.canShare ?? true,
        closed: project.closed,
        // Whether that machine can open it for its shelves - a plugin older than this client answers
        // such a request with a refusal written for another cause (see CAP_OPEN_BARE).
        canOpen: (inventories[project.agentId]?.caps ?? []).includes(CAP_OPEN_BARE),
      })),
    [projects, facts, inventories],
  )

  const openMachineScreen = useCallback(
    (at: 'mcp' | 'plugins' | 'accounts', agentId: string, projectKey: string) => {
      setDrawer(false)
      setScreen({ at, agentId, projectKey })

      // Watching the PROJECT, with no conversation named - the same line as openScenarios and for the
      // same reason: every one of these answers is a fact of the project (see RemoteFeed.PROJECT_FACTS),
      // and a fact is delivered to what a device has subscribed to. Opened from the list of projects,
      // before any conversation had been entered, these three screens were subscribed to nothing and
      // waited on "Loading…" for an answer the IDE had sent to nobody.
      links.current[agentId]?.watch(projectKey, '', 0)

      if (at === 'mcp') askMcp(agentId, projectKey)
      if (at === 'plugins') {
        command(agentId, projectKey, { type: 'pluginList' })
        command(agentId, projectKey, { type: 'marketplaceList' })
      }
      if (at === 'accounts') {
        setAccountNote('')
        command(agentId, projectKey, { type: 'accountList' })
      }
    },
    [askMcp, command],
  )

  /*
   * Where a request for a dictation token goes: to whichever IDE the conversation on screen belongs to.
   *
   * Kept as a ref rather than passed into the hook because the hook is built once, while the address
   * changes with every conversation opened. Off any thread it points at nothing - a press elsewhere has
   * nowhere to put the words anyway.
   */
  useEffect(() => {
    askForToken.current =
      screen.at === 'thread' || screen.at === 'decide'
        ? (id: string) => command(screen.agentId, screen.projectKey, { type: 'voiceToken', id })
        : () => undefined
  }, [screen, command])

  /*
   * A dictation belongs to the conversation it was started in, and ends when that screen is left.
   *
   * It has to end rather than follow: the field it was filling is gone with the screen, so the words
   * would land in whichever draft happens to be mounted next - the phone's version of the mix-up the
   * panel guards against with voiceTargetRef. Ending it also releases the microphone, which a latched
   * dictation would otherwise hold for as long as the tab lived.
   */
  const leaveDictation = dictation.cancel
  /** Which conversation is on screen, as one string - the thing a dictation is tied to. */
  const dictatingIn = showingFeed ? `${screen.agentId}:${screen.projectKey}:${screen.sessionId}` : ''

  useEffect(() => {
    if (!dictatingIn) return undefined

    return () => leaveDictation()
  }, [dictatingIn, leaveDictation])

  /*
   * The page going away, or going behind another application.
   *
   * `pagehide` is the one that matters on a phone: a browser throws a backgrounded tab out without
   * warning, and everything in it - including an open microphone - would go with it silently. Hidden is
   * treated the same way rather than left running: a panel that goes on listening while somebody is in
   * another app is the behaviour nobody would forgive, whatever the intention was.
   */
  useEffect(() => {
    const stop = () => leaveDictation()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
    }

    window.addEventListener('pagehide', stop)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pagehide', stop)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [leaveDictation])

  /**
   * Start a conversation, opening the project first when it is not open.
   *
   * The identifier is made up here rather than asked for, exactly as the panel does it: the screen has
   * to answer the press at once, and a round trip before a conversation appears would be felt. It is
   * marked as this device's so that two clients inventing one in the same millisecond cannot collide.
   */
  const startSession = useCallback(
    (project: ProjectEntry, launch: SessionLaunch) => {
      const link = links.current[project.agentId]
      if (!link) return

      const sessionId = newSessionId()

      if (project.closed) {
        // The IDE has a window to open first, which takes seconds rather than milliseconds - so this
        // screen waits, says so, and is answered by a frame of its own (see projectOpened).
        setOpening({ agentId: project.agentId, sessionId, error: '' })
        link.openProject(project.key, sessionId, '', launch)
        return
      }

      // No name: an empty one leaves the tab called "new session" and, more to the point, marked as
      // never having been named - which is what makes the first message name it, here as at the desk.
      command(project.agentId, project.key, {
        type: 'newSession',
        kind: 'main',
        sessionId,
        title: '',
        ...launch,
      })

      enter(project.agentId, project.key, sessionId, false)
    },
    [command, enter],
  )

  /**
   * Stop being paired with an IDE.
   *
   * Local and immediate, the mirror of revoking a device from the IDE's side: with the keys gone
   * nothing from that agent opens, so nothing has to reach it and it need not be running. Asked about
   * first - a pairing is a QR code and two confirmations to make again.
   */
  const forget = useCallback((agentId: string) => {
    const agent = agents.find((one) => one.agentId === agentId)
    if (!window.confirm(`Forget ${agent?.label ?? 'this IDE'}? Pairing again needs the QR code.`)) return

    links.current[agentId]?.close()
    delete links.current[agentId]

    void forgetAgent(agentId)
    setAgents((current) => current.filter((one) => one.agentId !== agentId))
    setInventories((current) => {
      const rest = { ...current }
      delete rest[agentId]
      return rest
    })
  }, [agents])

  /**
   * Open a past conversation, in a tab of its own.
   *
   * Always its own, unlike at the desk: the panel reuses the tab in front of it when there is nothing in
   * it to lose (see resume in App.tsx), and from here there is no telling what is in the tab on that
   * screen at all.
   *
   * One request rather than three. The tab is opened by the same side that resumes the conversation, and
   * the name travels inside that request: sent separately it had to go last - resuming drops a tab's
   * name on purpose - and a frame that arrives out of order over the relay was a tab called "New chat".
   */
  const openPast = useCallback(
    (agentId: string, projectKey: string, entry: HistoryEntry) => {
      // Already open on that machine - then this is "take me there": the history lists open conversations
      // too, and a second tab on one transcript is two processes writing over each other.
      const project = projects.find((item) => item.agentId === agentId && item.key === projectKey)
      const open = tabHolding(
        entry.id,
        (project?.sessions ?? []).map((session) => ({ id: session.sessionId })),
        (tab) => project?.sessions.find((session) => session.sessionId === tab)?.conversation,
      )

      if (open) {
        enter(agentId, projectKey, open, false)
        return
      }

      const sessionId = newSessionId()
      const title = deriveSessionTitle(entry.title, 40)
      const titleSource = entry.titleSource === 'heuristic' ? 'heuristic' : 'llm'

      // A project the IDE is not holding open has to be opened first, and the conversation travels with
      // that request rather than after it - the window takes seconds, and a phone waiting to send the
      // second half loses it the moment the screen goes off (see RemoteAgent.openProject). The screen
      // waits the same way it waits for a conversation started in a closed project, and is answered by
      // the same frame (see projectOpened).
      if (project?.closed) {
        setOpening({ agentId, sessionId, error: '' })
        links.current[agentId]?.openProject(projectKey, sessionId, title, EMPTY_LAUNCH, {
          conversationId: entry.id,
          titleSource,
        })
        return
      }

      command(agentId, projectKey, {
        type: 'resumeSession',
        sessionId,
        conversationId: entry.id,
        title,
        titleSource,
      })

      enter(agentId, projectKey, sessionId, false)
    },
    [command, enter, projects],
  )

  /**
   * The conversation above what this phone holds - the same hook the panel uses (see useEarlierPages).
   *
   * Stated up here, before the screens branch off, because a hook cannot hang off which screen is open;
   * off a thread there is simply nothing to anchor a request on, and the mark is a plain caption anyway.
   */
  const thread = screen.at === 'thread' ? screen : undefined
  const { loadEarlier } = useEarlierPages(
    feed.state,
    thread ? chatKey(thread.agentId, thread.projectKey, thread.sessionId) : '',
    (before) => {
      if (!thread) return
      command(thread.agentId, thread.projectKey, {
        type: 'historyPage',
        sessionId: thread.sessionId,
        before,
      })
    },
  )

  // --- The search --------------------------------------------------------------------

  /* A typed query goes out a moment after the typing pauses - the panel's own rule (see App.tsx). */
  useEffect(() => {
    if (!search.open || search.tab === 'ai') return
    const query = search.query.trim()
    if (!query) {
      searchAsked.current = ''
      setSearchLoading(false)
      setSearchAnswer({ hits: [], terms: [], counts: EMPTY_COUNTS, total: 0, error: '', answered: false, scope: '' })
      return
    }

    const scope = search.tab
    const { matchCase, wholeWords } = search
    const timer = setTimeout(() => {
      const id = `s-${(searchSeq.current += 1)}`
      searchAsked.current = id
      askedScope.current = scope
      setSearchLoading(true)
      command(search.agentId, search.projectKey, { type: 'search', id, sessionId: search.sessionId, scope, query, matchCase, wholeWords })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [search.open, search.tab, search.query, search.matchCase, search.wholeWords, search.agentId, search.projectKey, search.sessionId, command])

  const openSearch = useCallback((agentId: string, projectKey: string, sessionId: string) => {
    setSearch((current) => ({
      ...current,
      open: true,
      agentId,
      projectKey,
      sessionId,
      // Over a project's history there is no "this chat" to search; over a thread the tab follows the
      // conversation it was last used on.
      tab: sessionId ? (current.sessionId === sessionId ? current.tab : 'chat') : current.tab === 'chat' ? 'project' : current.tab,
    }))
  }, [])

  const closeSearch = useCallback(() => setSearch((current) => ({ ...current, open: false })), [])

  const runAiSearch = useCallback(() => {
    const query = search.aiQuery.trim()
    if (!query) return
    const id = `a-${(searchSeq.current += 1)}`
    setAiSearch({ id, hits: [], error: '', answered: false, steps: [], startedAt: Date.now() })
    setAiSeconds(0)
    command(search.agentId, search.projectKey, { type: 'searchAi', id, sessionId: search.sessionId, query })
  }, [search.aiQuery, search.agentId, search.projectKey, search.sessionId, command])

  const cancelAiSearch = useCallback(() => {
    const id = aiSearchRef.current.id
    if (!id) return
    command(search.agentId, search.projectKey, { type: 'searchCancel', id })
    setAiSearch((current) => ({ ...current, id: '' }))
  }, [search.agentId, search.projectKey, command])

  /** The conversation on screen, as one string - what a capsule and a jump are tied to. */
  const threadKey = thread ? chatKey(thread.agentId, thread.projectKey, thread.sessionId) : ''

  /** The conversation behind the thread on screen, if the IDE has named one yet (see SessionEntry.conversation). */
  const threadConversation = thread
    ? projects
        .find((project) => project.agentId === thread.agentId && project.key === thread.projectKey)
        ?.sessions.find((one) => one.sessionId === thread.sessionId)?.conversation
    : undefined

  /**
   * A hit chosen: the window folds into the capsule and the thread goes to the hit.
   *
   * A hit in another conversation opens it the way the history does from here - the tab already
   * holding it, else a tab of its own (see openPast) - and the jump waits for that feed to arrive.
   */
  const jumpToHit = useCallback(
    (hit: SearchHit, terms: PaintedTerm[], all: readonly SearchHit[]) => {
      const project = projects.find((item) => item.agentId === search.agentId && item.key === search.projectKey)
      const hits = chatHits(all, hit.conversationId)
      const at = Math.max(0, hits.findIndex((one) => one.uuid === hit.uuid))
      const onScreen =
        thread &&
        thread.agentId === search.agentId &&
        thread.projectKey === search.projectKey &&
        project?.sessions.find((one) => one.sessionId === thread.sessionId)?.conversation === hit.conversationId

      setSearch((current) => ({ ...current, open: false }))

      if (onScreen) {
        const key = chatKey(thread.agentId, thread.projectKey, thread.sessionId)
        setCapsule({ key, terms, note: 'none', hits, at })
        const row = rowOf(feed.state.items, hit)
        if (row) {
          jumping.current = null
          setFeedFocus({ key, row, nonce: Date.now() })
        } else {
          jumping.current = { key, hit, pages: 0 }
          setCapsule((current) => (current ? { ...current, note: 'loading' } : current))
          setJumpTick((tick) => tick + 1)
        }
        return
      }

      const held = tabHolding(
        hit.conversationId,
        (project?.sessions ?? []).map((session) => ({ id: session.sessionId })),
        (tab) => project?.sessions.find((session) => session.sessionId === tab)?.conversation,
      )
      const sessionId = held ?? newSessionId()
      const key = chatKey(search.agentId, search.projectKey, sessionId)
      setCapsule({ key, terms, note: 'loading', hits, at })
      jumping.current = { key, hit, pages: 0 }

      if (held) {
        enter(search.agentId, search.projectKey, held, false)
        return
      }

      command(search.agentId, search.projectKey, {
        type: 'resumeSession',
        sessionId,
        conversationId: hit.conversationId,
        title: deriveSessionTitle(hit.title, 40),
        titleSource: hit.named ? 'llm' : 'heuristic',
      })
      enter(search.agentId, search.projectKey, sessionId, false)
    },
    [projects, search.agentId, search.projectKey, thread, feed.state.items, enter, command],
  )

  /** One hit up or down this conversation - the capsule's arrows, by the panel's rule (see stepHit in App.tsx). */
  const stepHit = useCallback(
    (direction: -1 | 1) => {
      if (!capsule || capsule.hits.length < 2) return
      const at = (capsule.at + direction + capsule.hits.length) % capsule.hits.length
      const hit = capsule.hits[at]!
      const row = rowOf(feed.state.items, hit)
      if (row) {
        jumping.current = null
        setCapsule({ ...capsule, at, note: 'none' })
        setFeedFocus({ key: capsule.key, row, nonce: Date.now() })
        return
      }

      jumping.current = { key: capsule.key, hit, pages: 0 }
      setCapsule({ ...capsule, at, note: 'loading' })
      setJumpTick((tick) => tick + 1)
    },
    [capsule, feed.state.items],
  )

  /** The search over and done with - the panel's own rule (see resetSearch in App.tsx). */
  const resetSearch = useCallback(() => {
    jumping.current = null
    setCapsule(null)
    cancelAiSearch()
    setSearch((current) => ({ ...current, open: false, query: '', aiQuery: '' }))
    setSearchAnswer({ hits: [], terms: [], counts: EMPTY_COUNTS, total: 0, error: '', answered: false, scope: '' })
    setAiSearch({ id: '', hits: [], error: '', answered: false, steps: [], startedAt: 0 })
  }, [cancelAiSearch])

  // The conversation the capsule stands on is gone - the search goes with it, the panel's own rule (see App.tsx).
  useEffect(() => {
    if (!capsule) return
    const alive = projects.some((project) =>
      project.sessions.some((session) => chatKey(project.agentId, project.key, session.sessionId) === capsule.key),
    )
    if (!alive) resetSearch()
  }, [projects, capsule, resetSearch])

  /*
   * A jump still on its way - the panel's own rule (see App.tsx): once the feed on screen holds the
   * conversation, the row is looked for after every change, one more page is asked for while it is not
   * there, and at the beginning or the limit the capsule says so.
   */
  useEffect(() => {
    const pending = jumping.current
    if (!pending || pending.key !== threadKey || !feed.loaded) return
    const onScreen = projects
      .find((project) => thread && project.agentId === thread.agentId && project.key === thread.projectKey)
      ?.sessions.find((one) => thread && one.sessionId === thread.sessionId)?.conversation
    if (onScreen !== pending.hit.conversationId && feed.state.sessionId !== pending.hit.conversationId) return

    const row = rowOf(feed.state.items, pending.hit)
    if (row) {
      jumping.current = null
      setFeedFocus({ key: threadKey, row, nonce: Date.now() })
      setCapsule((current) => (current && current.key === threadKey ? { ...current, note: 'none' } : current))
      return
    }

    if (feed.state.reachedStart || pending.pages >= JUMP_PAGE_LIMIT) {
      jumping.current = null
      setCapsule((current) => (current && current.key === threadKey ? { ...current, note: 'missing' } : current))
      return
    }

    if (loadEarlier) {
      pending.pages += 1
      loadEarlier()
    }
  }, [threadKey, feed.loaded, feed.state.sessionId, feed.state.items, feed.state.reachedStart, loadEarlier, projects, thread, jumpTick])

  const capsuleProps =
    capsule && capsule.key === threadKey
      ? {
          note: capsule.note,
          count: capsule.hits.length,
          at: capsule.at,
          onStep: stepHit,
          onOpen: () => setSearch((current) => ({ ...current, open: true })),
          onClose: resetSearch,
        }
      : undefined

  const searchWindow = search.open ? (
    <Search
      tab={search.tab}
      onTab={(tab) => setSearch((current) => ({ ...current, tab }))}
      query={search.query}
      onQuery={(query) => setSearch((current) => ({ ...current, query }))}
      matchCase={search.matchCase}
      wholeWords={search.wholeWords}
      onMatchCase={(matchCase) => setSearch((current) => ({ ...current, matchCase }))}
      onWholeWords={(wholeWords) => setSearch((current) => ({ ...current, wholeWords }))}
      hits={searchAnswer.hits}
      answerScope={searchAnswer.scope}
      counts={searchAnswer.counts}
      total={aiSearch.answered && search.tab === 'ai' ? aiSearch.hits.length : searchAnswer.total}
      loading={searchLoading}
      answered={searchAnswer.answered}
      error={searchAnswer.error}
      aiQuery={search.aiQuery}
      onAiQuery={(aiQuery) => setSearch((current) => ({ ...current, aiQuery }))}
      aiHits={aiSearch.hits}
      aiRunning={aiSearch.id !== ''}
      aiError={aiSearch.error}
      aiAnswered={aiSearch.answered}
      aiSteps={aiSearch.steps}
      aiSeconds={aiSeconds}
      onRunAi={runAiSearch}
      onCancelAi={cancelAiSearch}
      hasChat={search.sessionId !== '' && Boolean(threadConversation)}
      onPick={(hit) =>
        search.tab === 'ai' ? jumpToHit(hit, [], aiSearch.hits) : jumpToHit(hit, searchAnswer.terms, searchAnswer.hits)
      }
      onClose={resetSearch}
      onDismiss={closeSearch}
    />
  ) : null

  const home = useCallback(() => {
    watching.current = null
    setOpening(null)
    setScreen({ at: 'sessions' })

    // The IDE pushes the list whenever it changes, so this is not what keeps the screen up to date. It
    // is for this moment alone: walking back onto a list one has just changed, where a frame in flight
    // and a frame not yet sent look the same and neither deserves a person's doubt.
    for (const link of Object.values(links.current)) link.refreshInventory()
  }, [])

  /**
   * One step back, by where the step is taken from.
   *
   * A stack of screens rather than a list of them, because that is what the back arrow promises: a
   * subagent came from the task list, the task list came from the conversation, the conversation came
   * from the list of projects. Written out rather than kept as a history of visits: a history remembers
   * the way in, and the way in is not always the way out - a conversation opened straight onto its
   * decision from the band at the top of the first screen belongs back at that screen, not at a thread
   * nobody asked for.
   *
   * The three screens about the machine go back to the menu they were opened from, which is where the
   * next one is: closing the drawer to open it again would be the app forgetting where it just was.
   */
  const back = useCallback(() => {
    setSheet('')

    setScreen((current) => {
      if (current.at === 'agent') return { ...current, at: 'tasks' }
      if (current.at === 'tasks') return { ...current, at: 'thread' }
      if (current.at === 'decide') return { ...current, at: 'thread' }

      // A run came from the list of them, which is where the next one is - and where the shelves are.
      if (current.at === 'scenarioRun') return { ...current, at: 'scenarios' }
      // And a step came from the run it belongs to. The log goes with it: a screen opened on the next
      // step must not show the one before it while its own answer is on the way.
      if (current.at === 'scenarioStep') {
        setStepLog(null)
        return { at: 'scenarioRun', agentId: current.agentId, projectKey: current.projectKey, runId: current.runId }
      }
      // A card came from the editor, which stays open behind it - nothing is saved by walking back.
      if (current.at === 'scenarioCard') {
        return { at: 'scenarioEditor', agentId: current.agentId, projectKey: current.projectKey }
      }
      // And the editor goes back to the shelves, dropping what it was holding: leaving it is the same
      // decision as Cancel at the desk, and a draft kept behind an editor nobody is in would reopen over
      // whatever is there the next time.
      if (current.at === 'scenarioEditor') {
        setEdit(null)
        return { at: 'scenarios', agentId: current.agentId, projectKey: current.projectKey }
      }

      if (
        current.at === 'mcp' ||
        current.at === 'plugins' ||
        current.at === 'accounts' ||
        current.at === 'scenarios'
      ) {
        setDrawer(true)
        return { at: 'sessions' }
      }

      watching.current = null
      setOpening(null)
      for (const link of Object.values(links.current)) link.refreshInventory()

      return { at: 'sessions' }
    })
  }, [])

  /*
   * The language of every screen below.
   *
   * It is not this device's choice: the phone is shown the language chosen at the desk (see
   * facts.locale and RemoteCommands, which refuses `setLanguage` from here). Taken from the
   * project in view, or from whatever project has already said, so that the list of chats speaks
   * the right language before any one of them is opened.
   */
  const spoken = localeOf(facts, screen)
  const locale = activeLocale(spoken?.chosen, spoken?.ide)

  /*
   * And the gauges' paint, by the same rule and for the same reason: the mode belongs to the person, is
   * set at the desk and cannot be set from here (see RemoteCommands). Answered by any project that has
   * said, like the language above - somebody who switched the red off on their machine should not meet
   * it on the list of chats, which belongs to no project at all.
   */
  useCalmColors(calmOf(facts, screen) === true)

  const body = (() => {
    if (screen.at === 'pairing') {
      return (
        <Pairing
          offer={scanned.current}
          onPaired={(agent: PairedAgent) => {
            scanned.current = null
            setAgents((current) => [...current.filter((one) => one.agentId !== agent.agentId), agent])
            setScreen({ at: 'sessions' })
          }}
          onCancel={agents.length > 0 ? () => setScreen({ at: 'sessions' }) : undefined}
        />
      )
    }

    const list = (
      <div className={m.screen}>
        <Projects
          agents={paired}
          projects={projects}
          facts={facts}
          reach={reach}
          now={nowOf}
          onOpen={open}
          onDecide={(entry) => enter(entry.agentId, entry.projectKey, entry.sessionId, true)}
          onNew={(project) => setScreen({ at: 'new', agentId: project.agentId, projectKey: project.key })}
          onMenu={() => setDrawer(true)}
          onSearch={(project) => openSearch(project.agentId, project.key, '')}
          onRun={(project, runId) => openRun(project.agentId, project.key, runId)}
          onHide={hide}
          onShowHidden={showHidden}
          onHistory={(project) => {
            // Asked for on every visit: it is read off that machine's disk, and a conversation held at the
            // desk five minutes ago should be on the list rather than one refresh away.
            //
            // A closed project asks by a kind of its own: an ordinary command is handed to that project's
            // hub, and a project the IDE is not holding open has none. The disk has the transcripts
            // either way (see RemoteAgent.recentHistory).
            if (project.closed) {
              links.current[project.agentId]?.recentHistory(project.key)
            } else {
              command(project.agentId, project.key, { type: 'history' })
            }

            setScreen({ at: 'history', agentId: project.agentId, projectKey: project.key })
          }}
        />
      </div>
    )

    if (screen.at === 'sessions') return list

    if (screen.at === 'mcp') {
      return (
        <div className={m.screen}>
          <Mcp
            servers={mcp[screen.agentId] ?? null}
            message={mcpNote}
            signIns={mcpSignIns}
            project={projectNameOf(projects, screen.agentId, screen.projectKey)}
            onRefresh={() => askMcp(screen.agentId, screen.projectKey)}
            onReconnect={(name) =>
              command(screen.agentId, screen.projectKey, {
                type: 'mcpReconnect',
                sessionId: anySessionOf(projects, screen.agentId, screen.projectKey),
                name,
              })
            }
            onAuthenticate={(name) => {
              setMcpNote(null)
              command(screen.agentId, screen.projectKey, {
                type: 'mcpAuthenticate',
                sessionId: anySessionOf(projects, screen.agentId, screen.projectKey),
                name,
              })
            }}
            onRemove={(name) =>
              command(screen.agentId, screen.projectKey, {
                type: 'mcpRemove',
                sessionId: anySessionOf(projects, screen.agentId, screen.projectKey),
                name,
              })
            }
            onAdd={(name, cmd, transport) =>
              command(screen.agentId, screen.projectKey, {
                type: 'mcpAdd',
                sessionId: anySessionOf(projects, screen.agentId, screen.projectKey),
                name,
                command: cmd,
                transport,
              })
            }
            onBack={back}
          />
        </div>
      )
    }

    if (screen.at === 'plugins') {
      const held = plugins[screen.agentId]

      return (
        <div className={m.screen}>
          <Plugins
            installed={held?.installed ?? null}
            available={held?.available ?? []}
            marketplaces={markets[screen.agentId] ?? null}
            project={projectNameOf(projects, screen.agentId, screen.projectKey)}
            onBack={back}
          />
        </div>
      )
    }

    if (screen.at === 'accounts') {
      const book = facts[`${screen.agentId}:${screen.projectKey}`]?.usage
      const held = accounts[screen.agentId] ?? null

      return (
        <div className={m.screen}>
          <Accounts
            state={held}
            usage={(id): UsageFacts => (book ? usageOf(book, id) : {})}
            note={accountNote}
            paying={paying(held, chatAccounts, projects, screen.agentId)}
            onUse={(id) => command(screen.agentId, screen.projectKey, { type: 'accountUse', id })}
            onRename={(id, alias) =>
              command(screen.agentId, screen.projectKey, { type: 'accountRename', id, alias })
            }
            onForget={(id) => command(screen.agentId, screen.projectKey, { type: 'accountForget', id })}
            onLogout={(id) => command(screen.agentId, screen.projectKey, { type: 'accountLogout', id })}
            onBack={back}
          />
        </div>
      )
    }

    if (screen.at === 'scenarios') {
      const at = screen
      const held = facts[`${at.agentId}:${at.projectKey}`]

      return (
        <div className={m.screen}>
          <Scenarios
            shelves={held?.scenarios ?? null}
            live={liveRunsOf(held)}
            project={projectNameOf(projects, at.agentId, at.projectKey)}
            repository={{ agentId: at.agentId, projectKey: at.projectKey }}
            repositories={repositories}
            // Another repository is the same screen opened over another project: its shelves are that
            // project's facts, and watching it is how they arrive (see openScenarios).
            onPickRepository={openScenarios}
            onOpenRepository={(repo, then) => openRepository(repo.agentId, repo.projectKey, then)}
            opening={{
              going: opening !== null && opening.sessionId === '' && opening.error === '',
              error: opening !== null && opening.sessionId === '' ? opening.error : '',
            }}
            problem={scenarioNote}
            draftingSince={drafting.since}
            draftError={drafting.error}
            onOpenRun={(runId) => openRun(at.agentId, at.projectKey, runId)}
            onRun={(scenario, inputs) =>
              command(at.agentId, at.projectKey, {
                type: 'scenarioRun',
                id: scenario.id,
                scope: scenario.scope,
                inputs,
              })
            }
            onSchedule={(scenario, scheduleId, hour, inputs) =>
              command(at.agentId, at.projectKey, {
                type: 'scenarioSchedule',
                scenarioId: scenario.id,
                scope: scenario.scope,
                scheduleId,
                at: hour.at,
                repeat: hour.repeat,
                weekday: hour.weekday,
                inputs,
              })
            }
            onUnschedule={(scheduleId) =>
              command(at.agentId, at.projectKey, { type: 'scenarioUnschedule', scheduleId })
            }
            onEdit={(scenario) => openEditor(at.agentId, at.projectKey, scenario)}
            onNew={(draft, shelf) => openBlankEditor(at.agentId, at.projectKey, draft, shelf)}
            onDraft={(description, shelf) => {
              const id = `draft-${Date.now().toString(36)}`
              // Asked of the project it is to be kept in: the model reads that project while it writes
              // (see ScenarioAuthor), and a scenario for one repository written by reading another is a
              // plausible round of work for a project that does not exist.
              const home = shelfHome(shelf, { agentId: at.agentId, projectKey: at.projectKey })
              setDrafting({ id, since: Date.now(), error: '', shelf, home })
              command(home.agentId, home.projectKey, { type: 'scenarioDraft', id, description })
            }}
            onCancelDraft={() => {
              if (drafting.id) {
                command(drafting.home.agentId, drafting.home.projectKey, { type: 'scenarioDraftCancel', id: drafting.id })
              }
              setDrafting((current) => ({ ...current, id: '', since: 0, error: '' }))
            }}
            onDuplicate={(scenario) =>
              command(at.agentId, at.projectKey, {
                type: 'scenarioDuplicate',
                id: scenario.id,
                scope: scenario.scope,
              })
            }
            onDelete={(scenario) =>
              command(at.agentId, at.projectKey, { type: 'scenarioDelete', id: scenario.id, scope: scenario.scope })
            }
            onPause={(runId) => command(at.agentId, at.projectKey, { type: 'scenarioPause', runId })}
            onResume={(runId) => command(at.agentId, at.projectKey, { type: 'scenarioResume', runId })}
            onStop={(runId) => command(at.agentId, at.projectKey, { type: 'scenarioStop', runId })}
            onBack={back}
          />
        </div>
      )
    }

    if (screen.at === 'scenarioRun') {
      const at = screen

      return (
        <div className={m.screen}>
          <ScenarioRun
            run={facts[`${at.agentId}:${at.projectKey}`]?.runs?.[at.runId] ?? null}
            problem={scenarioNote}
            onPause={() => command(at.agentId, at.projectKey, { type: 'scenarioPause', runId: at.runId })}
            onResume={() => command(at.agentId, at.projectKey, { type: 'scenarioResume', runId: at.runId })}
            onStop={() => command(at.agentId, at.projectKey, { type: 'scenarioStop', runId: at.runId })}
            onContinue={() => command(at.agentId, at.projectKey, { type: 'scenarioContinue', runId: at.runId })}
            // The main thread's conversation, opened the way one is opened from the history: in a tab of
            // its own on that machine, under the run's name (see openPast).
            onOpenChat={() => {
              const run = facts[`${at.agentId}:${at.projectKey}`]?.runs?.[at.runId]
              if (!run?.headConversationId) return
              openPast(at.agentId, at.projectKey, {
                id: run.headConversationId,
                title: run.scenarioName,
                updatedAt: run.finishedAt || run.startedAt,
                messages: 0,
                titleSource: 'heuristic',
              })
            }}
            onAnswer={(allow, text) =>
              command(at.agentId, at.projectKey, { type: 'scenarioAnswer', runId: at.runId, allow, text })
            }
            onOpenStep={(step) => {
              setStepLog(null)
              setScreen({
                at: 'scenarioStep',
                agentId: at.agentId,
                projectKey: at.projectKey,
                runId: at.runId,
                key: step.key,
              })
              command(at.agentId, at.projectKey, {
                type: 'scenarioLog',
                runId: at.runId,
                key: step.key,
                conversationId: step.conversationId,
              })
            }}
            onBack={back}
          />
        </div>
      )
    }

    if (screen.at === 'scenarioStep') {
      const at = screen
      const run = facts[`${at.agentId}:${at.projectKey}`]?.runs?.[at.runId] ?? null

      return (
        <div className={m.screen}>
          <ScenarioStep
            step={run?.steps.find((one) => one.key === at.key) ?? null}
            log={stepLog && stepLog.runId === at.runId && stepLog.key === at.key ? stepLog : null}
            onOpenLink={(url) => window.open(url, '_blank', 'noopener')}
            onBack={back}
          />
        </div>
      )
    }

    if (screen.at === 'scenarioEditor') {
      const at = screen
      const held = facts[`${at.agentId}:${at.projectKey}`]

      return (
        <div className={m.screen}>
          <ScenarioEditor
            draft={edit?.draft ?? null}
            fresh={edit?.fresh === true}
            tooBig={edit?.tooBig === true}
            gone={edit?.gone === true}
            shelf={
              edit?.draft?.scope === 'project' && edit.home
                ? { scope: 'project', agentId: edit.home.agentId, projectKey: edit.home.projectKey }
                : { scope: 'user' }
            }
            repositories={repositories}
            models={inventories[at.agentId]?.models ?? null}
            customModels={held?.customModels ?? []}
            onChange={(draft) => setEdit((current) => (current ? { ...current, draft } : current))}
            onShelf={(shelf) => {
              const keep = (chosen: ShelfChoice) =>
                setEdit((current) =>
                  current && current.draft
                    ? {
                        ...current,
                        draft: { ...current.draft, scope: chosen.scope },
                        home: shelfHome(chosen, { agentId: at.agentId, projectKey: at.projectKey }),
                      }
                    : current,
                )

              // A closed repository is opened first, and kept under the key it is open under. A machine
              // that cannot open one does not offer the row at all (see shelfOptions), so this only
              // guards against being asked anyway.
              const chosen =
                shelf.scope === 'project'
                  ? repositories.find((one) => one.agentId === shelf.agentId && one.projectKey === shelf.projectKey)
                  : undefined
              if (chosen?.closed && !chosen.canOpen) return
              if (shelf.scope === 'project' && chosen?.closed) {
                openRepository(shelf.agentId, shelf.projectKey, (key) =>
                  keep({ scope: 'project', agentId: shelf.agentId, projectKey: key }),
                )
              } else {
                keep(shelf)
              }
            }}
            onOpenCard={(stageId, cardId) =>
              setScreen({ at: 'scenarioCard', agentId: at.agentId, projectKey: at.projectKey, stageId, cardId })
            }
            onSave={(draft) => {
              // Through the project that holds the shelf: a repository's own, or this screen's for the
              // shelf every project shares - which is the same folder from any of that machine's.
              const target =
                draft.scope === 'project' && edit?.home ? edit.home : { agentId: at.agentId, projectKey: at.projectKey }

              command(target.agentId, target.projectKey, { type: 'scenarioSave', scenario: draft, scope: draft.scope })

              /*
               * Moved off another project's shelf: the copy there goes.
               *
               * Only where the store that saves it cannot reach the copy itself. Between its own two
               * shelves it does the moving (see ScenarioStore.save) - and the shared shelf is one folder
               * for every project of a machine, so a copy there is that store's to remove too. A copy in
               * another repository, or on another machine, is not.
               */
              const from = edit?.origin
              const elsewhere =
                from !== null &&
                from !== undefined &&
                (from.agentId !== target.agentId || (from.scope === 'project' && from.projectKey !== target.projectKey))
              if (from && elsewhere) {
                command(from.agentId, from.projectKey, { type: 'scenarioDelete', id: draft.id, scope: from.scope })
              }

              // Landing where it was put, so that the saved scenario is on the screen that opens.
              openScenarios(target.agentId, target.projectKey)
            }}
            onBack={back}
          />
        </div>
      )
    }

    if (screen.at === 'scenarioCard') {
      const at = screen
      const held = facts[`${at.agentId}:${at.projectKey}`]
      // The editor's own draft, which is where the card lives: walking back to it must find the change.
      if (!edit?.draft) return list

      return (
        <div className={m.screen}>
          <ScenarioCardScreen
            draft={edit.draft}
            stageId={at.stageId}
            cardId={at.cardId}
            models={inventories[at.agentId]?.models ?? null}
            customModels={held?.customModels ?? []}
            onChange={(draft) => setEdit((current) => (current ? { ...current, draft } : current))}
            onBack={back}
          />
        </div>
      )
    }

    if (screen.at === 'history') {
      const project = projects.find((one) => one.agentId === screen.agentId && one.key === screen.projectKey)
      if (!project) return list

      return (
        <div className={m.screen}>
          <History
            project={project}
            conversations={histories[`${screen.agentId}:${screen.projectKey}`] ?? null}
            busy={opening !== null && opening.error === ''}
            error={opening?.error ?? ''}
            onOpen={(entry) => openPast(screen.agentId, screen.projectKey, entry)}
            onBack={back}
            onSearch={
              // A closed project has no hub, so nothing on that machine holds an index of it to search
              // (see SearchDesk): the button is left off rather than left dead.
              project.closed ? undefined : () => openSearch(screen.agentId, screen.projectKey, '')
            }
          />
        </div>
      )
    }

    if (screen.at === 'new') {
      const project = projects.find((one) => one.agentId === screen.agentId && one.key === screen.projectKey)
      const inventory = inventories[screen.agentId]

      // The project has gone from the list while this screen stood open - closed at the desk, or the IDE
      // stopped answering. There is nothing to start in it, and pretending otherwise ends in a request
      // that is refused for reasons this screen cannot explain.
      if (!project) return list

      return (
        <div className={m.screen}>
          <NewSession
            project={project}
            models={inventory?.models ?? null}
            customModels={customModelsOf(facts, screen.agentId, screen.projectKey)}
            prefs={inventory?.prefs ?? EMPTY_LAUNCH}
            busy={opening !== null && opening.error === ''}
            error={opening?.error ?? ''}
            onStart={(launch) => startSession(project, launch)}
            onBack={back}
          />
        </div>
      )
    }

    // Inside the project it belongs to rather than across all of them: with one identifier per project
    // ("main" everywhere), a flat search found another project's tab and drew its title and its project's
    // name over this conversation.
    const entry = projects
      .find((project) => project.agentId === screen.agentId && project.key === screen.projectKey)
      ?.sessions.find((one) => one.sessionId === screen.sessionId)

    /** Every conversation of this project - the strip of tabs, and the sheet that holds the rest of it. */
    const siblings =
      projects.find((project) => project.agentId === screen.agentId && project.key === screen.projectKey)
        ?.sessions ?? []

    const key = chatKey(screen.agentId, screen.projectKey, screen.sessionId)

    if (screen.at === 'tasks') {
      return (
        <div className={m.screen}>
          <ClockContext.Provider value={clockOf(screen.agentId).now}>
            <Tasks
              feed={feed.state}
              cards={cards}
              title={entry?.title ?? NEW_SESSION_TITLE}
              onAgent={(taskId) => setScreen({ ...screen, at: 'agent', taskId })}
              onStopTask={(taskId) =>
                command(screen.agentId, screen.projectKey, {
                  type: 'stopTask',
                  sessionId: screen.sessionId,
                  taskId,
                })
              }
              onBack={back}
            />
          </ClockContext.Provider>
        </div>
      )
    }

    if (screen.at === 'agent') {
      const task = feed.state.items.find(
        (item): item is TaskItem => item.kind === 'task' && item.id === screen.taskId,
      )

      return (
        <div className={m.screen}>
          <ClockContext.Provider value={clockOf(screen.agentId).now}>
            <AgentScreen
              task={task}
              onStop={() => {
                if (!task?.taskId) return
                command(screen.agentId, screen.projectKey, {
                  type: 'stopTask',
                  sessionId: screen.sessionId,
                  taskId: task.taskId,
                })
              }}
              onBack={back}
            />
          </ClockContext.Provider>
        </div>
      )
    }

    if (screen.at === 'decide') {
      return (
        <div className={m.screen}>
          <ClockContext.Provider value={clockOf(screen.agentId).now}>
            <Decision
              feed={feed.state}
              cards={cards}
              title={entry?.title ?? 'A conversation'}
              project={entry?.projectName ?? ''}
              // The answers gathered so far are kept here, so stepping back into the conversation and
              // returning does not start the questions over - see askAnswers.
              answers={askAnswers}
              onAnswers={setAskAnswers}
              onDecide={(id, decision) =>
                command(screen.agentId, screen.projectKey, { type: 'permissionDecision', id, decision })
              }
              onPlan={(id, decision) =>
                command(screen.agentId, screen.projectKey, {
                  type: 'planDecision',
                  sessionId: screen.sessionId,
                  id,
                  decision,
                })
              }
              onAsk={(id, answers, text) =>
                command(screen.agentId, screen.projectKey, {
                  type: 'askAnswer',
                  sessionId: screen.sessionId,
                  id,
                  answers,
                  text,
                })
              }
              onOpenThread={() => setScreen({ ...screen, at: 'thread' })}
              onBack={back}
            />
          </ClockContext.Provider>
        </div>
      )
    }

    return (
      <div className={m.screen}>
        <ClockContext.Provider value={clockOf(screen.agentId).now}>
          <Thread
            feed={feed.state}
            cards={cards}
            chat={chatKey(screen.agentId, screen.projectKey, screen.sessionId)}
            title={entry?.title ?? NEW_SESSION_TITLE}
            project={entry?.projectName ?? ''}
            siblings={siblings}
            sessionId={screen.sessionId}
            facts={factsFor(
              facts[`${screen.agentId}:${screen.projectKey}`] ?? emptyFacts(),
              chatAccounts[chatKey(screen.agentId, screen.projectKey, screen.sessionId)] ?? '',
            )}
            connected={states[screen.agentId] === 'connected'}
            loading={!feed.loaded}
            voice={dictation}
            onSend={(prompt: OutgoingPrompt) => {
              // The first message names the tab, with the panel's own rule and the panel's own function -
              // otherwise a conversation begun from a phone stays "new session" at the desk for as long as
              // it lasts. The better name from the model replaces this one when it arrives.
              if (!entry || entry.titleSource === 'default') {
                command(screen.agentId, screen.projectKey, {
                  type: 'renameSession',
                  sessionId: screen.sessionId,
                  title: deriveSessionTitle(prompt.text),
                })
              }

              command(screen.agentId, screen.projectKey, {
                type: 'prompt',
                sessionId: screen.sessionId,
                text: prompt.text,
                // The pieces the card is drawn from travel with the message: the shell keeps them and
                // echoes them back, which is how this screen - and the panel at the desk - shows what was
                // asked rather than only what was answered.
                tokens: prompt.tokens,
                // What was quoted out of the conversation before this was written - the same field the
                // panel sends, so the card reads the same on both screens (see feed/tokens).
                quotes: prompt.quotes,
                // Photos from the phone travel as bytes: there is no path on this device the agent could
                // read (see prompt.images in protocol.ts).
                images: prompt.images,
              })

              setQuotes((current) => ({ ...current, [key]: [] }))
            }}
            // Queued in the IDE rather than on this device: the page holding it is thrown out while the
            // phone sits in a pocket, and that is exactly when a queued message matters (see SessionQueue).
            onQueue={(prompt: OutgoingPrompt) => {
              command(screen.agentId, screen.projectKey, {
                type: 'queuePrompt',
                sessionId: screen.sessionId,
                id: `q-${Date.now().toString(36)}-${queueCounter.current++}`,
                text: prompt.text,
                tokens: prompt.tokens,
                quotes: prompt.quotes,
                images: prompt.images,
              })

              setQuotes((current) => ({ ...current, [key]: [] }))
            }}
            onUnqueue={(id: string) =>
              command(screen.agentId, screen.projectKey, {
                type: 'unqueuePrompt',
                sessionId: screen.sessionId,
                id,
              })
            }
            onStop={() =>
              command(screen.agentId, screen.projectKey, { type: 'stop', sessionId: screen.sessionId })
            }
            onStopTask={(taskId) =>
              command(screen.agentId, screen.projectKey, { type: 'stopTask', sessionId: screen.sessionId, taskId })
            }
            earlierPages={feed.state.earlierPages}
            onLoadEarlier={loadEarlier}
            onDecide={() => setScreen({ ...screen, at: 'decide' })}
            onBack={back}
            onTasks={() => setScreen({ ...screen, at: 'tasks' })}
            onTabs={() => setSheet('tabs')}
            onNewChat={() => setScreen({ at: 'new', agentId: screen.agentId, projectKey: screen.projectKey })}
            onPickTab={(session) => enter(session.agentId, session.projectKey, session.sessionId, false)}
            onRun={() => setSheet('run')}
            onMessage={(item) => {
              setActing(item)
              setSheet('message')
            }}
            pins={pins[key] ?? EMPTY_PINS}
            onPin={(id) =>
              setPins((current) => ({ ...current, [key]: togglePin(current[key] ?? EMPTY_PINS, id) }))
            }
            quotes={quotes[key] ?? EMPTY_QUOTES}
            onDropQuote={(index) =>
              setQuotes((current) => ({
                ...current,
                [key]: (current[key] ?? []).filter((_, at) => at !== index),
              }))
            }
            onSearch={() => openSearch(screen.agentId, screen.projectKey, screen.sessionId)}
            capsule={capsuleProps}
            focus={feedFocus?.key === threadKey ? feedFocus : undefined}
            onFocused={forgetFeedFocus}
            paint={capsule?.key === threadKey ? capsule.terms : undefined}
          />
        </ClockContext.Provider>
      </div>
    )
  })()

  /**
   * Which conversation the sheets are about.
   *
   * The three of them belong to a thread and are opened from it, but the state that holds them lives
   * here - so a sheet left open while the screen changed would stand over a conversation it says
   * nothing about. Named once rather than narrowed at each of the three.
   */
  const onThread =
    screen.at === 'thread' || screen.at === 'decide' || screen.at === 'tasks' || screen.at === 'agent'
      ? screen
      : undefined

  const sheetSiblings = onThread
    ? (projects.find((one) => one.agentId === onThread.agentId && one.key === onThread.projectKey)?.sessions ??
      [])
    : []

  const sheetKey = onThread ? chatKey(onThread.agentId, onThread.projectKey, onThread.sessionId) : ''

  /** Which project the menu's three machine screens would be about: the one in view, else the first open. */
  const menuProject = onThread
    ? projects.find((one) => one.agentId === onThread.agentId && one.key === onThread.projectKey)
    : (screen.at === 'history' || screen.at === 'new'
        ? projects.find((one) => one.agentId === screen.agentId && one.key === screen.projectKey)
        : undefined) ?? projects.find((one) => !one.closed)

  return (
    <LocaleProvider locale={locale}>
      {body}

      {drawer && (
        <Drawer
          agents={paired}
          waiting={waitingFor(projects).length}
          live={onThread ? feed.state.items.filter((item) => item.kind === 'task' && item.pending).length : 0}
          account={
            menuProject
              ? currentAccountName(accounts[menuProject.agentId] ?? null)
              : ''
          }
          mcpTone={mcpTone(menuProject ? mcp[menuProject.agentId] : undefined)}
          onProjects={() => {
            setDrawer(false)
            home()
          }}
          onTasks={
            onThread
              ? () => {
                  setDrawer(false)
                  setScreen({ ...onThread, at: 'tasks' })
                }
              : undefined
          }
          onScenarios={menuProject ? () => openScenarios(menuProject.agentId, menuProject.key) : undefined}
          liveRuns={menuProject ? liveRunsOf(facts[`${menuProject.agentId}:${menuProject.key}`]) : []}
          onMcp={menuProject ? () => openMachineScreen('mcp', menuProject.agentId, menuProject.key) : undefined}
          onPlugins={
            menuProject ? () => openMachineScreen('plugins', menuProject.agentId, menuProject.key) : undefined
          }
          onAccounts={
            menuProject ? () => openMachineScreen('accounts', menuProject.agentId, menuProject.key) : undefined
          }
          onPair={() => {
            setDrawer(false)
            setScreen({ at: 'pairing' })
          }}
          onForget={forget}
          onClose={() => setDrawer(false)}
        />
      )}

      {sheet === 'tabs' && onThread && (
        <TabsSheet
          project={projectNameOf(projects, onThread.agentId, onThread.projectKey)}
          sessions={sheetSiblings}
          sessionId={onThread.sessionId}
          onPick={(session) => {
            setSheet('')
            if (session.sessionId !== onThread.sessionId) {
              enter(session.agentId, session.projectKey, session.sessionId, false)
            }
          }}
          onNew={() => {
            setSheet('')
            setScreen({ at: 'new', agentId: onThread.agentId, projectKey: onThread.projectKey })
          }}
          onFork={() => {
            setSheet('')
            forkWhole(onThread.agentId, onThread.projectKey, onThread.sessionId)
          }}
          onClose={() => setSheet('')}
        />
      )}

      {sheet === 'run' && onThread && (
        <RunSheet
          models={inventories[onThread.agentId]?.models ?? null}
          customModels={customModelsOf(facts, onThread.agentId, onThread.projectKey)}
          model={feed.state.model ?? ''}
          effort={feed.state.effort ?? ''}
          mode={feed.state.permissionMode ?? ''}
          onApply={(change) => {
            setSheet('')
            if (change.model !== undefined) {
              command(onThread.agentId, onThread.projectKey, {
                type: 'setModel',
                sessionId: onThread.sessionId,
                model: change.model,
              })
            }
            if (change.effort !== undefined) {
              command(onThread.agentId, onThread.projectKey, {
                type: 'setEffort',
                sessionId: onThread.sessionId,
                effort: change.effort,
              })
            }
          }}
          onClose={() => setSheet('')}
        />
      )}

      {sheet === 'message' && onThread && acting && (
        <MessageSheet
          item={acting}
          pinned={(pins[sheetKey] ?? EMPTY_PINS).includes(acting.id)}
          pinsFull={(pins[sheetKey] ?? EMPTY_PINS).length >= PIN_LIMIT}
          onQuote={(text) =>
            setQuotes((current) => ({ ...current, [sheetKey]: [...(current[sheetKey] ?? []), text] }))
          }
          onFork={() => {
            setSheet('')
            forkFrom(onThread.agentId, onThread.projectKey, onThread.sessionId, acting)
          }}
          onPin={() =>
            setPins((current) => ({
              ...current,
              [sheetKey]: togglePin(current[sheetKey] ?? EMPTY_PINS, acting.id),
            }))
          }
          onClose={() => setSheet('')}
        />
      )}

      {searchWindow}
    </LocaleProvider>
  )
}

/**
 * A conversation of this project to address a question about the project to.
 *
 * The MCP status is asked of a running conversation rather than of the project (see askMcp), so the
 * request has to name one - and which one does not matter, because the answer is about the project's
 * servers whichever it was. The one already in front of the person would be the tidiest choice and is
 * not available here: this screen is reached from the menu, which does not belong to a conversation.
 */
const anySessionOf = (projects: ProjectEntry[], agentId: string, projectKey: string): string =>
  projects.find((one) => one.agentId === agentId && one.key === projectKey)?.sessions[0]?.sessionId ?? ''

/** What that project is called, for the line under a screen's title. */
const projectNameOf = (projects: ProjectEntry[], agentId: string, projectKey: string): string =>
  projects.find((one) => one.agentId === agentId && one.key === projectKey)?.name ?? ''

/**
 * Which account is paying for the conversation this phone was last in, named the way its row is.
 *
 * The question the accounts screen is opened with, answered at the top of it rather than by reading
 * four rows to find the one marked "in use" - and it is not the same question: the account in force is
 * what the NEXT conversation starts on, while a conversation already open goes on being billed to the
 * one it was born under until somebody switches (see ClaudeSessions.moveTo).
 *
 * Nothing at all when this phone has not been inside a conversation of that machine yet: a line that
 * names an account and no conversation is a line about nothing.
 */
const paying = (
  state: AccountsState | null,
  chatAccounts: Record<string, string>,
  projects: ProjectEntry[],
  agentId: string,
): { account: string; title: string } | null => {
  if (!state) return null

  for (const project of projects) {
    if (project.agentId !== agentId) continue

    for (const session of project.sessions) {
      const id = chatAccounts[chatKey(agentId, project.key, session.sessionId)]
      if (id === undefined) continue

      const account = state.accounts.find((one) => one.id === id)
      if (!account) continue

      return {
        account: account.alias.trim() || account.email.split('@')[0] || account.email,
        title: `${project.name} · ${session.title}`,
      }
    }
  }

  return null
}

/**
 * What to call a fork, out of the message it grew from.
 *
 * The message itself for one's own, the answer's text for the agent's - either way it is the sentence
 * the branch is about, which is what `deriveSessionTitle` is written to shorten (see feed/title.ts).
 */
const forkTitle = (item: FeedItem): string => {
  if (item.kind === 'user') return item.tokens.find((token) => token.kind === 'text')?.value ?? ''
  if (item.kind === 'text') return item.source

  return ''
}

/** Which account this machine is working on, named the way its row is - for the menu's line. */
const currentAccountName = (state: AccountsState | null): string => {
  const account = state?.accounts.find((one) => one.id === state.current)
  if (!account) return ''

  return account.alias.trim() || account.email.split('@')[0] || account.email
}

/**
 * The dot beside the menu's MCP row: the worst state any of that project's servers is in.
 *
 * A dot rather than a count, because the question the row is glanced at with is "is anything wrong
 * there" - and a green one would be one more thing lit up on a menu where everything is fine.
 */
const mcpTone = (servers: McpServerInfo[] | undefined): 'none' | 'warn' | 'bad' => {
  if (!servers) return 'none'
  if (servers.some((server) => server.status === 'failed')) return 'bad'

  return servers.some((server) => server.status === 'needs-auth') ? 'warn' : 'none'
}

/** Stable empties, so a card that reads them is not re-rendered by a new array on every pass. */
const EMPTY_PINS: readonly string[] = []
const EMPTY_QUOTES: string[] = []

/** What a search that has not been asked anything yet has found. */
const EMPTY_COUNTS = { chat: 0, project: 0, conversations: 0 }

/** How long the typing pauses before a query goes out - the panel's figure (see App.tsx). */
const SEARCH_DEBOUNCE_MS = 160

/** How many pages above a jump may fetch on its own - the panel's figure (see App.tsx). */
const JUMP_PAGE_LIMIT = 40

/**
 * An identifier for a tab this phone is opening.
 *
 * Made up here rather than asked for, exactly as the panel does it: the screen has to answer the press
 * at once, and a round trip before a conversation appears would be felt. Marked as this device's so
 * that two clients inventing one in the same millisecond cannot collide.
 */
/**
 * The language tag this phone should speak, out of everything the paired IDEs have said.
 *
 * The project in view answers first; when none is - the list of chats, the pairing screen - any project
 * that has already said will do. They are all the same person's machines, and one of their answers is
 * far better than falling back to English on the screen that lists the work.
 */
const localeOf = (facts: Record<string, ProjectFacts>, screen: Screen): ProjectFacts['locale'] => {
  const key = 'agentId' in screen ? `${screen.agentId}:${screen.projectKey}` : ''
  return facts[key]?.locale ?? Object.values(facts).find((fact) => fact.locale)?.locale
}

/**
 * Whether the gauges should be drawn calm, out of everything the paired IDEs have said.
 *
 * The same rule as the language above, written out rather than reused because a boolean needs asking
 * differently: an explicit `false` is an answer, and a search for the first truthy fact would walk
 * straight past a machine that has just switched the mode off.
 */
const calmOf = (facts: Record<string, ProjectFacts>, screen: Screen): boolean | undefined => {
  const key = 'agentId' in screen ? `${screen.agentId}:${screen.projectKey}` : ''
  return facts[key]?.calmColors ?? Object.values(facts).find((fact) => fact.calmColors !== undefined)?.calmColors
}

/**
 * The models added by hand on the machine this project belongs to (see CustomModels.tsx).
 *
 * Asked of that machine alone, unlike the language and the colour mode above: those are about the person
 * and any answer will do, while a model is about a Claude Code - a name added on one machine says nothing
 * about what another one can launch, and offering it would be offering a turn that dies on its first
 * message.
 */
const customModelsOf = (facts: Record<string, ProjectFacts>, agentId: string, projectKey: string): string[] =>
  facts[`${agentId}:${projectKey}`]?.customModels ?? []

/** Where the put-away conversations are remembered on this device - see the note on the state. */
const HIDDEN_KEY = 'hiddenChats'

const newSessionId = (): string => `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/**
 * What a tab is called before the list has said otherwise - the same words the IDE puts on an unnamed
 * one. Only ever seen for the moment between starting a conversation and the list catching up.
 */
const NEW_SESSION_TITLE = 'new session'

/**
 * The pairing details out of the address bar - see the note about the fragment in Pairing.kt.
 *
 * This is the main way in on Android: the camera opens the address and the pairing happens on load.
 * Which relay it is does not come from here - the screen that pairs decides that, so that the origin
 * is worked out in one place rather than two that can disagree.
 */
export const readPairingFragment = (): PairingOffer | null => {
  const fragment = window.location.hash.slice(1)
  if (!fragment) return null

  const [version, agentId, secret, fingerprint] = fragment.split('.')
  if (version !== '1' || !agentId || !secret || !fingerprint) return null

  // Cleared from the address bar before anything else happens: it must not sit in history, and it must
  // not travel anywhere if this page is shared or restored.
  //
  // The FRAGMENT, and only it. The query travels on: in development it carries which relay to talk to
  // (see relayAddress), and this runs before anything asks - so wiping it here left a client paired
  // against a link and then dialling the Vite server it was served from, which answers nothing. The
  // secret is in the fragment; there is nothing in the query worth taking away.
  window.history.replaceState(null, '', window.location.pathname + window.location.search)

  return { agentId, secret: unbase64url(secret), fingerprint }
}
