import { describe, expect, it } from 'vitest'

import { activityFor, gerund } from './activity'
import type { FeedItem, ToolItem, ToolGroupItem } from './types'

const tool = (toolName: string, input: unknown, pending = true): ToolItem => ({
  id: `t-${toolName}-${JSON.stringify(input)}`,
  kind: 'tool',
  chip: 'TOOL',
  toolName,
  input,
  target: '',
  meta: '',
  duration: '',
  detail: [],
  hunks: [],
  isError: false,
  pending,
})

const group = (...tools: ToolItem[]): ToolGroupItem => ({
  id: 'g-1',
  kind: 'toolGroup',
  tools,
  pending: tools.some((item) => item.pending),
  duration: '',
  startedAt: 0,
})

const activity = (...items: FeedItem[]): string => activityFor(items)

describe('строка про текущее дело', () => {
  it('называет вызов инструмента делом, а не именем инструмента', () => {
    expect(activity(group(tool('Read', { file_path: '/repo/webview/src/feed/build.ts' })))).toBe('Reading build.ts')
    expect(activity(group(tool('Edit', { file_path: '/repo/src/App.tsx' })))).toBe('Editing App.tsx')
    expect(activity(group(tool('Write', { file_path: '/repo/notes.md' })))).toBe('Writing notes.md')
    expect(activity(group(tool('Grep', { pattern: 'retryLabel' })))).toBe('Searching for retryLabel')
    expect(activity(group(tool('Glob', { pattern: '**/*.kt' })))).toBe('Looking for **/*.kt')
    expect(activity(group(tool('WebFetch', { url: 'https://status.claude.com/incidents/42' })))).toBe(
      'Fetching status.claude.com',
    )
    expect(activity(group(tool('WebSearch', { query: 'kotlin coroutines' })))).toBe(
      'Searching the web for kotlin coroutines',
    )
  })

  // От пути в строке помещается немного, и обрезается он с конца — то есть
  // ровно по имени файла, ради которого путь и читают.
  it('от пути берёт имя файла, а не начало пути', () => {
    const path = '/repo/src/main/kotlin/io/github/crmapache/amazingclaudecode/toolwindow/ClaudePanel.kt'
    expect(activity(group(tool('Read', { file_path: path })))).toBe('Reading ClaudePanel.kt')
  })

  it('команду называет её собственным описанием, переставленным в настоящее время', () => {
    expect(activity(group(tool('Bash', { command: 'pnpm vitest run', description: 'Run the webview tests' })))).toBe(
      'Running the webview tests',
    )
  })

  it('без описания у команды остаётся сама команда', () => {
    expect(activity(group(tool('Bash', { command: 'git status --short\ngit log' })))).toBe('Running git status --short')
  })

  it('вызов MCP называет сервером и инструментом', () => {
    expect(activity(group(tool('mcp__railway__list_projects', {})))).toBe('Running railway list_projects')
  })

  it('незнакомый инструмент называет собой, а не молчит', () => {
    expect(activity(group(tool('SomeNewTool', {})))).toBe('Running SomeNewTool')
  })

  it('пачку однородных вызовов называет числом, а не первым из них', () => {
    expect(activity(group(tool('Read', { file_path: '/a.ts' }), tool('Read', { file_path: '/b.ts' })))).toBe(
      'Reading 2 files',
    )
  })

  /**
   * В одну карточку попадают и вызовы, сделанные один за другим, — числом
   * называется только то, что идёт прямо сейчас, а не вся карточка.
   */
  it('называет идущее сейчас, а не всю карточку: закончившийся вызов в счёт не идёт', () => {
    const batch = group(
      tool('Read', { file_path: '/a.ts' }, false),
      tool('Read', { file_path: '/b.ts' }, false),
      tool('Grep', { pattern: 'retryLabel' }),
    )
    expect(activity(batch)).toBe('Searching for retryLabel')
  })

  // Общего глагола у разных инструментов нет, и выдумывать его нечестно.
  it('пачку разных вызовов называет пачкой', () => {
    expect(activity(group(tool('Read', { file_path: '/a.ts' }), tool('Grep', { pattern: 'x' })))).toBe('Running 2 tools')
  })

  it('уже завершившийся вызов делом не считается', () => {
    expect(activity(group(tool('Read', { file_path: '/a.ts' }, false)))).toBe('')
  })

  it('субагента называет тем, кем он представился', () => {
    expect(
      activity({
        id: 'task-1',
        kind: 'task',
        target: 'code-reviewer',
        meta: '',
        duration: '',
        percent: 0,
        log: [],
        pending: true,
      }),
    ).toBe('Running the code-reviewer agent')
  })

  /**
   * Между вызовами ход думает — но думает над конкретным пунктом собственного
   * списка задач, и назвать это можно им.
   */
  it('в паузе между вызовами берёт пункт списка задач, который в работе', () => {
    const todo: FeedItem = {
      id: 'todo-1',
      kind: 'todo',
      todos: [
        { id: 'task-1', text: 'Fix the retry card', state: 'done' },
        { id: 'task-2', text: 'Fix auth bug', state: 'active', activeForm: 'Fixing auth bug' },
        { id: 'task-3', text: 'Ship it', state: 'todo' },
      ],
    }
    expect(activity(todo)).toBe('Fixing auth bug')
  })

  it('без activeForm называет пункт списка им самим, переставленным в настоящее время', () => {
    const todo: FeedItem = {
      id: 'todo-1',
      kind: 'todo',
      todos: [{ id: 'task-1', text: 'Fix auth bug', state: 'active' }],
    }
    expect(activity(todo)).toBe('Fixing auth bug')
  })

  it('молчит, когда не происходит ничего конкретного', () => {
    const todo: FeedItem = {
      id: 'todo-1',
      kind: 'todo',
      todos: [{ id: 'task-1', text: 'Fix auth bug', state: 'done' }],
    }
    expect(activity(todo)).toBe('')
    expect(activity()).toBe('')
  })

  it('обрезает описание, которое в строку не помещается', () => {
    const description = 'Search every transcript in every project directory for the exact phrase from the screenshot'
    const line = activity(group(tool('Bash', { command: 'grep -r', description })))
    expect(line.length).toBeLessThanOrEqual(72)
    expect(line.endsWith('…')).toBe(true)
    expect(line.startsWith('Searching every transcript')).toBe(true)
  })
})

