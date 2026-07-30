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

    // Заголовки макет отдельно не рисует, поэтому оставляем их жирной строкой.
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)

    if (heading) {
      flushPlain()
      paragraphs.push({ parts: [{ text: heading[1] ?? '', strong: true }] })
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

/** Кодовые вставки, жирный текст и подсветка ссылок на ветку внутри строки. */
export const parseInline = (line: string): TextPart[] => {
  const parts: TextPart[] = []
  const pattern = /\[\[(.+?)\]\]|`([^`]+)`|\*\*([^*]+)\*\*/g

  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) parts.push({ text: line.slice(last, match.index) })

    if (match[1] !== undefined) parts.push({ text: match[1], mark: true })
    else if (match[2] !== undefined) parts.push({ text: match[2], code: true })
    else if (match[3] !== undefined) parts.push({ text: match[3], strong: true })

    last = match.index + match[0].length
  }

  if (last < line.length) parts.push({ text: line.slice(last) })
  return parts.length > 0 ? parts : [{ text: line }]
}
