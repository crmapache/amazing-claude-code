import { describe, expect, it } from 'vitest'
import { fileRef, isOpenablePath, knownFiles, withFileRefs } from './paths'

/**
 * What a click on a piece of an answer does hangs on this rule alone: a path opens in the editor, anything
 * else copies. Both halves matter equally - a version number turned into a link promises an editor that
 * has nothing to open, and a path left as plain text sends a person back to typing it out by hand.
 */
describe('a file named in an answer', () => {
  it('reads a plain path', () => {
    expect(fileRef('webview/src/App.tsx')).toEqual({ path: 'webview/src/App.tsx' })
  })

  it('reads the line after it', () => {
    expect(fileRef('webview/src/App.tsx:3262')).toEqual({ path: 'webview/src/App.tsx', line: 3262 })
  })

  // A person who wrote the column meant it, and a caret at the start of the line ignores them.
  it('reads the column after the line', () => {
    expect(fileRef('src/main.kt:120:4')).toEqual({ path: 'src/main.kt', line: 120, column: 4 })
  })

  // A range is a piece of the file rather than a point in it, and what is asked for by writing one is to
  // see that piece - so it travels whole and the editor selects it.
  it('reads a range of columns whole', () => {
    expect(fileRef('src/useSocket.js:15:33-40')).toEqual({
      path: 'src/useSocket.js',
      line: 15,
      column: 33,
      endColumn: 40,
    })
  })

  it('reads a range of lines whole', () => {
    expect(fileRef('src/useSocket.js:15-20')).toEqual({
      path: 'src/useSocket.js',
      line: 15,
      endLine: 20,
    })
  })

  it('leaves the column out when the reference named none', () => {
    expect(fileRef('src/main.kt:120')).toEqual({ path: 'src/main.kt', line: 120 })
  })

  it('takes a bare file name with an extension it knows', () => {
    expect(fileRef('CLAUDE.md')).toEqual({ path: 'CLAUDE.md' })
  })

  // The names the agent mentions most of all, and the old rule refused every one of them.
  it('takes a name that begins with a dot', () => {
    expect(fileRef('.gitignore')).toEqual({ path: '.gitignore' })
    expect(fileRef('.env')).toEqual({ path: '.env' })
  })

  it('takes an absolute path', () => {
    expect(fileRef('/Users/max/notes.md')).toEqual({ path: '/Users/max/notes.md' })
  })

  // Windows is half the machines this panel runs on, and the colon there is part of the path.
  it('takes a drive letter', () => {
    expect(fileRef('C:\\project\\build.gradle.kts')).toEqual({ path: 'C:\\project\\build.gradle.kts' })
  })

  // The panel writes its own file chips this way, and the agent copies the habit.
  it('ignores the "@" a file chip is written with', () => {
    expect(fileRef('@relay/README.md')).toEqual({ path: 'relay/README.md' })
  })

  it('leaves the punctuation of the sentence behind', () => {
    expect(fileRef('(webview/src/App.tsx),')).toEqual({ path: 'webview/src/App.tsx' })
  })
})

describe('what is not a file', () => {
  /**
   * The one false positive that outnumbered all the true ones: in a sentence about code a property
   * access has exactly the shape of a name with an extension, and a click on it promised an editor and
   * did nothing.
   */
  it('a property access in a sentence about code', () => {
    expect(fileRef('state.items')).toBeNull()
    expect(fileRef('event.target')).toBeNull()
    expect(fileRef('panel.compacting')).toBeNull()
  })

  /**
   * A network path is refused before anything touches the disk: the text it is read out of is the
   * agent's retelling of files, command output and web pages, and reaching for a host somebody else
   * named is - on Windows - the machine introducing itself to whoever is listening.
   */
  it('a network path, and nothing about it reaches the disk', () => {
    expect(fileRef('//attacker.example/share/a.ts')).toBeNull()
    expect(fileRef('\\\\attacker.example\\share\\a.ts')).toBeNull()
    expect(isOpenablePath('//attacker.example/share/a.ts')).toBe(false)
    expect(isOpenablePath('\\\\attacker.example\\share')).toBe(false)
  })

  it('a path with a control character in it', () => {
    expect(fileRef('src/a\u0000.ts')).toBeNull()
    expect(isOpenablePath('src/a\u001b[2J.ts')).toBe(false)
  })

  it('a label with a number after it', () => {
    expect(fileRef('Warning:42')).toBeNull()
    expect(fileRef('12:30')).toBeNull()
  })
  it('a version number', () => {
    expect(fileRef('2.1.247')).toBeNull()
  })

  it('a glob - it names a search rather than a file', () => {
    expect(fileRef('src/**/*.ts')).toBeNull()
  })

  it('a directory', () => {
    expect(fileRef('webview/src/components')).toBeNull()
  })

  it('an address - it is already a link, and it opens in a browser', () => {
    expect(fileRef('https://example.com/a.txt')).toBeNull()
  })

  it('a sentence with a path inside it', () => {
    expect(fileRef('see webview/src/App.tsx for this')).toBeNull()
  })

  it('an ordinary word', () => {
    expect(fileRef('useEffect')).toBeNull()
  })

  it('nothing at all', () => {
    expect(fileRef('   ')).toBeNull()
  })
})

