const CACHE_NAME = 'godofilm-v4';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=4',
  './script.js',
  './manifest.json',
  './icon.png',
  './god-text.png',
  './camera-o.png',
  './guide-1.png',
  './guide-2.png',
  './guide-3.png',
  './home-background.png',
  './my-background.png',
  './bg-sorae-peak.png',
  './bg-baebong-craft-english.png',
  './bg-surak-peak.png',
  './bg-gooreum-craft-korean.png',
  './bg-mireuk-peak.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 고도 API(open-meteo)는 항상 실시간 데이터가 필요하므로 캐싱하지 않고 그대로 통과
  if (url.hostname.includes('open-meteo.com')) return;

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // stale-while-revalidate: 캐시에 있으면 즉시 응답(산속 즉시 실행), 
  // 동시에 백그라운드에서 최신본으로 갱신
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
