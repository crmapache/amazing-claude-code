import { linkify } from '../../feed/markdown'
import { useOpenFile } from '../../hooks/useOpenFile'
import s from '../feed.module.css'
import { PathLink, withPathLinks } from './PathLink'

interface LinkedTextProps {
  text: string
  /** Open the address in the system browser rather than inside the panel's webview. */
  onOpenLink: (url: string) => void
}

/**
 * The text exactly as it arrived, but with live addresses inside it.
 *
 * For places where markup must not be parsed: in a person's message asterisks and hashes mean themselves,
 * and an error is a line from a process rather than markdown. An address, though, has to stay an address:
 * the link to the service status in "API Error … check https://status.claude.com" is clicked rather than
 * retyped into a browser by hand.
 *
 * A path is the same kind of thing (see PathLink). A person who pasted `src/useSocket.js:15` into the
 * field meant that place more plainly than anyone, and a stack trace in an error is a list of them.
 */
export const LinkedText = ({ text, onOpenLink }: LinkedTextProps) => (
  <>
    {linkify(text).map((part, index) =>
      part.href ? (
        <a
          key={index}
          href={part.href}
          className={s.link}
          // Outwards, into the system browser: ordinary navigation would carry the panel's own webview
          // off to that address, interface and all.
          onClick={(event) => {
            event.preventDefault()
            onOpenLink(part.href ?? '')
          }}
        >
          {part.text}
        </a>
      ) : (
        <PlainWithPaths key={index} text={part.text} />
      ),
    )}
  </>
)

/** A stretch with no address in it: whatever names a file becomes a link, the rest stays as it came. */
const PlainWithPaths = ({ text }: { text: string }) => {
  const runs = withPathLinks(text, useOpenFile())
  if (!runs) return <span>{text}</span>

  return (
    <>
      {runs.map((run, index) =>
        run.ref ? <PathLink key={index} run={run} /> : <span key={index}>{run.text}</span>,
      )}
    </>
  )
}
