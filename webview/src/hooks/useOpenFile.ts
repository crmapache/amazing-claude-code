import { createContext, useContext } from 'react'
import { NOTHING_KNOWN, type KnownFiles } from '../feed/paths'

/** What the panel asks the IDE to open, and where in it to land. */
export interface OpenFileRequest {
  /** As the agent wrote it: absolute, or relative to the project - the IDE resolves it (see OpenInEditor). */
  path: string
  /** 1-based, the way a person counts lines - when the reference named one (`App.tsx:120`). */
  line?: number
  /** 1-based as well, and only when the reference named it: `App.tsx:120:30`. */
  column?: number
  /**
   * The end of a range, when the reference named one - and then the editor selects it rather than dropping
   * the caret at its start (see OpenInEditor). Inclusive, the way a person counts.
   */
  endLine?: number
  endColumn?: number
  /**
   * A line of text to land on, when the reference named no number - the first line an edit added.
   *
   * The alternative was landing at the top of the file, which for an edit halfway down a thousand lines
   * is most of the way to not opening it at all. The number itself cannot be had here: the CLI answers an
   * edit with a sentence rather than with a place in the file (checked against the whole local archive of
   * conversations), so the place is found on the IDE's side, in the file it already has open.
   */
  find?: string
}

/**
 * Opening a file the feed names, in the editor beside the panel.
 *
 * A context rather than a prop for the same reason the clock is one (see useNow): the readers are leaves -
 * a path in the head of a call's card, a path in backticks in the middle of an answer - and threading a
 * handler through every component in between would put the IDE into the signature of things that have
 * nothing to do with it.
 *
 * Null means there is no editor to open anything in, and that is the phone's honest answer rather than a
 * missing wire: a path there stays what it was, a piece of text a tap copies (see InlineCode). The panel
 * at the desk provides it (see App).
 */
export const OpenFileContext = createContext<((request: OpenFileRequest) => void) | null>(null)

/** The editor to open a named file in, or null where there is none - see [OpenFileContext]. */
export const useOpenFile = (): ((request: OpenFileRequest) => void) | null => useContext(OpenFileContext)

/**
 * The project's files, for telling a file's name from a word that merely looks like one (see KnownFiles).
 *
 * A context for the same reason as the one above: the readers are the same leaves. The default knows
 * nothing, which is the honest answer everywhere the shell has not sent its list - the harness, the
 * phone, the first moments of the panel - and there the rules about shape decide alone, as they did.
 */
export const KnownFilesContext = createContext<KnownFiles>(NOTHING_KNOWN)

/** What the project is known to have - see [KnownFilesContext]. */
export const useKnownFiles = (): KnownFiles => useContext(KnownFilesContext)
