/**
 * System Design Vault — Service Worker
 * Cache-first for static assets, network-first for data indexes.
 */
const CACHE_NAME = 'sdv-cache-v2';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const STATIC_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/css/styles.css`,
  `${BASE_PATH}/js/app.js`,
  `${BASE_PATH}/js/canvas.js`,
  `${BASE_PATH}/vendor/marked.min.js`,
  `${BASE_PATH}/vendor/mermaid.min.js`,
  `${BASE_PATH}/vendor/d3.min.js`,
  `${BASE_PATH}/vendor/jszip.min.js`,
  `${BASE_PATH}/vendor/dompurify.min.js`,
  `${BASE_PATH}/vendor/confetti.browser.js`,
  `${BASE_PATH}/vendor/html2pdf.bundle.min.js`,
  `${BASE_PATH}/vendor/highlight.min.js`,
  `${BASE_PATH}/vendor/highlight-github-dark.min.css`,
  `${BASE_PATH}/data/vault-index.json`,
  `${BASE_PATH}/data/search-index.json`,
  `${BASE_PATH}/data/graph-edges.json`,
  `${BASE_PATH}/data/study-prompts.json`,
  `${BASE_PATH}/data/scenarios.json`,
  `${BASE_PATH}/data/quests.json`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(STATIC_ASSETS.map(async (asset) => {
        const isCrossOrigin = asset.startsWith('http');
        const request = new Request(asset, isCrossOrigin ? { mode: 'no-cors' } : undefined);
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
          await cache.put(request, response);
        }
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for data indexes (pick up new content when online)
  if (url.pathname.startsWith(`${BASE_PATH}/data/`) && url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for markdown notes (they change with enrichment)
  if (url.pathname.startsWith(`${BASE_PATH}/data/`) && url.pathname.endsWith('.md')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (static assets, CDN libs)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache both normal same-origin responses and opaque CDN responses
        if (response.ok || response.type === 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
