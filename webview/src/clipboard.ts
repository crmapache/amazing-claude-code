import { isInsideIde, send } from './bridge'
import type { ShellMessage } from './protocol'

/**
 * Мост буфера обмена между страницей и IDE.
 *
 * Панель — это встроенный браузер, и буфер обмена у него свой. На Linux он
 * вдобавок ни с кем не связан: браузер рисуется без собственного окна, а
 * системным буфером там владеет именно окно — не получив владения, браузер
 * молча заводит внутренний буфер и живёт с ним. Наружу это выглядит так, будто
 * копирование работает только внутри поля ввода: вырезал и вставил там же —
 * получилось, скопировал во вкладке кода и вставил в панель — пусто, и обратно
 * тоже. Ровно об этом и пришёл отзыв.
 *
 * Чиним не подменой всего подряд, а обходом сломанного места: настоящий буфер
 * доступен оболочке (это тот же буфер, которым пользуется вся IDE), поэтому
 * копирование дублируем туда, а вставку берём оттуда, когда браузер вернул
 * пустоту. Там, где родной путь работает (macOS, Windows), мы в него не лезем:
 * при живом буфере вставка приходит с содержимым, и мост просто молчит.
 */

/** Содержимое системного буфера в том виде, в котором его понимает страница. */
export interface ClipboardContent {
  text: string
  html: string
  /** Картинка как data-URL: другого пути занести байты через текстовый канал нет. */
  image: string
}

const EMPTY: ClipboardContent = { text: '', html: '', image: '' }

/**
 * Сколько ждём ответ оболочки, прежде чем считать буфер пустым.
 *
 * Чтение буфера на X11 — это запрос к чужому приложению-владельцу, и оно вправе
 * молчать. Вставка, которая ничего не сделала, — неприятно, но переживаемо;
 * вставка, после которой панель не отвечает на клавиши, — нет.
 */
const READ_TIMEOUT_MS = 1500

let lastRequest = 0
const pending = new Map<string, (content: ClipboardContent) => void>()

/**
 * Ломается это только на Linux, поэтому и вмешиваемся только там: на остальных
 * системах родной путь умеет больше нашего (файлы из проводника, форматы, о
 * которых мы не знаем), и подменять его собой значило бы чинить одно, ломая
 * другое. Проверка ленивая — в тестах и в харнессе браузера может не быть вовсе.
 */
const isLinux = (): boolean => typeof navigator !== 'undefined' && /linux/i.test(navigator.userAgent)

/** Мост нужен и осмыслен только внутри IDE: в харнессе буфер браузера настоящий. */
const bridged = (): boolean => isLinux() && isInsideIde()

/**
 * Положить в системный буфер IDE то, что скопировали в панели. Возвращает,
 * дошло ли дело до оболочки: тем, кто иначе не узнает об успехе (кнопка
 * «скопировать»), это единственный честный признак.
 */
export const writeClipboard = (text: string, html = ''): boolean => {
  if (!bridged()) return false
  if (!text && !html) return false

  send({ type: 'clipboardWrite', text, html })
  return true
}

/** Спросить у оболочки, что сейчас лежит в системном буфере. */
export const readClipboard = (): Promise<ClipboardContent> => {
  if (!bridged()) return Promise.resolve(EMPTY)

  lastRequest += 1
  const id = `clip-${lastRequest}`

  return new Promise<ClipboardContent>((resolve) => {
    const finish = (content: ClipboardContent) => {
      if (!pending.delete(id)) return
      clearTimeout(timeout)
      resolve(content)
    }

    const timeout = setTimeout(() => finish(EMPTY), READ_TIMEOUT_MS)

    pending.set(id, finish)
    send({ type: 'clipboardRead', id })
  })
}

/** Ответ оболочки на readClipboard — зовётся из общего разбора сообщений. */
export const resolveClipboard = (message: Extract<ShellMessage, { type: 'clipboard' }>): void => {
  pending.get(message.id)?.({
    text: message.text ?? '',
    html: message.html ?? '',
    image: message.image ?? '',
  })
}

/**
 * Поставить мост на страницу. Возвращает снятие — подписки живут ровно столько,
 * сколько сама панель.
 */
export const installClipboardBridge = (): (() => void) => {
  document.addEventListener('copy', onCopy)
  document.addEventListener('cut', onCopy)
  // Перехват до всех: если браузер отдал пустоту, дальше это событие пускать
  // нельзя — обработчик поля ввода принял бы её за «вставили ничего».
  document.addEventListener('paste', onPaste, true)
  window.addEventListener('keydown', onKeyDown, true)

  return () => {
    document.removeEventListener('copy', onCopy)
    document.removeEventListener('cut', onCopy)
    document.removeEventListener('paste', onPaste, true)
    window.removeEventListener('keydown', onKeyDown, true)
  }
}

/**
 * Копирование и вырезание дублируем в буфер IDE.
 *
 * Слушаем на всплытии, то есть уже после обработчиков панели: поле ввода кладёт
 * в буфер своё (текст плюс описание вложений, см. Composer), и забрать нужно
 * именно то, что положили. Когда никто ничего не клал — копируют выделение в
 * ленте — берём его сами.
 */
const onCopy = (event: ClipboardEvent): void => {
  if (!bridged()) return

  const own = selection()
  const text = event.clipboardData?.getData('text/plain') || own.text
  const html = event.clipboardData?.getData('text/html') || own.html

  writeClipboard(text, html)
}

/**
 * Вставка, за которой браузер ничего не принёс.
 *
 * Событие гасим целиком и вместо него посылаем такое же, но с содержимым из
 * настоящего буфера: так вся разборка вставки — картинки, вложения, простыни
 * текста — остаётся там же, где была, и второй её копии не заводится.
 */
