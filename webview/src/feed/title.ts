/**
 * An instant tab name out of the first message - a heuristic stand-in until the real title from the LLM
 * arrives (see sessionTitle in protocol.ts), and the fallback if that call did not work out. The same
 * logic as in ClaudeHistory.kt on the plugin's side (for the titles in the history panel) - keeping them
 * word for word identical is not required, but the result has to be recognisably the same for one and
 * the same message.
 */

import { withoutShellText } from './bash'
import type { SearchHit, TitleSource } from '../protocol'

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

/**
 * The name, and its rank, a past conversation opens in a tab with - picked from the history list or
 * reached from a search hit.
 *
 * A name the person gave travels exactly as they typed it. Worked over like a guess it came out cut at
 * forty characters and short of a line starting with "@", and the tab hands its name back to the
 * conversation's transcript with the next message (see ClaudeSession.nameAfterPerson) - the cut would
 * have been written over the name itself. A name with no rank said is the model's, as it always was.
 */
export const resumedTitle = (
  title: string,
  source: TitleSource | undefined,
): { title: string; titleSource: TitleSource } => {
  if (source === 'user') return { title, titleSource: 'user' }

  return { title: deriveSessionTitle(title, 40), titleSource: source === 'heuristic' ? 'heuristic' : 'llm' }
}

/**
 * Where a search hit's title came from - see SearchHit.titleSource. An IDE built before that field says
 * only whether the title is a guess, and a phone may well be talking to one.
 */
export const searchHitTitleSource = (hit: Pick<SearchHit, 'named' | 'titleSource'>): TitleSource =>
  hit.titleSource ?? (hit.named ? 'llm' : 'heuristic')
