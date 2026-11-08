// AID Quizz v1.0 — sw.js
// App shell: cache-first. Google Fonts: cached after first load.
// AI calls (OpenAI / team Worker) are never cached — the app's own offline screen (S2) handles them.

const VERSION = 'aidq-v1.2.4';     // bump on every deploy so phones pick up new files
const SHELL = [
  './', './index.html', './manifest.json',
  './tokens.css', './components.css', './screens.css',
  './app.js', './ui.js', './icons.js', './state.js', './api.js',
  './onboarding.js', './levelmap.js', './templates.js', './question.js', './boss.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // AI calls are POST → straight to network
  const url = new URL(req.url);

  // Google Fonts: cache after first fetch
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Same-origin app shell: cache-first, fall back to network
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
  }
});
