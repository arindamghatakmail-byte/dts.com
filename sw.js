// Service worker for Dihibaliharpur Tarun Sangha — caches only the static
// app shell (HTML/CSS/JS/logo) for fast repeat loads and basic offline
// support. It deliberately never touches anything cross-origin (Supabase,
// GitHub, Google Fonts, CDN scripts) so live club data is never stale.

const CACHE_VERSION = 'dts-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './common.js',
  './public.js',
  './member.js',
  './treasurer.js',
  './admin.js',
  './passkey.js',
  './logo.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn('Service worker: shell caching failed', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only ever serve same-origin requests from cache. Supabase, GitHub,
  // Google Fonts, and CDN scripts (Quill/Chart.js/jsPDF/Font Awesome) are
  // left to the browser's normal network handling — never cached here.
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    // Network-first for the page itself, so content/admin updates show up
    // immediately on a normal visit; only fall back to the cached shell
    // when there's genuinely no connection.
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for the static shell files themselves — fast repeat loads.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
