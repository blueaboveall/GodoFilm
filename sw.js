const CACHE_NAME = 'godofilm-v9';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=6',
  './script.js',
  './manifest.json',
  './icon.png',
  './god-text.png',
  './camera-o.png',
  './guide-1.png',
  './guide-2.png',
  './guide-3.png',
  './home-background.png',
  './bg-sorae-peak.png',
  './bg-baebong-craft-english.png',
  './bg-surak-peak.png',
  './bg-gooreum-craft-korean.png',
  './bg-mireuk-peak.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => /^godofilm-v\d+$/.test(k) && k !== CACHE_NAME)
        .map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.hostname.includes('open-meteo.com')) return;

  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope) ||
      event.request.headers.has('Range')) return;

  const cachePromise = caches.open(CACHE_NAME);
  const cachedResponse = cachePromise.then((cache) => cache.match(event.request)).catch(() => undefined);
  const networkResponse = fetch(event.request);
  event.waitUntil(networkResponse.then(async (response) => {
    if (!response.ok || response.status === 206) return;
    const responseCopy = response.clone();
    const cache = await cachePromise;
    await cache.put(event.request, responseCopy);
  }).catch(() => {}));
  event.respondWith(cachedResponse.then((cached) => cached || networkResponse));
});
