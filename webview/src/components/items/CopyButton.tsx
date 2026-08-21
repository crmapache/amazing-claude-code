import { useEffect, useState } from 'react'
import { writeClipboard } from '../../clipboard'

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
      title={title}
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

/** How long the modern Clipboard API is waited for before it counts as unavailable. */
const CLIPBOARD_API_TIMEOUT_MS = 300

/**
 * navigator.clipboard is not always present in the IDE's embedded browser (JCEF) - and, worse than an
 * ordinary refusal, it may not reject with an error but hang without an answer for good (verified live:
 * a plain await never sees either success or refusal). The button meanwhile reported success (the tick)
 * at once, waiting for nothing at all. document.execCommand is already used in the panel for other
 * operations and works reliably there, so it is an honest fallback when the modern API is unavailable,
 * failed, or stays silent longer than is reasonable. "Success" now means exactly success rather than
 * merely a call.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  // Apart from both browser routes: on Linux the embedded browser's clipboard is connected to nothing,
  // and both of them put the text where nobody can reach it afterwards - neither the editor nor a
  // neighbouring application (see clipboard.ts). This button slips past the shared copy interception
  // because the modern Clipboard API raises no copy event.
  const bridged = writeClipboard(text)

  if (navigator.clipboard?.writeText) {
    // .catch straight on the promise itself - otherwise, rejecting later than the timeout has already
    // won the race, it surfaces as an uncaught (in promise) in the console.
    const write = navigator.clipboard
      .writeText(text)
      .then(() => 'done' as const)
      .catch(() => 'failed' as const)
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), CLIPBOARD_API_TIMEOUT_MS))

    if ((await Promise.race([write, timeout])) === 'done') return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  return ok || bridged
}
