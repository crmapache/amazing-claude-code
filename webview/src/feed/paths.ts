/**
 * Which pieces of what the agent says are files one can open, and where in them to land.
 *
 * The agent talks in paths constantly - `webview/src/App.tsx`, `claude/ClaudeSession.kt:120`,
 * `@relay/README.md` - and inside an IDE such a line is worth a click rather than a retype. What is not
 * worth a click is everything that merely looks like one: a version number, a glob, an abbreviation with
 * a dot in it, `state.items` out of the middle of a sentence about code. A link that leads nowhere is
 * worse than plain text - it promises and does nothing - so the rule here is deliberately narrow and
 * refuses whatever it is not sure of.
 */

export interface FileRef {
  /** As the agent wrote it: absolute, or relative to the project - the shell resolves it (see OpenInEditor). */
  path: string
  /** 1-based, the way a person counts lines. Absent when the reference named no line. */
  line?: number
  /**
   * 1-based too, and only when the reference named one: `App.tsx:120:30`.
   *
   * Carried rather than dropped, because a person who wrote the column meant it - and a caret that lands
   * at the start of the line has answered a question nobody asked.
   */
  column?: number
  /**
   * The end of a range, when the reference named one: `App.tsx:15-20`, `App.tsx:15:33-40`.
   *
   * A range is a piece of the file rather than a point in it, and what is asked for by writing one is to
   * see that piece - so the editor selects it (see OpenInEditor) instead of dropping the caret at its
   * start and leaving the rest to be counted by eye. Inclusive, the way a person counts: "33-40" is eight
   * characters.
   */
  endLine?: number
  endColumn?: number
}

/** Characters no filename carries, and which are how a path gets smuggled past the eye. */
const CONTROL = /[\u0000-\u001f\u007f]/

/**
 * Where a path may not lead, whoever named it.
 *
 * The text a path is read out of is not the person's: the agent retells files it has read, output of
 * commands and pages off the web, and whatever gets into those gets in here. Two forms are refused
 * outright rather than left to the other side to survive:
 *
 * - a network path (`//host/share`, `\\host\share`). Opening one sends the machine to a host somebody
 *   else named, and on Windows it introduces itself on the way - the user's name and an answer to a
 *   password challenge, to whoever is listening. A click on a path in a chat must not be able to do that.
 * - control characters: no filename has them.
 *
 * A web address is refused too, for an ordinary reason: it is already a link, and it belongs in a browser
 * rather than in the editor.
 *
 * Asked by both halves of this - the rule below that reads a path out of prose, and the head of a call's
 * card, which takes the path the tool itself was given (see fileTarget in ToolCard).
 */
export const isOpenablePath = (path: string): boolean => {
  const trimmed = path.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) return false
  if (trimmed.includes('://')) return false
  return !CONTROL.test(trimmed)
}

/**
 * The extensions a bare name is allowed to become a link by.
 *
 * The list exists because of one false positive that outnumbered all the true ones: in a sentence about
 * code `state.items` and `event.target` have exactly the shape of a file with an extension, and every
 * fourth piece the rule called a path was a property access. A name with a separator in it (`src/x.ts`) or
 * a line number after it (`Foo.kt:12`) needs no list - those shapes are paths and nothing else.
 *
 * Written out rather than guessed, and easy to add to: an unknown extension costs one copy by hand, a
 * wrong guess costs a link that promises an editor and does nothing.
 */
const KNOWN_EXTENSIONS = new Set([
  // The languages this panel and its neighbours are written in
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'kt', 'kts', 'java', 'py', 'rb', 'go', 'rs',
  'php', 'cs', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'm', 'mm', 'scala', 'dart', 'lua', 'pl', 'r',
  'jl', 'zig', 'hs', 'ex', 'exs', 'clj', 'vue', 'svelte', 'astro',
  // Shells and build files
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'gradle', 'mk', 'podspec', 'gemspec',
  // Markup, styles, data, docs
  'html', 'htm', 'xml', 'svg', 'css', 'scss', 'sass', 'less', 'md', 'mdx', 'txt', 'rst', 'adoc',
  'json', 'jsonc', 'json5', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'env',
  'csv', 'tsv', 'sql', 'graphql', 'gql', 'proto', 'prisma', 'tf', 'ipynb', 'plist', 'lock', 'log',
  // The dotfiles the agent names most of all: with a leading dot the name itself is the "extension"
  'gitignore', 'gitattributes', 'gitmodules', 'dockerignore', 'editorconfig', 'npmrc', 'nvmrc',
  'prettierrc', 'eslintrc', 'babelrc', 'stylelintrc',
])

