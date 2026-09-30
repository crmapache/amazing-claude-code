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
    expect(html).toContain('Active machines per day')
    // The labels of the features, not their ids.
    expect(html).toContain('Dictate by voice')
    expect(html).toContain('Improve prompt')
    expect(html).toContain('WebStorm (WS)')
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
