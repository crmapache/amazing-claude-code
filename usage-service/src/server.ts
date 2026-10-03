import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { AdminAuth } from './auth.js'
import { SERVICE_VERSION, type Config } from './config.js'
import { overview, RANGES } from './dashboard.js'
import { Limits } from './limits.js'
import { dashboardPage, loginPage, notConfiguredPage } from './page.js'
import { DEFAULT_PRODUCT, PRODUCTS, readProduct, type Product } from './products.js'
import { isInstallId, productOf, readReport } from './report.js'
import type { Store } from './store.js'

/**
 * The service behind the anonymous usage report of both plugins - Amazing Claude Code GUI and its Codex
 * fork, Amazing Codex GUI (see products.ts) - and the page the author reads them on.
 *
 * Its own service rather than a route on the feedback service or the relay, because it is the only one of
 * the three that keeps anything: the relay holds nothing on disk by design, the feedback service forgets
 * a message the moment it is forwarded, and both say so in their own READMEs. A database belongs beside
 * neither of those promises.
 *
 * What it keeps is counts under a random identifier and nothing else. The address a report came from is
 * used for one thing - the hourly ceiling below, in memory - and never written anywhere, the log
 * included, where only its first few characters appear.
 */

export interface Service {
  listen: (port: number) => Promise<number>
  close: () => void
}

export const createService = (config: Config, store: Store, log: (line: string) => void): Service => {
  const reports = new Limits(config.perIpPerHour, 60 * 60 * 1000)
  // Ten tries in a quarter of an hour: a person who mistyped twice is not slowed down, a script trying
  // passwords is held to forty an hour.
  const logins = new Limits(10, 15 * 60 * 1000)
  const auth = new AdminAuth(config.adminPassword, config.secureCookie)

  /** Something threw while answering: logged by its message alone, answered once. */
  const failed = (response: ServerResponse, error: unknown): void => {
    log(`a request failed: ${(error as Error).message}`)
    if (!response.headersSent) reply(response, 500, 'something went wrong here')
  }

  const http = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const path = url.pathname

    try {
      if (path === '/healthz') return reply(response, 200, 'ok')

      if (path === '/v1/info') {
        // The plugins it counts for, so a deploy can be checked from outside before a plugin relies on it.
        return json(response, 200, { serviceVersion: SERVICE_VERSION, admin: auth.enabled, products: PRODUCTS })
      }

      if (path === '/v1/usage' && request.method === 'POST') {
        return void takeReport(request, response).catch((error: unknown) => failed(response, error))
      }

      if (path.startsWith('/v1/usage/') && request.method === 'DELETE') {
        // Not decoded: an identifier is made of URL-safe characters only, and anything else is refused below.
        return forget(request, response, path.slice('/v1/usage/'.length), url)
      }

      if (path === '/admin' || path === '/admin/') return dashboard(request, response, url)
      if (path === '/admin/login' && request.method === 'GET') return page(response, 200, auth.enabled ? loginPage(null) : notConfiguredPage())
      if (path === '/admin/login' && request.method === 'POST') {
        return void login(request, response).catch((error: unknown) => failed(response, error))
      }
      if (path === '/admin/logout' && request.method === 'POST') {
        response.writeHead(303, { location: '/admin/login', 'set-cookie': auth.clear() })
        return void response.end()
      }

      return reply(response, 404, 'not found')
    } catch (error) {
      return failed(response, error)
    }
  })

  /** A report from the plugin: read, held to the shape, kept. */
  const takeReport = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    // The secret before the body: a scanner costs a header, not a read.
    if (config.key && request.headers['x-acc-key'] !== config.key) return reply(response, 403, 'not for you')

    const address = addressOf(request, config.trustedProxies)
    const now = Date.now()
    if (!reports.allow(address, now)) {
      log(`refused ${hint(address)}: too many reports this hour`)
      return reply(response, 429, 'too many reports this hour')
    }

    const body = await readBody(request, config.maxBodyBytes)
    if (body === null) return reply(response, 413, 'too big')

    let parsed: unknown
    try {
      parsed = JSON.parse(body.toString('utf8'))
    } catch {
      return reply(response, 400, 'send it as JSON')
    }

    // Asked apart from the rest, so a plugin this service does not count hears that rather than "empty".
    if (productOf(parsed) === null) return reply(response, 400, 'not a plugin this service counts')

    const report = readReport(parsed, now)
    if (!report) return reply(response, 400, 'nothing in it to keep')

    if (!store.save(report, now)) {
      log(`refused a report from ${report.product} ${hint(report.install)}: the identifier is the other plugin's`)
      return reply(response, 409, 'that identifier belongs to another plugin')
    }
    // Sizes and counts only - and never the identifier whole: the log is not a second copy of the table.
    log(
      `report from ${report.product} ${hint(report.install)}: ` +
        `${report.days.length} day${report.days.length === 1 ? '' : 's'}, ${body.length} B`,
    )
    response.writeHead(204).end()
  }

  /**
   * Everything under one identifier, deleted. Asked for by the plugin when somebody switches the report
   * off: what was sent with their permission goes away when the permission does.
   *
   * Within the plugin that asks only, named the way a report names it but in the address, since a DELETE
   * has no body: `?product=acx`, and nothing for ACC, whose published versions ask without it. Answered
   * 204 whether there was anything to delete or not: all the plugin needs to hear is that it may stop
   * asking.
   */
  const forget = (request: IncomingMessage, response: ServerResponse, install: string, url: URL): void => {
    if (config.key && request.headers['x-acc-key'] !== config.key) return reply(response, 403, 'not for you')
    if (!isInstallId(install)) return reply(response, 400, 'not an identifier')

    const product = readProduct(url.searchParams.get('product') ?? undefined)
    if (!product) return reply(response, 400, 'not a plugin this service counts')

    const removed = store.forget(product, install)
    log(`forgot ${product} ${hint(install)}: ${removed} row${removed === 1 ? '' : 's'}`)
    response.writeHead(204).end()
  }

  const dashboard = (request: IncomingMessage, response: ServerResponse, url: URL): void => {
    if (!auth.enabled) return page(response, 404, notConfiguredPage())
    if (!auth.verify(request.headers.cookie, Date.now())) {
      response.writeHead(303, { location: '/admin/login' })
      return void response.end()
    }

    const asked = Number(url.searchParams.get('days'))
    const days = (RANGES as readonly number[]).includes(asked) ? asked : 30
    // An address with a plugin the page does not have opens the default tab, as a wrong range opens 30 days.
    const product: Product = readProduct(url.searchParams.get('product') ?? undefined) ?? DEFAULT_PRODUCT
    page(response, 200, dashboardPage(overview(store, product, days)))
  }

  const login = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!auth.enabled) return page(response, 404, notConfiguredPage())

    const address = addressOf(request, config.trustedProxies)
    if (!logins.allow(address, Date.now())) {
      log(`refused a login from ${hint(address)}: too many attempts`)
      return page(response, 429, loginPage('Too many attempts. Wait a quarter of an hour and try again.'))
    }

    const body = await readBody(request, 4096)
    const password = body ? new URLSearchParams(body.toString('utf8')).get('password') ?? '' : ''

    if (!auth.checkPassword(password)) {
      log(`a wrong password from ${hint(address)}`)
      return page(response, 401, loginPage('That is not the password.'))
    }

    response.writeHead(303, { location: '/admin', 'set-cookie': auth.issue(Date.now()) })
    response.end()
  }

  return {
    listen: (port: number) =>
      new Promise((resolve) => {
        http.listen(port, () => {
          const taken = http.address()
          resolve(typeof taken === 'object' && taken ? taken.port : port)
        })
      }),
    close: () => void (http as Server).close(),
  }
}

