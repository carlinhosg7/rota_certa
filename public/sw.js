const CACHE_NAME = "kidy-pwa-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Todas as requisições continuam sendo atendidas pela rede.
  // Evita dados comerciais desatualizados ou sensíveis em cache.
});
