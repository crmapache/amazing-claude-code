import type { Dict } from '../i18n/en'

/**
 * The few words about a run that more than one screen on a phone needs.
 *
 * A file of their own rather than an export off whichever screen happened to write one first: several
 * screens say the same things about a run, and a helper living on one of them makes the others import a
 * screen to borrow a sentence.
 */

/** What the IDE could not do, in the words this side has for it - see the outcomes block of the dictionary. */
export const outcomeText = (t: Dict, code: string): string =>
  code in t.scenarios.outcomes
    ? t.scenarios.outcomes[code as keyof typeof t.scenarios.outcomes]
    : t.scenarios.outcomes.unknown

/**
 * A repository a shared scenario may be kept in: a project of a paired IDE, by the key the IDE names it.
 *
 * The phone's screen of scenarios used to be about one project and say so with "in this repository" -
 * and from a sofa there was no telling which, nor any way to look at another one. The shelf that is the
 * same everywhere comes first now, and the repository is chosen by name (see mobile/screens/Scenarios).
 *
 * Open projects only can be read: their shelves travel as facts of a project the IDE holds open (see
 * RemoteFeed.PROJECT_FACTS), and a closed one has nothing to send them from. The closed ones are still
 * listed, greyed, so that a repository somebody is looking for is seen to be closed rather than missing.
 */
export interface RepositoryChoice {
  agentId: string
  projectKey: string
  name: string
  /** Whether that project has a repository to put a shared scenario in at all (see ScenarioShelves.canShare). */
  canShare: boolean
  closed: boolean
}

/**
 * Where a scenario is kept: on the shelf every project shares, or in one repository.
 *
 * The shared shelf names no repository because it belongs to none - it is the machine's own folder,
 * read by every project on it - so a scenario put there goes through whichever project's screen it was
 * written on. A repository is named by the project that holds it.
 */
export type ShelfChoice = { scope: 'user' } | { scope: 'project'; agentId: string; projectKey: string }

/** The two coordinates of a project, as one string - the key the facts and the screens are held by. */
export const repositoryKey = (agentId: string, projectKey: string): string => `${agentId}:${projectKey}`

/**
 * The project a scenario on this shelf is written through.
 *
 * A repository is its own; the shared shelf is reached through the project the screen is open on, which
 * is as good as any other of that machine's - the folder is the same (see ScenarioStore).
 */
export const shelfHome = (
  shelf: ShelfChoice,
  screen: { agentId: string; projectKey: string },
): { agentId: string; projectKey: string } =>
  shelf.scope === 'project' ? { agentId: shelf.agentId, projectKey: shelf.projectKey } : screen

/** What a shelf is called on screen: the shared one by its own name, a repository by the project's. */
export const shelfLabel = (
  shelf: ShelfChoice,
  repositories: RepositoryChoice[],
  shared: string,
): string =>
  shelf.scope === 'user'
    ? shared
    : (repositories.find((one) => one.agentId === shelf.agentId && one.projectKey === shelf.projectKey)?.name ??
      shared)
