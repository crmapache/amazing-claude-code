import { describe, expect, it } from 'vitest'
import {
  chipFor,
  commandLabel,
  editAnchor,
  filePathOf,
  formatDuration,
  hunksFor,
  targetFor,
} from './tools'

describe('a call duration', () => {
  it('leaves the fractions of a second on fast calls', () => {
    expect(formatDuration(340)).toBe('0.3s')
    expect(formatDuration(6_200)).toBe('6.2s')
  })

  it('drops the fractions past ten seconds', () => {
    expect(formatDuration(30_000)).toBe('30s')
  })

  it('runs the minutes with seconds, and never a "60s" among them', () => {
    expect(formatDuration(90_000)).toBe('1m 30s')
    expect(formatDuration(59_600 + 60_000)).toBe('2m 00s')
  })

  it('counts in hours past an hour: a "1010m" does not convert to hours by eye', () => {
    expect(formatDuration(3_600_000)).toBe('1h 00m 00s')
    expect(formatDuration(60_608_000)).toBe('16h 50m 08s')
  })

  // The seconds are the one thing that shows time is passing: without them a long turn looks frozen for a
  // whole minute.
  it('does not let the hours eat the seconds', () => {
    expect(formatDuration(3_600_000 + 5_000)).toBe('1h 00m 05s')
    expect(formatDuration(3_600_000 + 70_000)).toBe('1h 01m 10s')
  })

  /**
   * Time does not run backwards, so a negative span always means its two ends were read off two
   * different clocks - which is a thing that genuinely happens on the phone (see mobile/clock.ts). The
   * clocks are reconciled there; this is only the floor under the last fraction of a second of error,
   * because "-0.2s" under a turn is worse than "0.0s" however small the mistake behind it.
   */
  it('shows a span that came out negative as no time at all', () => {
    expect(formatDuration(-200)).toBe('0.0s')
    expect(formatDuration(-9_000)).toBe('0.0s')
  })
})

describe('a command short caption', () => {
  it('leaves the command itself out of a command with flags', () => {
    expect(commandLabel('pnpm dev --host')).toBe('pnpm dev')
    expect(commandLabel('tail -f build/sandbox.log')).toBe('tail')
  })

  it('folds a script path down to its file name', () => {
    expect(commandLabel('./scripts/sandbox.sh')).toBe('sandbox.sh')
  })

  it('does not treat entering a directory and loading the environment as the work itself', () => {
    expect(commandLabel('cd /Users/max/project && pnpm dev')).toBe('pnpm dev')
  })

  /**
   * A waiting loop is the shape that used to defeat this: every one of them came out as "until" plus
   * whatever word followed, so a header full of them said nothing about any of them.
   */
  it('names a loop by the work inside it', () => {
    expect(commandLabel('until curl -s https://example.com | grep -q ok; do sleep 10; done')).toBe('curl')
    expect(commandLabel('while pgrep -f sandbox >/dev/null; do sleep 5; done')).toBe('pgrep')
  })

  it('looks inside a shell that was handed a string', () => {
    expect(commandLabel(`sh -c 'pnpm build && node dist/index.js'`)).toBe('pnpm build')
  })

  /** A keyword on its own is still better than nothing: there is nothing else to call it. */
  it('keeps the keyword when there is nothing behind it', () => {
    expect(commandLabel('until')).toBe('until')
    expect(commandLabel('source .env && ./gradlew runIde')).toBe('gradlew runIde')
  })

  it('does not count the variables before a command as part of the business', () => {
    expect(commandLabel('NODE_ENV=production pnpm build')).toBe('pnpm build')
  })

  it('represents a multi-line command by its first line', () => {
    expect(commandLabel('python3 script.py \\\n  --verbose')).toBe('python3 script.py')
  })

  it('gives an empty command an empty caption, so the chip has something to replace it with', () => {
    expect(commandLabel('')).toBe('')
    expect(commandLabel('   ')).toBe('')
  })
})

describe('a skill call', () => {
  /** The head is the only place seen without opening the card - the name of the skill belongs there. */
  it('is captioned by the skill being launched', () => {
    expect(targetFor('Skill', { skill: 'infra' }, '')).toBe('infra')
    expect(chipFor('Skill')).toBe('SKILL')
  })

  it('keeps the arguments after the name, where the clipping cannot eat it', () => {
    expect(targetFor('Skill', { skill: 'code-review', args: 'ultra' }, '')).toBe('code-review ultra')
    expect(targetFor('Skill', { skill: 'deploy', args: ' patch \n more' }, '')).toBe('deploy patch')
  })

  it('falls back to the tool name when there is no skill in the call', () => {
    expect(targetFor('Skill', {}, '')).toBe('Skill')
  })
})

