const CACHE_NAME = 'talent-growth-web-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './talent.css',
  './main.js',
  './growth-progress.js',
  './data.json',
  './talent-data.js',
  './learning-data.js',
  './cultivation-data.js',
  './talent-ui.js',
  './talent-store.js',
  './talent-insights.js',
  './talent-journey.js',
  './talent-cloud.js',
  './talent-planets.js',
  './talent-planets-ui.js',
  './learning-ui.js',
  './cultivation-ui.js',
  './talent-mark.svg',
  './app-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && new URL(request.url).pathname.includes('/growth/')) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
