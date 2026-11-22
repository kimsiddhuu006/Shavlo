// shavlo v1.5.0 Service Worker (Network-First Shell + Background Push + Offline Fallback)
const CACHE_NAME = 'shavlo-shell-v150';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url || '';
  if (url.includes('supabase.co') || url.includes('fonts.googleapis.com') || url.includes('cdn.')) return;
  if (req.mode === 'navigate' || url.endsWith('/index.html') || url.endsWith('/')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'shavlo', body: 'New message or call', url: './' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) {
    try { if (event.data) data.body = event.data.text(); } catch (_) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'shavlo', {
      body: data.body || 'New activity on shavlo',
      tag: data.tag || 'shavlo-push',
      data: { url: data.url || './' },
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