describe('files named in ordinary text', () => {
  const linked = (text: string) => withFileRefs(text).filter((run) => run.ref).map((run) => run.text)

  // The case this exists for: asked for a list of files, the agent answers with bare lines.
  it('picks the paths out of a bare list', () => {
    const list = [
      '/Users/max/project/README.md',
      '/Users/max/project/package.json',
      '/Users/max/project/src/useSocket.js',
    ].join('\n')

    expect(linked(list)).toEqual([
      '/Users/max/project/README.md',
      '/Users/max/project/package.json',
      '/Users/max/project/src/useSocket.js',
    ])
  })

  it('picks one out of the middle of a sentence', () => {
    expect(linked('Правка лежит в webview/src/App.tsx:120, посмотри.')).toEqual(['webview/src/App.tsx:120'])
  })

  /**
   * Stricter here than in backticks: in prose a bare name with a familiar extension is a word about as
   * often as it is a file, and a sentence peppered with links that open nothing is worse than one with no
   * links at all.
   */
  it('leaves a bare name alone: "Node.js" is a word, not a file', () => {
    expect(linked('Собрано на Node.js и Next.js')).toEqual([])
    expect(linked('см. package.json')).toEqual([])
  })

  it('gives every character of the original back, in order', () => {
    const text = '  Открой /p/a.ts, потом /p/b.ts.\n'
    expect(withFileRefs(text).map((run) => run.text).join('')).toBe(text)
  })

  /**
   * The trap this exists to mark: a text that is nothing but a path comes back as ONE run, and that run is
   * the link. Reading "one run" as "nothing to link" is what left a bare path in a fenced block - the most
   * literal answer to "give me a link to this file" - as plain text (see PlainText and CodeBlock).
   */
  it('gives one run back when the whole text is a path, and that run is the link', () => {
    const runs = withFileRefs('/p/src/useSocket.js:11:15')

    expect(runs).toHaveLength(1)
    expect(runs[0]?.ref).toEqual({ path: '/p/src/useSocket.js', line: 11, column: 15 })
  })

  it('finds nothing in a text with no paths in it', () => {
    expect(linked('Всё готово, тесты зелёные.')).toEqual([])
  })
})

/**
 * The project's own list answers before any rule about shape does. The first review of the links put the
 * two failures of shape side by side: a name with an extension the panel did not know copied where its
 * neighbour opened, and a bare `.gitignore` in a list of files was the one line in it that was not a link.
 */
