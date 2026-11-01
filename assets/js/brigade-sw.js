/*
 * Service worker del modo brigadista (Normia Planos CAD).
 *
 * Guarda la página pública y el plano para poder consultarlos sin conexión.
 * Estrategia: red primero con respaldo en caché; los planos (plan.json) se
 * actualizan cuando hay conexión. Sin recursos externos.
 */
'use strict';

const CACHE = 'normia-brigade-v1';
const SHELL = [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('normia-brigade') && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'normia-brigade-cache' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(data.urls.filter((url) => typeof url === 'string' && url)
      .map(async (url) => {
        try {
          const response = await fetch(url, { credentials: 'omit', cache: 'reload' });
          if (response && response.ok) await cache.put(url, response.clone());
        } catch {
          /* sin conexión: se conserva lo que ya estaba guardado */
        }
      }));
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const fallback = await cache.match(url.pathname, { ignoreSearch: true });
        if (fallback) return fallback;
      }
      throw new Error('Sin conexión y sin copia guardada');
    }
  })());
});
