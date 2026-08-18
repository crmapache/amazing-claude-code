import type { FeedItem, TodoItem, ToolItem } from './types'

/**
 * Чем панель занята прямо сейчас, одной строкой — «Reading build.ts»,
 * «Searching for retryLabel», «Running the webview tests».
 *
 * Строка состояния под лентой до сих пор говорила про работу одно и то же —
 * «Claude is working» со счётчиком, — хотя всё, что нужно для честного ответа,
 * в потоке уже есть: имя вызванного инструмента, его цель и написанное самой
 * моделью описание того, зачем она этот вызов делает. Терминал в этом месте
 * показывает живую строку про текущее действие (narration), но она там своя,
 * отдельным запросом к модели, и в stream-json не приходит вовсе — собрать её
 * из потока можно только самим, и здесь это и делается.
 *
 * Строка именно заменяется, а не копится: это подпись к текущему мгновению, а
 * не запись в ленте. Всё, что стоит помнить, лента и так покажет карточками.
 */
export const activityFor = (items: FeedItem[]): string => {
  const last = items.at(-1)

  if (last?.kind === 'toolGroup' && last.pending) {
    const running = last.tools.filter((tool) => tool.pending)
    // Вызовы одного ответа модели идут разом, а не по очереди: перечислять их
    // в одну строку некуда, поэтому такая пачка называется числом и общим делом.
    if (running.length > 1) return clip(bulkFor(running))
    const tool = running.at(-1)
    if (tool) return clip(phraseFor(tool))
  }

  // Субагент работает сам, и своих вызовов в общую ленту не шлёт — назвать его
  // работу можно только тем, кем он представился при запуске.
  if (last?.kind === 'task' && last.pending) return clip(`Running the ${last.target} agent`)

  /**
   * Между вызовами инструментов ход и правда только думает — но думает он не
   * вообще, а над конкретным пунктом собственного списка задач. activeForm для
   * того в списке и лежит: это тот же пункт, названный происходящим сейчас
   * делом («Fixing authentication bug»), и терминал показывает в спиннере
   * именно его.
   */
  const todo = [...items].reverse().find((item): item is TodoItem => item.kind === 'todo')
  const active = todo?.todos.find((entry) => entry.state === 'active')
  if (active) return clip(gerund(active.activeForm || active.text))

  return ''
}

/** Строка состояния — одна строка без переноса; длинному описанию в ней не поместиться. */
const LIMIT = 72

const clip = (text: string): string => (text.length > LIMIT ? `${text.slice(0, LIMIT - 1).trimEnd()}…` : text)

const asInput = (input: unknown): Record<string, unknown> =>
  typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * От пути берём только имя файла. Путь целиком в эту строку не влезает, а
 * обрезается он с конца — то есть ровно по тому месту, ради которого его и
 * читают. Полный путь никуда не девается: он стоит в карточке вызова под ней.
 */
const fileName = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? path

