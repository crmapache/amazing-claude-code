import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { unbase64url } from '../core/crypto'
import { deriveSessionTitle } from '../feed/title'
import type { HistoryEntry, ShellMessage } from '../protocol'
import { applyMessage, emptyFeed, type MobileFeed } from './feed'
import { Link, type LinkState, type SessionLaunch } from './link'
import { buildProjects, chatKey, type Inventory } from './projects'
import { Decision } from './screens/Decision'
import { History } from './screens/History'
import { NewSession } from './screens/NewSession'
import { Pairing, type PairingOffer } from './screens/Pairing'
import { Sessions, type AgentEntry, type ProjectEntry, type SessionEntry } from './screens/Sessions'
import { Thread } from './screens/Thread'
import { forgetAgent, listAgents, readSetting, writeSetting, type PairedAgent } from './storage'
import m from './mobile.module.css'

/**
 * The phone's whole application.
 *
 * Four screens and nothing else: what is waiting, one conversation, one decision, and starting
 * something new. The panel in the IDE is where work is done; this is where work is unblocked and, when
 * an editor has just been started and has nothing open, begun. Everything that would make it a second
 * panel - the tabs, the plugins, the settings - is deliberately absent, and most of it is not even
 * permitted over the wire (see RemoteCommands on the plugin's side).
 */

type Screen =
  | { at: 'sessions' }
  | { at: 'new'; agentId: string; projectKey: string }
  | { at: 'history'; agentId: string; projectKey: string }
  | { at: 'thread'; agentId: string; projectKey: string; sessionId: string }
  | { at: 'decide'; agentId: string; projectKey: string; sessionId: string }
  | { at: 'pairing' }

/** A conversation being started in a project that has to be opened first - see [startSession]. */
interface Opening {
  agentId: string
  sessionId: string
  error: string
}

const EMPTY_LAUNCH: SessionLaunch = { model: '', effort: '', mode: '' }

