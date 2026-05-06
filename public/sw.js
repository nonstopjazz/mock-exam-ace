self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '學習提醒';
  const options = {
    body: data.body || '今天還沒複習喔！',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/practice/vocabulary' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
