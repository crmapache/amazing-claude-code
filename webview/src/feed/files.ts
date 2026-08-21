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