/** Read the whole body, or null once it grows past the ceiling or the sender goes away. */
export const readBody = (request: IncomingMessage, ceiling: number): Promise<Buffer | null> =>
  new Promise((resolve) => {
    let chunks: Buffer[] | null = []
    let held = 0

    request.on('data', (chunk: Buffer) => {
      if (chunks === null) return
      held += chunk.length
      if (held > ceiling) {
        chunks = null
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(chunks === null ? null : Buffer.concat(chunks)))
    request.on('error', () => resolve(null))
    request.on('aborted', () => resolve(null))
  })

const reply = (response: ServerResponse, status: number, text: string): void => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(text)
}

const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

/**
 * A page of the dashboard, with the headers that keep it to itself: no script may run on it at all,
 * nothing may frame it, no search engine may list it, and no browser keeps a copy of the figures.
 */
const page = (response: ServerResponse, status: number, html: string): void => {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
    'cache-control': 'no-store',
  })
  response.end(html)
}

/**
 * Who is asking, for the ceilings only - read from the end of x-forwarded-for, as far as our own proxies
 * reach, and from the socket when none is configured (see the feedback service for the whole argument).
 */
export const addressOf = (request: IncomingMessage, trustedProxies: number): string => {
  const socket = request.socket.remoteAddress?.replace(/^::ffff:/, '') ?? ''
  if (trustedProxies <= 0) return socket || 'unknown'

  const header = request.headers['x-forwarded-for']
  const chain = (Array.isArray(header) ? header.join(',') : header ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const taken = chain.length >= trustedProxies ? chain[chain.length - trustedProxies] : undefined
  return taken || socket || 'unknown'
}

/** The first few characters: enough to see one sender from another in a log, not enough to be a record. */
const hint = (value: string): string => value.slice(0, 6) + '…'
