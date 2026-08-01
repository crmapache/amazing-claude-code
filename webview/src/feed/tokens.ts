import { referenceText } from './reference'
import type { Chip, ChipKind, UserToken } from './types'

/**
 * Что содержимое поля ввода значит для агента — и как оно переживает буфер обмена.
 *
 * Живёт отдельно от панели, потому что нужно с двух сторон: панель этим собирает
 * сообщение перед отправкой, а поле ввода — тем же самым отвечает на копирование,
 * и расходиться этим двум ответам нельзя.
 */

/** Картинка из буфера обмена: та, у которой есть байты, а не просто путь. */
const isImage = (token: UserToken): boolean =>
  token.kind === 'chip' && token.chip.kind === 'img' && Boolean(token.chip.data)

/** Текст вложения внутри строки — ровно то, что видит агент на его месте. */
export const tokenText = (token: UserToken): string => {
  if (token.kind === 'text') return token.value

  const { chip } = token
  if (chip.kind === 'cmd') return `/${chip.value}`
  if (chip.kind === 'ref') return referenceText(chip)
  // Цитата не путь на диске, а сам текст: агенту уходит целиком, а не то, что видно в плашке.
  if (chip.kind === 'quote') return `"${chip.text ?? ''}"`
  // Картинка без байтов — выбранная в диалоге IDE, а не вставленная из буфера.
  // Это обычная ссылка на файл, и уходить она должна через @, как любая другая:
  // в скобках агент видел бы только имя и прочитать файл не мог.
  return `@${chip.value}`
}

/**
 * Текст последовательности вложений с нумерацией картинок.
 *
 * Номер картинки считаем заново по её месту в последовательности, а не берём
 * сохранённый в плашке: он мог устареть, если картинку вставили не в конец, а
 * раньше уже вставленной — иначе агенту достанутся байты в одном порядке, а
 * подписи [Image #N] в тексте — в другом, и он свяжет их неверно. Байты в
 * imageAttachments идут в том же порядке токенов, так что нумерация здесь и там
 * совпадает всегда.
 *
 * Отсчёт начинается не с нуля, а с offset — сколько картинок уже ушло раньше в
 * этой же сессии.
 */
export const tokensText = (tokens: UserToken[], offset = 0): string => {
  let ordinal = offset

  return tokens
    .map((token) => {
      if (!isImage(token)) return tokenText(token)
      ordinal += 1
      return `[Image #${ordinal}]`
    })
    .join('')
}

/** Сообщение целиком: цитаты отдельными строками сверху, дальше само поле. */
export const composePrompt = (
  { tokens, quotes }: { tokens: UserToken[]; quotes: { text: string }[] },
  imageOffset: number,
): string => {
  const parts: string[] = []

  for (const quote of quotes) parts.push(`> ${quote.text}`)

  const body = tokensText(tokens, imageOffset).trim()
  if (body) parts.push(body)

  return parts.join('\n')
}

const DATA_URL = /^data:([^;]+);base64,(.+)$/

/** Байты вставленных из буфера картинок — то, что реально уходит агенту как вложение. */
export const imageAttachments = (tokens: UserToken[]): { mediaType: string; data: string }[] =>
  tokens.flatMap((token) => {
    if (token.kind !== 'chip' || token.chip.kind !== 'img' || !token.chip.data) return []
    const match = token.chip.data.match(DATA_URL)
    return match?.[1] && match[2] ? [{ mediaType: match[1], data: match[2] }] : []
  })

// --- Буфер обмена -----------------------------------------------------------

/**
 * Признак нашего содержимого в буфере обмена.
 *
 * Вложения в поле ввода — не текст, а плашки, и байты картинки не лежат в самом
 * поле: они привязаны к живому узлу. Скопировать такое обычным способом нельзя —
 * браузер отдаст в буфер видимую надпись плашки вместе со значком и крестиком
 * кнопки удаления, а вставится она потом бессмысленной строкой.
 *
 * Поэтому рядом с читаемым текстом кладём в буфер и полное описание вложений —
 * прямо с байтами картинок. Носителем выбран text/html: это единственный формат
 * помимо простого текста, который гарантированно переживает системный буфер
 * обмена, поэтому вставка работает и после перезапуска IDE, и в другом окне, а
 * не только пока жив тот же самый webview.
 */
export const CLIPBOARD_ATTRIBUTE = 'data-acc-tokens'

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Что кладём в text/html: описание вложений в атрибуте, читаемый текст — внутри. */
export const clipboardHtml = (tokens: UserToken[]): string =>
  `<span ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent(JSON.stringify(tokens))}">${escapeHtml(tokensText(tokens))}</span>`

const CHIP_KINDS: ChipKind[] = ['file', 'img', 'dir', 'cmd', 'ref', 'quote']

const isChip = (value: unknown): value is Chip => {
  if (typeof value !== 'object' || value === null) return false

  const chip = value as Record<string, unknown>
  if (typeof chip.value !== 'string') return false
  if (!CHIP_KINDS.includes(chip.kind as ChipKind)) return false

  for (const field of ['range', 'data', 'text'] as const) {
    if (chip[field] !== undefined && typeof chip[field] !== 'string') return false
  }

  // Картинка без разборных байтов — сломанная: агенту вложение не уйдёт, а
  // плашка будет обещать обратное. Такую вставку лучше отдать простым текстом.
  return !(chip.kind === 'img' && chip.data !== undefined && !DATA_URL.test(chip.data as string))
}

const isToken = (value: unknown): value is UserToken => {
  if (typeof value !== 'object' || value === null) return false

  const token = value as Record<string, unknown>
  if (token.kind === 'text') return typeof token.value === 'string'
  return token.kind === 'chip' && isChip(token.chip)
}

/**
 * Достаёт вложения обратно из буфера обмена.
 *
 * Значение атрибута закодировано, поэтому кавычек внутри быть не может — читаем
 * его выражением, не поднимая ради этого разбор целого документа. Всё, что не
 * похоже на нашу запись, возвращаем как «ничего»: вставка тогда пойдёт обычным
 * путём, простым текстом, а не сломает поле.
 */
export const clipboardTokens = (html: string): UserToken[] | null => {
  const match = html.match(new RegExp(`${CLIPBOARD_ATTRIBUTE}="([^"]*)"`))
  if (!match?.[1]) return null

  const parsed = ((): unknown => {
    try {
      return JSON.parse(decodeURIComponent(match[1] as string))
    } catch {
      return null
    }
  })()

  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isToken)) return null

  return parsed
}
