// shavlo Service Worker — Offline Shell Cache + Rich Web Push + Quick Reply + Background Sync
const CACHE_NAME = 'shavlo-shell-v290';
const MEDIA_CACHE = 'shavlo-media-cache-v1';
const SHELL_ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== MEDIA_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/shavlo-media/')) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then((cache) =>
        cache.match(req, { ignoreSearch: true }).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          }).catch(() => Response.error());
        })
      )
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'shavlo', body: 'New encrypted message', tag: 'shavlo-msg', roomId: '' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (_) {}
  const roomTag = data.isCall
    ? ('shavlo-call-' + (data.roomId || 'active'))
    : (data.roomId ? ('shavlo-room-' + data.roomId) : (data.tag || 'shavlo-msg'));

  if (data.dismissCall) {
    event.waitUntil(
      self.registration.getNotifications({ tag: 'shavlo-call-' + (data.roomId || 'active') }).then((ns) => {
        ns.forEach((n) => n.close());
      })
    );
    return;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'shavlo', {
      body: data.body || 'New activity',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: roomTag,
      renotify: true,
      vibrate: data.isCall ? [220, 120, 220, 120, 220] : [90, 40, 90],
      data: { url: data.roomId ? ('./?chat=' + encodeURIComponent(data.roomId)) : (data.url || './'), roomId: data.roomId || '' },
      actions: data.isCall
        ? [{ action: 'open', title: 'Answer' }, { action: 'decline', title: 'Decline' }]
        : [
            { action: 'reply', title: 'Quick Reply', type: 'text', placeholder: 'Reply...' },
            { action: 'mark-read', title: 'Mark Read' }
          ]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const roomId = notifData.roomId || '';
  const targetUrl = notifData.url || './';

  if (event.action === 'decline') return;

  if (event.action === 'mark-read' && roomId) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => {
          try { c.postMessage({ type: 'mark_read', roomId }); } catch (_) {}
        });
      })
    );
    return;
  }

  if (event.action === 'reply' && event.reply && roomId) {
    const replyText = String(event.reply).trim();
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        if (clients.length > 0) {
          try { clients[0].postMessage({ type: 'quick_reply', roomId, text: replyText }); } catch (_) {}
          return;
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          if (roomId) {
            try { c.postMessage({ type: 'open_chat', roomId }); } catch (_) {}
          }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'shavlo-outbox-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => {
          try { c.postMessage({ type: 'flush_outbox' }); } catch (_) {}
        });
      })
    );
  }
});
