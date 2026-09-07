// Service worker for phone alerts (Web Push). Registered from
// lib/push.js. Kept intentionally minimal — this app has no other offline
// needs, so the only two jobs here are "show the notification" and
// "focus/open the app when it's tapped."

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: 'Baby Tracker', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Baby Tracker';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // tag + renotify: a second "Feed overdue" push replaces the first
    // instead of stacking a duplicate notification for the same episode.
    tag: data.tag || 'baby-tracker-overdue',
    renotify: true,
    data: { url: '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
