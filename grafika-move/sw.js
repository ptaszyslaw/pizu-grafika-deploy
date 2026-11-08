/**
 * PizuGrafika moved from https://grafika.pizu.pl/ to https://pizu.pl/grafika/.
 * This retiring service worker replaces the app's worker on the old subdomain:
 * the browser checks sw.js on the old address and never follows the redirect,
 * so without it every installed PWA would keep the old version forever.
 *
 * - install: take over immediately (skipWaiting),
 * - activate: drop every cache, unregister, then send each open window to the
 *   same path on the new address,
 * - no fetch handler: the folder only redirects visitors away.
 * scripts/pwa.mjs puts the new address in place of __MOVE_TO__; never deploy
 * this file as is.
 */
const MOVE_TO = "https://pizu.pl/grafika"

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) await caches.delete(name)
    await self.registration.unregister()
    const windows = await self.clients.matchAll({ type: 'window' })
    await Promise.all(windows.map((client) => {
      const url = new URL(client.url)
      return client.navigate(MOVE_TO + url.pathname + url.search)
    }))
  })())
})
