import type { Chip } from './types'

export interface SelectionSpan {
  path: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  wholeLines: boolean
}

/**
 * Подпись диапазона для ссылки из редактора.
 *
 * Колонки показываем, только когда выделение режет строку: у целых строк они
 * ничего не уточняют, а место в панели тратят. Формат один и тот же и в поле
 * ввода, и в сообщении агенту — сверять их глазами должно быть нечего.
 */
export const rangeLabel = (span: SelectionSpan): string => {
  const { startLine, startColumn, endLine, endColumn, wholeLines } = span

  if (wholeLines) return startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`
  if (startLine === endLine) return `L${startLine}:${startColumn}-${endColumn}`

  return `L${startLine}:${startColumn}-L${endLine}:${endColumn}`
}

export const referenceChip = (span: SelectionSpan): Chip => ({
  kind: 'ref',
  value: span.path,
  range: rangeLabel(span),
})

/**
 * Что уходит агенту. Путь идёт через @, как в терминале: так агент понимает, что
 * файл надо прочитать. Диапазон — припиской, чтобы он знал, о каком куске речь,
 * но видел файл целиком.
 */
export const referenceText = (chip: Chip): string =>
  chip.range ? `@${chip.value} (${chip.range})` : `@${chip.value}`

/** Дальше имя не показываем целиком: обрезаем середину, расширение остаётся видно. */
const MAX_LABEL_LENGTH = 28

const truncateMiddle = (text: string, max = MAX_LABEL_LENGTH): string => {
  if (text.length <= max) return text

  const head = Math.ceil((max - 1) * 0.6)
  const tail = max - 1 - head
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

/** Сколько слов цитаты показываем в самой плашке — дальше её просто не разглядеть. */
const QUOTE_PREVIEW_WORDS = 5

/** "ref1: пара слов текста…" — плашка не по длине символов, а по количеству слов: так превью не обрывается на середине слова. */
const quotePreview = (text: string): string => {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const preview = words.slice(0, QUOTE_PREVIEW_WORDS).join(' ')
  return words.length > QUOTE_PREVIEW_WORDS ? `${preview}…` : preview
}

/**
 * В самой плашке путь сокращаем до имени файла: полный не помещается, а для
 * файла вне проекта (например, из Downloads) это ещё и абсолютный путь целиком.
 * Полный путь остаётся в тексте, который получает агент, и в подсказке при
 * наведении — здесь только то, что видно глазами.
 */
export const chipLabel = (chip: Chip): string => {
  if (chip.kind === 'quote') return `${chip.value}: ${quotePreview(chip.text ?? '')}`

  const name = truncateMiddle(chip.value.split('/').at(-1) ?? chip.value)
  return chip.range ? `${name} ${chip.range}` : name
}
