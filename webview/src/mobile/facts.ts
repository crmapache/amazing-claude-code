import type { CommandEntry, CommandHint } from '../feed/slash'
import { buildCommands } from '../feed/slash'
import type { ShellMessage, UsageWindow } from '../protocol'

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
export interface ProjectFacts {
  session?: UsageWindow
  week?: UsageWindow
  /** The current model's context window: with the large ones it is a million, not two hundred thousand. */
  contextWindow?: number
  /** Today's tokens across every project - the same "tok" as in a terminal. */
  todayTokens?: string
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
  message.type === 'commands'

/**
 * One fact folded into what is already known.
 *
 * Merged rather than replaced whole, which matters for the usage above all: it arrives by two
 * independent routes - the conversation's own windows, and separately the scan of the transcripts that
 * counts today's tokens - and taking the last one entire would let each zero out what the other had
 * just learned.
 */
export const applyFact = (facts: ProjectFacts, message: ShellMessage): ProjectFacts => {
  switch (message.type) {
    case 'usage':
      return {
        ...facts,
        session: message.session ?? facts.session,
        week: message.week ?? facts.week,
        // ?? will not do here: a 0 is not nullish, it would stick in the state for good and the context
        // gauge would divide by zero ever after.
        contextWindow:
          message.contextWindow && message.contextWindow > 0 ? message.contextWindow : facts.contextWindow,
        todayTokens: message.todayTokens ?? facts.todayTokens,
      }

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
export const phoneCommands = (facts: ProjectFacts): CommandEntry[] =>
  buildCommands(facts.commands, facts.hints).filter((command) => command.group !== 'panel')
