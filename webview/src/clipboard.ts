import { isInsideIde, send } from './bridge'
import type { ShellMessage } from './protocol'

/**
 * The clipboard bridge between the page and the IDE.
 *
 * The panel is an embedded browser, and its clipboard is its own. On Linux it is besides connected to
 * nothing: the browser renders without a window of its own, while there the system clipboard is owned
 * precisely by a window - having got no ownership, the browser silently starts an internal clipboard and
 * lives with it. From outside that looks as though copying works only inside the input field: cut and
 * paste in the same place and it works, copy in a code tab and paste into the panel and it is empty, and
 * the other way round too. That is exactly what the report was about.
 *
 * We fix it not by replacing everything but by going around the broken place: the real clipboard is
 * available to the shell (it is the same one the whole IDE uses), so a copy is duplicated into it and a
 * paste is taken out of it when the browser returned emptiness. Where the native route works (macOS,
 * Windows) we do not touch it: with a live clipboard a paste arrives with contents, and the bridge simply
 * stays silent.
 */

/** The system clipboard's contents in the shape the page understands. */
export interface ClipboardContent {
  text: string
  html: string
  /** An image as a data URL: there is no other way to carry bytes through a text channel. */
  image: string
}

const EMPTY: ClipboardContent = { text: '', html: '', image: '' }

/**
 * How long the shell's answer is waited for before the clipboard counts as empty.
 *
 * Reading the clipboard on X11 is a request to another application that owns it, and it is free to stay
 * silent. A paste that did nothing is unpleasant but survivable; a paste after which the panel stops
 * answering the keyboard is not.
 */
const READ_TIMEOUT_MS = 1500

let lastRequest = 0
const pending = new Map<string, (content: ClipboardContent) => void>()

/**
 * This breaks only on Linux, so we step in only there: on the other systems the native route can do more
 * than ours (files from a file manager, formats we know nothing about), and replacing it with ourselves
 * would mean fixing one thing while breaking another. The check is lazy - in tests and in the harness
 * there may be no browser at all.
 */
const isLinux = (): boolean => typeof navigator !== 'undefined' && /linux/i.test(navigator.userAgent)

/** The bridge is needed and meaningful only inside the IDE: in the harness the browser's clipboard is real. */
const bridged = (): boolean => isLinux() && isInsideIde()

/**
 * Put what was copied in the panel into the IDE's system clipboard. Returns whether it got as far as the
 * shell: for those who would otherwise not learn about success (the "copy" button), that is the only
 * honest sign.
 */
export const writeClipboard = (text: string, html = ''): boolean => {
  if (!bridged()) return false
  if (!text && !html) return false

  send({ type: 'clipboardWrite', text, html })
  return true
}

/** Ask the shell what is in the system clipboard right now. */
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

/** The shell's answer to readClipboard - called from the shared message handling. */
export const resolveClipboard = (message: Extract<ShellMessage, { type: 'clipboard' }>): void => {
  pending.get(message.id)?.({
    text: message.text ?? '',
    html: message.html ?? '',
    image: message.image ?? '',
  })
}

/**
 * Install the bridge on the page. Returns the teardown - the subscriptions live exactly as long as the
 * panel does.
 */
