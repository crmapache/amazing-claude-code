import { createContext, useContext } from 'react'

/**
 * Which agent of a fleet is open, told by where it stands rather than by a copy of it.
 *
 * A copy would be a snapshot: the run keeps reporting, and the agent that was running when the window
 * was opened finishes a minute later with an answer in hand - which is the whole reason one opened it.
 * Named by its card and its number, it is looked up afresh on every repaint and is always the agent as
 * the report has it now (see feed/workflow.ts, where the number is the CLI's own key).
 */
export interface OpenedAgent {
  /** The tab it belongs to: a window opened in one conversation has no business in another. */
  session: string
  /** The workflow's card in the feed. */
  card: string
  index: number
}

/**
 * Opening one, for the line that shows it.
 *
 * A context rather than a prop for the same reason as the editor and the fleet's transcripts beside it
 * (see useOpenFile, useAgentTranscript): the caller is a leaf - one line among forty, inside a card,
 * inside the feed - while the window itself is drawn over the whole output area, at the other end of the
 * screen. Null where nothing can open it, which is nowhere today: both the panel and the phone provide
 * it, and a line that cannot be opened is drawn as a line rather than as a dead button.
 */
export const OpenAgentContext = createContext<((card: string, index: number) => void) | null>(null)

/** The way to open a fleet's agent, or null where there is none - see [OpenAgentContext]. */
export const useOpenAgent = (): ((card: string, index: number) => void) | null => useContext(OpenAgentContext)