describe("an edit's diff", () => {
  const edit = { file_path: '/p/a.ts', old_string: 'const a = 1', new_string: 'const a = 2' }

  it('is built out of what was replaced', () => {
    const hunks = hunksFor('t1', 'Edit', edit, 'The file has been updated')
    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.lines.map((line) => line.sign)).toEqual(['-', '+'])
  })

  /**
   * A failed edit changed nothing, so it has nothing to show. The diff is built out of the request rather
   * than out of the answer, so on a refusal it drew a change that never happened - and, since a card with
   * a diff gives up its body for it, the CLI's explanation was thrown away along with the truth.
   */
  it('is not drawn at all when the call failed', () => {
    expect(hunksFor('t1', 'Edit', edit, 'String to replace not found in file', true)).toEqual([])
  })

  /**
   * MultiEdit keeps its pairs in an `edits` array and NotebookEdit names a cell: neither carries the two
   * fields a diff is made of, and out of two empty strings the arithmetic produced one empty hunk
   * captioned "+0 -0" - which counts as a diff, so the tool's real answer was dropped behind it.
   */
  it('is not drawn for a call that carries neither half of one', () => {
    const multi = { file_path: '/p/a.ts', edits: [{ old_string: 'a', new_string: 'b' }] }
    expect(hunksFor('t1', 'MultiEdit', multi, 'Applied 1 edit')).toEqual([])
  })

  it('is not drawn for a tool that does not edit', () => {
    expect(hunksFor('t1', 'Read', { file_path: '/p/a.ts' }, '1\tconst a = 1')).toEqual([])
  })
})

describe('the file a call names', () => {
  it('is the file the tool was given', () => {
    expect(filePathOf('Edit', { file_path: '/p/a.ts' })).toBe('/p/a.ts')
    expect(filePathOf('Read', { file_path: '/p/a.ts' })).toBe('/p/a.ts')
    expect(filePathOf('NotebookEdit', { notebook_path: '/p/a.ipynb' })).toBe('/p/a.ipynb')
  })

  // Their `path` is the directory to search under, and an editor has nothing to open for one.
  it('is nothing for a search', () => {
    expect(filePathOf('Grep', { path: '/p/src' })).toBe('')
    expect(filePathOf('Glob', { path: '/p/src' })).toBe('')
  })

  /**
   * Asked by name rather than by the shape of the arguments: a third-party MCP tool with a `path` of its
   * own would otherwise get a clickable head promising an editor, with nothing behind it half the time.
   */
  it('is nothing for a tool we know nothing about', () => {
    expect(filePathOf('mcp__notion__fetch', { path: '/p/a.ts' })).toBe('')
  })

  // The same refusal the text of an answer gets, and for the same reason: reaching for a host somebody
  // else named is what makes Windows introduce itself to it (see isOpenablePath).
  it('is nothing for a network path', () => {
    expect(filePathOf('Read', { file_path: '//attacker.example/share/a.ts' })).toBe('')
    expect(filePathOf('Edit', { file_path: '\\\\attacker.example\\share\\a.ts' })).toBe('')
  })
})

describe('where an edit opens the file', () => {
  const hunksOf = (oldText: string, newText: string) =>
    hunksFor('t1', 'Edit', { file_path: '/p/a.ts', old_string: oldText, new_string: newText }, 'ok')

  it('is a line of the change, so the caret lands where the work is', () => {
    expect(editAnchor(hunksOf('const total = price', 'const total = price + tax'))).toBe(
      'const total = price + tax',
    )
  })

  // The first added line is as often as not a brace, and a search for one lands confidently in the wrong
  // part of the file - worse than not moving the caret at all.
  it('is the longest added line rather than the first', () => {
    const hunks = hunksOf('  {\n  }', '  {\n    assertAppleDomain(validationUrl)\n  }')
    expect(editAnchor(hunks)).toBe('assertAppleDomain(validationUrl)')
  })

  it('is nothing when the change has nothing to be found by', () => {
    expect(editAnchor(hunksOf('a', 'b'))).toBe('')
    expect(editAnchor([])).toBe('')
  })
})
