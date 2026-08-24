import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { marked } from 'marked'
import { defineConfig, type Plugin } from 'vite'

/**
 * The files only the phone needs: its manifest and its service worker.
 *
 * They live outside the shared public directory on purpose. Anything in that one is copied into both
 * builds, and the panel's build goes wholesale into the plugin's archive - so a service worker would
 * end up inside a JetBrains plugin, where it does nothing and reads as something to explain during
 * moderation.
 */
const mobileAssets = (): Plugin => ({
  name: 'acc-mobile-assets',

  // In a build they are copied beside the bundle; on the dev server they are served from where they
  // lie. Without this half the service worker is a 404 in development and an unexplained failure in
  // the console every time the page loads.
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const name = (request.url ?? '').split('?')[0]?.replace(/^\//, '') ?? ''
      if (!MOBILE_ONLY.includes(name)) return next()

      const file = join('mobile-assets', name)
      if (!existsSync(file)) return next()

      response.setHeader('content-type', contentType(name))
      response.end(readFileSync(file))
    })
  },

  closeBundle() {
    cpSync('mobile-assets', 'dist-mobile', { recursive: true })

    // The service worker is copied rather than bundled, so its one build-dependent value is written in
    // here. The shell it names is what a phone serves offline, and only a change of name evicts it -
    // see the note in sw.js.
    const shell = readFileSync('dist-mobile/mobile.html', 'utf8')
    const build = createHash('sha256').update(shell).digest('hex').slice(0, 12)
    const worker = join('dist-mobile', 'sw.js')
    writeFileSync(worker, readFileSync(worker, 'utf8').replace('__BUILD__', build))

    // The shell under the name the relay looks for. It serves anything that is not a file from
    // index.html (see serveStatic), the manifest's start_url is "/", and the service worker precaches
    // "/" - so the entry cannot stay called mobile.html once it is built. It keeps that name in the
    // sources because webview/index.html is already taken by the panel.
    cpSync('dist-mobile/mobile.html', 'dist-mobile/index.html')

    writePrivacyPage()
  },
})

/**
 * The privacy policy as a page of its own, at /privacy on whatever host serves the client.
 *
 * It has to exist somewhere permanent that is not a repository: the Marketplace asks for a URL, and
 * moderation reads it rather than a file in a git tree. The relay already serves the phone's client
 * over HTTPS, so it is the one address that is certain to be up wherever this is deployed - and the
 * page it serves is built from the same PRIVACY.md the repository holds, so the two cannot drift.
 *
 * A directory with an index.html rather than privacy.html: the relay answers a directory with the
 * index inside it (see serveStatic), which makes the address /privacy rather than /privacy.html.
 */
const writePrivacyPage = (): void => {
  const source = join('..', 'PRIVACY.md')
  if (!existsSync(source)) return

  const body = marked.parse(readFileSync(source, 'utf8'), { async: false })

  mkdirSync('dist-mobile/privacy', { recursive: true })
  writeFileSync('dist-mobile/privacy/index.html', PRIVACY_SHELL.replace('__BODY__', body))
}

/**
 * Deliberately one file with its styles inside it: this page must render on a phone with no network
 * left, in an email quoted by a moderator, and in whatever reader somebody pastes it into. A stylesheet
 * beside it is one more thing that can fail to load and turn a legal document into unreadable text.
 */
const PRIVACY_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index, follow" />
    <title>Privacy — Amazing Claude Code</title>
    <style>
      :root { color-scheme: dark light; }
      body {
        margin: 0 auto;
        padding: 32px 20px 96px;
        max-width: 46rem;
        background: #1c1f26;
        color: #d7dae0;
        font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      h1, h2, h3 { color: #fff; line-height: 1.25; margin: 2em 0 0.6em; }
      h1 { margin-top: 0; font-size: 1.9rem; }
      h2 { font-size: 1.35rem; }
      a { color: #7cb0ff; }
      code { background: #262a33; border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
      table { border-collapse: collapse; width: 100%; margin: 1em 0; display: block; overflow-x: auto; }
      th, td { border: 1px solid #343945; padding: 8px 10px; text-align: left; vertical-align: top; }
      th { background: #262a33; }
      blockquote { margin: 1em 0; padding-left: 14px; border-left: 3px solid #343945; color: #a9aeb8; }
      hr { border: none; border-top: 1px solid #343945; margin: 2.5em 0; }
    </style>
  </head>
  <body>__BODY__</body>
</html>
`

const contentType = (name: string): string => {
  if (name.endsWith('.js')) return 'text/javascript'
  if (name.endsWith('.png')) return 'image/png'
  return 'application/manifest+json'
}

/** The files that belong to the phone alone - see the note above. */
const MOBILE_ONLY = [
  'sw.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
]

/**
 * The phone's own build, kept apart from the panel's.
 *
 * Not a second entry in the panel's build, and the reason is where each one ends up: the panel's
 * output is copied wholesale into the plugin's archive (see processResources in build.gradle.kts),
 * while this one is served by the relay. Sharing an output directory would put a web application
 * nobody ever serves from the IDE into a plugin that goes through JetBrains' moderation.
 *
 * The base path differs too, and it is not cosmetic: the panel is served by a scheme handler with a
 * root of its own and needs relative paths, while a service worker's scope, a manifest's start_url and
 * the navigation fallback all need absolute ones.
 */
export default defineConfig({
  plugins: [react(), mobileAssets()],

  base: '/',

  build: {
    outDir: 'dist-mobile',
    emptyOutDir: true,
    rollupOptions: {
      input: { mobile: 'mobile.html' },
    },
    sourcemap: false,
  },

  server: {
    port: 5174,
    strictPort: true,
  },
})