const hostOf = (url: string): string => /^[a-z]+:\/\/([^/?#]+)/i.exec(url)?.[1] ?? ''

const phraseFor = (tool: ToolItem): string => {
  const input = asInput(tool.input)
  const file = str(input.file_path) || str(input.notebook_path) || str(input.path)

  switch (tool.toolName) {
    case 'Read':
    case 'NotebookRead':
      return file ? `Reading ${fileName(file)}` : 'Reading a file'

    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return file ? `Editing ${fileName(file)}` : 'Editing a file'

    case 'Write':
      return file ? `Writing ${fileName(file)}` : 'Writing a file'

    case 'Grep':
      return str(input.pattern) ? `Searching for ${str(input.pattern)}` : 'Searching the project'

    case 'Glob':
      return str(input.pattern) ? `Looking for ${str(input.pattern)}` : 'Looking through files'

    case 'Bash': {
      // Описание пишет сама модель — и пишет именно про то, зачем ей эта
      // команда; сама команда рядом с ним ничего не добавляет. Нет описания —
      // остаётся команда, она хотя бы правда.
      const described = gerund(str(input.description))
      if (described) return described
      const command = str(input.command).split('\n')[0] ?? ''
      return command ? `Running ${command}` : 'Running a command'
    }

    case 'BashOutput':
      return 'Checking a background command'

    case 'KillShell':
      return 'Stopping a background command'

    case 'WebFetch':
      return hostOf(str(input.url)) ? `Fetching ${hostOf(str(input.url))}` : 'Fetching a page'

    case 'WebSearch':
      return str(input.query) ? `Searching the web for ${str(input.query)}` : 'Searching the web'
  }

  if (tool.toolName.startsWith('mcp__')) {
    const [, server = '', ...rest] = tool.toolName.split('__')
    return `Running ${server} ${rest.join('__')}`.trim()
  }

  return gerund(str(input.description)) || `Running ${tool.toolName}`
}

/** Общее дело пачки вызовов: тем же глаголом, что и у одиночного, но числом. */
const BULK: Record<string, (count: number) => string> = {
  read: (count) => `Reading ${count} files`,
  edit: (count) => `Editing ${count} files`,
  write: (count) => `Writing ${count} files`,
  grep: (count) => `Searching for ${count} patterns`,
  glob: (count) => `Looking for ${count} patterns`,
  bash: (count) => `Running ${count} commands`,
  web: (count) => `Fetching ${count} pages`,
}

const BULK_KEYS: Record<string, string> = {
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Write: 'write',
  Grep: 'grep',
  Glob: 'glob',
  Bash: 'bash',
  WebFetch: 'web',
}

const bulkFor = (tools: ToolItem[]): string => {
  const keys = new Set(tools.map((tool) => BULK_KEYS[tool.toolName] ?? tool.toolName))
  const only = keys.size === 1 ? [...keys][0] : undefined
  const phrase = only ? BULK[only] : undefined
  // Разные инструменты разом — общего глагола у них нет, и выдумывать его
  // нечестно: тогда числом называется сама пачка.
  return phrase ? phrase(tools.length) : `Running ${tools.length} tools`
}

/**
 * Глаголы, с которых начинаются описания вызовов и пункты списка задач. Список
 * закрытый намеренно: описание не обязано начинаться с глагола вовсе («Git
 * status», «Version bump»), и общее правило превратило бы такое начало в
 * несуществующее слово. Не узнали глагол — оставляем фразу как есть: она и так
 * читается, а выдуманное слово в строке состояния — нет.
 */
const VERBS = new Set([
  'add', 'append', 'apply', 'archive', 'audit', 'backup', 'benchmark', 'build', 'bump', 'call', 'cancel', 'capture',
  'change', 'check', 'clean', 'clear', 'close', 'collect', 'commit', 'compare', 'compile', 'compress', 'configure',
  'confirm', 'convert', 'copy', 'count', 'create', 'debug', 'delete', 'deploy', 'design', 'detect', 'diff',
  'disable', 'document', 'download', 'draft', 'drop', 'dump', 'edit', 'enable', 'examine', 'execute', 'explain',
  'extract', 'fetch', 'filter', 'find', 'fix', 'format', 'gather', 'generate', 'get', 'grep', 'identify',
  'implement', 'insert', 'inspect', 'install', 'investigate', 'join', 'keep', 'kill', 'launch', 'link', 'lint',
  'list', 'load', 'locate', 'log', 'look', 'make', 'map', 'measure', 'merge', 'migrate', 'mirror', 'modify', 'mount',
  'move', 'open', 'parse', 'patch', 'pick', 'plan', 'print', 'profile', 'publish', 'pull', 'push', 'put', 'read',
  'rebase', 'rebuild', 'refactor', 'remove', 'rename', 'render', 'repair', 'replace', 'reproduce', 'reset',
  'resolve', 'restart', 'restore', 'revert', 'review', 'rewrite', 'run', 'save', 'scan', 'search', 'seed', 'send',
  'serve', 'set', 'ship', 'show', 'sort', 'split', 'stage', 'start', 'stash', 'stop', 'summarize', 'swap', 'sync',
  'tag', 'take', 'test', 'trace', 'track', 'trim', 'unzip', 'update', 'upgrade', 'upload', 'use', 'verify', 'wait',
  'watch', 'wire', 'write',
])

/**
 * Глаголы, у которых согласная перед -ing удваивается вопреки общему правилу:
 * слог под ударением последний, а слогов больше одного (commit → committing).
 * У односложных удвоение видно и без списка — см. [doubles].
 */
const DOUBLING = new Set([
  'admit', 'begin', 'commit', 'compel', 'control', 'defer', 'expel', 'forget', 'infer', 'occur', 'offset', 'omit',
  'permit', 'prefer', 'refer', 'regret', 'reset', 'submit', 'transmit', 'upset',
])

const doubles = (verb: string): boolean => {
  const tail = verb.slice(-3)
  if (tail.length < 3) return false
  // Согласная-гласная-согласная на конце: только у такого хвоста удвоение и
  // бывает. w, x, y в конце не удваиваются никогда (show, fix, copy).
  if (!/^[^aeiou][aeiou][^aeiouwxy]$/.test(tail)) return false
  if (DOUBLING.has(verb)) return true
  return (verb.match(/[aeiouy]+/g) ?? []).length === 1
}

const ing = (verb: string): string => {
  if (verb.endsWith('ie')) return `${verb.slice(0, -2)}ying`
  if (verb.endsWith('e') && !/(ee|oe|ye)$/.test(verb)) return `${verb.slice(0, -1)}ing`
  if (doubles(verb)) return `${verb}${verb.at(-1)}ing`
  return `${verb}ing`
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * «Search for the retry card» → «Searching for the retry card».
 *
 * Описания вызовов и пункты списка задач написаны повелительным наклонением —
 * это указания самому себе. Строка состояния рассказывает о происходящем, и
 * указание в ней читается чужой командой, а не рассказом. Меняется ровно первое
 * слово: остальная фраза от наклонения не зависит.
 *
 * Уже названное происходящим (activeForm списка задач, «Fixing…») проходит
 * насквозь — оно и так в нужной форме.
 */
export const gerund = (phrase: string): string => {
  const text = phrase.trim()
  if (!text) return ''

  const [first = '', ...rest] = text.split(' ')
  const verb = first.toLowerCase()
  if (!VERBS.has(verb) || verb.endsWith('ing')) return capitalize(text)

  return capitalize([ing(verb), ...rest].join(' '))
}
