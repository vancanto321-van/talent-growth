const CACHE_NAME = 'talent-growth-web-v2';
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
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const shell = /\.(?:html|css|js|json|webmanifest)$/.test(url.pathname) || request.mode === 'navigate';
  if (!shell) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
    return;
  }

  // 应用外壳走网络优先：本地预览与升级后刷新能立刻拿到最新文件，离线时回落到缓存。
  event.respondWith(fetch(request).then(response => {
    if (response.ok && url.pathname.includes('/growth/')) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html'))));
});
