import type { Paragraph, TableAlign, TableData, TextPart } from './types'

/**
 * Глубже панель не отступает: она бывает узкой, и четвёртый уровень вложенности
 * съедал бы больше места, чем сам текст пункта.
 */
const MAX_LIST_DEPTH = 3

/**
 * Разбор ответа агента в абзацы макета.
 *
 * Полноценный markdown здесь не нужен и вреден: панель рисует пять вещей —
 * абзац, пункт списка, блок кода, кодовую вставку и жирный кусок. Всё прочее
 * остаётся текстом, а не превращается в разметку, которую макет не описывает.
 */
export const parseParagraphs = (source: string): Paragraph[] => {
  const paragraphs: Paragraph[] = []
  const lines = source.split('\n')

  let codeFence: { language: string; lines: string[] } | null = null
  let plain: string[] = []
  let quoteLines: string[] = []

  const flushPlain = () => {
    if (plain.length === 0) return
    paragraphs.push({ parts: parseInline(plain.join(' ')) })
    plain = []
  }

  const flushQuote = () => {
    if (quoteLines.length === 0) return
    paragraphs.push({ quote: true, parts: parseInline(quoteLines.join(' ')) })
    quoteLines = []
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const fence = /^\s*```(\w*)\s*$/.exec(line)

    if (fence) {
      if (codeFence) {
        paragraphs.push({
          codeBlock: true,
          language: codeFence.language,
          parts: [{ text: codeFence.lines.join('\n') }],
        })
        codeFence = null
      } else {
        flushPlain()
        flushQuote()
        codeFence = { language: fence[1] ?? '', lines: [] }
      }
      continue
    }

    if (codeFence) {
      codeFence.lines.push(line)
      continue
    }

    // Таблица: строка с | и сразу под ней — строка-разделитель (`---|---`,
    // `:---|---:`…). Число ячеек разделителя должно совпадать с шапкой —
    // без этого случайная строка вида «команда | другая» перед горизонтальной
    // чертой «---» тоже сошла бы за таблицу.
    const table = parseTableAt(lines, index)

    if (table) {
      flushPlain()
      flushQuote()
      paragraphs.push({ table: table.data, parts: [] })
      index = table.nextIndex - 1
      continue
    }

    // Цитата: одна или несколько строк, начинающихся с «>» (вложенное «> >» —
    // тоже цитата, без своего уровня вложенности, панели глубже одной черты не
    // нужно). Пустая «>» внутри цитаты — граница между её абзацами, как пустая
    // строка для обычного текста: закрывает уже накопленное, не завершая саму
    // цитату целиком.
    const quote = /^[ \t]*(?:>[ \t]?)+(.*)$/.exec(line)

    if (quote) {
      flushPlain()
      const content = (quote[1] ?? '').trim()
      if (content.length > 0) {
        quoteLines.push(content)
      } else {
        flushQuote()
      }
      continue
    }

    // Номер и отступ пункта сохраняем: и то, и другое несёт смысл — по номеру
    // на шаг ссылаются словами, а по отступу видно, что это уточнение к пункту
    // выше, а не ещё один равноправный шаг.
    const bullet = /^([ \t]*)(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line)

    if (bullet) {
      flushPlain()
      flushQuote()
      const indent = (bullet[1] ?? '').replace(/\t/g, '  ').length
      paragraphs.push({
        bullet: true,
        depth: Math.min(Math.floor(indent / 2), MAX_LIST_DEPTH),
        ...(bullet[2] ? { marker: `${bullet[2]}.` } : {}),
        parts: parseInline(bullet[3] ?? ''),
      })
      continue
    }

    // Отдельного шрифта/кегля заголовки не получают — остаются жирной строкой,
    // но с пометкой heading: макет добавляет зазор перед ней, чтобы раздел не
    // сливался с абзацем над собой при отрисовке.
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)

    if (heading) {
      flushPlain()
      flushQuote()
      // Через общий разбор строки, а не одним куском текста: в заголовке бывает
      // и адрес, и код в бэктиках, и по ним точно так же кликают. Целым куском
      // ссылка в заголовке оставалась просто жирной строкой, которую приходилось
      // выделять и копировать руками.
      paragraphs.push({ heading: true, parts: emphasized(heading[1] ?? '') })
      continue
    }

    if (line.trim().length === 0) {
      flushPlain()
      flushQuote()
      continue
    }

    flushQuote()
    plain.push(line.trim())
  }

  if (codeFence) {
    paragraphs.push({ codeBlock: true, language: codeFence.language, parts: [{ text: codeFence.lines.join('\n') }] })
  }

  flushPlain()
  flushQuote()
  return paragraphs
}

/** Ячейки одной строки таблицы — по `|`, без пустых крайних от рамочных `|`. */
const splitTableRow = (line: string): string[] => {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|')
}

/** `:---`, `---:`, `:---:` — выравнивание столбца; голое `---` его не задаёт. */
const cellAlign = (spec: string): TableAlign => {
  const trimmed = spec.trim()
  const left = trimmed.startsWith(':')
  const right = trimmed.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return undefined
}

const SEPARATOR_CELL = /^:?-+:?$/

/**
 * Таблица от строки `index`: она сама и следующая строка образуют шапку и
 * разделитель, дальше — идущие подряд строки с `|` как тело, до первой без
 * `|` или до конца текста (таблица ещё печатается — тело просто короче).
 *
 * Число ячеек разделителя обязано совпасть с шапкой: без этой проверки
 * случайная строка с `|` (например, вывод команды) перед любой горизонтальной
 * чертой «---» в ответе тоже сходила бы за таблицу.
 */
const parseTableAt = (lines: string[], index: number): { data: TableData; nextIndex: number } | null => {
  const line = lines[index]!
  if (!line.includes('|') || index + 1 >= lines.length) return null

  const headerCells = splitTableRow(line)
  const separatorCells = splitTableRow(lines[index + 1]!)

  if (
    headerCells.length === 0 ||
    separatorCells.length !== headerCells.length ||
    !separatorCells.every((cell) => SEPARATOR_CELL.test(cell.trim()))
  ) {
    return null
  }

  const header = headerCells.map((cell) => parseInline(cell.trim()))
  const align = separatorCells.map((cell) => cellAlign(cell))
  const rows: TextPart[][][] = []

  let cursor = index + 2
  while (cursor < lines.length && lines[cursor]!.includes('|')) {
    rows.push(splitTableRow(lines[cursor]!).map((cell) => parseInline(cell.trim())))
    cursor += 1
  }

  return { data: { align, header, rows }, nextIndex: cursor }
}

/**
 * Хвостовая пунктуация из окружающего текста, а не часть адреса: "смотри
 * https://example.com." не должна утаскивать точку в ссылку. Закрывающую
 * скобку срезаем только когда она не балансирует открывающую внутри самого
 * адреса — иначе ссылки вида "(https://example.com/foo(bar))" ломались бы.
 */
const trimUrlPunctuation = (url: string): string => {
  let end = url.length
  while (end > 0 && ".,!?;:'\"".includes(url[end - 1]!)) end -= 1

  while (end > 0 && url[end - 1] === ')') {
    const head = url.slice(0, end)
    const opens = (head.match(/\(/g) ?? []).length
    const closes = (head.match(/\)/g) ?? []).length
    if (opens >= closes) break
    end -= 1
  }

  return url.slice(0, end)
}

/**
 * Голые адреса в обычном тексте — и только они.
 *
 * Для сообщения пользователя: набранное человеком показывается ровно так, как
 * он его набрал (никакой разметки — звёздочки и решётки в вопросе он имел в
 * виду буквально), но адрес обязан оставаться адресом: по нему кликают, чтобы
 * открыть страницу, а не переписывают руками в браузер.
 */
export const linkify = (text: string): TextPart[] => {
  const parts: TextPart[] = []
  const pattern = /https?:\/\/\S+/g

  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const href = trimUrlPunctuation(match[0])
    if (!href) continue

    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ text: href, href })
    last = match.index + href.length
  }

  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/** Кодовые вставки, жирный текст, ссылки (markdown и голые URL) и подсветка веток внутри строки. */
export const parseInline = (line: string): TextPart[] => {
  const parts: TextPart[] = []
  const pattern = /\[\[(.+?)\]\]|`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/\S+)/g

  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) parts.push({ text: line.slice(last, match.index) })

    if (match[1] !== undefined) {
      parts.push({ text: match[1], mark: true })
      last = match.index + match[0].length
    } else if (match[2] !== undefined) {
      parts.push({ text: match[2], code: true })
      last = match.index + match[0].length
    } else if (match[3] !== undefined) {
      // Внутри жирного тоже бывает адрес — «**http://localhost:5173/**» пишут
      // сплошь и рядом. Разбираем содержимое тем же разбором, иначе ссылка
      // теряется ровно там, где её выделили как самое важное в ответе.
      for (const part of emphasized(match[3])) parts.push(part)
      last = match.index + match[0].length
    } else if (match[5] !== undefined) {
      parts.push({ text: match[4] ?? match[5], href: match[5] })
      last = match.index + match[0].length
    } else if (match[6] !== undefined) {
      const href = trimUrlPunctuation(match[6])
      parts.push({ text: href, href })
      last = match.index + href.length
    }
  }

  if (last < line.length) parts.push({ text: line.slice(last) })
  return parts.length > 0 ? parts : [{ text: line }]
}

