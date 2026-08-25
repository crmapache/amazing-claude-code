/**
 * The "@" hint in the input field - the project's files rather than commands. The list arrives from the
 * shell once and refreshes itself; only the filtering by what has been typed lives here.
 */

const MAX_FILE_SUGGESTIONS = 40

/** Matches on the file's name come first - the same as with slash commands. */
export const matchFiles = (files: string[], query: string, limit = MAX_FILE_SUGGESTIONS): string[] => {
  const needle = query.toLowerCase()
  if (!needle) return files.slice(0, limit)

  const starts: string[] = []
  const contains: string[] = []

  for (const file of files) {
    const path = file.toLowerCase()
    const name = path.replace(/\/$/, '').split('/').at(-1) ?? path

    if (name.startsWith(needle) || path.startsWith(needle)) starts.push(file)
    else if (path.includes(needle)) contains.push(file)
  }

  return [...starts, ...contains].slice(0, limit)
}

/** An "@" at the start of a line or after a space - the same word the caret is typing right now. */
const AT_QUERY = /(?:^|\s)@([^\s@]*)$/

/**
 * The file being named right now, read out of plain text up to the caret.
 *
 * The panel reads the same thing off the DOM, because its field is a contentEditable with live chips
 * in it (see atQueryAt in composerDom.ts). A phone's field is an ordinary textarea, so there is only
 * text - but the rule about what counts as a mention has to be the one rule, not two that agree today.
 *
 * From the caret rather than from the field's start: unlike a slash command, an "@" can be typed
 * mid-sentence, as in a terminal ("look at @file and").
 */
export const atQueryInText = (text: string, caret: number): { query: string; start: number } | null => {
  const before = text.slice(0, caret)
  const match = AT_QUERY.exec(before)
  if (!match) return null

  // The expression allows a space before the "@" so that a mention mid-sentence is found; that space
  // belongs to the text, not to the mention, and must survive being replaced by the chosen file.
  return { query: match[1] ?? '', start: match.index + (match[0].startsWith('@') ? 0 : 1) }
}
