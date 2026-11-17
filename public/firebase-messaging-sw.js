/* iChat web push service worker.
 *
 * The push worker (worker/src/index.ts) sends data-only FCM messages, so this
 * worker builds and shows every notification itself. iOS requires that each
 * push shows a visible notification, so nothing is ever silently dropped.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  // FCM wraps our fields in `data`.
  const data = payload.data || payload;
  const title = data.title || 'iChat';
  const options = {
    body: data.body || 'New message',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.chatId || 'ichat', // one notification per chat, newest replaces older
    renotify: true,
    data: { link: data.link || '/' },
  };

  const badge = Number(data.badge);
  const updateBadge =
    self.navigator && 'setAppBadge' in self.navigator && badge > 0
      ? self.navigator.setAppBadge(badge).catch(() => {})
      : Promise.resolve();

  event.waitUntil(Promise.all([self.registration.showNotification(title, options), updateBadge]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate(link).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
