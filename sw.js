// LUMA — service worker de desarrollo sin caché de aplicación.
// Mientras la app esté en desarrollo preferimos siempre la versión de red.

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// No interceptamos fetch. El navegador solicita siempre los archivos actuales
// a GitHub Pages, evitando mezclar HTML/JS/CSS de versiones anteriores.
