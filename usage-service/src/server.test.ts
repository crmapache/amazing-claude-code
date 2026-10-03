import { afterEach, describe, expect, it } from 'vitest'
import { readConfig, type Config } from './config.js'
import { createService, type Service } from './server.js'
import { Store } from './store.js'

/**
 * A real service on a real port, over a database in memory. Most of what is worth checking is the doors:
 * the secret, the shape, the password, the cookie - the paths that decide whether a stranger can write
 * into the table or read the page.
 */

const INSTALL = 'Rk3pD9xQ2mV7tL1aZ8bN4c'

let service: Service | undefined
let store: Store | undefined

const raise = async (overrides: Partial<Config> = {}): Promise<{ port: number; store: Store }> => {
  const config: Config = {
    ...readConfig(),
    logLevel: 'silent',
    key: 'the-key',
    adminPassword: 'open sesame',
    secureCookie: false,
    ...overrides,
  }
  store = new Store(':memory:')
  service = createService(config, store, () => {})
  return { port: await service.listen(0), store }
}

afterEach(() => {
  service?.close()
  store?.close()
  service = undefined
  store = undefined
})

const CODEX_INSTALL = 'Cx7pQ2mV9tL4aZ1bN8kD3r'

const today = new Date().toISOString().slice(0, 10)

const report = (install = INSTALL, day = today) => ({
  schema: 1,
  install,
  env: { plugin: '0.14.0', ide: 'WS', ideVersion: '2026.2', os: 'mac', arch: 'arm64', cli: '2.3.1', lang: 'ru' },
  settings: { remote: true, layout: 'bottom' },
  days: [
    {
      day,
      minutes: 95,
      prompts: 12,
      turns: 11,
      conversations: 3,
      sittings: [20, 75],
      tools: { Read: 20, MCP: 2 },
      models: { Opus: 11 },
      slash: { compact: 1 },
      features: { voice: 2, improve_prompt: 1, 'screen:history': 1, 'setting:theme': 1 },
    },
  ],
})

