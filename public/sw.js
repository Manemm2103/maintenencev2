const CACHE='drhome-v13';const ASSETS=['./','./index.html','./logo.png','./opal-tower-marina.jpg','./maintenance.html','./book.html','./confirm.html','./success.html','./properties.html','./service.html','./documents.html','./notifications.html','./more.html','./profile.html','./support.html','./login.html','./auth.js','./push-test.js','./push-setup.html','./admin-push-test.html','./contact.html'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'index.html';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list => {
    for (const c of list) {
      if ('focus' in c) { c.navigate(url); return c.focus(); }
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
