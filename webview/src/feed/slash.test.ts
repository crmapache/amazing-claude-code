import { en } from '../i18n/en'
import { describe, expect, it } from 'vitest'
import {
  buildCommands,
  captureCommand,
  captureWrittenCommand,
  chosenRow,
  commandChip,
  commandNameBeforeArgument,
  enterSends,
  localCommand,
  matchCommands,
  replaceCommandHead,
  sameHints,
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
    const commands = buildCommands(en, ['ai-docs'])
    const groups = new Set(commands.map((command) => command.group))

    expect(groups).toEqual(new Set(['panel', 'built-in', 'project']))
    expect(commands.some((command) => command.id === 'login' && command.local)).toBe(true)
    expect(commands.at(-1)?.id).toBe('ai-docs')
  })

  it('lets a skill from disk reach the list before the agent has named its own commands', () => {
    // Until the first message the agent's list is empty: it arrives with system:init.
    const commands = buildCommands(en, [], { task: { description: 'Start a new task', argumentHint: '[task]' } })
    const task = commands.find((command) => command.id === 'task')

    expect(task).toEqual({ id: 'task', hint: 'Start a new task', argumentHint: '[task]', group: 'project' })
  })

  it('shows a command that has no description at all', () => {
    // Frontmatter is optional for the CLI, and a project command written as a bare prompt has none. Such
    // a file used to fall out of the scan whole (see ClaudeCommandHints), so the hint knew nothing about
    // it until the first message of the conversation had been sent.
    const commands = buildCommands(en, [], { deploy: { description: '', argumentHint: '' } })
    const deploy = commands.find((command) => command.id === 'deploy')

    expect(deploy).toEqual({ id: 'deploy', hint: '', argumentHint: '', group: 'project' })
  })

  it('does not double the same command coming from the agent and from disk', () => {
    const commands = buildCommands(en, ['task'], { task: { description: 'Start a new task', argumentHint: '' } })

    expect(commands.filter((command) => command.id === 'task')).toHaveLength(1)
  })

  it('puts what was found on disk in name order, whatever order the map arrived in', () => {
    // The map comes in the order the IDE walked the directories in, and under that the order the file
    // system chose to list them - not promised to be the same twice. Sorted here, the same set of files
    // cannot redraw the list differently for no reason.
    const hints = {
      zulu: { description: '', argumentHint: '' },
      alpha: { description: '', argumentHint: '' },
      mike: { description: '', argumentHint: '' },
    }
    const ids = buildCommands(en, [], hints).map((command) => command.id)

    expect(ids.slice(-3)).toEqual(['alpha', 'mike', 'zulu'])
  })

  it('leaves the three groups before it in their own order', () => {
    // The order of the groups is what the hint is read by - the panel's own first, then the built-in
    // ones, then what the agent named. Only the tail found on disk is sorted.
    const first = buildCommands(en, ['zebra', 'apple'], {})
    const ids = first.map((command) => command.id)

    expect(ids.indexOf('zebra')).toBeLessThan(ids.indexOf('apple'))
    expect(ids[0]).toBe('resume')
  })
})

describe('sameHints', () => {
  it('sees an unchanged map as unchanged, whatever order its keys are in', () => {
    const one = { a: { description: 'first', argumentHint: '' }, b: { description: 'second', argumentHint: '' } }
    const other = { b: { description: 'second', argumentHint: '' }, a: { description: 'first', argumentHint: '' } }

    expect(sameHints(one, other)).toBe(true)
  })

  it('sees an edited description, a new name and a lost one', () => {
    const was = { a: { description: 'first', argumentHint: '' } }

    expect(sameHints(was, { a: { description: 'edited', argumentHint: '' } })).toBe(false)
    expect(sameHints(was, { a: { description: 'first', argumentHint: '[x]' } })).toBe(false)
    expect(sameHints(was, { a: { description: 'first', argumentHint: '' }, b: { description: '', argumentHint: '' } })).toBe(false)
    expect(sameHints(was, {})).toBe(false)
  })

  it('does not take a renamed command for the same one', () => {
    // Same size, same content, different names: counted rather than compared, this would pass.
    expect(
      sameHints({ a: { description: 'x', argumentHint: '' } }, { b: { description: 'x', argumentHint: '' } }),
    ).toBe(false)
  })
})

