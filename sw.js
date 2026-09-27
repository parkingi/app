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

// Web Push (send-push → this browser): show the notification and tell the open app, which refreshes its lists.
// The payload is { title, body, url: 'parkingi://…', kind, tag } (supabase/functions/send-push/webpush.ts).
self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = (e.data && e.data.json()) || {};
  } catch (_) {
    // unreadable: a plain Parkingi notification still shows (browsers require one for every push)
  }
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Parkingi', {
        body: data.body || '',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: data.tag || undefined,
        lang: 'ka',
        data: { url: data.url || null },
      }),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((all) => all.forEach((c) => c.postMessage({ type: 'parkingi-push', kind: data.kind || null }))),
    ]),
  );
});

// A tap opens the notification's screen: only the ones the phone app opens too (src/features/push/links.ts).
const PUSH_ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const PUSH_ROUTES = [
  new RegExp('^booking/' + PUSH_ID + '$'),
  /^spots\/requests$/,
  new RegExp('^chat/' + PUSH_ID + '$'),
  new RegExp('^spots/' + PUSH_ID + '$'),
];
function pushPath(url) {
  if (typeof url !== 'string' || url.indexOf('parkingi://') !== 0) return '';
  const path = url.slice('parkingi://'.length);
  return PUSH_ROUTES.some((r) => r.test(path)) ? path : '';
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  const target = scope + pushPath(e.notification.data && e.notification.data.url);
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const open = all.find((c) => c.url.indexOf(scope) === 0);
      if (!open) return self.clients.openWindow(target);
      return open
        .focus()
        .then((c) => (c || open).navigate(target))
        .catch(() => self.clients.openWindow(target));
    }),
  );
});
