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

/**
 * Строка похожа на заданный вопрос — заканчивается вопросительным знаком. В
 * собственном сообщении такую строку показываем приглушённой: рядом почти
 * всегда стоит решение по ней, и внимание должно доставаться решению, а не
 * повторённому контексту вопроса.
 */
export const isQuestionLine = (line: string): boolean => line.trim().endsWith('?')

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
 * Сколько слов вставки показываем в плашке. Больше, чем у цитаты: у цитаты перед
 * превью стоит её номер, и по нему её и узнают, а вставку узнают только по
 * началу текста — оно и есть всё, что о ней известно с одного взгляда.
 */
const PASTE_PREVIEW_WORDS = 7

/**
 * Символьный потолок поверх словесного — семь слов сами по себе не защищают от
 * длины: попадись среди них голый URL или путь без пробелов, и плашка
 * растягивалась бы в узкую длинную полосу вместо компактной, как у соседних
 * вложений (см. MAX_LABEL_LENGTH выше — та же по духу защита у имени файла).
 */
const PASTE_PREVIEW_CHARS = 40

/**
 * Сколько символов вставки хватает на превью. Дальше не смотрим вовсе: подпись
 * плашки строится на каждой перерисовке ленты, а вставляют в поле и стокилобайтные
 * логи — разбирать такой текст целиком ради семи слов незачем.
 *
 * С запасом: семь слов даже из длинных путей укладываются с большим отрывом.
 */
const PASTE_SCAN_CHARS = 300

/**
 * Начало вставленного текста — многоточие в конце стоит всегда, даже если текст
 * уместился целиком: свёрнута вставка ровно потому, что она многострочная, и за
 * первой строкой в ней всегда есть что-то ещё.
 */
const pastePreview = (text: string): string => {
  const words = text.slice(0, PASTE_SCAN_CHARS).trim().split(/\s+/).filter(Boolean)
  const preview = words.slice(0, PASTE_PREVIEW_WORDS).join(' ')
  return `${preview.slice(0, PASTE_PREVIEW_CHARS)}…`
}

/**
 * Сколько текста берём во вставку, показанную блоком. Строк на экране всё равно
 * три (обрезает вёрстка), но взять ровно три строки здесь нельзя: в них может
 * быть и десять символов, и тысяча — ширину знает только сам экран.
 */
const PASTE_BLOCK_CHARS = 600

/**
 * Начало вставки для широкой плашки — той, за которой в сообщении уже ничего
 * нет и место можно занять целиком. В отличие от подписи в строке, здесь текст
 * идёт как есть, с переносами: по ним и узнают, что именно вставили.
 */
export const pasteBlockPreview = (text: string): string => {
  const body = text.trim()
  return body.length > PASTE_BLOCK_CHARS ? `${body.slice(0, PASTE_BLOCK_CHARS)}…` : body
}

/**
 * Сколько строк во вставке — цифра для подсказки при наведении, не для подписи.
 *
 * Считаем переводы строки, а не режем текст на массив: у стокилобайтного лога
 * это тысячи ненужных строк в памяти на каждой перерисовке ленты.
 */
export const pasteLineCount = (text: string): number => {
  const body = text.trimEnd()
  if (!body) return 0

  let lines = 1
  for (let index = body.indexOf('\n'); index >= 0; index = body.indexOf('\n', index + 1)) lines += 1
  return lines
}

/**
 * Сколько текста вставки показываем в подсказке при наведении. Системная
 * подсказка длиннее и не покажет — а вот в атрибут узла ляжет всё, что дадут.
 */
const PASTE_TITLE_CHARS = 2_000

/**
 * Что показывает плашка при наведении. Одна на все места, где она рисуется:
 * в поле ввода узлом DOM и в ленте разметкой React — разъехаться этим двум
 * подсказкам нельзя, плашка человеку одна и та же.
 *
 * У свёрнутой вставки это её объём и весь текст целиком: подпись показывает
 * только начало, и другого способа увидеть, что там внутри, не разворачивая
 * плашку, нет.
 */
export const chipTitle = (chip: Chip): string => {
  if (chip.kind === 'quote') return chip.text ?? ''

  if (chip.kind === 'paste') {
    const text = chip.text ?? ''
    const shown = text.length > PASTE_TITLE_CHARS ? `${text.slice(0, PASTE_TITLE_CHARS)}\n…` : text
    return `${pasteLineCount(text)} lines pasted\n\n${shown}`
  }

  return chip.range ? `${chip.value} ${chip.range}` : chip.value
}

/**
 * В самой плашке путь сокращаем до имени файла: полный не помещается, а для
 * файла вне проекта (например, из Downloads) это ещё и абсолютный путь целиком.
 * Полный путь остаётся в тексте, который получает агент, и в подсказке при
 * наведении — здесь только то, что видно глазами.
 */
export const chipLabel = (chip: Chip): string => {
  if (chip.kind === 'quote') return `${chip.value}: ${quotePreview(chip.text ?? '')}`
  if (chip.kind === 'paste') return pastePreview(chip.text ?? '')
  // Со слэшем, как её и набирали: без него плашка команды читается просто словом.
  if (chip.kind === 'cmd') return `/${chip.value}`

  // Пустые куски отбрасываем: у папки путь кончается слэшем, и последним куском
  // там идёт пустая строка — плашка оставалась бы вовсе без подписи.
  const parts = chip.value.split('/').filter(Boolean)
  const name = truncateMiddle(parts.at(-1) ?? chip.value)
  return chip.range ? `${name} ${chip.range}` : name
}
