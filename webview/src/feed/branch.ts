/**
 * The branch the project is on and that branch's pull request.
 *
 * A fact about the folder rather than about any conversation in it, and both screens keep it that way:
 * the phone beside its other project facts (see mobile/facts.ts), the panel in a state of its own beside
 * the tabs (see App). The panel used to keep it inside the opening tab's feed, and closing that tab took
 * the branch and the PR off the header until the branch next changed.
 */
export interface BranchFacts {
  gitBranch?: string
  /** The current branch's pull request number, when it has one. An empty string says it has none. */
  pullRequest?: string
  /** The same PR's address - the page opens by it. */
  pullRequestUrl?: string
}

/**
 * What was said put over what is held, each field falling back to what is already held.
 *
 * The machine says the whole of this fact every time (see ProjectCatalog.sayProject), so on a current
 * plugin nothing ever falls back. The fallback is for the other case, which is the ordinary one for a week
 * after a release on the phone: its page is served by the relay and updates with it, while the plugin
 * updates when somebody gets round to it - and an older one sends the branch and the pull request as two
 * separate messages, each carrying its half. Replaced whole, the second of them wiped the first, and the
 * branch disappeared at the next look at GitHub.
 */
export const withBranch = <T extends BranchFacts>(held: T, said: BranchFacts): T => ({
  ...held,
  gitBranch: said.gitBranch ?? held.gitBranch,
  pullRequest: said.pullRequest ?? held.pullRequest,
  pullRequestUrl: said.pullRequestUrl ?? held.pullRequestUrl,
})