const send = (port: number, body: unknown, key = 'the-key') =>
  fetch(`http://127.0.0.1:${port}/v1/usage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acc-key': key },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

/** What the Codex fork sends: the same shape, its own product, its own agent's names. */
const codexReport = (install = CODEX_INSTALL) => ({
  ...report(install),
  product: 'acx',
  env: { plugin: '0.1.0', ide: 'IU', ideVersion: '2026.2', os: 'mac', arch: 'arm64', cli: '0.152.0', lang: 'en' },
  settings: { remote: false, accounts: 2 },
  days: [
    {
      day: today,
      minutes: 40,
      prompts: 5,
      turns: 5,
      sittings: [40],
      tools: { Read: 3, mcp__github__search: 1 },
      models: { 'gpt-5.6-sol': 5 },
      slash: { review: 1, 'prompts:fix-it': 1 },
      features: { project_trust: 1, account_add: 1, 'screen:codexConfig': 1 },
    },
  ],
})

const forget = (port: number, install: string, query = '') =>
  fetch(`http://127.0.0.1:${port}/v1/usage/${install}${query}`, { method: 'DELETE', headers: { 'x-acc-key': 'the-key' } })

const signIn = async (port: number, password = 'open sesame') =>
  fetch(`http://127.0.0.1:${port}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }).toString(),
    redirect: 'manual',
  })

describe('taking a report', () => {
  it('keeps one that carries the key', async () => {
    const { port, store } = await raise()

    const response = await send(port, report())

    expect(response.status).toBe(204)
    expect(store.all('SELECT * FROM days')).toHaveLength(1)
    expect(store.all("SELECT * FROM counts WHERE kind = 'features'")).toHaveLength(4)
  })

  it('refuses one without the key before reading it', async () => {
    const { port, store } = await raise()

    expect((await send(port, report(), 'wrong')).status).toBe(403)
    expect(store.all('SELECT * FROM days')).toHaveLength(0)
  })

  it('refuses what is not a report', async () => {
    const { port } = await raise()

    expect((await send(port, 'not json')).status).toBe(400)
    expect((await send(port, { install: 'x', days: [] })).status).toBe(400)
  })

  it('refuses a body past the ceiling', async () => {
    const { port } = await raise({ maxBodyBytes: 256 })
    expect((await send(port, report())).status).toBe(413)
  })

  it('holds one address to its hourly share', async () => {
    const { port } = await raise({ perIpPerHour: 2 })

    expect((await send(port, report())).status).toBe(204)
    expect((await send(port, report())).status).toBe(204)
    expect((await send(port, report())).status).toBe(429)
  })

  it('forgets an identifier when asked with the key', async () => {
    const { port, store } = await raise()
    await send(port, report())

    const refused = await fetch(`http://127.0.0.1:${port}/v1/usage/${INSTALL}`, { method: 'DELETE' })
    expect(refused.status).toBe(403)
    expect(store.all('SELECT * FROM days')).toHaveLength(1)

    const done = await fetch(`http://127.0.0.1:${port}/v1/usage/${INSTALL}`, {
      method: 'DELETE',
      headers: { 'x-acc-key': 'the-key' },
    })
    expect(done.status).toBe(204)
    expect(store.all('SELECT * FROM days')).toHaveLength(0)
    expect(store.all('SELECT * FROM installs')).toHaveLength(0)
  })

  it('files a report under the plugin it names, and under ACC when it names none', async () => {
    const { port, store } = await raise()

    expect((await send(port, report())).status).toBe(204)
    expect((await send(port, codexReport())).status).toBe(204)

    expect(store.all('SELECT id, product FROM installs ORDER BY product')).toEqual([
      { id: INSTALL, product: 'acc' },
      { id: CODEX_INSTALL, product: 'acx' },
    ])
    expect(store.all("SELECT name, value FROM counts WHERE product = 'acx' AND kind IN ('slash', 'tools') ORDER BY name")).toEqual([
      { name: 'MCP', value: 1 },
      { name: 'Read', value: 3 },
      { name: 'custom', value: 1 },
      { name: 'review', value: 1 },
    ])
  })

  it('refuses a report from a plugin this service does not count, and keeps none of it', async () => {
    const { port, store } = await raise()

    for (const product of ['acz', '', null]) {
      const response = await send(port, { ...report(), product })
      expect(response.status, String(product)).toBe(400)
      expect(await response.text()).toBe('not a plugin this service counts')
    }
    expect(store.all('SELECT * FROM installs')).toHaveLength(0)
  })

  it("refuses a report under an identifier that is the other plugin's", async () => {
    const { port, store } = await raise()
    await send(port, report())

    expect((await send(port, codexReport(INSTALL))).status).toBe(409)
    expect(store.all("SELECT * FROM days WHERE product = 'acx'")).toHaveLength(0)
  })

  it('forgets within the plugin that asks only', async () => {
    const { port, store } = await raise()
    await send(port, report())
    await send(port, codexReport())

    // ACC's request, as its published versions send it - no product - does not reach the fork's figures.
    expect((await forget(port, CODEX_INSTALL)).status).toBe(204)
    // Nor the fork's request ACC's.
    expect((await forget(port, INSTALL, '?product=acx')).status).toBe(204)
    expect(store.all('SELECT * FROM days')).toHaveLength(2)

    expect((await forget(port, CODEX_INSTALL, '?product=acx')).status).toBe(204)
    expect(store.all<{ product: string }>('SELECT product FROM days')).toEqual([{ product: 'acc' }])
    expect(store.all<{ product: string }>('SELECT DISTINCT product FROM counts')).toEqual([{ product: 'acc' }])
    expect(store.all<{ id: string }>('SELECT id FROM installs')).toEqual([{ id: INSTALL }])
  })

  it('refuses to forget for a plugin this service does not count', async () => {
    const { port, store } = await raise()
    await send(port, report())

    expect((await forget(port, INSTALL, '?product=acz')).status).toBe(400)
    expect((await forget(port, INSTALL, '?product=')).status).toBe(400)
    expect(store.all('SELECT * FROM days')).toHaveLength(1)
  })

  it('says which plugins it counts', async () => {
    const { port } = await raise()
    const info = (await (await fetch(`http://127.0.0.1:${port}/v1/info`)).json()) as Record<string, unknown>
    expect(info.products).toEqual(['acc', 'acx'])
  })

  it('refuses to forget something that is not an identifier', async () => {
    const { port } = await raise()
    const response = await fetch(`http://127.0.0.1:${port}/v1/usage/%E0%A4%A`, {
      method: 'DELETE',
      headers: { 'x-acc-key': 'the-key' },
    })
    expect(response.status).toBe(400)
  })
})

