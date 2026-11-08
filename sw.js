/**
 * PizuGrafika service worker — scripts/pwa.mjs copies it into the build as /sw.js and puts the
 * build's file list in place of __BUILD__; never deploy this file as is.
 *
 * - On install: every page (/, /kod-qr/ …) and every file the app needs (/assets with the
 *   HEIC, WebP and AVIF encoders, icons…) goes into one cache per version, each checked against
 *   its SHA-256 from the build — a half-copied deployment fails the install and the previous
 *   version stays.
 * - The multithreaded AVIF encoder runs only on cross-origin isolated pages, which this site is
 *   not: cached the first time a browser fetches it, if ever (one cache per content revision).
 * - Images shared to the installed app (Android „Udostępnij”, manifest share_target) are kept
 *   in their own cache until the page takes them (lib/pwa.ts).
 * - A new version installs in the background and waits; the page shows „Jest nowa wersja”
 *   (lib/pwa.ts) and switches only when the visitor clicks „Odśwież” (or closes every tab).
 */
const BUILD = {"app":"0.7.0","version":"847356bf1ce2","hashLength":16,"base":"/grafika/","pages":["/grafika/","/grafika/kadruj-zdjecie/","/grafika/kod-qr/","/grafika/konwertuj-zdjecia/","/grafika/zaslon-i-znak-wodny/"],"offlinePage":"/grafika/404.html","precache":[["/grafika/","0df703044d5089af"],["/grafika/kadruj-zdjecie/","8fab8403922257d9"],["/grafika/kod-qr/","776ea53f85c74765"],["/grafika/konwertuj-zdjecia/","43529f26d6a26ec4"],["/grafika/zaslon-i-znak-wodny/","fb57f15fdc56171c"],["/grafika/favicon.svg","3187206ad882a731"],["/grafika/settings-init.js","09127e0a65527d4b"],["/grafika/404.html","c5780bfad334e64b"],["/grafika/404.css","3c181cf453dbda73"],["/grafika/manifest.webmanifest","7193153fefd397c6"],["/grafika/icon-192.png","fcc3189a34a48e40"],["/grafika/icon-512.png","354e5890b37fff91"],["/grafika/icon-maskable-512.png","3276eca901ad3be0"],["/grafika/apple-touch-icon.png","9a3cc75c02ac51c9"],["/grafika/assets/ConvertImages-GPANkwPz.js","92446cf6a668bc9c"],["/grafika/assets/CropResize-lJuF7fTy.js","2d02e0fc0b6e5ee9"],["/grafika/assets/QrCode-Dm2i0IK_.js","c7db3840705a8192"],["/grafika/assets/RedactWatermark-B_qxJkgJ.js","65e90fa8da29eb88"],["/grafika/assets/avif_enc-B3-f0xkY.js","c5f826192ad41c67"],["/grafika/assets/avif_enc-Co4TcJko.wasm","d9f2a95164362af4"],["/grafika/assets/crop-Cypqk54s.js","0eeb5887b812001f"],["/grafika/assets/encode-D1V32o0e.js","6da95ab7e17c72c9"],["/grafika/assets/encode-DSKK0i4X.js","3adad45addcf2033"],["/grafika/assets/encode.worker-CMC1DkQC.js","972160524d230ba7"],["/grafika/assets/esm-mZAPAzZp.js","8e98ae64583369ad"],["/grafika/assets/files-BvjvEXuT.js","4c6416113bc4714a"],["/grafika/assets/full.esm-CsDekuHh.js","12dfc03f77f24188"],["/grafika/assets/heic.worker-L1Y982FS.js","fb683da40d4a1f68"],["/grafika/assets/index-AID13YEX.css","67f2fbf6fc5b75a5"],["/grafika/assets/index-D9aJZU5B.js","fbcbd0d5942cfc83"],["/grafika/assets/libheif-BfiPCEgt.wasm","184d3d20f8323877"],["/grafika/assets/licenses-Ddo0_Poz.js","c6a74a73483b6eb5"],["/grafika/assets/metadata-CjG0i53Q.js","8e6429a107108b2f"],["/grafika/assets/triangle-alert-BmuCrBx1.js","4975f6843f709cda"],["/grafika/assets/webp_enc-BpZvKflB.wasm","b6085bb6702f144e"],["/grafika/assets/webp_enc-DBWorT4o.js","20f7eeca1101d76e"],["/grafika/assets/webp_enc_simd-CFvKQ_80.wasm","39c279269ec1163b"],["/grafika/assets/webp_enc_simd-PhpcE9Fp.js","955610c3c774538a"]],"lazy":[{"cache":"pizugrafika-avif-mt-63c3064fa6be","prefix":"/grafika/assets/avif_enc_mt"}],"shareAction":"/grafika/udostepnij","shareField":"images"}
const APP_CACHE = `pizugrafika-app-${BUILD.version}`
const SHARE_CACHE = 'pizugrafika-share'
const PRECACHED = new Set(BUILD.precache.map(([path]) => path))
const PAGES = new Set(BUILD.pages)

