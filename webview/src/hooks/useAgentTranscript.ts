import { createContext, useContext } from 'react'

/**
 * What one agent of a workflow did, as the IDE read it off that agent's own transcript - see
 * WorkflowAgents.kt and the `agentTranscript` pair in protocol.ts.
 *
 * 'loading' is the moment between asking and being answered; 'missing' means the file is not there at
 * all, and then the report's own 400-character previews are all the panel has. Both are states worth
 * naming: a body that stays empty without a word in it reads as a broken card.
 */
export interface AgentTranscript {
  state: 'loading' | 'ready' | 'missing'
  /**
   * What the agent's own state was when this was asked for.
   *
   * The reason a re-read happens at all: a transcript read while its agent was running holds no answer -
   * the very thing the line was opened for - so it is worth reading again once the agent is done. And the
   * reason it happens only once: without a mark of what was already read, "re-read a finished agent" is
   * true again the moment the answer arrives, and the panel reads a megabyte in a loop for as long as the
   * line stays open.
   */
  of?: string
  prompt?: string
  steps?: string[]
  output?: string
  truncated?: boolean
}

export interface AgentTranscripts {
  of: (agentId: string) => AgentTranscript | undefined
  /**
   * Ask for it, naming the agent's state as it stands now. Answered once per state: unfolding a line
   * twice does not read a megabyte twice, and an agent that has finished since it was read is read again
   * exactly once (see [AgentTranscript.of]).
   */
  request: (agentId: string, state: string) => void
}

/**
 * Reading a fleet's agent, for the lines that show one.
 *
 * A context rather than a prop for the same reason as the editor above it (see useOpenFile): the reader
 * is a leaf - one line among forty inside a card inside the feed - and threading a handler through
 * everything in between would put disk reading into the signature of components that have nothing to do
 * with it.
 *
 * Null is the honest answer where there is no disk to read: a phone, which is handed the feed rather
 * than the machine it was made on. A line unfolds there too - it simply shows what the report itself
 * carries.
 */
export const AgentTranscriptContext = createContext<AgentTranscripts | null>(null)

/** What is known about a fleet's agents, or null where nobody can read them - see [AgentTranscriptContext]. */
export const useAgentTranscripts = (): AgentTranscripts | null => useContext(AgentTranscriptContext)
