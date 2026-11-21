/* PinkTask service worker. Naikkan CACHE_VERSION setiap kali mengubah CSS/JS/HTML. */
var CACHE_VERSION = 'pinktask-v1';
var APP_SHELL = [
  './',
  './index.html',
  './pinktask.html',
  './css/app.css',
  './js/store.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE_VERSION;
      }).map(function (key) { return caches.delete(key); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      }).catch(function () { return caches.match('./pinktask.html'); });
    })
  );
});
