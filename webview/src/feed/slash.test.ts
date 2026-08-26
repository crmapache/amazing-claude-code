import { describe, expect, it } from 'vitest'
import {
  buildCommands,
  captureCommand,
  captureWrittenCommand,
  commandChip,
  commandNameBeforeArgument,
  localCommand,
  matchCommands,
  replaceCommandHead,
  slashQuery,
  type CommandEntry,
} from './slash'
import { tokensText } from './tokens'
import type { UserToken } from './types'

const project = (...ids: string[]): CommandEntry[] =>
  ids.map((id) => ({ id, hint: '', group: 'project' }))

describe('slashQuery', () => {
  it('opens the hint on a bare slash', () => {
    expect(slashQuery('/')).toBe('')
  })

  it('returns what was typed after the slash', () => {
    expect(slashQuery('/rev')).toBe('rev')
  })

  it('stays silent if the line does not begin with a slash', () => {
    expect(slashQuery('fix /rev')).toBeNull()
  })

  it('closes as soon as the command arguments begin', () => {
    expect(slashQuery('/review ')).toBeNull()
  })
})

describe('commandNameBeforeArgument', () => {
  it('returns the command name while the argument slot is still empty', () => {
    expect(commandNameBeforeArgument('/review ')).toBe('review')
  })

  it('dies as soon as the first character is typed into the argument - rather than holding to the end of the message', () => {
    expect(commandNameBeforeArgument('/review 123')).toBeNull()
  })

  it('dies after the argument has grown into ordinary text with spaces too', () => {
    expect(commandNameBeforeArgument('/plan-nest-feature a new login feature, let us discuss it')).toBeNull()
  })

  it('stays silent without a fully named command', () => {
    expect(commandNameBeforeArgument('/rev')).toBeNull()
  })
})

describe('matchCommands', () => {
  const commands = project('review', 'pr-create', 'pr-review', 'fix')
  const ids = (entries: CommandEntry[]) => entries.map((entry) => entry.id)

  it('puts the matches at the start ahead of the matches inside', () => {
    expect(ids(matchCommands(commands, 'rev'))).toEqual(['review', 'pr-review'])
  })

  it('ignores the case', () => {
    expect(ids(matchCommands(commands, 'PR'))).toEqual(['pr-create', 'pr-review'])
  })

  it('shows the start of the list on an empty query', () => {
    expect(ids(matchCommands(commands, '', 2))).toEqual(['review', 'pr-create'])
  })
})

describe('buildCommands', () => {
  it('joins the panel commands, the built-in ones and the project ones', () => {
    const commands = buildCommands(['ai-docs'])
    const groups = new Set(commands.map((command) => command.group))

    expect(groups).toEqual(new Set(['panel', 'built-in', 'project']))
    expect(commands.some((command) => command.id === 'login' && command.local)).toBe(true)
    expect(commands.at(-1)?.id).toBe('ai-docs')
  })

  it('lets a skill from disk reach the list before the agent has named its own commands', () => {
    // Until the first message the agent's list is empty: it arrives with system:init.
    const commands = buildCommands([], { task: { description: 'Start a new task', argumentHint: '[task]' } })
    const task = commands.find((command) => command.id === 'task')

    expect(task).toEqual({ id: 'task', hint: 'Start a new task', argumentHint: '[task]', group: 'project' })
  })

  it('does not double the same command coming from the agent and from disk', () => {
    const commands = buildCommands(['task'], { task: { description: 'Start a new task', argumentHint: '' } })

    expect(commands.filter((command) => command.id === 'task')).toHaveLength(1)
  })
})

describe('localCommand', () => {
  it('recognises the commands the panel runs itself', () => {
    expect(localCommand('/login')).toEqual({ name: 'login', argument: '' })
    expect(localCommand('  /fork  ')).toEqual({ name: 'fork', argument: '' })
  })

  it('leaves the agent commands alone', () => {
    expect(localCommand('/pr-review')).toBeNull()
  })

  it('recognises its own command when it has become a chip too', () => {
    const tokens: UserToken[] = [{ kind: 'chip', chip: { kind: 'cmd', value: 'fork' } }, { kind: 'text', value: ' ' }]
    expect(localCommand(tokensText(tokens))).toEqual({ name: 'fork', argument: '' })
  })

  it('lets the panel run the model and effort choice itself - that is its setting rather than a turn of the agent', () => {
    expect(localCommand('/model haiku')).toEqual({ name: 'model', argument: 'haiku' })
    expect(localCommand('/effort low')).toEqual({ name: 'effort', argument: 'low' })
  })

  it('leaves an unfamiliar value to the agent: it may know a model we do not', () => {
    expect(localCommand('/model whatever-3')).toBeNull()
    expect(localCommand('/model')).toBeNull()
  })
})

