import { describe, expect, it } from 'vitest'
import {
  buildCommands,
  captureCommand,
  commandChip,
  commandNameBeforeArgument,
  localCommand,
  matchCommands,
  slashQuery,
  type CommandEntry,
} from './slash'
import { tokensText } from './tokens'
import type { UserToken } from './types'

const project = (...ids: string[]): CommandEntry[] =>
  ids.map((id) => ({ id, hint: '', group: 'project' }))

describe('slashQuery', () => {
  it('открывает подсказку на голом слэше', () => {
    expect(slashQuery('/')).toBe('')
  })

  it('отдаёт набранное после слэша', () => {
    expect(slashQuery('/rev')).toBe('rev')
  })

  it('молчит, если строка не начинается со слэша', () => {
    expect(slashQuery('fix /rev')).toBeNull()
  })

  it('закрывается, как только пошли аргументы команды', () => {
    expect(slashQuery('/review ')).toBeNull()
  })
})

describe('commandNameBeforeArgument', () => {
  it('отдаёт имя команды, пока слот аргумента ещё пуст', () => {
    expect(commandNameBeforeArgument('/review ')).toBe('review')
  })

  it('гаснет, как только в аргумент напечатан первый символ — а не держится до конца сообщения', () => {
    expect(commandNameBeforeArgument('/review 123')).toBeNull()
  })

  it('гаснет и после того, как аргумент перерос в обычный текст с пробелами', () => {
    expect(commandNameBeforeArgument('/plan-nest-feature новая фича логина, давай обсудим')).toBeNull()
  })

  it('молчит без названной целиком команды', () => {
    expect(commandNameBeforeArgument('/rev')).toBeNull()
  })
})

describe('matchCommands', () => {
  const commands = project('review', 'pr-create', 'pr-review', 'fix')
  const ids = (entries: CommandEntry[]) => entries.map((entry) => entry.id)

  it('ставит совпадения по началу впереди совпадений внутри', () => {
    expect(ids(matchCommands(commands, 'rev'))).toEqual(['review', 'pr-review'])
  })

  it('не смотрит на регистр', () => {
    expect(ids(matchCommands(commands, 'PR'))).toEqual(['pr-create', 'pr-review'])
  })

  it('на пустом запросе показывает начало списка', () => {
    expect(ids(matchCommands(commands, '', 2))).toEqual(['review', 'pr-create'])
  })
})

describe('buildCommands', () => {
  it('склеивает команды панели, встроенные и проектные', () => {
    const commands = buildCommands(['ai-docs'])
    const groups = new Set(commands.map((command) => command.group))

    expect(groups).toEqual(new Set(['panel', 'built-in', 'project']))
    expect(commands.some((command) => command.id === 'login' && command.local)).toBe(true)
    expect(commands.at(-1)?.id).toBe('ai-docs')
  })
})

describe('localCommand', () => {
  it('узнаёт команды, которые выполняет сама панель', () => {
    expect(localCommand('/login')).toEqual({ name: 'login', argument: '' })
    expect(localCommand('  /fork  ')).toEqual({ name: 'fork', argument: '' })
  })

  it('не трогает команды агента', () => {
    expect(localCommand('/pr-review')).toBeNull()
  })

  it('узнаёт свою команду и когда она стала плашкой', () => {
    const tokens: UserToken[] = [{ kind: 'chip', chip: { kind: 'cmd', value: 'fork' } }, { kind: 'text', value: ' ' }]
    expect(localCommand(tokensText(tokens))).toEqual({ name: 'fork', argument: '' })
  })

  it('выбор модели и усилия выполняет сама панель — это её настройка, а не ход агента', () => {
    expect(localCommand('/model haiku')).toEqual({ name: 'model', argument: 'haiku' })
    expect(localCommand('/effort low')).toEqual({ name: 'effort', argument: 'low' })
  })

  it('незнакомое значение оставляет агенту: вдруг он знает модель, о которой не знаем мы', () => {
    expect(localCommand('/model whatever-3')).toBeNull()
    expect(localCommand('/model')).toBeNull()
  })
})

describe('captureCommand', () => {
  const commands = project('review', 'pr-create')
  const text = (value: string): UserToken[] => [{ kind: 'text', value }]

  it('превращает набранное имя в плашку, как только за ним поставили пробел', () => {
    expect(captureCommand(text('/review '), commands)).toEqual([
      { kind: 'chip', chip: { kind: 'cmd', value: 'review' } },
      { kind: 'text', value: ' ' },
    ])
  })

  it('ждёт пробела: пока имя набирается, подсказка сама сужает список', () => {
    expect(captureCommand(text('/rev'), commands)).toBeNull()
  })

  it('не обещает плашкой команду, которой нет', () => {
    expect(captureCommand(text('/nothing-like-this '), commands)).toBeNull()
  })

  it('не трогает уже набранный аргумент — плашка ставится один раз', () => {
    expect(captureCommand(text('/review src/App.tsx'), commands)).toBeNull()
  })

  it('оставляет в покое поле с вложением: команда с приложенным файлом бессмысленна', () => {
    const withChip: UserToken[] = [{ kind: 'chip', chip: { kind: 'file', value: 'a.ts' } }, { kind: 'text', value: '/review ' }]
    expect(captureCommand(withChip, commands)).toBeNull()
  })

  it('уходит агенту тем же текстом, каким его набирали', () => {
    const captured = captureCommand(text('/review '), commands) ?? []
    expect(tokensText([...captured, { kind: 'text', value: 'src/App.tsx' }])).toBe('/review src/App.tsx')
  })
})

describe('commandChip', () => {
  it('находит команду-плашку в начале поля', () => {
    expect(commandChip([{ kind: 'chip', chip: { kind: 'cmd', value: 'model' } }])).toBe('model')
  })

  it('команда не в начале командой уже не является', () => {
    expect(
      commandChip([{ kind: 'text', value: 'смотри ' }, { kind: 'chip', chip: { kind: 'cmd', value: 'model' } }]),
    ).toBeNull()
  })
})
