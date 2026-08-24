/**
 * The phone client's service worker.
 *
 * Two jobs, and one thing it deliberately does not do.
 *
 * It keeps the shell - the HTML, the scripts, the styles, the fonts - so the app opens without a
 * network and can say "you are offline" in its own words rather than as a browser error page.
 *
 * From phase 5 it also receives push notifications and opens them, which is why it exists at all on
 * iOS: web notifications there work only for an app installed to the home screen, and only through a
 * worker.
 *
 * What it never caches is the content of conversations. Nothing about them travels over HTTP anyway -
 * it all arrives over the socket, sealed - and a cache holding source code on a phone would be exactly
 * the kind of copy nobody asked for.
 */

/*
 * The cache's name carries the build it belongs to, and the placeholder is filled in when the bundle is
 * copied (see vite.mobile.config.ts). It is not decoration: `activate` deletes every cache whose name
 * is not this one, so a new name is what evicts the previous shell. With a name hand-written as "v1",
 * a deploy left an installed phone serving last month's app out of its own cache and looking, to the
 * person holding it, like the deploy had not happened.
 */
const SHELL = 'acc-shell-__BUILD__'

self.addEventListener('install', (event) => {
  // The shell alone. The hashed assets fetch themselves on first use and are cached then: listing them
  // here would mean a worker that has to be rewritten on every build.
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', '/manifest.webmanifest'])),
  )
  // No waiting for every tab to close: there is one, and the first version people have should be
  // replaceable without them knowing what a service worker is.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== SHELL).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // The privacy policy is a page in its own right, served by the relay rather than drawn by the client
  // (see vite.mobile.config.ts). Left to the rule below it would be answered with the app's shell -
  // and, worse, cached as the shell, so the app would open on the policy the next time it was offline.
  if (url.pathname.startsWith('/privacy')) return

  // A navigation to any address inside the app: the client reads the address itself, so any of them is
  // answered with the shell. Network first, so a fresh shell wins when there is a network at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(SHELL).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    )
    return
  }

  // Everything else is a hashed asset or a font: its name changes when its content does, so a cached
  // copy is never stale and never needs revalidating.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(SHELL).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})

/**
 * A notification arriving while the app is closed.
 *
 * The payload is sealed by the IDE with this device's own key, so the relay could not read it and
 * neither could Apple or Google. Only this worker can, which is why the key lives in IndexedDB rather
 * than in localStorage - a worker cannot see localStorage at all.
 *
 * There is one rule that shapes everything here: the browser requires a notification to be shown for
 * every push it delivers. Staying silent when something cannot be decrypted is not an option - the
 * browser would show its own "this site was updated in the background", and eventually stop delivering
 * altogether. So a failure shows a deliberately empty notification instead of nothing.
 */
self.addEventListener('push', (event) => {
  event.waitUntil(show(event.data))
})

const show = async (data) => {
  const fallback = () =>
    self.registration.showNotification('Amazing Claude Code', {
      body: 'Open the app to see what happened.',
      tag: 'acc-unknown',
    })

  if (!data) return fallback()

  try {
    const sealed = new Uint8Array(data.arrayBuffer())
    const opened = await unsealPush(sealed)
    if (!opened) return fallback()

    return self.registration.showNotification(opened.title, {
      body: opened.project,
      // Tagged by conversation, so a busy session replaces its own notification rather than stacking
      // five of them on a lock screen.
      tag: `acc-${opened.agentId}-${opened.sessionId}`,
      renotify: false,
      data: opened,
    })
  } catch {
    return fallback()
  }
}

/**
 * Opening a sealed push.
 *
 * The keys are the ones this device derived when it paired, kept as CryptoKey handles the browser will
 * use but never hand back as bytes.
 */
const unsealPush = async (sealed) => {
  const keys = await readPushKeys()
  if (!keys) return null

  const HEADER = 42
  if (sealed.length < HEADER) return null

  const header = sealed.slice(0, HEADER)
  const body = sealed.slice(HEADER)
  const counter = new DataView(sealed.buffer, sealed.byteOffset + 34, 8).getBigUint64(0, false)

  const nonce = new Uint8Array(12)
  nonce.set(keys.noncePrefixFromAgent, 0)
  new DataView(nonce.buffer).setBigUint64(4, counter, false)

  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: header, tagLength: 128 },
      keys.fromAgent,
      body,
    )
    return JSON.parse(new TextDecoder().decode(opened))
  } catch {
    return null
  }
}

/** The session keys this device last derived, put here by the app - see mobile/link.ts. */
const readPushKeys = () =>
  new Promise((resolve) => {
    const request = indexedDB.open('acc-remote', 1)
    request.onsuccess = () => {
      const database = request.result
      const store = database.transaction('settings', 'readonly').objectStore('settings')
      const read = store.get('pushKeys')
      read.onsuccess = () => resolve(read.result ?? null)
      read.onerror = () => resolve(null)
    }
    request.onerror = () => resolve(null)
  })

/**
 * Tapping a notification goes straight to the decision, not to a list. The whole point of the thing is
 * that answering takes two taps: this is the first.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = event.notification.data
  const url = target ? `/#/s/${target.agentId}/${target.sessionId}/decide` : '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => client.url.includes(self.location.origin))

      if (open) {
        open.postMessage({ type: 'acc-open', url })
        return open.focus()
      }

      return self.clients.openWindow(url)
    }),
  )
})