/** The punctuation a sentence leaves stuck to a path, and the "@" the panel's own file chips are written with. */
const EDGES = /^[@(["']+|[).,;:"'\]]+$/g

/**
 * The place at the end of a reference: `App.tsx:120`, `App.tsx:120:4`, and the ranges people write just
 * as readily - `App.tsx:120-130`, `App.tsx:120:33-35`.
 *
 * A range travels whole: it is a piece of the file rather than a point in it, and the editor selects it.
 * Refusing the whole reference over the tail, which is what happened before, left the most precise thing
 * anyone had written as plain text.
 */
const AT_LINE = /:(\d+)(?:-(\d+))?(?::(\d+)(?:-(\d+))?)?$/

/** A drive letter at the front, which is the one place a colon belongs to the path rather than to a line. */
const DRIVE = /^[A-Za-z]:[\\/]/

/** What a path may not contain anywhere: whitespace, a glob's wildcards, a shell's redirections. */
const FORBIDDEN = /[\s*?"<>|]/

/**
 * The dot and what follows it in the last segment: letters, then letters or digits - never a version's
 * `247`. Long enough for the dotfiles, where the whole name is the "extension": `.gitattributes`.
 */
const EXTENSION = /\.([A-Za-z][A-Za-z0-9]{0,14})$/

/**
 * The file this piece of text names, or nothing when it names none.
 *
 * Trimmed of what the writing around it left behind: a path at the end of a sentence keeps the full stop,
 * one inside brackets keeps the bracket, and neither belongs to the name of the file.
 *
 * [bare] is what tells the two callers apart. A piece the agent put in backticks it meant as code, so a
 * lone `CLAUDE.md` there is a file and is treated as one. In running prose the same shape is a word about
 * as often as it is a file - "Node.js", "Next.js", "React.js" - so there a name has to carry a separator
 * or a line number before it becomes a link (see withFileRefs).
 */
export const fileRef = (text: string, bare = true): FileRef | null => {
  const trimmed = text.trim().replace(EDGES, '')
  if (!isOpenablePath(trimmed)) return null

  const at = AT_LINE.exec(trimmed)
  const line = at ? Number(at[1]) : undefined
  const named = line !== undefined && Number.isFinite(line) && line > 0
  const endLine = number(at?.[2])
  const column = number(at?.[3])
  const endColumn = number(at?.[4])
  const path = at ? trimmed.slice(0, at.index) : trimmed

  if (!path || FORBIDDEN.test(path)) return null

  const drive = DRIVE.test(path)
  // A colon anywhere else is not a path's - it is a label, a time, a ratio.
  if (path.slice(drive ? 2 : 0).includes(':')) return null

  const lastSegment = path.split(/[/\\]/).at(-1) ?? ''
  const extension = EXTENSION.exec(lastSegment)?.[1]?.toLowerCase()
  // A last segment without an extension is a directory, or a word we cannot tell from one.
  if (!extension) return null

  // A separator or a line number makes the shape a path by itself; a bare name has to earn it by its
  // extension, or every `state.items` in an answer becomes a link to a file that was never there.
  const separated = /[/\\]/.test(path)
  const shaped = separated || named || (bare && KNOWN_EXTENSIONS.has(extension))
  if (!shaped) return null

  if (!named) return { path }

  return {
    path,
    line,
    ...(column === undefined ? {} : { column }),
    ...(endLine === undefined ? {} : { endLine }),
    // Only alongside a column: "15:33-40" is a piece of one line, while "15-20" is a piece of the file and
    // its end is a line rather than a character in one.
    ...(column === undefined || endColumn === undefined ? {} : { endColumn }),
  }
}

/** A figure a person wrote, or nothing: a zero and a nonsense are the same as unsaid. */
const number = (text: string | undefined): number | undefined => {
  if (!text) return undefined
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/** One piece of ordinary text: either a stretch of it, or a file it names. */
export interface TextRun {
  text: string
  /** The file this stretch names, when it names one. Absent for everything else. */
  ref?: FileRef
}

/** Whitespace splits candidates apart: a path in a sentence ends where the space begins. */
const TOKENS = /\S+/g

/**
 * The same text, with the files named inside it picked out - for the places where the agent writes a path
 * without marking it as code at all.
 *
 * That is most places, as it turns out: asked for a list of files, the agent answers with bare lines, and
 * a list of paths that cannot be clicked is exactly the retyping this was built to remove. A fenced block
 * of them goes the same way (see ParagraphView).
 *
 * The rule is stricter here than in backticks: a path must carry a separator or a line number. In prose a
 * bare "Node.js" is a name far more often than a file, and a sentence peppered with links that open
 * nothing is worse than one with no links at all.
 *
 * Every character of the original comes back out, in order - the runs are the text, cut rather than
 * rewritten - so a block of code still reads exactly as the agent wrote it.
 */
export const withFileRefs = (text: string): TextRun[] => {
  const runs: TextRun[] = []
  let last = 0

  for (const match of text.matchAll(TOKENS)) {
    const token = match[0]
    const at = match.index

    // The punctuation of the sentence is not part of the name, and it stays outside the link.
    const core = token.replace(EDGES, '')
    if (!core) continue

    const ref = fileRef(core, false)
    if (!ref) continue

    const start = at + token.indexOf(core)
    if (start > last) runs.push({ text: text.slice(last, start) })
    runs.push({ text: core, ref })
    last = start + core.length
  }

  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs
}
