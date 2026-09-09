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
 * A closed project's shelf is read through the hub its window brings, so picking one opens the project
 * in the IDE first (see openRepository). A machine too old to do that - the client comes off the relay
 * and outruns the plugin behind it - lists it greyed, as every machine did before.
 */
export interface RepositoryChoice {
  agentId: string
  projectKey: string
  name: string
  /** Whether that project has a repository to put a shared scenario in at all (see ScenarioShelves.canShare). */
  canShare: boolean
  closed: boolean
  /**
   * Whether that machine can open a project for its shelves at all - see CAP_OPEN_BARE.
   *
   * A phone runs whichever client the relay was last given, and the plugin on the other side is
   * whatever version somebody has installed. On an older one a closed repository is greyed as it always
   * was, rather than offered and refused with a sentence written for another cause.
   */
  canOpen: boolean
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

/**
 * The shelves as rows of a pick sheet: the shared one first, then every repository by name.
 *
 * One list for the two places that ask - the sheet that writes a new scenario and the editor's own row -
 * so that a closed repository reads the same in both: listed, with the line saying that picking it opens
 * the project in the IDE first. Only a project with no folder to write into is greyed; nothing can be
 * kept there whether it is open or not.
 */
export const shelfOptions = (
  repositories: RepositoryChoice[],
  words: { shared: string; opensProject: string; closed: string; noProject: string },
): { id: string; label: string; hint?: string; disabled?: boolean }[] => [
  { id: 'user', label: words.shared },
  ...repositories.map((one, index) => ({
    id: `repo:${index}`,
    label: one.name,
    hint: one.closed ? (one.canOpen ? words.opensProject : words.closed) : !one.canShare ? words.noProject : undefined,
    disabled: one.closed ? !one.canOpen : !one.canShare,
  })),
]

/** Which row of [shelfOptions] a shelf is - the shared one, or the repository's own. */
export const shelfOptionId = (shelf: ShelfChoice, repositories: RepositoryChoice[]): string =>
  shelf.scope === 'user'
    ? 'user'
    : `repo:${repositories.findIndex((one) => one.agentId === shelf.agentId && one.projectKey === shelf.projectKey)}`

/** The repository behind a row of [shelfOptions], or null for the shared shelf. */
export const repositoryOfOption = (id: string, repositories: RepositoryChoice[]): RepositoryChoice | null =>
  id.startsWith('repo:') ? (repositories[Number(id.slice(5))] ?? null) : null