/**
 * Строка целиком под ударением — заголовок или содержимое жирного куска.
 *
 * Разбирается как обычная строка, а поверх на все её части ложится пометка
 * жирного: ссылка внутри остаётся ссылкой, код — кодом. Рекурсия конечна:
 * содержимое жирного по своему же шаблону звёздочек не содержит.
 */
const emphasized = (text: string): TextPart[] =>
  parseInline(text).map((part) => ({ ...part, strong: true }))

/**
 * Тот же текст, но одной строкой и без разметки — для мест, где показать её
 * нечем. Превью мысли в ленте идёт одной строкой с многоточием: звёздочки и
 * решётки в нём ничего не выделяют, а просто торчат как мусор посреди фразы.
 *
 * Разбирается тем же разбором, что и ответ агента: своего понимания разметки
 * здесь заводить незачем — берутся готовые куски и склеиваются своим текстом.
 * Номер пункта остаётся: «1.» — часть смысла перечисления, а не его оформление.
 */
export const plainLine = (source: string): string =>
  parseParagraphs(source)
    .map(plainParagraph)
    .filter((text) => text.length > 0)
    .join(' ')

const plainParagraph = (paragraph: Paragraph): string => {
  const text = paragraph.parts
    .map((part) => part.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

  return paragraph.marker ? `${paragraph.marker} ${text}`.trim() : text
}
