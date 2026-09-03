import webpush from 'web-push'

/**
 * Waking a phone that is not connected.
 *
 * This is the one part of the relay that talks to somebody else's server - Apple's or Google's - and
 * the only part with a dependency to its name. Web push encryption (RFC 8291) is not something to
 * write by hand for a side project: getting it subtly wrong produces notifications that arrive as
 * "this site was updated in the background", which is the failure mode nobody notices in testing and
 * everybody sees in use.
 *
 * What matters here is what it does *not* do. The text of a notification is encrypted by the IDE
 * before it ever reaches this server, and decrypted by the phone's service worker. This code moves an
 * opaque blob: it can see that a notification was sent, to which device and when, and nothing else.
 * Push encryption happens on top of that and hides the same blob from Apple and Google in turn.
 */

export interface Subscription {
  deviceId: string
  endpoint: string
  /** The browser's own keys for push encryption - not ours, and no use for anything else. */
  p256dh: string
  auth: string
  createdAt: number
  failures: number
}

export interface PushKeys {
  publicKey: string
  privateKey: string
  subject: string
}

/**
 * Where a notification may be sent.
 *
 * An allowlist rather than a list of forbidden addresses, and that is the whole of the defence. This
 * endpoint is the one place where somebody else's string turns into an outgoing request from this
 * server, and the legitimate set of strings is tiny, public and named by the browsers themselves - so
 * "these hosts and nothing else" is both exact and short. A blocklist of private ranges would have to
 * be re-checked at connect time to mean anything (a name resolves when it is dialled, not when it is
 * stored), and it would still leave this server willing to post whatever it is handed at any address
 * on the internet.
 *
 * Add to it through RELAY_PUSH_HOSTS rather than by editing this: a browser this list has not heard of
 * is a subscription refused, and refusing one is better than a relay that can be pointed anywhere.
 */
const PUSH_HOSTS = [
  // Chrome and everything else built on it.
  'fcm.googleapis.com',
  'android.googleapis.com',
  // Firefox.
  'updates.push.services.mozilla.com',
  // Safari, on the phone and on the desktop.
  'web.push.apple.com',
  // Edge.
  'notify.windows.com',
]

const extraHosts = (process.env.RELAY_PUSH_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean)

/**
 * Whether this is an address a push service answers on: https, a known host or a subdomain of one,
 * and nothing clever in between. Anything else is refused before it is written down, because what is
 * written down is what this server will later dial.
 */
export const isPushEndpoint = (endpoint: string): boolean => {
  if (endpoint.length > 512) return false

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false

  const host = url.hostname.toLowerCase()

  return [...PUSH_HOSTS, ...extraHosts].some((known) => host === known || host.endsWith(`.${known}`))
}

export class Pushes {
  private readonly subscriptions = new Map<string, Subscription>()

  constructor(
    private readonly keys: PushKeys | null,
    private readonly log: (line: string) => void,
    /** How many are held at once. One per paired phone - see the config's note. */
    private readonly ceiling = 10_000,
  ) {
    if (keys) webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey)
  }

  get enabled(): boolean {
    return this.keys !== null
  }

  /** What a client needs to subscribe at all. Read from the relay rather than built into the client:
   *  a client built for the public relay must still work against somebody's own. */
  publicKey(): string {
    return this.keys?.publicKey ?? ''
  }

  /**
   * Hold a subscription, or refuse it.
   *
   * Refusing rather than making room is deliberate: the oldest entries are the phones that have been
   * paired longest, so evicting them would turn somebody else's flood into "notifications quietly
   * stopped working" for the people who use this most. A full map is not a busy server - one entry
   * per paired phone is the honest size - so it means somebody is filling it, and the answer to that
   * is no.
   */
  remember(subscription: Omit<Subscription, 'createdAt' | 'failures'>): boolean {
    if (!isPushEndpoint(subscription.endpoint)) return false

    if (!this.subscriptions.has(subscription.deviceId) && this.subscriptions.size >= this.ceiling) {
      this.log(`push subscriptions are at their ceiling (${this.ceiling}) - refusing a new one`)
      return false
    }

    this.subscriptions.set(subscription.deviceId, {
      ...subscription,
      createdAt: Date.now(),
      failures: 0,
    })

    return true
  }

  forget(deviceId: string): void {
    this.subscriptions.delete(deviceId)
  }

  has(deviceId: string): boolean {
    return this.subscriptions.has(deviceId)
  }

  count(): number {
    return this.subscriptions.size
  }

  /**
   * Send an already-sealed payload to a device.
   *
   * A refusal from the push service is the ordinary way to learn a subscription is dead - the app was
   * deleted, the browser cleared, the endpoint expired. After a few of them the subscription goes:
   * keeping one that has been refused for a week costs a request every time and delivers nothing.
   */
  async send(deviceId: string, sealed: Uint8Array): Promise<boolean> {
    const subscription = this.subscriptions.get(deviceId)
    if (!subscription || !this.keys) return false

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        Buffer.from(sealed),
        { TTL: TTL_SECONDS },
      )

      subscription.failures = 0
      return true
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 0

      // 404 and 410 are the push service saying this endpoint is gone for good. Anything else may be
      // weather.
      if (status === 404 || status === 410) {
        this.subscriptions.delete(deviceId)
        this.log(`push endpoint gone for ${deviceId.slice(0, 8)} - forgotten`)
        return false
      }

      subscription.failures += 1
      if (subscription.failures >= MAX_FAILURES) {
        this.subscriptions.delete(deviceId)
        this.log(`push failed ${MAX_FAILURES} times for ${deviceId.slice(0, 8)} - forgotten`)
      }

      // The reason, never the payload - it is not ours to look at, and it is encrypted anyway.
      this.log(`push refused (${status}) for ${deviceId.slice(0, 8)}`)
      return false
    }
  }
}

/**
 * How long a push service should hold a notification for a phone that is off.
 *
 * Four hours rather than a day: a permission from this morning answered at midnight is not useful, and
 * a stale notification is worse than none - it sends someone to look at a conversation that moved on
 * without them.
 */
const TTL_SECONDS = 4 * 60 * 60

const MAX_FAILURES = 3

export const readPushKeys = (): PushKeys | null => {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!publicKey || !privateKey) return null

  return {
    publicKey,
    privateKey,
    // Push services want a way to contact whoever is sending. A mailto: or a URL, both fine.
    subject: process.env.VAPID_SUBJECT ?? 'mailto:relay@example.com',
  }
}

/** For the one-off script that makes a pair for a new deployment - see the relay's README. */
export const generateKeys = (): { publicKey: string; privateKey: string } => webpush.generateVAPIDKeys()
