// Minimal app-shell cache so Parkingi installs as a PWA and opens offline to its shell.
const CACHE = 'parkingi-shell-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add('.')));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Navigations: serve the cached shell when offline (SPA), so the app still opens.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('.').then((r) => r || caches.match(req))));
    return;
  }
  // Same-origin static assets: cache-first.
  if (new URL(req.url).origin === self.location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => hit)));
  }
});
