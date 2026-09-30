import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The lock on the dashboard: one password, and a signed cookie that remembers it was typed.
 *
 * One person reads this page, so there are no accounts - only ADMIN_PASSWORD. The cookie carries nothing
 * but the moment it runs out and a signature over it, made with a key derived from the password itself.
 * Two things follow from that and both are the point: nothing about a session has to be kept anywhere
 * (a restart of the service does not sign anybody out), and changing the password signs everybody out at
 * once, because every old signature stops matching.
 */
export class AdminAuth {
  private readonly key: Buffer

  constructor(
    private readonly password: string,
    private readonly secure: boolean,
  ) {
    this.key = createHmac('sha256', password).update('acc-usage-admin-session').digest()
  }

  get enabled(): boolean {
    return this.password.length > 0
  }

  /**
   * Whether this is the password. Both sides are hashed first so the comparison is of equal lengths and
   * takes the same time whatever was typed - a length that differs would otherwise say so by itself.
   */
  checkPassword(candidate: string): boolean {
    if (!this.enabled) return false
    const typed = createHash('sha256').update(candidate).digest()
    const real = createHash('sha256').update(this.password).digest()
    return timingSafeEqual(typed, real)
  }

  /** The Set-Cookie value for a fresh session. */
  issue(now: number): string {
    const expires = now + SESSION_MS
    const value = `${expires}.${this.sign(expires)}`
    return this.cookie(value, Math.floor(SESSION_MS / 1000))
  }

  /** The Set-Cookie value that ends one. */
  clear(): string {
    return this.cookie('', 0)
  }

  /** Whether the request carries a session that is ours and has not run out. */
  verify(cookieHeader: string | undefined, now: number): boolean {
    if (!this.enabled || !cookieHeader) return false

    const value = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1)
    if (!value) return false

    const [expiresText, signature] = value.split('.')
    const expires = Number(expiresText)
    if (!Number.isFinite(expires) || expires < now || !signature) return false

    const expected = Buffer.from(this.sign(expires))
    const given = Buffer.from(signature)
    return expected.length === given.length && timingSafeEqual(expected, given)
  }

  private sign(expires: number): string {
    return createHmac('sha256', this.key).update(`v1.${expires}`).digest('base64url')
  }

  private cookie(value: string, maxAge: number): string {
    return [
      `${COOKIE}=${value}`,
      'Path=/admin',
      'HttpOnly',
      // Strict rather than Lax: nothing links to this page from anywhere, and a cookie that never rides
      // along on a request started by another site is the whole of the defence against forged posts.
      'SameSite=Strict',
      `Max-Age=${maxAge}`,
      ...(this.secure ? ['Secure'] : []),
    ].join('; ')
  }
}

const COOKIE = 'acc_admin'

const SESSION_MS = 30 * 24 * 60 * 60 * 1000
