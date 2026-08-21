import type { ShellMessage, WebviewMessage } from './protocol'

declare global {
  interface Window {
    /** Set by the shell once the bridge is in place. */
    __accSend?: (payload: string) => void
    /**
     * Set by us: this is where the shell puts its messages - as a batch per frame, and one at a time
     * from the harness.
     */
    __accReceive?: (batch: ShellMessage[] | ShellMessage) => void
  }
}

/**
 * Sending accumulates until the shell has put the bridge in place: the page manages to render and take
 * its first input before the channel is up.
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
  // The whole batch is handled inside one call - and React merges it into a single interface update
  // rather than a dozen in a row.
  window.__accReceive = (batch) => {
    if (!Array.isArray(batch)) {
      handler(batch)
      return
    }

    for (const message of batch) handler(message)
  }

  return () => {
    window.__accReceive = undefined
  }
}

/** Outside the IDE, in a browser, there is no bridge: worth knowing while debugging the interface. */
export const isInsideIde = (): boolean => isBridgeReady() || Boolean(window.__accReceive)
