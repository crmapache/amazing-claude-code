import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
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
