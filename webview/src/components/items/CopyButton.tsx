import { useEffect, useState } from 'react'
import { copyToClipboard } from '../../clipboard'

interface CopyButtonProps {
  /** What travels into the clipboard - ready plain text, without markdown. */
  text: string
  className: string
  title: string
}

/** How long the tick is held after a copy before the icon returns. */
const COPIED_FLASH_MS = 1500

/**
 * The "copy" button - one for every place a piece of an answer is copied from: the whole answer, a code
 * block inside it. A tick instead of the icon is the only answer to a press possible here: one cannot
 * look into the clipboard.
 */
export const CopyButton = ({ text, className, title }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    return () => clearTimeout(timeout)
  }, [copied])

  return (
    <button
      type="button"
      className={className}
      data-tooltip={title}
      onClick={(event) => {
        // A code block lies inside the answer's card, which has click handlers of its own (selection,
        // the menu) - a press on the button must not reach them.
        event.stopPropagation()
        void copyToClipboard(text).then((ok) => {
          if (ok) setCopied(true)
        })
      }}
    >
      {copied ? '✓' : '⧉'}
    </button>
  )
}
