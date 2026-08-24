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

export class Pushes {
  private readonly subscriptions = new Map<string, Subscription>()

  constructor(
    private readonly keys: PushKeys | null,
    private readonly log: (line: string) => void,
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

  remember(subscription: Omit<Subscription, 'createdAt' | 'failures'>): void {
    this.subscriptions.set(subscription.deviceId, {
      ...subscription,
      createdAt: Date.now(),
      failures: 0,
    })
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