const onPaste = (event: ClipboardEvent): void => {
  awaitingPaste = false
  if (!bridged() || hasContent(event.clipboardData)) return

  event.preventDefault()
  event.stopImmediatePropagation()

  const target = event.target instanceof Element ? event.target : document.activeElement
  void readClipboard().then((content) => deliverPaste(target, content))
}

/**
 * Ждём ли вставку, которая уже нажата, но ещё не пришла событием.
 *
 * Нужно потому, что событие может и не прийти вовсе: браузер, не получивший
 * системный буфер, вправе счесть вставку невозможной и не будить страницу
 * совсем. Тогда за него это делаем мы — но только убедившись, что своим путём
 * она действительно не дошла.
 */
let awaitingPaste = false

const onKeyDown = (event: KeyboardEvent): void => {
  if (!bridged() || !isPasteShortcut(event)) return

  const target = document.activeElement
  if (!isEditable(target)) return

  awaitingPaste = true
  // Своё событие браузер разошлёт в этой же задаче, сразу за обработчиками
  // клавиши, — поэтому проверять есть смысл уже в следующей.
  setTimeout(() => {
    if (!awaitingPaste) return
    awaitingPaste = false

    void readClipboard().then((content) => deliverPaste(target, content))
  }, 0)
}

/** Ctrl/Cmd+V и Shift+Insert — привычка родом из Linux, там она в ходу наравне. */
const isPasteShortcut = (event: KeyboardEvent): boolean => {
  if (event.altKey) return false
  if (event.code === 'KeyV') return (event.ctrlKey || event.metaKey) && !event.shiftKey
  return event.code === 'Insert' && event.shiftKey && !event.ctrlKey && !event.metaKey
}

/**
 * Разослать вставку заново — уже с содержимым из буфера IDE.
 *
 * Если её приняли (поле ввода гасит событие само), делать больше нечего. Если
 * никто не принял — а это обычные поля вроде адреса сервера MCP, у которых
 * своей обработки вставки нет, — вставляем текст руками: без этого они на
 * Linux остались бы теми же нерабочими, что и до моста.
 */
const deliverPaste = (target: Element | null, content: ClipboardContent): void => {
  if (!isEditable(target)) return
  if (!content.text && !content.html && !content.image) return

  const data = new DataTransfer()
  if (content.text) data.setData('text/plain', content.text)
  if (content.html) data.setData('text/html', content.html)

  const image = fileFromDataUrl(content.image)
  if (image) data.items.add(image)

  const accepted = !target.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  )

  if (!accepted && content.text) insertText(target, content.text)
}

/**
 * Есть ли в буфере хоть что-то. Проверяем и файлы: скриншот приходит именно
 * ими, а текста при нём может не быть вовсе.
 */
const hasContent = (data: DataTransfer | null): boolean => {
  if (!data) return false
  if (data.files.length > 0) return true
  if (Array.from(data.items).some((item) => item.kind === 'file')) return true

  return Boolean(data.getData('text/plain') || data.getData('text/html'))
}

const isEditable = (node: Element | null): node is HTMLElement => {
  if (!(node instanceof HTMLElement)) return false

  return node.isContentEditable || node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
}

/**
 * Вставка руками — для полей, которые своей обработки не имеют.
 *
 * Значение обычного поля правим через сеттер самого элемента, а не через
 * свойство: React подменяет свойство своим, запоминает в нём последнее
 * известное значение и по нему же решает, было ли изменение. Присваивание в
 * обход этой памяти он не заметит — поле показало бы вставленное, а состояние
 * компонента осталось бы прежним, и отправилось бы старое.
 */
const insertText = (target: HTMLElement, text: string): void => {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    document.execCommand('insertText', false, text)
    return
  }

  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set

  setter?.call(target, target.value.slice(0, start) + text + target.value.slice(end))
  target.setSelectionRange(start + text.length, start + text.length)
  target.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Что сейчас выделено — на случай, когда в буфер никто ничего не клал сам.
 *
 * Обычные поля (адрес сервера MCP, поиск по истории) держат своё выделение
 * отдельно от выделения страницы: общий getSelection про их текст не знает
 * вообще и вернул бы пустоту — а с ней в буфер IDE уехало бы «ничего», и он
 * остался бы с прошлым содержимым, пока браузер думает, что скопировал.
 */
const selection = (): { text: string; html: string } => {
  const active = document.activeElement
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return { text: active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0), html: '' }
  }

  const picked = window.getSelection()
  if (!picked || picked.rangeCount === 0 || picked.isCollapsed) return { text: '', html: '' }

  const holder = document.createElement('div')
  holder.appendChild(picked.getRangeAt(0).cloneContents())

  return { text: picked.toString(), html: holder.innerHTML }
}

/** Разбор data-URL: тип и байты. Вынесено отдельно, потому что легко ошибиться молча. */
const decodeDataUrl = (url: string): { type: string; bytes: Uint8Array<ArrayBuffer> } | null => {
  const match = url.match(/^data:([^;,]+);base64,(.*)$/s)
  if (!match?.[1] || !match[2]) return null

  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)

    return { type: match[1], bytes }
  } catch {
    return null
  }
}

const fileFromDataUrl = (url: string): File | null => {
  const decoded = url ? decodeDataUrl(url) : null
  if (!decoded) return null

  const extension = decoded.type.split('/')[1] || 'png'
  return new File([decoded.bytes], `clipboard.${extension}`, { type: decoded.type })
}