describe('chosenRow', () => {
  const rows = project('alpha', 'mike', 'zulu')

  it('starts at the top when nothing has been chosen', () => {
    expect(chosenRow(rows, null, '/')).toBe(0)
  })

  it('keeps the chosen command when the list changes underneath it', () => {
    // The whole point: the IDE looks at the disk every couple of seconds now, and the agent re-sends its
    // catalogue at the start of every turn. Held by place, the choice slides onto whatever moved into
    // that slot and Enter runs a command nobody picked.
    const held = { id: 'zulu', list: '/', by: 'key' as const }
    const grown = project('alpha', 'bravo', 'mike', 'zulu')

    expect(chosenRow(grown, held, '/')).toBe(3)
  })

  it('returns to the top as soon as the typing makes it a different list', () => {
    const held = { id: 'zulu', list: '/', by: 'key' as const }

    expect(chosenRow(rows, held, '/zu')).toBe(0)
  })

  it('returns to the top when the chosen command is no longer there', () => {
    // A skill renamed mid-debugging. The first row is the only answer where the screen and the key still
    // say the same thing: an unresolvable place used to leave nothing highlighted while Enter quietly
    // ran the top row.
    const held = { id: 'gone', list: '/', by: 'key' as const }

    expect(chosenRow(rows, held, '/')).toBe(0)
  })

  it('answers zero for an empty list rather than a place that is not there', () => {
    expect(chosenRow([], { id: 'zulu', list: '/', by: 'key' as const }, '/')).toBe(0)
  })

  it('does not carry a command name into a list of file paths', () => {
    // One choice serves three lists - commands, a command's values, the paths after "@" - and the key
    // tells them apart.
    const files = project('src/App.tsx', 'src/zulu.ts')

    expect(chosenRow(files, { id: 'zulu', list: '/', by: 'key' as const }, '@zu')).toBe(0)
  })
})

describe('enterSends', () => {
  // What decides, over an open hint, whether Enter sends the message or substitutes the row on screen.
  // Silent both ways: too eager and half a command is sent, too shy and the field will not send at all.
  const list = '/ta'

  it('sends a name that has been typed in full, as it always did', () => {
    expect(enterSends(true, null, list)).toBe(true)
  })

  it('substitutes when the name is only half typed', () => {
    expect(enterSends(false, null, list)).toBe(false)
  })

  it('substitutes the row stepped onto, even when what is typed is a name of its own', () => {
    // The defect. "/task" is typed in full and "/task-review" is on the next row down: Enter used to
    // send "/task" while the screen was lighting the row the person had just chosen.
    expect(enterSends(true, { id: 'task-review', list, by: 'key' }, list)).toBe(false)
  })

  it('ignores a choice made in another list', () => {
    expect(enterSends(true, { id: 'task-review', list: '/t', by: 'key' }, list)).toBe(true)
  })

  it('does not let a hovering mouse turn sending into substituting', () => {
    // The arrows and the mouse light the same row through the same handler, and a cursor left lying
    // over the list on its way somewhere else has decided nothing.
    expect(enterSends(true, { id: 'task-review', list, by: 'pointer' }, list)).toBe(true)
  })
})

describe('localCommand', () => {
  it('recognises the commands the panel runs itself', () => {
    expect(localCommand(en, '/login')).toEqual({ name: 'login', argument: '' })
    expect(localCommand(en, '  /fork  ')).toEqual({ name: 'fork', argument: '' })
  })

  it('leaves the agent commands alone', () => {
    expect(localCommand(en, '/pr-review')).toBeNull()
  })

  /*
   * The one command here that is the panel's because the CLI will not run it: a streaming session does
   * not have `/design-login` in its command list at all, so sent onwards it comes back as "isn't
   * available in this environment" - a refusal to something the panel's own hint had just offered.
   * Hyphens are the reason this is worth a test of its own: every other name here is one word.
   */
  it('takes over the Claude Design sign-in, which a streaming session cannot run', () => {
    expect(localCommand(en, '/design-login')).toEqual({ name: 'design-login', argument: '' })
  })

  it('recognises its own command when it has become a chip too', () => {
    const tokens: UserToken[] = [{ kind: 'chip', chip: { kind: 'cmd', value: 'fork' } }, { kind: 'text', value: ' ' }]
    expect(localCommand(en, tokensText(tokens))).toEqual({ name: 'fork', argument: '' })
  })

  it('lets the panel run the model and effort choice itself - that is its setting rather than a turn of the agent', () => {
    expect(localCommand(en, '/model haiku')).toEqual({ name: 'model', argument: 'haiku' })
    expect(localCommand(en, '/effort low')).toEqual({ name: 'effort', argument: 'low' })
  })

  it('leaves an unfamiliar value to the agent: it may know a model we do not', () => {
    expect(localCommand(en, '/model whatever-3')).toBeNull()
    expect(localCommand(en, '/model')).toBeNull()
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
