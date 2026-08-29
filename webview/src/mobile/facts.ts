import type { CommandEntry, CommandHint } from '../feed/slash'
import { buildCommands } from '../feed/slash'
import { mergeUsage, type UsageFacts } from '../feed/usage'
import type { Dict } from '../i18n/en'
import type { ShellMessage } from '../protocol'

/**
 * What a phone knows about a project rather than about one conversation in it.
 *
 * The branch and its pull request, the subscription's windows, the descriptions of the slash commands,
 * the project's files. All four arrive by themselves - nobody asks for them (see
 * ClaudeSessionHub.PROJECT_ORDER and RemoteFeed.projectFact) - and the composer cannot be drawn
 * without them.
 *
 * Per project rather than per conversation, and that is the whole reason this is a file of its own:
 * they outlive the screen. Walking out of a chat and back into it must not empty the limit rings and
 * blank the branch while the IDE gets round to saying them again.
 */
export interface ProjectFacts extends UsageFacts {
  gitBranch?: string
  pullRequest?: string
  pullRequestUrl?: string
  /** The project's paths, for the "@" hint. Trimmed on the way out - see RemoteFeed.forPhone. */
  files: string[]
  hints: Record<string, CommandHint>
  /**
   * The names of the commands the agent knows, as the IDE last heard them (see the `commands` message).
   * A phone never sees a conversation start, so this is the only route by which the MCP servers'
   * commands - which live in no file and so have no hint of their own - reach the field at all.
   */
  commands: string[]
  /**
   * The language the panel at the desk is speaking, so this screen speaks it too.
   *
   * It is not a property of the project but of the person, and it arrives here the same way the project's
   * facts do because there is no other route: the phone is never sent `init`, which carries the working
   * directory (see RemoteFeed). Absent until the IDE says - and then it is English, as it always was.
   *
   * Both halves are kept as they arrived rather than folded into one here. Which of them wins is a rule
   * - an explicit choice beats the language of the IDE - and that rule already exists, in `activeLocale`;
   * applied here as well, it was written twice and `activeLocale` was left being called with a second
   * argument that could never mean anything.
   */
  locale?: { chosen: string; ide: string }
}

export const emptyFacts = (): ProjectFacts => ({ files: [], hints: {}, commands: [] })

/**
 * Whether this is one of the project's facts rather than a line of somebody's conversation.
 *
 * The list is the client's half of the one in RemoteFeed: what that one lets out, this one takes in.
 * They are checked against each other by nothing but care, so both are short and both say why.
 */
export const isFact = (message: ShellMessage): boolean =>
  message.type === 'usage' ||
  message.type === 'project' ||
  message.type === 'files' ||
  message.type === 'commandHints' ||
  message.type === 'commands' ||
  message.type === 'locale'

/**
 * One fact folded into what is already known.
 *
 * The usage is folded by the shared rules rather than by a copy of them here (see mergeUsage): the same
 * message reaches the panel at the desk, and the two screens disagreeing about what a percentage means
 * would be worse than either of them saying nothing.
 */
export const applyFact = (facts: ProjectFacts, message: ShellMessage): ProjectFacts => {
  switch (message.type) {
    case 'usage':
      return { ...facts, ...mergeUsage(facts, message) }

    case 'project':
      // Replaced rather than merged, unlike the usage: this one message is the whole answer about the
      // branch, and a branch with no pull request says so by leaving the field out. Merging would keep
      // yesterday's PR number beside today's branch.
      return {
        ...facts,
        gitBranch: message.gitBranch,
        pullRequest: message.pullRequest,
        pullRequestUrl: message.pullRequestUrl,
      }

    case 'files':
      return { ...facts, files: message.files }

    case 'commandHints':
      return { ...facts, hints: message.hints }

    case 'commands':
      return { ...facts, commands: message.commands }

    /*
     * Both halves, as they were said. Which of them wins is decided where every screen asks for it (see
     * activeLocale) - the phone is looking at the same setting as the panel, it simply cannot change it
     * (see RemoteCommands).
     */
    case 'locale':
      return { ...facts, locale: { chosen: message.language ?? '', ide: message.ideLanguage ?? '' } }

    default:
      return facts
  }
}

/**
 * The slash commands a phone may offer.
 *
 * The panel's own four - resume, fork, login, logout - are dropped rather than shown greyed out. They
 * are not commands the agent knows: the panel intercepts each one and does something local with it,
 * and two of them (login, logout) open a terminal on the work machine, which is refused over the wire
 * anyway (see RemoteCommands.DENIED). Offering them here would end in a command sent to an agent that
 * has never heard of it.
 *
 * Past conversations are not lost by this: the phone has a screen for them already, reached from the
 * project rather than from the field.
 */
export const phoneCommands = (t: Dict, facts: ProjectFacts): CommandEntry[] =>
  buildCommands(t, facts.commands, facts.hints).filter((command) => command.group !== 'panel')
