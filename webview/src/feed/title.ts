/**
 * An instant tab name out of the first message - a heuristic stand-in until the real title from the LLM
 * arrives (see sessionTitle in protocol.ts), and the fallback if that call did not work out. The same
 * logic as in ClaudeHistory.kt on the plugin's side (for the titles in the history panel) - keeping them
 * word for word identical is not required, but the result has to be recognisably the same for one and
 * the same message.
 */

import { withoutShellText } from './bash'

const IMAGE_PLACEHOLDER = /\[Image #\d+]/g
const MULTIPLE_SPACES = / {2,}/g

const stripImageTags = (line: string): string => line.replace(IMAGE_PLACEHOLDER, ' ').replace(MULTIPLE_SPACES, ' ').trim()

const isAttachmentLine = (line: string): boolean => line.startsWith('@') || line.startsWith('> ')

const truncateAtWord = (text: string, max: number): string => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}

/**
 * Joins the meaningful lines of the first message into one - a short first line ("Right") must not
 * become the whole tab name when the substance of the question is written a line below. Attachments
 * (`@path`, a quote, an `[Image #N]` even mid-sentence) and bash-mode output are cut out of the name as
 * noise.
 */
export const deriveSessionTitle = (text: string, max = 60): string => {
  const rawLines = withoutShellText(text)
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const meaningful = rawLines.map(stripImageTags).filter((line) => line.length > 0 && !isAttachmentLine(line))

  const joined = (meaningful.length > 0 ? meaningful : rawLines.slice(-1)).join(' ').trim()

  return truncateAtWord(joined, max)
}
