import { withFileRefs, type KnownFiles, type TextRun } from '../../feed/paths'
import { useOpenFile } from '../../hooks/useOpenFile'
import { useT } from '../../i18n'
import s from '../feed.module.css'

/**
 * A path inside ordinary text: a click opens the file in the editor - or shows the folder, when the path
 * names one (see FileRef.folder and OpenInEditor).
 *
 * A button rather than a link with an address: there is no address here, and the panel has no browser of
 * its own to be carried off by one. Dotted under the pointer, exactly as a path in backticks is (see
 * .codeFile) - in this panel a solid underline means a link out into a browser.
 *
 * Its own file because two different kinds of text hold paths and both have to open them: the agent's
 * answers, which are markdown (see Markdown), and the lines shown exactly as they came - a person's own
 * message, the text of an error (see LinkedText).
 */
export const PathLink = ({ run, children }: { run: TextRun; children?: React.ReactNode }) => {
  const t = useT()
  const openFile = useOpenFile()
  const ref = run.ref

  if (!ref || !openFile) return <>{children ?? run.text}</>

  // What the click does, in the words of the thing it does it to - the hover on a path is the one place
  // that says so before it happens. The flag itself stays here: the IDE asks the disk rather than us.
  const { folder, ...request } = ref
  const does = folder ? t.feed.copy.openFolder : t.feed.copy.openFile

  return (
    <button
      type="button"
      className={s.pathLink}
      aria-label={`${does}: ${run.text}`}
      data-tooltip={does}
      onClick={() => openFile(request)}
    >
      {children ?? run.text}
    </button>
  )
}

/**
 * A stretch of text with the files named inside it picked out - for text shown exactly as it came, with no
 * markup parsed in it at all.
 *
 * A person's own message counts: a path pasted into the field by hand is the one thing they most obviously
 * meant to point at. So does the text of an error, which is where a stack trace's paths live.
 */
export const withPathLinks = (text: string, openFile: unknown, known?: KnownFiles): TextRun[] | null => {
  if (!openFile) return null

  const runs = withFileRefs(text, known)
  // By whether anything is a link rather than by how many pieces came back: a text that is nothing but a
  // path comes back as ONE piece, and that piece is the link.
  return runs.some((run) => run.ref) ? runs : null
}