describe('the dashboard', () => {
  it('sends a stranger to the password', async () => {
    const { port } = await raise()
    const response = await fetch(`http://127.0.0.1:${port}/admin`, { redirect: 'manual' })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/admin/login')
  })

  it('refuses a wrong password and signs in with the right one', async () => {
    const { port } = await raise()

    const wrong = await signIn(port, 'guess')
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get('set-cookie')).toBeNull()

    const right = await signIn(port)
    expect(right.status).toBe(303)
    const cookie = right.headers.get('set-cookie')!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/admin')
  })

  it('shows the figures to a signed-in reader, with no script allowed on the page', async () => {
    const { port } = await raise()
    await send(port, report())
    await send(port, report('another-machine-id-000'))

    const cookie = (await signIn(port)).headers.get('set-cookie')!.split(';')[0]!
    const response = await fetch(`http://127.0.0.1:${port}/admin?days=7`, { headers: { cookie } })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(html).not.toContain('<script')
    expect(html).toContain('<h3>Active machines</h3>')
    expect(html).toContain('<h3>New and returning</h3>')
    // Light whatever the reader's browser prefers: there is no dark set to switch to.
    expect(html).not.toContain('prefers-color-scheme')
    // The labels of the features, not their ids.
    expect(html).toContain('Dictate by voice')
    expect(html).toContain('Improve prompt')
    expect(html).toContain('WebStorm (WS)')
  })

  it("opens Claude Code's tab by default, with a tab for each plugin that keeps the range", async () => {
    const { port } = await raise()
    await send(port, report())
    await send(port, codexReport())

    const cookie = (await signIn(port)).headers.get('set-cookie')!.split(';')[0]!
    const html = await (await fetch(`http://127.0.0.1:${port}/admin?days=7`, { headers: { cookie } })).text()

    expect(html).toContain('<a href="/admin?product=acc&amp;days=7" aria-current="page" class="on">Claude Code</a>')
    expect(html).toContain('<a href="/admin?product=acx&amp;days=7">Codex</a>')
    expect(html).toContain('<a href="/admin?product=acc&amp;days=30">30 days</a>')
    expect(html).toContain('Amazing Claude Code GUI ·')
    expect(html).toContain('Claude Code version')
    expect(html).toContain('2.3.1')
    // Nothing of the fork's on this tab: not its machine's version, not its features.
    expect(html).not.toContain('0.152.0')
    expect(html).not.toContain('Trust a project')
    expect(html).not.toContain('Codex CLI version')
  })

  it("shows the Codex tab when the address asks for it - its own figures in its own words", async () => {
    const { port } = await raise()
    await send(port, report())
    await send(port, codexReport())

    const cookie = (await signIn(port)).headers.get('set-cookie')!.split(';')[0]!
    const response = await fetch(`http://127.0.0.1:${port}/admin?product=acx&days=90`, { headers: { cookie } })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).not.toContain('<script')
    expect(html).toContain('<title>Usage - Codex - 90 days</title>')
    expect(html).toContain('<a href="/admin?product=acx&amp;days=90" aria-current="page" class="on">Codex</a>')
    expect(html).toContain('<a href="/admin?product=acx&amp;days=7">7 days</a>')
    expect(html).toContain('Amazing Codex GUI ·')
    expect(html).toContain('Codex CLI version')
    expect(html).toContain('0.152.0')
    expect(html).toContain('Codex plugins installed')
    expect(html).toContain('Codex accounts')
    expect(html).toContain('Trust a project with its Codex settings')
    expect(html).toContain('Add a Codex account')
    expect(html).toContain('gpt-5.6-sol')
    // Nothing of Claude Code's: not its version, not its words, not its machine's features.
    expect(html).not.toContain('2.3.1')
    expect(html).not.toContain('Claude Code version')
    expect(html).not.toContain('Claude account')
    expect(html).not.toContain('Dictate by voice')
  })

  it('opens the default tab for a plugin it does not have', async () => {
    const { port } = await raise()
    const cookie = (await signIn(port)).headers.get('set-cookie')!.split(';')[0]!
    const html = await (await fetch(`http://127.0.0.1:${port}/admin?product=nope`, { headers: { cookie } })).text()

    expect(html).toContain('aria-current="page" class="on">Claude Code</a>')
  })

  it('does not take a cookie signed with another password', async () => {
    const first = await raise({ adminPassword: 'one' })
    const cookie = (await signIn(first.port, 'one')).headers.get('set-cookie')!.split(';')[0]!
    service?.close()
    store?.close()

    const second = await raise({ adminPassword: 'two' })
    const response = await fetch(`http://127.0.0.1:${second.port}/admin`, { headers: { cookie }, redirect: 'manual' })
    expect(response.status).toBe(303)
  })

  it('slows down somebody trying passwords', async () => {
    const { port } = await raise()
    for (let attempt = 0; attempt < 10; attempt += 1) await signIn(port, `guess ${attempt}`)

    expect((await signIn(port)).status).toBe(429)
  })

  it('does not exist without a password configured', async () => {
    const { port } = await raise({ adminPassword: '' })

    expect((await fetch(`http://127.0.0.1:${port}/admin`)).status).toBe(404)
    expect((await signIn(port, '')).status).toBe(404)
  })
})
