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
const BUILD = {"app":"0.6.0","version":"44d3cfd85c70","hashLength":16,"pages":["/","/kadruj-zdjecie/","/kod-qr/","/konwertuj-zdjecia/","/zaslon-i-znak-wodny/"],"offlinePage":"/404.html","precache":[["/","9deea38511694524"],["/kadruj-zdjecie/","bb87517a30da8993"],["/kod-qr/","03da4869a048fdde"],["/konwertuj-zdjecia/","62aa9e3d9fb1fbb9"],["/zaslon-i-znak-wodny/","8eaf98b5bc4cc98c"],["/favicon.svg","3187206ad882a731"],["/settings-init.js","b2ed895815a64dfb"],["/404.html","0f5b351e38f1d755"],["/404.css","3c181cf453dbda73"],["/manifest.webmanifest","d108288bac3544fb"],["/icon-192.png","fcc3189a34a48e40"],["/icon-512.png","354e5890b37fff91"],["/icon-maskable-512.png","3276eca901ad3be0"],["/apple-touch-icon.png","9a3cc75c02ac51c9"],["/assets/ConvertImages-BtMUINjk.js","ecd82beff9e4e68e"],["/assets/CropResize-EcnRbcQG.js","8afbc5f754fc3173"],["/assets/QrCode-fsfpubEk.js","2dd3d8db8ea96eac"],["/assets/RedactWatermark-Dmbwt-jy.js","c28466cb5f2c849e"],["/assets/avif_enc-4t6I8W1F.js","283dd29dbdc0c027"],["/assets/avif_enc-Co4TcJko.wasm","d9f2a95164362af4"],["/assets/crop-DsM0y31v.js","12e8acd8f304e5be"],["/assets/encode-B3854btX.js","261ff70f2323b149"],["/assets/encode-BVI_Htwn.js","4189a8495d1191ec"],["/assets/encode.worker-BLb6Mu3n.js","ae4bd553f56d5d0b"],["/assets/esm-mZAPAzZp.js","8e98ae64583369ad"],["/assets/files-DI2t9JQK.js","38bc9d4f41b390bc"],["/assets/full.esm-DF3YPjgv.js","fea7e52bfc88bd15"],["/assets/heic.worker-BZORov6e.js","86e9683236585f05"],["/assets/index-AID13YEX.css","67f2fbf6fc5b75a5"],["/assets/index-D-NtiyNd.js","f7aa72325d09acd9"],["/assets/libheif-BfiPCEgt.wasm","184d3d20f8323877"],["/assets/licenses-Ddo0_Poz.js","c6a74a73483b6eb5"],["/assets/metadata-DpE7X1mi.js","fb10ec2250910f9e"],["/assets/triangle-alert-DP-Btyz5.js","3c015ba07360598f"],["/assets/webp_enc-BpZvKflB.wasm","b6085bb6702f144e"],["/assets/webp_enc-C2MdtjXf.js","73c8003066b9bb83"],["/assets/webp_enc_simd-CFvKQ_80.wasm","39c279269ec1163b"],["/assets/webp_enc_simd-CUzUNlRG.js","0a906366747d88d5"]],"lazy":[{"cache":"pizugrafika-avif-mt-0bcba7d2e899","prefix":"/assets/avif_enc_mt"}],"shareAction":"/udostepnij","shareField":"images"}
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
          const response = await fetch(path, { cache: path.startsWith('/assets/') ? 'default' : 'no-cache' })
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
        cache.put(`/udostepnione/${i}`, new Response(file, {
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        }))
      )
    )
  } catch (error) {
    console.error('PizuGrafika: nie udało się przyjąć udostępnionych zdjęć', error)
  }
  return Response.redirect(`${self.location.origin}/?udostepnione`, 303)
}
