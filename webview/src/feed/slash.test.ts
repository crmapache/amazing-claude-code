import { describe, expect, it } from 'vitest'
import { buildCommands, commandNameBeforeArgument, localCommand, matchCommands, slashQuery, type CommandEntry } from './slash'

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
    expect(localCommand('/login')).toBe('login')
    expect(localCommand('  /fork  ')).toBe('fork')
  })

  it('не трогает команды агента', () => {
    expect(localCommand('/pr-review')).toBeNull()
    expect(localCommand('/model haiku')).toBeNull()
  })
})
