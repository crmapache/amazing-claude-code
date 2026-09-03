import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { serveStatic } from './static.js'

/**
 * What may be kept, and for how long.
 *
 * Worth a test of its own because getting it wrong is invisible until it is expensive: a service
 * worker cached for a year is a phone that can never be updated, and no deploy would ever reach it.
 * The person who hits that is somebody with the app on their home screen, weeks later.
 */

const root = mkdtempSync(join(tmpdir(), 'acc-static-'))
mkdirSync(join(root, 'assets'), { recursive: true })
writeFileSync(join(root, 'index.html'), '<!doctype html>')
writeFileSync(join(root, 'sw.js'), '// worker')
writeFileSync(join(root, 'manifest.webmanifest'), '{}')
writeFileSync(join(root, 'assets', 'mobile-abc123.js'), 'export {}')

/**
 * Just enough of a response to record the headers.
 *
 * A real Writable rather than an object literal: the success path pipes a read stream into it, and a
 * stub without the stream's own methods fails there rather than where the test is looking.
 */
const answer = (path: string) => {
  const headers: Record<string, string> = {}
  let status = 0

  const sink = new Writable({ write: (_chunk, _encoding, done) => done() }) as Writable & {
    writeHead: (code: number, given: Record<string, string>) => void
  }

  sink.writeHead = (code, given) => {
    status = code
    Object.assign(headers, given)
  }

  serveStatic(root, path, sink as never)

  return { status, cache: headers['cache-control'], type: headers['content-type'] }
}

describe('what the relay lets a client keep', () => {
  it('never lets the shell go stale, at the root or down any of the client\'s own routes', () => {
    expect(answer('/')).toMatchObject({ status: 200, cache: 'no-store', type: 'text/html; charset=utf-8' })
    expect(answer('/some/route/of/the/client')).toMatchObject({ status: 200, cache: 'no-store' })
  })

  it('makes the service worker revalidate, or an installed phone can never be updated', () => {
    expect(answer('/sw.js').cache).toBe('no-cache')
  })

  it('makes the manifest revalidate too', () => {
    expect(answer('/manifest.webmanifest').cache).toBe('no-cache')
  })

  it('keeps a hashed asset forever, because its name changes when it does', () => {
    expect(answer('/assets/mobile-abc123.js').cache).toBe('public, max-age=31536000, immutable')
  })
})

/**
 * What may be read at all.
 *
 * The prefix check reads a string; a link satisfies it and still points somewhere else. This folder is
 * a build artifact, so neither of these should ever fire - which is exactly what makes them cheap.
 */
describe('what the relay refuses to read', () => {
  it('does not follow a link out of the folder it serves', () => {
    const secret = join(root, '..', `acc-secret-${process.pid}`)
    writeFileSync(secret, 'not for the internet')
    symlinkSync(secret, join(root, 'escape.txt'))

    // Not a 404: an address that is not a file belongs to the client's own routing, so what comes
    // back is the shell. What matters is that it is the shell and not the file the link pointed at.
    expect(answer('/escape.txt')).toMatchObject({ status: 200, cache: 'no-store', type: 'text/html; charset=utf-8' })
  })

  it('does not serve what a build left behind by accident', () => {
    writeFileSync(join(root, '.env'), 'VAPID_PRIVATE_KEY=nope')

    expect(answer('/.env').status).toEqual(403)
  })
})