export const installClipboardBridge = (): (() => void) => {
  document.addEventListener('copy', onCopy)
  document.addEventListener('cut', onCopy)
  // Intercepted before everyone: if the browser handed over emptiness, this event must not be let
  // through - the input field's handler would take it for "nothing was pasted".
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
 * Copying and cutting are duplicated into the IDE's clipboard.
 *
 * We listen on the bubble phase, that is, after the panel's own handlers: the input field puts its own
 * thing into the clipboard (the text plus a description of the attachments, see Composer), and what has
 * to be taken is exactly what was put there. When nobody put anything - a selection in the feed is being
 * copied - we take it ourselves.
 */
const onCopy = (event: ClipboardEvent): void => {
  if (!bridged()) return

  const own = selection()
  const text = event.clipboardData?.getData('text/plain') || own.text
  const html = event.clipboardData?.getData('text/html') || own.html

  writeClipboard(text, html)
}

/**
 * A paste the browser brought nothing with.
 *
 * The event is suppressed entirely and one just like it is sent instead, carrying the contents of the
 * real clipboard: that way the whole paste handling - images, attachments, sheets of text - stays where
 * it was, and no second copy of it is started.
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
 * Whether we are waiting for a paste that has been pressed but has not arrived as an event yet.
 *
 * Needed because the event may not arrive at all: a browser that got no system clipboard is free to
 * consider a paste impossible and never wake the page. Then we do it on its behalf - but only after
 * making sure it genuinely did not arrive by its own route.
 */
let awaitingPaste = false

const onKeyDown = (event: KeyboardEvent): void => {
  if (!bridged() || !isPasteShortcut(event)) return

  const target = document.activeElement
  if (!isEditable(target)) return

  awaitingPaste = true
  // The browser will dispatch its own event inside this same task, right after the key handlers - so
  // checking makes sense already in the next one.
  setTimeout(() => {
    if (!awaitingPaste) return
    awaitingPaste = false

    void readClipboard().then((content) => deliverPaste(target, content))
  }, 0)
}

/** Ctrl/Cmd+V and Shift+Insert - a habit from Linux, where the latter is just as common. */
const isPasteShortcut = (event: KeyboardEvent): boolean => {
  if (event.altKey) return false
  if (event.code === 'KeyV') return (event.ctrlKey || event.metaKey) && !event.shiftKey
  return event.code === 'Insert' && event.shiftKey && !event.ctrlKey && !event.metaKey
}

/**
 * Dispatch the paste anew - this time with the contents of the IDE's clipboard.
 *
 * If it was accepted (the input field suppresses the event itself), there is nothing more to do. If
 * nobody accepted it - and those are the ordinary fields such as an MCP server's address, which have no
 * paste handling of their own - we insert the text by hand: without that they would stay on Linux as
 * broken as they were before the bridge.
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
 * Whether the clipboard holds anything at all. Files are checked too: a screenshot arrives precisely as
 * one, and there may be no text with it at all.
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
 * A paste by hand - for fields that have no handling of their own.
 *
 * An ordinary field's value is set through the element's own setter rather than through the property:
 * React replaces the property with one of its own, remembers the last known value in it and decides by
 * that whether a change happened. An assignment bypassing that memory it will not notice - the field
 * would show what was pasted while the component's state stayed as it was, and the old value would be
 * sent.
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
 * What is selected right now - for the case where nobody put anything into the clipboard themselves.
 *
 * Ordinary fields (an MCP server's address, the history search) keep their selection apart from the
 * page's: the shared getSelection knows nothing about their text at all and would return emptiness - and
 * with it "nothing" would travel into the IDE's clipboard, which would then keep its previous contents
 * while the browser thinks it has copied.
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

/** Parsing a data URL: the type and the bytes. Split out because it is easy to get wrong silently. */
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

/** How long the modern Clipboard API is waited for before it counts as unavailable. */
const CLIPBOARD_API_TIMEOUT_MS = 300

/**
 * navigator.clipboard is not always present in the IDE's embedded browser (JCEF) - and, worse than an
 * ordinary refusal, it may not reject with an error but hang without an answer for good (verified live:
 * a plain await never sees either success or refusal). The button meanwhile reported success (the tick)
 * at once, waiting for nothing at all. document.execCommand is already used in the panel for other
 * operations and works reliably there, so it is an honest fallback when the modern API is unavailable,
 * failed, or stays silent longer than is reasonable. "Success" now means exactly success rather than
 * merely a call.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  // Apart from both browser routes: on Linux the embedded browser's clipboard is connected to nothing,
  // and both of them put the text where nobody can reach it afterwards - neither the editor nor a
  // neighbouring application (see clipboard.ts). This button slips past the shared copy interception
  // because the modern Clipboard API raises no copy event.
  const bridged = writeClipboard(text)

  if (navigator.clipboard?.writeText) {
    // .catch straight on the promise itself - otherwise, rejecting later than the timeout has already
    // won the race, it surfaces as an uncaught (in promise) in the console.
    const write = navigator.clipboard
      .writeText(text)
      .then(() => 'done' as const)
      .catch(() => 'failed' as const)
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), CLIPBOARD_API_TIMEOUT_MS))

    if ((await Promise.race([write, timeout])) === 'done') return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  return ok || bridged
}
