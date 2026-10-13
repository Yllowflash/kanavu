/* Kanavu Service Worker — offline support + local notifications (M2) */
var CACHE_NAME = 'kanavu-v9';
var ASSETS = [
  './',
  './index.html',
  './kanavu-world.js',
  './kanavu-social.js',
  './kanavu-multiplayer.js',
  './kanavu-decks.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  // Cache-first for our assets, network-first for everything else
  var url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        return cached || fetch(e.request).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(e.request, copy);
          });
          return res;
        });
      })
    );
  }
});

// Local notifications (M2: soft nudges)
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'notify') {
    var d = e.data;
    self.registration.showNotification(d.title || 'Kanavu 💛', {
      body: d.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: d.tag || 'kanavu',
      renotify: false
    });
  }
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf('kanavu') >= 0) return clients[i].focus();
      }
      return clients.openWindow('./');
    })
  );
});
