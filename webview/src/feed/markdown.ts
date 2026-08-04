import type { Paragraph, TextPart } from './types'

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

  const flushPlain = () => {
    if (plain.length === 0) return
    paragraphs.push({ parts: parseInline(plain.join(' ')) })
    plain = []
  }

  for (const line of lines) {
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
        codeFence = { language: fence[1] ?? '', lines: [] }
      }
      continue
    }

    if (codeFence) {
      codeFence.lines.push(line)
      continue
    }

    const bullet = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line)

    if (bullet) {
      flushPlain()
      paragraphs.push({ bullet: true, parts: parseInline(bullet[1] ?? '') })
      continue
    }

    // Отдельного шрифта/кегля заголовки не получают — остаются жирной строкой,
    // но с пометкой heading: макет добавляет зазор перед ней, чтобы раздел не
    // сливался с абзацем над собой при отрисовке.
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)

    if (heading) {
      flushPlain()
      paragraphs.push({ heading: true, parts: [{ text: heading[1] ?? '', strong: true }] })
      continue
    }

    if (line.trim().length === 0) {
      flushPlain()
      continue
    }

    plain.push(line.trim())
  }

  if (codeFence) {
    paragraphs.push({ codeBlock: true, language: codeFence.language, parts: [{ text: codeFence.lines.join('\n') }] })
  }

  flushPlain()
  return paragraphs
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
      parts.push({ text: match[3], strong: true })
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
