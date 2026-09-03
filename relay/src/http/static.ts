import { createReadStream, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize, relative, resolve, sep } from 'node:path'
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

  if (!inside(target, base) || hidden(target, base)) {
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
  const direct = readable(target, base)
  if (direct) return direct

  const indexed = readable(join(target, 'index.html'), base)
  if (indexed) return indexed

  // Every other address belongs to the client's own routing rather than to a file: hand it the shell
  // and let it read the address itself.
  return readable(join(base, 'index.html'), base)
}

/**
 * A file, and one that is really where it appears to be.
 *
 * The prefix check above reads a string; this one reads the disk. A link inside the folder pointing
 * out of it satisfies every check that only looks at the path - it is spelled entirely inside the
 * folder - and would be read all the same. What is served here is a build artifact, so this should
 * never fire; that is exactly why it is cheap to insist on.
 */
const readable = (path: string, base: string): string | null => {
  try {
    if (!statSync(path).isFile()) return null

    // Both sides resolved, because the folder itself is often reached through a link and comparing a
    // resolved file against an unresolved folder would refuse everything: /var is a link to
    // /private/var on macOS, and a container's mount is a link about as often as not.
    const real = realpathSync(path)
    return inside(real, realpathSync(base)) ? real : null
  } catch {
    return null
  }
}

const inside = (path: string, base: string): boolean => path === base || path.startsWith(base + sep)

/**
 * Anything whose name begins with a dot, at any depth.
 *
 * Not because a dotted name is dangerous in itself, but because everything that ends up in a folder
 * by accident wears one: an `.env` left from a test, a macOS `._name`, a source map's `.map` beside
 * an editor's `.swp`. The one exception is the folder the web itself reserves.
 */
const hidden = (target: string, base: string): boolean =>
  relative(base, target)
    .split(sep)
    .some((part) => part.startsWith('.') && part !== '.well-known' && part !== '')
