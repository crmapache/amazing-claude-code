import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { ServerResponse } from 'node:http'

/**
 * The phone's own files, when this relay is the one serving them.
 *
 * A single-page client, so anything that is not a file falls back to its shell - the client sorts out
 * what to draw from the address itself. Set RELAY_STATIC_DIR empty to turn this off entirely: someone
 * hosting the client elsewhere should not have this server pretending to.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

export const serveStatic = (root: string, path: string, response: ServerResponse): void => {
  if (!root) {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('not found')
    return
  }

  const base = resolve(root)
  // A path from outside is never trusted to stay inside: "../../etc/passwd" is the oldest request on
  // the internet, and it must not be the way to read this server's disk.
  const target = resolve(join(base, normalize(path)))

  if (target !== base && !target.startsWith(base + sep)) {
    response.writeHead(403, { 'content-type': 'text/plain' })
    response.end('forbidden')
    return
  }

  const file = pick(target, base)

  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('not found')
    return
  }

  const type = TYPES[extname(file)] ?? 'application/octet-stream'
  const cache = cacheControl(file)

  response.writeHead(200, { 'content-type': type, 'cache-control': cache })
  createReadStream(file).pipe(response)
}

/**
 * How long a file may be kept.
 *
 * Only the hashed assets are immutable, and only because their names change when their contents do.
 * Everything whose name stays the same across builds has to be re-fetched, and the service worker is
 * the one that matters most: a worker cached for a year is an installed phone that can never be
 * updated - it would go on serving last year's client out of its own cache, and no deploy would ever
 * reach it. The manifest is the same story on a longer fuse.
 */
const NEVER_STALE = ['sw.js', 'manifest.webmanifest']

const cacheControl = (file: string): string => {
  // The shell itself is never cached: a stale one against a fresh relay is exactly the mismatch the
  // hashed assets beside it exist to avoid.
  if (file.endsWith('.html')) return 'no-store'
  if (NEVER_STALE.some((name) => file.endsWith(sep + name))) return 'no-cache'

  return 'public, max-age=31536000, immutable'
}

const pick = (target: string, base: string): string | null => {
  const direct = readable(target)
  if (direct) return direct

  const indexed = readable(join(target, 'index.html'))
  if (indexed) return indexed

  // Every other address belongs to the client's own routing rather than to a file: hand it the shell
  // and let it read the address itself.
  return readable(join(base, 'index.html'))
}

const readable = (path: string): string | null => {
  try {
    return statSync(path).isFile() ? path : null
  } catch {
    return null
  }
}
