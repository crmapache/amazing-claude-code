import type { ShellMessage } from '../protocol'

/**
 * The same panel, reached over a socket instead of through the IDE's embedded browser.
 *
 * It plugs in exactly where the harness does - the two globals and the readiness event that bridge.ts
 * knows about (see there). That is the whole seam: one interface, three hosts. Nothing in bridge.ts
 * changes for this, and nothing in App.tsx knows it happened.
 *
 * Server-sent events rather than a WebSocket, deliberately. The JDK has no WebSocket *server*, only a
 * client, and writing one by hand for a channel that exists to be replaced in phase 2 would be work
 * spent on scaffolding. An EventSource reconnects by itself, which is the very behaviour the relay
 * will need - so this rehearses it rather than avoiding it.
 */

interface Options {
  /** Where the shell listens. Empty means the page's own origin, which is the ordinary case. */
  base?: string
  /**
   * The token the shell printed when it opened the port. Even on a loopback address any page in any
   * browser on this machine can post to it, so it is not optional.
   */
  token: string
}

export const connect = ({ base = '', token }: Options): void => {
  /**
   * This page's own name. The shell answers some requests to whoever asked rather than to everyone -
   * the clipboard, a command's output - and without a name of its own a page would be answered by
   * whichever stream happened to be first.
   */
  const clientId = `page-${Math.random().toString(36).slice(2, 10)}`

  /**
   * Messages that arrived before the page mounted. The interface sets its receiver as it mounts (see
   * subscribe in bridge.ts), and the shell starts talking the moment the stream opens - without this
   * the whole restored feed would land in nothing.
   */
  const pending: ShellMessage[] = []

  const receive = (message: ShellMessage): void => {
    if (!window.__accReceive) {
      pending.push(message)
      return
    }

    window.__accReceive(message)
  }

  const drain = (): void => {
    if (!window.__accReceive) return

    while (pending.length > 0) {
      const message = pending.shift()
      if (message) window.__accReceive(message)
    }
  }

  window.__accSend = (payload: string): void => {
    void fetch(`${base}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-acc-token': token, 'x-acc-client': clientId },
      body: payload,
    }).catch(() => {
      // A dropped request is not worth a dialog: the stream below notices the break and the page says
      // so in one place rather than in two.
    })
  }

  const stream = new EventSource(
    `${base}/events?token=${encodeURIComponent(token)}&client=${encodeURIComponent(clientId)}`,
  )

  stream.onmessage = (event) => {
    const message = JSON.parse(event.data) as ShellMessage
    receive(message)
    drain()
  }

  // The page is ready to talk before it has anything to say - the same signal the IDE's shell sends
  // once its bridge is in place.
  window.dispatchEvent(new Event('acc:ready'))

  // And once React has mounted and put its receiver in, whatever arrived in between goes through.
  const settle = window.setInterval(() => {
    if (!window.__accReceive) return
    drain()
    window.clearInterval(settle)
  }, MOUNT_POLL_MS)
}

/** How often to look for the mounted page while the first messages wait - see [connect]. */
const MOUNT_POLL_MS = 10