export const App = () => {
  const [agents, setAgents] = useState<PairedAgent[]>([])
  const [screen, setScreen] = useState<Screen>({ at: 'sessions' })
  const [inventories, setInventories] = useState<Record<string, Inventory>>({})
  const [states, setStates] = useState<Record<string, LinkState>>({})
  const [feed, setFeed] = useState<MobileFeed>(emptyFeed())
  const [opening, setOpening] = useState<Opening | null>(null)

  /**
   * The past conversations of each project, by the project they belong to.
   *
   * Kept rather than fetched on every visit: the list is read off that machine's disk, and coming back
   * to a screen that says "Loading…" over something already known is worse than a list a minute old -
   * it is asked for again on opening anyway.
   */
  const [histories, setHistories] = useState<Record<string, HistoryEntry[]>>({})

  /**
   * The conversations this phone has put away, by `agentId:sessionId`.
   *
   * Kept on the device rather than told to the IDE: hiding one changes nothing about it - the process
   * runs, the tab at the desk stays open, the other phone still lists it. What it changes is how much
   * of this screen a project with eight open conversations takes up.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const links = useRef<Record<string, Link>>({})

  /** Whether the IDE being watched was reachable a moment ago - what makes "it came back" a moment. */
  const wasLive = useRef(false)

  /** Which conversation the feed on screen belongs to - a late message from another one is dropped. */
  const watching = useRef<{ agentId: string; projectKey: string; sessionId: string } | null>(null)

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

  const receive = useCallback((agentId: string, message: ShellMessage, projectKey: string) => {
    // The one answer that belongs to a project rather than to a conversation, and the one that arrives
    // while nothing is being watched at all - the screen that asked for it is a list of past
    // conversations, not a feed.
    if (message.type === 'history') {
      setHistories((current) => ({ ...current, [`${agentId}:${projectKey}`]: message.conversations }))
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

    setFeed((previous) => applyMessage(previous, message))
  }, [])

  /** Watch a conversation from the beginning and show it. */
  const enter = useCallback((agentId: string, projectKey: string, sessionId: string, decide: boolean) => {
    watching.current = { agentId, projectKey, sessionId }
    setFeed(emptyFeed())

    // From nothing: this screen has no feed for that conversation yet, so the whole of it is wanted.
    links.current[agentId]?.watch(projectKey, sessionId, 0)

    setScreen({ at: decide ? 'decide' : 'thread', agentId, projectKey, sessionId })
  }, [])

  /** How a request to open a closed project ended - see [startSession]. */
  const projectOpened = useCallback(
    (agentId: string, result: { sessionId: string; ok: boolean; projectKey?: string; error?: string }) => {
      setOpening((current) => {
        if (!current || current.agentId !== agentId || current.sessionId !== result.sessionId) return current

        if (result.ok && result.projectKey) {
          enter(agentId, result.projectKey, result.sessionId, false)
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
          setInventories((current) => ({ ...current, [agent.agentId]: inventory as Inventory }))
        },
        onState: (state) => setStates((current) => ({ ...current, [agent.agentId]: state })),
        onProjectOpened: (result) => projectOpened(agent.agentId, result),
        onResync: () => resync(agent.agentId),
      })

      links.current[agent.agentId] = link
      void link.connect()
    }
  }, [agents, receive, projectOpened, resync])

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
   * Not in the tab that happens to be on screen at the desk, which is what the panel does: it can see
   * which tab that is, and from here there is no telling whether somebody is working in it. The name
   * goes last, after the request that opens it - resuming resets a tab's title on purpose, and a name
   * sent before that would be the one thing thrown away.
   */
  const openPast = useCallback(
    (agentId: string, projectKey: string, entry: HistoryEntry) => {
      const sessionId = newSessionId()

      command(agentId, projectKey, { type: 'newSession', kind: 'main', sessionId, title: '' })
      command(agentId, projectKey, { type: 'resumeSession', sessionId, conversationId: entry.id })
      command(agentId, projectKey, { type: 'renameSession', sessionId, title: deriveSessionTitle(entry.title, 40) })

      enter(agentId, projectKey, sessionId, false)
    },
    [command, enter],
  )

  const back = useCallback(() => {
    watching.current = null
    setOpening(null)
    setScreen({ at: 'sessions' })

    // The IDE pushes the list whenever it changes, so this is not what keeps the screen up to date. It
    // is for this moment alone: walking back onto a list one has just changed, where a frame in flight
    // and a frame not yet sent look the same and neither deserves a person's doubt.
    for (const link of Object.values(links.current)) link.refreshInventory()
  }, [])

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
      <Sessions
        agents={paired}
        projects={projects}
        reach={reach}
        onOpen={open}
        onNew={(project) => setScreen({ at: 'new', agentId: project.agentId, projectKey: project.key })}
        onPair={() => setScreen({ at: 'pairing' })}
        onForget={forget}
        onHide={hide}
        onShowHidden={showHidden}
        onHistory={(project) => {
          // Asked for on every visit: it is read off that machine's disk, and a conversation held at the
          // desk five minutes ago should be on the list rather than one refresh away.
          command(project.agentId, project.key, { type: 'history' })
          setScreen({ at: 'history', agentId: project.agentId, projectKey: project.key })
        }}
      />
    </div>
  )

  if (screen.at === 'sessions') return list

  if (screen.at === 'history') {
    const project = projects.find((one) => one.agentId === screen.agentId && one.key === screen.projectKey)
    if (!project) return list

    return (
      <div className={m.screen}>
        <History
          project={project}
          conversations={histories[`${screen.agentId}:${screen.projectKey}`] ?? null}
          onOpen={(entry) => openPast(screen.agentId, screen.projectKey, entry)}
          onBack={back}
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

  if (screen.at === 'decide') {
    return (
      <div className={m.screen}>
        <Decision
          feed={feed.state}
          title={entry?.title ?? 'A conversation'}
          project={entry?.projectName ?? ''}
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
      </div>
    )
  }

  return (
    <div className={m.screen}>
      <Thread
        feed={feed.state}
        title={entry?.title ?? NEW_SESSION_TITLE}
        project={entry?.projectName ?? ''}
        connected={states[screen.agentId] === 'connected'}
        loading={!feed.loaded}
        onSend={(text: string) => {
          // The first message names the tab, with the panel's own rule and the panel's own function -
          // otherwise a conversation begun from a phone stays "new session" at the desk for as long as
          // it lasts. The better name from the model replaces this one when it arrives.
          if (!entry || entry.titleSource === 'default') {
            command(screen.agentId, screen.projectKey, {
              type: 'renameSession',
              sessionId: screen.sessionId,
              title: deriveSessionTitle(text),
            })
          }

          command(screen.agentId, screen.projectKey, {
            type: 'prompt',
            sessionId: screen.sessionId,
            text,
            // The pieces the card is drawn from travel with the message: the shell keeps them and
            // echoes them back, which is how this screen - and the panel at the desk - shows what was
            // asked rather than only what was answered.
            tokens: [{ kind: 'text', value: text }],
            quotes: [],
          })
        }}
        onStop={() =>
          command(screen.agentId, screen.projectKey, { type: 'stop', sessionId: screen.sessionId })
        }
        onStopTask={(taskId) =>
          command(screen.agentId, screen.projectKey, { type: 'stopTask', sessionId: screen.sessionId, taskId })
        }
        onLoadEarlier={
          feed.oldestEventUuid
            ? () =>
                command(screen.agentId, screen.projectKey, {
                  type: 'historyPage',
                  sessionId: screen.sessionId,
                  before: feed.oldestEventUuid ?? undefined,
                })
            : undefined
        }
        onDecide={() => setScreen({ ...screen, at: 'decide' })}
        onBack={back}
      />
    </div>
  )
}

/**
 * An identifier for a tab this phone is opening.
 *
 * Made up here rather than asked for, exactly as the panel does it: the screen has to answer the press
 * at once, and a round trip before a conversation appears would be felt. Marked as this device's so
 * that two clients inventing one in the same millisecond cannot collide.
 */
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
  window.history.replaceState(null, '', window.location.pathname)

  return { agentId, secret: unbase64url(secret), fingerprint }
}
