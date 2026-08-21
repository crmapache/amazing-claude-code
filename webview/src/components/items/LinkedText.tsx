import { linkify } from '../../feed/markdown'
import s from '../feed.module.css'

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
        <span key={index}>{part.text}</span>
      ),
    )}
  </>
)