describe('captureCommand', () => {
  const commands = project('review', 'pr-create')
  const text = (value: string): UserToken[] => [{ kind: 'text', value }]
  const cmd: UserToken = { kind: 'chip', chip: { kind: 'cmd', value: 'review' } }
  const file: UserToken = { kind: 'chip', chip: { kind: 'file', value: 'a.ts' } }

  it('turns a typed name into a chip as soon as a space is put after it', () => {
    expect(captureCommand(text('/review '), commands, '/review ')).toEqual([cmd, { kind: 'text', value: ' ' }])
  })

  it('keeps what stands after the caret: a command written in front of a ready message', () => {
    expect(captureCommand(text('/review let us look at this'), commands, '/review ')).toEqual([
      cmd,
      { kind: 'text', value: ' ' },
      { kind: 'text', value: 'let us look at this' },
    ])
  })

  it('keeps an attachment that stands after the command', () => {
    const tokens: UserToken[] = [{ kind: 'text', value: '/review ' }, file, { kind: 'text', value: ' and this too' }]

    expect(captureCommand(tokens, commands, '/review ')).toEqual([
      cmd,
      { kind: 'text', value: ' ' },
      file,
      { kind: 'text', value: ' and this too' },
    ])
  })

  it('does not double the space the chip brings with it', () => {
    expect(captureCommand(text('/review  already spaced'), commands, '/review ')).toEqual([
      cmd,
      { kind: 'text', value: ' ' },
      { kind: 'text', value: 'already spaced' },
    ])
  })

  it('waits for the space: while the name is typed the hint narrows the list itself', () => {
    expect(captureCommand(text('/rev'), commands, '/rev')).toBeNull()
  })

  it('does not promise a chip for a command that does not exist', () => {
    expect(captureCommand(text('/nothing-like-this '), commands, '/nothing-like-this ')).toBeNull()
  })

  it('leaves an already typed argument alone - a chip is placed once', () => {
    expect(captureCommand(text('/review src/App.tsx'), commands, '/review src/App.tsx')).toBeNull()
  })

  it('leaves a command with an attachment before it alone: it is no longer a command', () => {
    const withChip: UserToken[] = [file, { kind: 'text', value: '/review ' }]

    // There is no head at all when an attachment stands before the caret - the field reports it as null.
    expect(captureCommand(withChip, commands, null)).toBeNull()
  })

  it('travels to the agent as the same text it was typed as', () => {
    const captured = captureCommand(text('/review '), commands, '/review ') ?? []
    expect(tokensText([...captured, { kind: 'text', value: 'src/App.tsx' }])).toBe('/review src/App.tsx')
  })

  it('keeps the message readable when the command lands in front of it', () => {
    const captured = captureCommand(text('/review let us look at this'), commands, '/review ') ?? []
    expect(tokensText(captured)).toBe('/review let us look at this')
  })
})

describe('captureWrittenCommand', () => {
  const commands = project('review', 'pr-create')
  const text = (value: string): UserToken[] => [{ kind: 'text', value }]
  const cmd: UserToken = { kind: 'chip', chip: { kind: 'cmd', value: 'review' } }

  it('makes a chip of a command sent right after its own name - typing never put a space there', () => {
    expect(captureWrittenCommand(text('/review'), commands)).toEqual([cmd, { kind: 'text', value: ' ' }])
  })

  it('keeps the argument as text and does not double the space in front of it', () => {
    const captured = captureWrittenCommand(text('/review src/App.tsx'), commands) ?? []

    expect(captured).toEqual([cmd, { kind: 'text', value: ' src/App.tsx' }])
    expect(tokensText(captured)).toBe('/review src/App.tsx')
  })

  it('leaves the message word for word - the agent sees the same thing either way', () => {
    expect(tokensText(captureWrittenCommand(text('/review '), commands) ?? [])).toBe('/review ')
  })

  it('leaves an unfamiliar name alone: a chip promises the command exists', () => {
    expect(captureWrittenCommand(text('/reviewer'), commands)).toBeNull()
    expect(captureWrittenCommand(text('/'), commands)).toBeNull()
  })

  it('is not a command with anything in front of it', () => {
    expect(captureWrittenCommand(text('look /review'), commands)).toBeNull()
    expect(
      captureWrittenCommand([{ kind: 'chip', chip: { kind: 'file', value: 'a.ts' } }, { kind: 'text', value: '/review' }], commands),
    ).toBeNull()
  })

  it('does nothing to a command that is already a chip', () => {
    expect(captureWrittenCommand([cmd, { kind: 'text', value: ' ' }], commands)).toBeNull()
  })
})

describe('replaceCommandHead', () => {
  const chip: UserToken = { kind: 'chip', chip: { kind: 'cmd', value: 'review' } }

  it('puts the choice in place of the half-typed name and keeps the rest', () => {
    const tokens: UserToken[] = [{ kind: 'text', value: '/rev the message that was already written' }]

    expect(replaceCommandHead(tokens, '/rev', [chip, { kind: 'text', value: ' ' }])).toEqual([
      chip,
      { kind: 'text', value: ' ' },
      { kind: 'text', value: 'the message that was already written' },
    ])
  })

  it('refuses when the head is not plain text - there is nothing to replace there', () => {
    const tokens: UserToken[] = [{ kind: 'chip', chip: { kind: 'file', value: 'a.ts' } }]

    expect(replaceCommandHead(tokens, '/rev', [chip])).toBeNull()
  })
})

describe('commandChip', () => {
  it('finds a command chip at the start of the field', () => {
    expect(commandChip([{ kind: 'chip', chip: { kind: 'cmd', value: 'model' } }])).toBe('model')
  })

  it('does not treat a command that is not at the start as a command any more', () => {
    expect(
      commandChip([{ kind: 'text', value: 'look ' }, { kind: 'chip', chip: { kind: 'cmd', value: 'model' } }]),
    ).toBeNull()
  })
})