describe('files the project is known to have', () => {
  const known = knownFiles([
    '.gitignore',
    'Makefile',
    'build',
    'sandbox-project.iml',
    'notes.txtx',
    'src/components/Button.js',
    'src/legacy/Button.js',
    'src/utils/',
  ])

  it('makes a bare name in ordinary text a link when the project has the file', () => {
    expect(withFileRefs('the rules live in .gitignore and nowhere else', known)).toEqual([
      { text: 'the rules live in ' },
      { text: '.gitignore', ref: { path: '.gitignore' } },
      { text: ' and nowhere else' },
    ])
  })

  it('leaves a bare name alone when the project has no such file', () => {
    expect(withFileRefs('the rules live in .gitignore', knownFiles([]))).toEqual([{ text: 'the rules live in .gitignore' }])
    expect(withFileRefs('runs on Node.js', known)).toEqual([{ text: 'runs on Node.js' }])
  })

  it('trusts the list over the extension in backticks', () => {
    expect(fileRef('sandbox-project.iml', true, knownFiles([]))).toEqual({ path: 'sandbox-project.iml' })
    expect(fileRef('notes.txtx', true, knownFiles([]))).toBeNull()
    expect(fileRef('notes.txtx', true, known)).toEqual({ path: 'notes.txtx' })
  })

  it('takes a name without an extension only inside backticks', () => {
    expect(fileRef('Makefile', true, known)).toEqual({ path: 'Makefile' })
    // A script called "build" must not turn the word into a link across every answer.
    expect(withFileRefs('run the build again', known)).toEqual([{ text: 'run the build again' }])
    expect(fileRef('build', false, known)).toBeNull()
  })

  it('matches folders written in front against the tail of the path', () => {
    expect(known.has('components/Button.js')).toBe(true)
    expect(known.has('legacy/Button.js')).toBe(true)
    expect(known.has('ponents/Button.js')).toBe(false)
    expect(known.has('src/Button.js')).toBe(false)
    expect(known.has('./src/components/Button.js')).toBe(true)
    expect(known.has('src\\components\\Button.js')).toBe(true)
  })

  it('does not count a folder as a file', () => {
    expect(known.has('utils')).toBe(false)
    expect(known.has('src/utils/')).toBe(false)
  })

  it('still reads the line after a known name', () => {
    expect(withFileRefs('see .gitignore:3', known)).toEqual([
      { text: 'see ' },
      { text: '.gitignore:3', ref: { path: '.gitignore', line: 3 } },
    ])
  })
})

/**
 * A folder is a destination of its own - the IDE shows it rather than opening it (see OpenInEditor) - and
 * the report that asked for this was `~/.claude` in an answer: read as a file with a `claude` extension,
 * offered to the editor, and doing nothing at all when clicked.
 *
 * The rule is narrower than the one for files, because a folder has no extension to be recognised by: a
 * shape alone is never enough, the path has to be somewhere as well.
 */
describe('folders named in an answer', () => {
  const known = knownFiles(['src/utils/', 'webview/src/feed/', 'notes.md'])

  it('reads a dot-name outside the list of known dotfiles as a folder', () => {
    expect(fileRef('~/.claude')).toEqual({ path: '~/.claude', folder: true })
    expect(fileRef('/home/ivan/.config')).toEqual({ path: '/home/ivan/.config', folder: true })
  })

  it('keeps the dotfiles it knows files', () => {
    expect(fileRef('~/.gitignore')).toEqual({ path: '~/.gitignore' })
    expect(fileRef('~/.claude/settings.json')).toEqual({ path: '~/.claude/settings.json' })
  })

  it('reads a separator at the end as a folder', () => {
    expect(fileRef('/var/log/')).toEqual({ path: '/var/log/', folder: true })
    expect(fileRef('~/Downloads/')).toEqual({ path: '~/Downloads/', folder: true })
  })

  /** A shape is not a place: the same words inside a comment must stay words. */
  it('refuses a shape that starts nowhere and the project does not have', () => {
    expect(fileRef('foo/bar/')).toBeNull()
    expect(fileRef('src/utils')).toBeNull()
  })

  it('takes a folder the project has, written with a separator and with or without the slash', () => {
    expect(fileRef('src/utils', true, known)).toEqual({ path: 'src/utils', folder: true })
    expect(fileRef('src/utils/', true, known)).toEqual({ path: 'src/utils/', folder: true })
    expect(fileRef('webview/src/feed', false, known)).toEqual({ path: 'webview/src/feed', folder: true })
  })

  it('does not turn a folder\'s bare name into a link', () => {
    expect(fileRef('utils', true, known)).toBeNull()
    expect(withFileRefs('the utils in question', known)).toEqual([{ text: 'the utils in question' }])
  })

  /** Two words with a slash between them are the shape of a path and nothing else about it. */
  it('leaves a slash inside prose alone', () => {
    expect(withFileRefs('и/или, w/e', known)).toEqual([{ text: 'и/или, w/e' }])
  })

  /** Nobody writes a line inside a folder, so the number is what the reference is about. */
  it('keeps a line number a file, whatever the name looks like', () => {
    expect(fileRef('~/.claude:12')).toEqual({ path: '~/.claude', line: 12 })
    expect(fileRef('/home/ivan/.claude/hooks.ts:12')).toEqual({ path: '/home/ivan/.claude/hooks.ts', line: 12 })
  })

  it('marks the folder in ordinary prose too', () => {
    expect(withFileRefs('lives in ~/.claude, next to the rest')).toEqual([
      { text: 'lives in ' },
      { text: '~/.claude', ref: { path: '~/.claude', folder: true } },
      { text: ', next to the rest' },
    ])
  })
})
