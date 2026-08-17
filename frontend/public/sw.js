/**
 * FMCG Shop Offline Service Worker
 * Caches product data and queues POS transactions when offline.
 */

const CACHE_NAME = 'fmcg-v1';
const STATIC_ASSETS = ['/', '/pos'];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache if offline, otherwise network-first
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only cache GET requests for pages/assets
  if (request.method !== 'GET') return;

  // Skip API calls (those go through the offline queue in the app)
  if (request.url.includes('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 })))
  );
});

// Listen for sync events to replay queued transactions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pos-queue') {
    event.waitUntil(replayQueue());
  }
});

async function replayQueue() {
  // Open IndexedDB and replay pending transactions
  // The actual replay logic lives in the main app (offline-store.ts)
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_QUEUE' });
  }
}
