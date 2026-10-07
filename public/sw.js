// Service worker: só notificações (push do resumo diário). Não faz cache: o app sempre carrega da rede.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'TVBR.Cob', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'tvbrcob',
    renotify: true,
    data: { url: data.url || '/' },
  }));
});

// Toque na notificação: foca o app aberto (indo para a página certa) ou abre um novo
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list[0];
    if (win) return win.navigate(url).then(w => (w || win).focus()).catch(() => win.focus());
    return self.clients.openWindow(url);
  }));
});
