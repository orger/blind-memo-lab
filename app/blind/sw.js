/* Only public, bundled app files are cached. Training history stays in storage.js. */
const CACHE_PREFIX = 'blind-memo-static-';
// Direct app/ previews keep this source version. build-web assigns a content hash.
const CACHE_VERSION = 'source-v1';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
// The web build replaces this list with every published app asset.
const PRECACHE = [
  './', './index.html', './styles.css', './app.js', './data.js', './repetition.js',
  './cube.js', './cube-view.js', './answers.js', './vault.js', './default-memos.js', './choices.js', './pwa.js', './manifest.webmanifest',
  './icon.svg', './icon-192.png', './icon-512.png'
];
const assetURLs = PRECACHE.map(path => new URL(path, self.registration.scope).href);
const allowedAssets = new Set(assetURLs);

async function cacheResources() {
  // A same-version development install must not overwrite an active app's files.
  // Published builds have distinct content hashes whenever any public file changes.
  if (await cacheIsComplete()) return;
  const cache = await caches.open(CACHE_NAME);
  // A failed download prevents installation, preserving the previous working version.
  await cache.addAll(assetURLs.map(url => new Request(url, { cache: 'reload' })));
}

async function cacheIsComplete() {
  const cache = await caches.open(CACHE_NAME);
  const entries = await Promise.all(assetURLs.map(url => cache.match(url)));
  return entries.every(Boolean);
}

self.addEventListener('install', event => {
  event.waitUntil(cacheResources());
  // Updates wait until the user chooses Update. Never interrupt a running solve.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    event.waitUntil(self.skipWaiting());
  } else if (event.data?.type === 'OFFLINE_STATUS') {
    event.waitUntil((async () => {
      const ready = await cacheIsComplete();
      event.ports?.[0]?.postMessage({ ready, version: CACHE_VERSION });
    })());
  } else if (event.data?.type === 'REPAIR_OFFLINE') {
    event.waitUntil((async () => {
      try {
        await cacheResources();
        event.ports?.[0]?.postMessage({ ready: true, version: CACHE_VERSION });
      } catch {
        event.ports?.[0]?.postMessage({ ready: false, version: CACHE_VERSION });
      }
    })());
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  url.hash = '';
  // No catch-all caching: external links, backup files and unrelated URLs pass through.
  if (!allowedAssets.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const saved = await cache.match(url.href);
    if (saved) return saved;
    const response = await fetch(event.request);
    if (response.ok && response.type !== 'opaque') await cache.put(url.href, response.clone());
    return response;
  })());
});