describe('повелительное наклонение в настоящее время', () => {
  it('переставляет обычные глаголы', () => {
    expect(gerund('Search for the retry card')).toBe('Searching for the retry card')
    expect(gerund('List files in current directory')).toBe('Listing files in current directory')
    expect(gerund('Check size and locate key phrases')).toBe('Checking size and locate key phrases')
    expect(gerund('Find exact lines')).toBe('Finding exact lines')
    expect(gerund('Build the plugin')).toBe('Building the plugin')
    expect(gerund('Install dependencies')).toBe('Installing dependencies')
  })

  it('убирает немую e перед -ing', () => {
    expect(gerund('Compare the two files')).toBe('Comparing the two files')
    expect(gerund('Create a branch')).toBe('Creating a branch')
    expect(gerund('Remove the leftover file')).toBe('Removing the leftover file')
    expect(gerund('Make a release')).toBe('Making a release')
  })

  it('удваивает согласную там, где она удваивается', () => {
    expect(gerund('Run the tests')).toBe('Running the tests')
    expect(gerund('Get the current version')).toBe('Getting the current version')
    expect(gerund('Stop the sandbox')).toBe('Stopping the sandbox')
    expect(gerund('Set the flag')).toBe('Setting the flag')
    expect(gerund('Commit the changes')).toBe('Committing the changes')
  })

  it('не удваивает там, где не надо', () => {
    expect(gerund('Show the diff')).toBe('Showing the diff')
    expect(gerund('Fix the test')).toBe('Fixing the test')
    expect(gerund('Copy the file')).toBe('Copying the file')
    expect(gerund('Open the panel')).toBe('Opening the panel')
    expect(gerund('Add a line')).toBe('Adding a line')
    expect(gerund('Verify the fix')).toBe('Verifying the fix')
    expect(gerund('Install the plugin')).toBe('Installing the plugin')
  })

  /**
   * Описание не обязано начинаться с глагола, и общее правило превратило бы
   * такое начало в несуществующее слово («Git» → «Giting»).
   */
  it('не трогает фразу, которая начинается не с глагола', () => {
    expect(gerund('Git status of the working tree')).toBe('Git status of the working tree')
    expect(gerund('Version bump to 0.7.11')).toBe('Version bump to 0.7.11')
    expect(gerund('~/.claude/projects listing')).toBe('~/.claude/projects listing')
  })

  it('оставляет как есть то, что уже названо происходящим', () => {
    expect(gerund('Fixing auth bug')).toBe('Fixing auth bug')
    expect(gerund('Running the tests')).toBe('Running the tests')
  })

  it('поднимает первую букву, как бы её ни написали', () => {
    expect(gerund('run the tests')).toBe('Running the tests')
  })

  it('на пустом описании молчит', () => {
    expect(gerund('')).toBe('')
    expect(gerund('   ')).toBe('')
  })
})
