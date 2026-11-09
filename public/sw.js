'use strict';

/*
 * Service worker mínimo de MyHealth.
 *
 * Reglas de privacidad:
 *  - Solo se cachean recursos estáticos propios (CSS, JS, imágenes y vendor).
 *  - Las páginas HTML y todo lo que genera datos desde SQLite van siempre a red.
 *  - Si no hay conexión, las navegaciones muestran /offline.html, nunca una
 *    versión antigua de una pantalla con datos de salud.
 */

const CACHE_PREFIX = 'myhealth-static-';
const CACHE_VERSION = 'v1';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/app.js',
  '/vendor/tabler/css/tabler.min.css',
  '/vendor/tabler/js/tabler.min.js',
  '/images/favicon.svg',
  '/images/icons/icon-192.png',
  '/images/icons/icon-512.png'
];

const STATIC_PATH_PREFIXES = ['/css/', '/js/', '/images/', '/vendor/'];

// Recursos propios que cambian al desarrollar: red primero, caché como respaldo.
const NETWORK_FIRST_PREFIXES = ['/css/', '/js/'];

function matchesPrefix(url, prefixes) {
  return prefixes.some((prefix) => url.pathname.startsWith(prefix));
}

function isCacheable(request, response) {
  return (
    request.method === 'GET' &&
    response &&
    response.status === 200 &&
    response.type === 'basic'
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // addAll aborta todo el precache si falla un recurso; se tolera uno a uno.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)
        )
      );

      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match(OFFLINE_URL);
        return offline || Response.error();
      })
    );
    return;
  }

  if (!matchesPrefix(url, STATIC_PATH_PREFIXES)) {
    return;
  }

  if (matchesPrefix(url, NETWORK_FIRST_PREFIXES)) {
    // Red primero: los cambios de CSS/JS se ven en la siguiente carga.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(request, response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.error();
        })
    );
    return;
  }

  // Stale-while-revalidate: respuesta inmediata y actualización en segundo plano.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);

      const network = fetch(request)
        .then((response) => {
          if (isCacheable(request, response)) {
            cache.put(request, response.clone());
          }

          return response;
        })
        .catch(() => undefined);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }

      const response = await network;
      return response || Response.error();
    })
  );
});
