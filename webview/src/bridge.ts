import type { ShellMessage, WebviewMessage } from './protocol'

declare global {
  interface Window {
    /** Ставит оболочка, когда мост готов. */
    __accSend?: (payload: string) => void
    /** Ставим мы: сюда оболочка складывает свои сообщения. */
    __accReceive?: (message: ShellMessage) => void
  }
}

/**
 * Отправка накапливается, пока оболочка не поставила мост: страница успевает
 * отрисоваться и принять первый ввод раньше, чем встанет канал.
 */
const outbox: WebviewMessage[] = []

const isBridgeReady = (): boolean => typeof window.__accSend === 'function'

const flush = (): void => {
  if (!isBridgeReady()) return

  while (outbox.length > 0) {
    const message = outbox.shift()
    if (message) window.__accSend?.(JSON.stringify(message))
  }
}

window.addEventListener('acc:ready', flush)

export const send = (message: WebviewMessage): void => {
  outbox.push(message)
  flush()
}

export const subscribe = (handler: (message: ShellMessage) => void): (() => void) => {
  window.__accReceive = handler
  return () => {
    window.__accReceive = undefined
  }
}

/** В браузере вне IDE моста нет: об этом полезно знать при отладке интерфейса. */
export const isInsideIde = (): boolean => isBridgeReady() || Boolean(window.__accReceive)
