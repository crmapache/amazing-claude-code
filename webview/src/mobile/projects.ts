import type { LinkState, SessionLaunch } from './link'
import type { ProjectEntry } from './screens/Sessions'
import type { ModelInfo } from '../protocol'

/**
 * What one IDE says it has, as it arrives on the wire (see RemoteAgent.inventoryBody).
 *
 * Projects that are open, with their conversations; the ones it merely remembers, named by an opaque
 * key because a path never leaves that machine; and two facts about the machine itself that a screen
 * starting a conversation needs - which models it offers and what is chosen at the desk.
 */
export interface Inventory {
  projects: Array<{
    key: string
    name: string
    sessions: Array<{
      id: string
      title: string
      titleSource?: string
      status: string
      awaitsYou: boolean
      q: number
    }>
  }>
  recents?: Array<{ key: string; name: string }>
  models?: ModelInfo[]
  prefs?: SessionLaunch
}

export interface PairedFacts {
  agentId: string
  label: string
}

/**
 * How one conversation is named on this phone, across every IDE and every project.
 *
 * All three parts, because the conversation's own identifier is unique nowhere but inside its project:
 * every project's first tab is called "main" by the IDE itself. Naming one by that identifier alone
 * put the wrong title and the wrong project's name over an opened conversation, and hiding one
 * project's main tab hid every other project's along with it.
 */
export const chatKey = (agentId: string, projectKey: string, sessionId: string): string =>
  `${agentId}:${projectKey}:${sessionId}`

/**
 * Every project on every paired IDE, in the order it deserves attention.
 *
 * The ones with something waiting for a person first, then the ones at work, then the rest, then the
 * ones that would have to be opened. A phone is picked up to answer something, so what needs answering
 * goes at the top - and a project that is not even open goes last, however recently it was used.
 *
 * A function of its own rather than a block inside the screen: this is the whole of what the first
 * screen shows, the ordering is the part that is easy to get subtly wrong, and neither deserves a
 * running IDE and a phone to check.
 */
export const buildProjects = (
  agents: PairedFacts[],
  inventories: Record<string, Inventory>,
  states: Record<string, LinkState>,
  /**
   * Conversations this phone has been asked to put away, by [chatKey].
   *
   * Local to the device and to nothing else: hiding is not closing, and the conversation goes on at the
   * desk exactly as it was. What it changes is one screen's worth of room.
   */
  hidden: ReadonlySet<string> = new Set(),
): ProjectEntry[] => {
  const entries: ProjectEntry[] = []

  for (const agent of agents) {
    const inventory = inventories[agent.agentId]
    if (!inventory) continue

    const online = states[agent.agentId] === 'connected'

    for (const project of inventory.projects) {
      const all = project.sessions.map((session) => ({
        agentId: agent.agentId,
        agentLabel: agent.label,
        projectKey: project.key,
        projectName: project.name,
        sessionId: session.id,
        title: session.title,
        titleSource: session.titleSource ?? 'default',
        status: session.status,
        awaitsYou: session.awaitsYou,
        seq: session.q,
        online,
      }))

      // A hidden conversation that has stopped and is waiting for a person comes back by itself. The
      // phone exists to answer those; leaving one out of sight because it was tidied away an hour ago
      // would be the app failing at the one thing it is for.
      const sessions = all.filter(
        (session) => session.awaitsYou || !hidden.has(chatKey(agent.agentId, project.key, session.sessionId)),
      )

      entries.push({
        agentId: agent.agentId,
        agentLabel: agent.label,
        key: project.key,
        name: project.name,
        closed: false,
        online,
        hiddenCount: all.length - sessions.length,
        sessions: sessions.sort((first, second) => {
          if (first.awaitsYou !== second.awaitsYou) return first.awaitsYou ? -1 : 1
          if (first.status !== second.status) return first.status === 'running' ? -1 : 1
          return 0
        }),
      })
    }

    for (const recent of inventory.recents ?? []) {
      entries.push({
        agentId: agent.agentId,
        agentLabel: agent.label,
        key: recent.key,
        name: recent.name,
        closed: true,
        online,
        hiddenCount: 0,
        sessions: [],
      })
    }
  }

  // A stable sort, which the language guarantees: within one rank the projects stay in the order the
  // IDE listed them - open ones as the platform holds them, remembered ones newest first.
  return entries.sort((first, second) => rank(first) - rank(second))
}

/**
 * Where a project stands in the list. Lower comes first: something waiting for a person, then work in
 * progress, then an open project with nothing happening, then one that would have to be opened.
 */
const rank = (project: ProjectEntry): number => {
  if (project.closed) return 3
  if (project.sessions.some((session) => session.awaitsYou)) return 0
  if (project.sessions.some((session) => session.status === 'running')) return 1

  return 2
}
