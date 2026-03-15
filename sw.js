// ═══════════════════════════════════════════════════════════════════════════
// sw.js — Service Worker
//
// Strategy:
//   App shell (HTML/CSS/JS):  Cache-first, update in background
//   API calls (OMDB/TMDB):    Network-first, fall back to cache
//   Images (posters/backdrops): Cache-first, long TTL
//
// The metadata cache in localStorage means most API calls are skipped
// entirely — the service worker is a second layer for offline resilience.
// Note: playback (vidsrc.me) requires a live connection and is NOT cached.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_VERSION   = 'ff-v1';
const SHELL_CACHE     = `${CACHE_VERSION}-shell`;
const API_CACHE       = `${CACHE_VERSION}-api`;
const IMAGE_CACHE     = `${CACHE_VERSION}-images`;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './js/main.js',
  './js/storage.js',
  './js/api.js',
  './js/library.js',
  './js/player.js',
  './js/userdata.js',
  './js/watchlist.js',
  './js/settings.js',
  './js/github.js',
  './js/freeflow.js',
  // worker.js intentionally omitted — Workers are fetched fresh each time
];

const NEVER_CACHE = [
  'vidsrc.me',      // playback — always needs live connection
  'vidsrc.to',
];

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL — pre-cache app shell
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVATE — clean up old caches
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('ff-') && !k.startsWith(CACHE_VERSION))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// FETCH — route requests by type
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept non-GET or streaming/playback URLs
  if (event.request.method !== 'GET') return;
  if (NEVER_CACHE.some(h => url.hostname.includes(h))) return;

  // App shell: cache-first
  if (SHELL_FILES.some(f => url.pathname.endsWith(f.replace('./', ''))) ||
      url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(cacheFirst(SHELL_CACHE, event.request));
    return;
  }

  // Posters and images: cache-first, long TTL
  if (url.hostname.includes('image.tmdb.org') ||
      url.hostname.includes('img.omdbapi.com') ||
      url.hostname.includes('m.media-amazon.com')) {
    event.respondWith(cacheFirst(IMAGE_CACHE, event.request));
    return;
  }

  // OMDB / TMDB API: network-first (fresh data preferred, fall back to cache)
  if (url.hostname.includes('omdbapi.com') ||
      url.hostname.includes('themoviedb.org')) {
    event.respondWith(networkFirst(API_CACHE, event.request));
    return;
  }

  // Everything else: network only
});

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGIES
// ─────────────────────────────────────────────────────────────────────────────

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(cacheName, request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ Response: 'False', Error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
