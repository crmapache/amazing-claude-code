import type { DetailLine, DiffLine, Hunk, ToolChip } from './types'

/** Сколько строк вывода инструмента показываем в раскрытом виде. */
const DETAIL_LIMIT = 60

const CHIPS: Record<string, ToolChip> = {
  Read: 'READ',
  NotebookRead: 'READ',
  Grep: 'GREP',
  Glob: 'GREP',
  Edit: 'EDIT',
  MultiEdit: 'EDIT',
  NotebookEdit: 'EDIT',
  Write: 'WRITE',
  Bash: 'BASH',
  BashOutput: 'BASH',
  KillShell: 'BASH',
  WebFetch: 'WEB',
  WebSearch: 'WEB',
}

export const chipFor = (name: string): ToolChip => {
  if (name.startsWith('mcp__')) return 'MCP'
  return CHIPS[name] ?? 'TOOL'
}

type ToolInput = Record<string, unknown>

const asInput = (input: unknown): ToolInput =>
  typeof input === 'object' && input !== null ? (input as ToolInput) : {}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Путь показываем относительно проекта: полный не помещается и ничего не добавляет. */
export const shortenPath = (path: string, workingDirectory: string): string => {
  if (!path) return ''
  if (workingDirectory && path.startsWith(workingDirectory)) {
    return path.slice(workingDirectory.length).replace(/^\//, '')
  }
  return path
}

export const targetFor = (name: string, input: unknown, workingDirectory: string): string => {
  const data = asInput(input)

  const filePath = str(data.file_path) || str(data.notebook_path) || str(data.path)
  if (filePath) return shortenPath(filePath, workingDirectory)

  if (name === 'Bash' || name === 'BashOutput') {
    const command = str(data.command)
    return command.split('\n')[0] ?? name
  }

  const pattern = str(data.pattern)
  if (pattern) return pattern

  const url = str(data.url) || str(data.query)
  if (url) return url

  const description = str(data.description) || str(data.prompt)
  if (description) return description.split('\n')[0] ?? name

  return name
}

export const metaFor = (name: string, input: unknown, result: string, isError: boolean): string => {
  if (isError) return '· failed'

  const data = asInput(input)

  if (name === 'Read' || name === 'NotebookRead') {
    const lines = countLines(result)
    return lines > 0 ? `· ${lines} lines` : ''
  }

  if (name === 'Grep' || name === 'Glob') {
    const matches = countLines(result)
    return matches > 0 ? `· ${matches} matches` : '· no matches'
  }

  if (name === 'Edit' || name === 'MultiEdit' || name === 'NotebookEdit') {
    const before = countLines(str(data.old_string))
    const after = countLines(str(data.new_string))
    return `· +${Math.max(after - before, 0) + Math.min(before, after)} −${before}`
  }

  if (name === 'Write') {
    const lines = countLines(str(data.content))
    return lines > 0 ? `· ${lines} lines` : ''
  }

  if (name === 'Bash') return result.trim().length > 0 ? '· output' : '· no output'

  return ''
}

export const detailFor = (result: string): DetailLine[] => {
  if (!result.trim()) return []

  const lines = result.split('\n')
  const shown = lines.slice(0, DETAIL_LIMIT).map((text) => ({ text, tone: toneOf(text) }))

  if (lines.length > DETAIL_LIMIT) {
    shown.push({ text: `… ${lines.length - DETAIL_LIMIT} more lines`, tone: 'dim' as const })
  }

  return shown
}

const toneOf = (line: string): DetailLine['tone'] => {
  if (/^\s*(✓|✔|PASS|passed\b)/i.test(line)) return 'ok'
  if (/^\s*(✗|✘|FAIL|error\b|Error:)/i.test(line)) return 'bad'
  return 'dim'
}

/**
 * Кусок правки для показа в ленте.
 *
 * Настоящего диффа в потоке нет: инструмент правки присылает старый и новый текст.
 * Поэтому отрезаем совпадающие начало и конец, а расхождение показываем как
 * удалённые и добавленные строки — ровно то, что рисует макет.
 */
export const hunksFor = (id: string, name: string, input: unknown, result: string): Hunk[] => {
  if (name !== 'Edit' && name !== 'MultiEdit' && name !== 'NotebookEdit') return []

  const data = asInput(input)
  const before = str(data.old_string).split('\n')
  const after = str(data.new_string).split('\n')

  if (before.length === 0 && after.length === 0) return []

  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++

  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++
  }

  const removed = before.slice(head, before.length - tail)
  const added = after.slice(head, after.length - tail)
  const startLine = firstLineNumber(result)

  const lines: DiffLine[] = []
  let n = startLine === null ? null : startLine + head

  const context = (text: string) => {
    lines.push({ n, sign: ' ', kind: 'ctx', text })
    if (n !== null) n += 1
  }

  if (head > 0) context(before[head - 1] ?? '')

  for (const text of removed) {
    lines.push({ n: null, sign: '-', kind: 'del', text })
  }

  for (const text of added) {
    lines.push({ n, sign: '+', kind: 'add', text })
    if (n !== null) n += 1
  }

  if (tail > 0) context(before[before.length - tail] ?? '')

  return [
    {
      id: `${id}-h1`,
      range: startLine === null ? '@@ edit @@' : `@@ ${startLine + head} @@`,
      note: `+${added.length} −${removed.length}`,
      lines,
    },
  ]
}

/** Инструмент правки возвращает кусок файла с номерами строк — берём первый номер оттуда. */
const firstLineNumber = (result: string): number | null => {
  const match = /^\s*(\d+)\t/m.exec(result)
  if (!match) return null

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

const countLines = (value: string): number => {
  const trimmed = value.replace(/\n+$/, '')
  return trimmed.length === 0 ? 0 : trimmed.split('\n').length
}

/** Длительность в стиле макета: доли секунды у быстрых вызовов, целые у долгих. */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`

  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/** Текст результата инструмента бывает строкой, списком блоков или объектом. */
export const resultToText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (content === null || content === undefined) return ''

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null && 'text' in item) {
          const text = (item as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return JSON.stringify(content, null, 2)
}