async function sha256(body) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, BUILD.hashLength)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE)
      await Promise.all(
        BUILD.precache.map(async ([path, hash]) => {
          // a hashed name never changes its content, so the HTTP cache may answer; the rest is revalidated
          const response = await fetch(path, { cache: path.startsWith(BUILD.base + 'assets/') ? 'default' : 'no-cache' })
          if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
          const body = await response.clone().arrayBuffer()
          if ((await sha256(body)) !== hash) throw new Error(`${path}: treść inna niż w wersji ${BUILD.version}`)
          // a redirected response cannot answer a navigation — store a plain copy
          await cache.put(path, response.redirected ? new Response(body, response) : response)
        })
      )
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set([APP_CACHE, SHARE_CACHE, ...BUILD.lazy.map((group) => group.cache)])
      for (const name of await caches.keys()) {
        if (name.startsWith('pizugrafika-') && !current.has(name)) await caches.delete(name)
      }
      // The first install takes over the page that registered it, so files a tool fetches
      // during that first visit are cached too. Later versions get here only after „Odśwież”.
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname
  if (request.method === 'POST' && path === BUILD.shareAction) return event.respondWith(receiveShare(request))
  if (request.method !== 'GET' || request.headers.has('range')) return
  if (request.mode === 'navigate') {
    event.respondWith(page(path, url, request))
  } else if (PRECACHED.has(path)) {
    event.respondWith(fromCache(path, request))
  } else {
    const group = BUILD.lazy.find((entry) => path.startsWith(entry.prefix))
    if (group) event.respondWith(onFirstUse(event, group.cache, path, request))
  }
  // anything else (sitemap.xml, og-image.png …) goes to the server as usual
})

// Query strings (?utm_source=…) do not change a page, so /?x and / share one copy
async function fromCache(path, request) {
  return (await caches.match(path, { cacheName: APP_CACHE })) ?? fetch(request)
}

async function page(path, url, request) {
  if (PAGES.has(path)) return fromCache(path, request)
  // /kod-qr → /kod-qr/, as the server does — offline too
  if (PAGES.has(`${path}/`)) return Response.redirect(`${url.origin}${path}/${url.search}`, 301)
  try {
    return await fetch(request)
  } catch {
    return (await caches.match(BUILD.offlinePage, { cacheName: APP_CACHE })) ?? Response.error()
  }
}

async function onFirstUse(event, cacheName, path, request) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(path)
  if (hit) return hit
  const response = await fetch(request)
  if (response.status === 200 && response.type === 'basic') event.waitUntil(cache.put(path, response.clone()))
  return response
}

// The images go into SHARE_CACHE (replacing anything never taken), then the app opens with
// ?udostepnione and lib/pwa.ts takes them out. Never an error page: at worst the app opens empty.
async function receiveShare(request) {
  try {
    const form = await request.formData()
    const files = form.getAll(BUILD.shareField).filter((entry) => typeof entry !== 'string')
    await caches.delete(SHARE_CACHE)
    const cache = await caches.open(SHARE_CACHE)
    await Promise.all(
      files.map((file, i) =>
        cache.put(`${BUILD.base}udostepnione/${i}`, new Response(file, {
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        }))
      )
    )
  } catch (error) {
    console.error('PizuGrafika: nie udało się przyjąć udostępnionych zdjęć', error)
  }
  return Response.redirect(`${self.location.origin}${BUILD.base}?udostepnione`, 303)
}
