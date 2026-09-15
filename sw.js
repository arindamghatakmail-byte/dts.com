// Service worker for Dihibaliharpur Tarun Sangha — caches only the static
// app shell (HTML/CSS/JS/logo) for fast repeat loads and basic offline
// support. It deliberately never touches anything cross-origin (Supabase,
// GitHub, Google Fonts, CDN scripts) so live club data is never stale.

const CACHE_VERSION = 'dts-shell-v3'; // <-- bumped from v2. IMPORTANT: bump
// this string (v4, v5, ...) every single time you push changes to ANY file
// listed below. Browsers only fetch a fresh copy of these files when they
// detect this file itself has changed bytes — otherwise visitors keep
// getting the OLD cached JS/CSS forever, even after you update GitHub,
// which is exactly what caused the "needs two hard refreshes" issue.
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './common.js',
  './public.js',
  './member.js',
  './my-account.js',
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

  // Network-first for the JS files themselves too — a stale cached script
  // (like the one that caused today's bug) is worse than a slightly slower
  // load. Falls back to cache only if there's no connection at all.
  if (event.request.destination === 'script') {
    event.respondWith(
      fetch(event.request).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else in the shell (CSS, images, manifest)
  // — these change far less often, so fast repeat loads still make sense.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
